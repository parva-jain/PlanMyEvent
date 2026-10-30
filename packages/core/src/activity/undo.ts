import type {
  EventModule,
  UpdateEvent,
  UpdateSubEvent,
  UpdateTask,
  UpdateVenue,
} from '@pme/contracts';

import type { ActionDefinition, ActionOutcome, ActivityEntry } from '../action.js';
import type { ActionContext } from '../context.js';
import { ActionError } from '../errors.js';
import { replaceModules, updateEvent } from '../events/event-actions.js';
import {
  deleteSubEvent,
  deleteVenue,
  restoreSubEvent,
  restoreVenue,
  updateSubEvent,
  updateVenue,
} from '../events/program-actions.js';
import type { CoreTx, StoredActivity } from '../ports.js';
import {
  deleteTask,
  replaceTaskAssignees,
  restoreTask,
  updateTask,
} from '../tasks/task-actions.js';
import { actorAccess, requirePermission, userIdOf } from '../team/access.js';

/** The fields each update action accepts, so undo writes back only what it may. */
const EVENT_FIELDS = [
  'name',
  'description',
  'startsOn',
  'endsOn',
  'timeZone',
  'status',
  'budgetPaise',
] as const satisfies readonly (keyof UpdateEvent)[];
const VENUE_FIELDS = [
  'name',
  'address',
  'mapUrl',
] as const satisfies readonly (keyof UpdateVenue)[];
const SUB_EVENT_FIELDS = [
  'name',
  'startsAt',
  'endsAt',
  'venueId',
  'capacity',
  'visibility',
  'responseMode',
  'groupLabel',
  'notes',
  'position',
] as const satisfies readonly (keyof UpdateSubEvent)[];
const TASK_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'category',
  'dueOn',
  'subEventId',
  'position',
] as const satisfies readonly (keyof UpdateTask)[];

type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields => (value ?? {}) as Fields;
/** The entry's values for the fields an update action accepts. */
const pick = <T>(value: unknown, keys: readonly (keyof T & string)[]): T =>
  Object.fromEntries(
    keys.filter((key) => key in fields(value)).map((key) => [key, fields(value)[key]]),
  ) as T;
const versionOf = (value: unknown) => {
  const version = fields(value).version;
  return typeof version === 'number' ? version : -1;
};

/** Someone changed it since: 409 with what it looks like now (SystemDesign 5.8). */
function changedSince(current: unknown): never {
  throw new ActionError('version_conflict', 'It has changed since; undo would overwrite that', {
    current,
  });
}
/** For rows without a version: the fields the entry set must still hold those values. */
function assertStill(current: object | null, after: Fields) {
  if (!current) throw new ActionError('not_found', 'It no longer exists');
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify((current as Fields)[key]) !== JSON.stringify(value)) changedSince(current);
  }
}

/** The reversing action with its input, bound so the planner table stays type-safe. */
interface Inverse {
  /** The reversing action's own permission check, sub-event scope included. */
  check(tx: CoreTx, ctx: ActionContext): Promise<void>;
  run(tx: CoreTx, ctx: ActionContext): Promise<ActionOutcome<unknown>>;
}
function inverse<I, R>(action: ActionDefinition<I, R, CoreTx>, input: I): Inverse {
  return {
    async check(tx, ctx) {
      if (action.permission === null) return;
      const subEventId = (await action.subEventOf?.(tx, ctx, input)) ?? null;
      await requirePermission(tx, ctx, action.permission, subEventId);
    },
    run: (tx, ctx) => action.execute(tx, ctx, input),
  };
}

type Planner = (
  tx: CoreTx,
  ctx: ActionContext,
  entry: StoredActivity,
) => Promise<Inverse> | Inverse;

/**
 * What can be undone and how, by `<entityType>.<verb>`. Team changes (roles, members,
 * invites) aren't here: reversing them touches other people's access.
 */
const PLANNERS: Record<string, Planner> = {
  'event.update': (_tx, _ctx, entry) =>
    inverse(updateEvent, {
      expectedVersion: versionOf(entry.after),
      changes: pick<UpdateEvent>(entry.before, EVENT_FIELDS),
    }),
  'event_modules.update': async (tx, ctx, entry) => {
    const eventId = ctx.eventId!;
    const current = await tx.events.listModules(eventId);
    if (JSON.stringify(current) !== JSON.stringify(entry.after)) changedSince(current);
    const event = await tx.events.find(eventId);
    if (!event) throw new ActionError('not_found', 'Event not found');
    return inverse(replaceModules, {
      expectedVersion: event.version,
      body: { modules: entry.before as EventModule[] },
    });
  },
  'venue.create': async (tx, ctx, entry) => {
    const current = await tx.venues.find(ctx.eventId!, entry.entityId);
    assertStill(current, pick<Fields>(entry.after, VENUE_FIELDS));
    return inverse(deleteVenue, { venueId: entry.entityId });
  },
  'venue.update': async (tx, ctx, entry) => {
    assertStill(await tx.venues.find(ctx.eventId!, entry.entityId), fields(entry.after));
    return inverse(updateVenue, {
      venueId: entry.entityId,
      changes: pick<UpdateVenue>(entry.before, VENUE_FIELDS),
    });
  },
  'venue.delete': (_tx, _ctx, entry) => inverse(restoreVenue, { venueId: entry.entityId }),
  'sub_event.create': (_tx, _ctx, entry) =>
    inverse(deleteSubEvent, {
      subEventId: entry.entityId,
      expectedVersion: versionOf(entry.after),
    }),
  'sub_event.update': (_tx, _ctx, entry) =>
    inverse(updateSubEvent, {
      subEventId: entry.entityId,
      expectedVersion: versionOf(entry.after),
      changes: pick<UpdateSubEvent>(entry.before, SUB_EVENT_FIELDS),
    }),
  'sub_event.delete': (_tx, _ctx, entry) =>
    inverse(restoreSubEvent, { subEventId: entry.entityId }),
  'task.create': (_tx, _ctx, entry) =>
    inverse(deleteTask, { taskId: entry.entityId, expectedVersion: versionOf(entry.after) }),
  'task.update': (_tx, _ctx, entry) =>
    inverse(updateTask, {
      taskId: entry.entityId,
      expectedVersion: versionOf(entry.after),
      changes: pick<UpdateTask>(entry.before, TASK_FIELDS),
    }),
  'task.assign': (_tx, _ctx, entry) =>
    inverse(replaceTaskAssignees, {
      taskId: entry.entityId,
      expectedVersion: versionOf(entry.after),
      memberIds: (fields(entry.before).memberIds as string[] | undefined) ?? [],
    }),
  'task.delete': (_tx, _ctx, entry) =>
    inverse(restoreTask, {
      taskId: entry.entityId,
      subEventId: (fields(entry.before).subEventId as string | null | undefined) ?? null,
    }),
};

/** Whether the log can reverse this kind of entry at all (the feed's canUndo uses it). */
export const isUndoable = (entry: Pick<StoredActivity, 'action' | 'undoOfId'>) =>
  entry.undoOfId === null && Object.hasOwn(PLANNERS, entry.action);

const notUndoable = (reason: 'already_undone' | 'not_undoable', message: string) =>
  new ActionError('conflict', message, { reason });

/**
 * POST E/activity/{entryId}/undo (SystemDesign 5.8): undo is a normal action. Its author or
 * someone with event.settings may undo an entry; the reversing action then runs with its own
 * permission check (sub-event scope included) and version check, so a change made since
 * gives 409 instead of being overwritten. The entries it writes point back with undo_of_id.
 */
export const undoActivity: ActionDefinition<
  { entryId: string },
  { entityType: string; entityId: string },
  CoreTx
> = {
  name: 'activity.undo',
  permission: null,
  async execute(tx, ctx, { entryId }) {
    const eventId = ctx.eventId!;
    await actorAccess(tx, ctx);
    const entry = await tx.activity.lockForUndo(eventId, entryId);
    if (!entry) throw new ActionError('not_found', 'Activity entry not found');
    if (entry.actorUserId !== userIdOf(ctx)) await requirePermission(tx, ctx, 'event.settings');
    if (entry.undoneAt) throw notUndoable('already_undone', 'This change was already undone');
    const planner = entry.undoOfId === null ? PLANNERS[entry.action] : undefined;
    if (!planner) throw notUndoable('not_undoable', "This change can't be undone");

    const reverse = await planner(tx, ctx, entry);
    await reverse.check(tx, ctx);
    const outcome = await reverse.run(tx, ctx);
    await tx.activity.markUndone(eventId, entryId);
    const activity: ActivityEntry[] = (outcome.activity ?? []).map((item) => ({
      ...item,
      undoOfId: entry.id,
    }));
    return {
      result: { entityType: entry.entityType, entityId: entry.entityId },
      activity,
      ...(outcome.outbox ? { outbox: outcome.outbox } : {}),
    };
  },
};
