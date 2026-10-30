import { z } from 'zod';

/** BullMQ queues, separated by urgency (SystemDesign 5.3). */
export const QUEUES = {
  /** Sign-in codes and member invites: small, urgent, highest priority. */
  emailCritical: 'email-critical',
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
