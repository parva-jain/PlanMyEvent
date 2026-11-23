import type { Channel } from '@pme/contracts';

/**
 * Who is acting. Guests act through a link token; a visitor is someone registering on the
 * public page (no account, no link yet), by the name they typed; system covers workers.
 */
export type Actor =
  | { kind: 'user'; userId: string; memberId: string | null }
  | { kind: 'guest'; invitationId: string }
  | { kind: 'visitor'; name: string }
  | { kind: 'system'; name: string };

/** Everything an action needs to know about the caller, built by the API or worker. */
export interface ActionContext {
  requestId: string;
  channel: Channel;
  actor: Actor;
  /** Tenant boundary; null only for actions outside an event (e.g. creating one). */
  eventId: string | null;
  now: Date;
}
