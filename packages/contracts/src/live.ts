import { z } from 'zod';

/*
 * The /live socket contract (APIDesign "Real-time contract"). Signals say what changed, never
 * the data; clients re-fetch through the REST API, so the same guard applies every time.
 */

export const LIVE_NAMESPACE = '/live';
/** A client may be in at most this many event rooms, and a user hold this many sockets. */
export const MAX_EVENT_ROOMS = 10;
export const MAX_SOCKETS_PER_USER = 10;

export const eventRoom = (eventId: string) => `event:${eventId}`;
export const userRoom = (userId: string) => `user:${userId}`;

export const EntityOpSchema = z.enum(['created', 'updated', 'deleted']);
export type EntityOp = z.infer<typeof EntityOpSchema>;

export const EntityChangedSchema = z.object({
  eventId: z.uuid(),
  entityType: z.string(),
  entityId: z.uuid(),
  op: EntityOpSchema,
  /** Lets a client ignore a signal older than what it holds; null for unversioned rows. */
  version: z.number().int().nullable(),
  subEventId: z.uuid().nullable(),
  actorUserId: z.uuid().nullable(),
  /** The client skips signals for its own requests (it sends X-Request-Id). */
  requestId: z.string().nullable(),
});
export type EntityChanged = z.infer<typeof EntityChangedSchema>;

/** Someone's roles changed: if memberId is mine (or null), re-fetch E/me. */
export const PermissionsChangedSchema = z.object({
  eventId: z.uuid(),
  memberId: z.uuid().nullable(),
});
export type PermissionsChanged = z.infer<typeof PermissionsChangedSchema>;

/** Sent to the removed user's own room; their sockets have already left the event room. */
export const MemberRemovedSchema = z.object({ eventId: z.uuid() });
export type MemberRemoved = z.infer<typeof MemberRemovedSchema>;

export interface ServerToClientEvents {
  'entity.changed': (signal: EntityChanged) => void;
  'permissions.changed': (signal: PermissionsChanged) => void;
  'member.removed': (signal: MemberRemoved) => void;
}

export const EventJoinSchema = z.object({ eventId: z.uuid() });
export type EventJoin = z.infer<typeof EventJoinSchema>;
export type JoinAck = { ok: true } | { ok: false; code: string };

export interface ClientToServerEvents {
  'event:join': (body: EventJoin, ack: (result: JoinAck) => void) => void;
  'event:leave': (body: EventJoin, ack: (result: JoinAck) => void) => void;
}

/**
 * The payload of an outbox row with topic `live.signal`: the worker's relay turns it into a
 * room broadcast, or makes a user's sockets leave an event room (member removed).
 */
export const LiveSignalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('emit'),
    room: z.string(),
    event: z.enum(['entity.changed', 'permissions.changed', 'member.removed']),
    data: z.record(z.string(), z.unknown()),
  }),
  z.object({ kind: z.literal('leave'), userId: z.uuid(), eventId: z.uuid() }),
]);
export type LiveSignal = z.infer<typeof LiveSignalSchema>;
