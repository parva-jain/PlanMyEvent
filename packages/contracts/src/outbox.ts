import { z } from 'zod';

import { GuestScopeSchema } from './enums.js';
import { ContactImportMappingSchema } from './guests.js';

/** BullMQ queues, separated by urgency (SystemDesign 5.3). */
export const QUEUES = {
  /** Sign-in codes and member invites: small, urgent, highest priority. */
  emailCritical: 'email-critical',
  /** CSV contact imports (in chunks of 500 rows) and guest-scope switches. */
  imports: 'imports',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** A sign-in code email. The code is sensitive: see `sensitive` on its route. */
export const SignInCodeEmailSchema = z.object({
  template: z.literal('sign-in-code'),
  to: z.email(),
  code: z.string().regex(/^\d{6}$/),
  /** Minutes until the code expires, shown in the email. */
  expiresInMinutes: z.number().int().positive(),
});

/** A member invite email. Carries the link token, so it is sensitive too. */
export const MemberInviteEmailSchema = z.object({
  template: z.literal('member-invite'),
  to: z.email(),
  eventName: z.string(),
  inviterName: z.string(),
  url: z.url(),
  expiresAt: z.iso.datetime({ offset: true }),
});

export const EmailJobSchema = z.discriminatedUnion('template', [
  SignInCodeEmailSchema,
  MemberInviteEmailSchema,
]);
export type EmailJob = z.infer<typeof EmailJobSchema>;

/** A CSV contact import, run as the member who started it. Holds guests' details: sensitive. */
export const ContactImportJobSchema = z.object({
  importId: z.uuid(),
  eventId: z.uuid(),
  userId: z.uuid(),
  csv: z.string(),
  mapping: ContactImportMappingSchema,
});
export type ContactImportJob = z.infer<typeof ContactImportJobSchema>;

/** A guest-scope switch, run as the member who asked for it. Ids only: not sensitive. */
export const GuestScopeJobSchema = z.object({
  switchId: z.uuid(),
  eventId: z.uuid(),
  userId: z.uuid(),
  guestScope: GuestScopeSchema,
});
export type GuestScopeJob = z.infer<typeof GuestScopeJobSchema>;

interface OutboxRoute {
  queue: QueueName;
  /** BullMQ job name. */
  job: string;
  attempts: number;
  /** First retry delay in ms; doubles each attempt. */
  backoffMs: number;
  /**
   * Payload holds a secret (a sign-in code or invite link): the relay deletes the row as soon as it is
   * published instead of keeping it 7 days, and the job is removed from Redis once done.
   */
  sensitive: boolean;
}

/** Where each outbox topic goes. The relay rejects topics missing here. */
export const OUTBOX_ROUTES = {
  'email.critical': {
    queue: QUEUES.emailCritical,
    job: 'send',
    attempts: 5,
    backoffMs: 5_000,
    sensitive: true,
  },
  'contacts.import': {
    queue: QUEUES.imports,
    job: 'contacts',
    attempts: 3,
    backoffMs: 5_000,
    sensitive: true,
  },
  'event.guest_scope': {
    queue: QUEUES.imports,
    job: 'guest-scope',
    attempts: 3,
    backoffMs: 5_000,
    sensitive: false,
  },
} as const satisfies Record<string, OutboxRoute>;

export type OutboxTopic = keyof typeof OUTBOX_ROUTES;

/**
 * Live signals (payload `LiveSignal`) don't become jobs: the relay publishes them straight to
 * the sockets through Redis. At least once, like everything in the outbox.
 */
export const LIVE_TOPIC = 'live.signal';

export function isOutboxTopic(topic: string): topic is OutboxTopic {
  return Object.hasOwn(OUTBOX_ROUTES, topic);
}
