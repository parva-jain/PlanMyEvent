import {
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
import type { CoreTx } from '../ports.js';
import { eventSlug } from './slug.js';
import { EVENT_TEMPLATES } from './templates.js';
import { versionMismatch } from './versioned.js';

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
 * template's modules and starter sub-events, and an optional first venue. The creator owns
 * it (milestone 4 adds the Owner role assignment). Any signed-in user may create one.
 */
export const createEvent: ActionDefinition<CreateEvent, CreatedEvent, CoreTx> = {
  name: 'events.create',
  permission: null,
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

    return {
      result: { ...event, counts: { subEvents: subEvents.length, venues: venue ? 1 : 0 } },
      activity: [
        { action: 'create', entityType: 'event', entityId: event.id, before: null, after: event },
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
