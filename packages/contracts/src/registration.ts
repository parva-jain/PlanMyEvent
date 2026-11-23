import { z } from 'zod';

import { DateOnlySchema } from './events.js';
import { EventStatusSchema, EventTypeSchema, GuestScopeSchema } from './enums.js';
import { PhoneSchema } from './guests.js';
import { PublicVenueSchema } from './public.js';

/*
 * Open registration (PRD "Open registration", APIDesign "Public endpoints"). The public event
 * page shows the event and its public sub-events; anyone may register for the ones open to
 * registration. Registering is the RSVP: it makes a contact, an invitation sent digitally and
 * attendance rows with status registered, and emails the magic link to view or cancel.
 */

/**
 * Whether a scope takes registrations now: open; full (capacity reached); closed (the event is
 * completed); or not_open (invite only, or invite + RSVP).
 */
export const RegistrationStateSchema = z.enum(['open', 'full', 'closed', 'not_open']);
export type RegistrationState = z.infer<typeof RegistrationStateSchema>;

const spotsLeft = z.number().int().min(0).nullable();

export const PublicSubEventSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  groupLabel: z.string().nullable(),
  notes: z.string().nullable(),
  venue: PublicVenueSchema.nullable(),
  capacity: z.number().int().positive().nullable(),
  /** Places left; null without a capacity. */
  spotsLeft,
  /** Per sub-event guests only; with whole-event guests registration is for the event. */
  registration: RegistrationStateSchema,
});
export type PublicSubEvent = z.infer<typeof PublicSubEventSchema>;

/** GET /v1/public/events/{slug}. */
export const PublicEventSchema = z.object({
  event: z.object({
    name: z.string(),
    slug: z.string(),
    type: EventTypeSchema,
    status: EventStatusSchema,
    description: z.string().nullable(),
    startsOn: DateOnlySchema,
    endsOn: DateOnlySchema,
    timeZone: z.string(),
  }),
  guestScope: GuestScopeSchema,
  /** Public sub-events by start time. */
  subEvents: z.array(PublicSubEventSchema),
  /**
   * With whole-event guests: whether the event takes registrations, and the fewest places left
   * among sub-events with a capacity. With per-sub-event guests, each sub-event says instead.
   */
  wholeEvent: z.object({ registration: RegistrationStateSchema, spotsLeft }).nullable(),
});
export type PublicEvent = z.infer<typeof PublicEventSchema>;

/** POST /v1/public/events/{slug}/registrations. */
export const RegisterSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(120),
    email: z.email('Enter a valid email').max(254).optional(),
    phone: PhoneSchema.optional(),
    /** Sub-events to register for; empty with whole-event guests. */
    subEventIds: z.array(z.uuid()).max(50).default([]),
    /** People coming, including the registrant. */
    partySize: z.number().int().min(1).max(10).default(1),
    /** Cloudflare Turnstile's token from the form. */
    turnstileToken: z.string().min(1).max(2048),
  })
  .strict()
  .refine((value) => value.email !== undefined || value.phone !== undefined, {
    message: 'Enter an email or a phone number',
    path: ['email'],
  });
export type Register = z.infer<typeof RegisterSchema>;

/**
 * The same answer whether this is a new registration or someone already registered, so the
 * form never tells a stranger whether an email or phone is on the list. Either way, a known
 * email gets (again) the confirmation with the link.
 */
export const RegistrationResultSchema = z.object({
  /** The scopes asked for: null is the whole event. */
  subEventIds: z.array(z.uuid().nullable()),
  /** An email was given, so the confirmation with the link is on its way. */
  confirmationEmail: z.boolean(),
});
export type RegistrationResult = z.infer<typeof RegistrationResultSchema>;

/**
 * POST E/attendance: an organizer adds a walk-in or a manual registration. An existing contact,
 * or a new one by name; a guest already listed for that scope gets the new status instead.
 */
export const CreateAttendanceSchema = z
  .object({
    contactId: z.uuid().optional(),
    contact: z
      .object({
        name: z.string().trim().min(1, 'Enter a name').max(120),
        phone: PhoneSchema.optional(),
        email: z.email('Enter a valid email').max(254).optional(),
      })
      .optional(),
    /** Null: the whole event (whole-event guests). */
    subEventId: z.uuid().nullable(),
    partySize: z.number().int().min(1).max(50).default(1),
    /** A walk-in is checked in; a manual registration is registered. */
    status: z.enum(['registered', 'checked_in']).default('checked_in'),
  })
  .strict()
  .refine((value) => (value.contactId === undefined) !== (value.contact === undefined), {
    message: 'Choose a contact or enter a new one',
    path: ['contactId'],
  });
export type CreateAttendance = z.infer<typeof CreateAttendanceSchema>;
