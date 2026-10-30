import {
  eventRoom,
  jobId,
  LIVE_TOPIC,
  userRoom,
  type EntityChanged,
  type EntityOp,
  type LiveSignal,
  type PermissionsChanged,
} from '@pme/contracts';

import type { ActivityEntry, OutboxMessage } from './action.js';
import type { ActionContext } from './context.js';

/** Verbs that make an entity appear or go; everything else is an update. */
const OPS: Record<string, EntityOp> = {
  create: 'created',
  join: 'created',
  restore: 'created',
  delete: 'deleted',
  remove: 'deleted',
  leave: 'deleted',
  revoke: 'deleted',
};

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
const numberOr = (value: unknown) => (typeof value === 'number' ? value : null);
const stringOr = (value: unknown) => (typeof value === 'string' ? value : null);

const signal = (payload: LiveSignal, ...key: [string, ...(string | number)[]]): OutboxMessage => ({
  topic: LIVE_TOPIC,
  // The relay doesn't dedupe live rows; the key only has to be a valid job id.
  dedupeKey: jobId('live', ...key),
  payload,
});

const emit =
  (room: string, event: 'entity.changed' | 'permissions.changed' | 'member.removed') =>
  (data: Record<string, unknown>) => ({ kind: 'emit' as const, room, event, data });

/**
 * The live signals for an action's activity entries (APIDesign "Real-time contract"), written
 * by runAction in the same transaction, so a committed change always reaches open screens:
 * - entity.changed for each entry, to the event's room;
 * - permissions.changed when a role or a member changed (memberId null: anyone's may have);
 * - for a member who left or was removed: their sockets leave the room, then member.removed.
 */
export function liveSignals(
  ctx: ActionContext,
  entries: readonly ActivityEntry[],
): OutboxMessage[] {
  const messages: OutboxMessage[] = [];
  const permissions = new Map<string, Set<string | null>>();
  for (const entry of entries) {
    const eventId = entry.eventId ?? ctx.eventId;
    if (!eventId) continue;
    const op = OPS[entry.action] ?? 'updated';
    const version = numberOr(field(entry.after, 'version') ?? field(entry.before, 'version'));
    const changed: EntityChanged = {
      eventId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      op,
      version,
      subEventId:
        entry.entityType === 'sub_event'
          ? entry.entityId
          : stringOr(field(entry.after, 'subEventId') ?? field(entry.before, 'subEventId')),
      actorUserId: ctx.actor.kind === 'user' ? ctx.actor.userId : null,
      requestId: ctx.requestId,
    };
    messages.push(
      signal(
        emit(eventRoom(eventId), 'entity.changed')(changed),
        entry.entityType,
        entry.entityId,
        version ?? op,
      ),
    );

    if (entry.entityType === 'role' || entry.entityType === 'member') {
      const memberIds = permissions.get(eventId) ?? new Set();
      memberIds.add(entry.entityType === 'member' ? entry.entityId : null);
      permissions.set(eventId, memberIds);
    }
    const removedUser = stringOr(field(entry.before, 'userId'));
    if (entry.entityType === 'member' && op === 'deleted' && removedUser) {
      messages.push(
        signal({ kind: 'leave', userId: removedUser, eventId }, 'leave', eventId, removedUser),
        signal(
          emit(userRoom(removedUser), 'member.removed')({ eventId }),
          'removed',
          eventId,
          removedUser,
        ),
      );
    }
  }
  for (const [eventId, memberIds] of permissions) {
    const targets = memberIds.has(null) ? [null] : [...memberIds];
    for (const memberId of targets) {
      const data: PermissionsChanged = { eventId, memberId };
      messages.push(
        signal(
          emit(eventRoom(eventId), 'permissions.changed')(data),
          'permissions',
          eventId,
          memberId ?? 'all',
        ),
      );
    }
  }
  return messages;
}

/** For changes that move permissions without a role or member entry (scopes dropped). */
export const permissionsChanged = (eventId: string): OutboxMessage =>
  signal(
    emit(eventRoom(eventId), 'permissions.changed')({ eventId, memberId: null }),
    'permissions',
    eventId,
    'all',
  );
