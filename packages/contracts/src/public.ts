import { z } from 'zod';

import { DateOnlySchema } from './events.js';
import {
  AttendanceStatusSchema,
  EventTypeSchema,
  GuestScopeSchema,
  ResponseModeSchema,
} from './enums.js';

/*
 * Public invite page (APIDesign "Public endpoints"). What a guest sees through their link:
 * the event, their own name, the sub-events on their invitation with times and venues, and
 * their own answers. Never other guests, headcounts, organizers' details or tasks.
 */

const VenueSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  mapUrl: z.string().nullable(),
});

const ScheduleItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  venue: VenueSchema.nullable(),
});

/** One thing the guest answers: the whole event, or one sub-event. */
export const InviteScopeSchema = z.object({
  /** Null: the whole event. */
  subEventId: z.uuid().nullable(),
  /** The sub-event, when per sub-event. */
  subEvent: ScheduleItemSchema.nullable(),
  responseMode: ResponseModeSchema,
  /** Invite + RSVP: the guest may answer; invite only: shown, not answered. */
  canRespond: z.boolean(),
  status: AttendanceStatusSchema,
  /** How many are coming: the organizer's estimate until the guest answers. */
  partySize: z.number().int(),
  respondedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type InviteScope = z.infer<typeof InviteScopeSchema>;

export const PublicInviteSchema = z.object({
  event: z.object({
    name: z.string(),
    type: EventTypeSchema,
    description: z.string().nullable(),
    startsOn: DateOnlySchema,
    endsOn: DateOnlySchema,
    timeZone: z.string(),
  }),
  /** "Sharma family" or "Ravi Kumar". */
  guestName: z.string(),
  guestScope: GuestScopeSchema,
  scopes: z.array(InviteScopeSchema),
  /** The event's schedule (not private sub-events), for a whole-event invitation. */
  schedule: z.array(ScheduleItemSchema),
});
export type PublicInvite = z.infer<typeof PublicInviteSchema>;

/** POST /v1/public/invites/{token}/rsvp: one answer per scope; last answer wins. */
export const RsvpSchema = z.object({
  responses: z
    .array(
      z.object({
        subEventId: z.uuid().nullable(),
        attending: z.boolean(),
        /** Required when attending; checked 1 to 50, not against the expected count. */
        partySize: z.number().int().min(1, 'At least 1').max(50, 'At most 50').optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type Rsvp = z.infer<typeof RsvpSchema>;
