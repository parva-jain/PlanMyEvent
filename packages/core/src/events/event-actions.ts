import {
  positionBetween,
  STANDARD_ROLES,
  starterSubEvents,
  zonedTimeToUtc,
  type CreatedEvent,
  type CreateEvent,
  type Event,
  type EventModule,
  type ReplaceModules,
  type UpdateEvent,
} from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import { ActionError } from '../errors.js';
import type { CoreTx, NewTask } from '../ports.js';
import { eventSlug } from './slug.js';
import { EVENT_TEMPLATES } from './templates.js';
import { versionMismatch } from './versioned.js';

/** `YYYY-MM-DD` minus whole days, in UTC so no time zone shifts it. */
function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The template's starter tasks, in order in the To do column. A due date already past
 * (an event planned at short notice) is left empty rather than starting overdue.
 */
function starterTasks(
  template: (typeof EVENT_TEMPLATES)[keyof typeof EVENT_TEMPLATES],
  startsOn: string,
  today: string,
  subEvents: { id: string; name: string }[],
): NewTask[] {
  let position: string | null = null;
  return template.tasks.map((task) => {
    position = positionBetween(position, null);
    const dueOn = task.daysBefore === null ? null : daysBefore(startsOn, task.daysBefore);
    return {
      title: task.title,
      category: task.category,
      dueOn: dueOn && dueOn >= today ? dueOn : null,
      subEventId: subEvents.find((item) => item.name === task.subEvent)?.id ?? null,
      position,
      templateKey: task.key,
    };
  });
}

/** Slug collisions are rare (4 random characters per name); retry a few times. */
const SLUG_ATTEMPTS = 5;

function userId(actor: { kind: string; userId?: string }): string {
  if (actor.kind !== 'user' || !actor.userId) {
    throw new ActionError('forbidden', 'Only a signed-in user can do this');
  }
  return actor.userId;
}

/**
 * POST /v1/events: an event from a template in the user's personal workspace, with the
 * template's modules, starter sub-events, tasks and budget categories, an optional first venue,
 * and the standard roles.
 * The creator joins as the first member holding Owner. Any signed-in user may create one.
 */
export const createEvent: ActionDefinition<CreateEvent, CreatedEvent, CoreTx> = {
  name: 'events.create',
  permission: null,
  outsideEvent: true,
  async execute(tx, ctx, input) {
    const ownerUserId = userId(ctx.actor);
    const workspace = await tx.workspaces.findPersonal(ownerUserId);
    if (!workspace) {
      throw new ActionError('not_found', 'Personal workspace not found');
    }
    const template = EVENT_TEMPLATES[input.templateKey];

    let event: Event | 'slug_taken' = 'slug_taken';
    for (let attempt = 0; attempt < SLUG_ATTEMPTS && event === 'slug_taken'; attempt++) {
      event = await tx.events.insert({
        workspaceId: workspace.id,
        ownerUserId,
        type: input.templateKey,
        name: input.name,
        slug: eventSlug(input.name),
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        timeZone: input.timeZone,
        status: 'planning',
        responseMode: template.responseMode,
      });
    }
    if (event === 'slug_taken') {
      throw new ActionError('conflict', 'Could not find a free link for this event, try again');
    }

    await tx.events.replaceModules(
      event.id,
      template.modules.map((item) => ({ ...item, config: {} })),
    );
    const venue = input.venue ? await tx.venues.insert(event.id, input.venue) : null;
    const subEvents = await tx.subEvents.insert(
      event.id,
      starterSubEvents(template, input.startsOn, input.endsOn).map((item, position) => ({
        name: item.name,
        startsAt: zonedTimeToUtc(item.date, item.start, input.timeZone),
        endsAt: zonedTimeToUtc(item.date, item.end, input.timeZone),
        venueId: venue?.id ?? null,
        position,
      })),
    );
    const categories = await tx.budgetCategories.insert(
      event.id,
      template.budgetCategories.map((name, position) => ({ name, position })),
    );
    if (categories === 'name_taken') throw new Error('Starter category names must be unique');
    const tasks = await tx.tasks.insert(
      event.id,
      starterTasks(template, input.startsOn, ctx.now.toISOString().slice(0, 10), subEvents),
    );

    const roles = await tx.roles.insert(
      event.id,
      STANDARD_ROLES.map((role) => ({
        name: role.name,
        isStandard: true,
        isOwner: role.isOwner,
        permissions: role.permissions,
      })),
    );
    if (roles === 'name_taken') throw new Error('Standard role names must be unique');
    const owner = await tx.members.join(event.id, ownerUserId, null);
    const ownerRole = roles.find((role) => role.isOwner)!;
    await tx.members.replaceAssignments(
      event.id,
      owner.id,
      [{ roleId: ownerRole.id, subEventIds: [] }],
      ownerUserId,
    );

    return {
      result: {
        ...event,
        counts: {
          subEvents: subEvents.length,
          venues: venue ? 1 : 0,
          tasks: tasks.length,
          budgetCategories: categories.length,
        },
      },
      activity: [
        {
          action: 'create',
          entityType: 'event',
          entityId: event.id,
          eventId: event.id,
          before: null,
          after: event,
        },
      ],
    };
  },
};

/** PATCH E (event.settings): details, dates, status and budget, guarded by If-Match. */
export const updateEvent: ActionDefinition<
  { expectedVersion: number; changes: UpdateEvent },
  Event,
  CoreTx
> = {
  name: 'events.update',
  permission: 'event.settings',
  async execute(tx, ctx, { expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const before = await tx.events.find(eventId);
    if (!before) throw new ActionError('not_found', 'Event not found');
    // Dates are checked against the stored ones when only one side changes.
    const startsOn = changes.startsOn ?? before.startsOn;
    const endsOn = changes.endsOn ?? before.endsOn;
    if (endsOn < startsOn) {
      throw new ActionError('validation_failed', 'The event must end on or after its start date', {
        fields: [{ path: 'endsOn', message: 'Must be on or after the start date' }],
      });
    }
    const after = await tx.events.update(eventId, expectedVersion, changes);
    if (!after) versionMismatch(await tx.events.find(eventId), expectedVersion);
    return {
      result: after,
      activity: [{ action: 'update', entityType: 'event', entityId: eventId, before, after }],
    };
  },
};

/**
 * PUT E/modules (event.settings): replaces the module set. Sets are guarded by the
 * parent's version (APIDesign), so this bumps the event's version.
 */
export const replaceModules: ActionDefinition<
  { expectedVersion: number; body: ReplaceModules },
  { modules: EventModule[]; event: Event },
  CoreTx
> = {
  name: 'events.replaceModules',
  permission: 'event.settings',
  async execute(tx, ctx, { expectedVersion, body }) {
    const eventId = ctx.eventId!;
    const event = await tx.events.update(eventId, expectedVersion, {});
    if (!event) versionMismatch(await tx.events.find(eventId), expectedVersion);
    const before = await tx.events.listModules(eventId);
    await tx.events.replaceModules(eventId, body.modules);
    const modules = await tx.events.listModules(eventId);
    return {
      result: { modules, event },
      activity: [
        {
          action: 'update',
          entityType: 'event_modules',
          entityId: eventId,
          before,
          after: modules,
        },
      ],
    };
  },
};
