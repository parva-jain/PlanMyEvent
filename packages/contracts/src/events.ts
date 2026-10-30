import { z } from 'zod';

import {
  EventStatusSchema,
  EventTypeSchema,
  GuestScopeSchema,
  ModuleSchema,
  ResponseModeSchema,
  VALUE_SETS,
  VisibilitySchema,
} from './enums.js';

/** Calendar date, `YYYY-MM-DD` (DatabaseDesign "Calendar dates"). */
export const DateOnlySchema = z.iso.date();

/** IANA time zone the runtime knows, e.g. Asia/Kolkata. */
export const TimeZoneSchema = z.string().refine(
  (zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Unknown time zone' },
);

/** Money in paise (CLAUDE.md rule 5). JSON numbers are exact up to ₹90 trillion. */
export const PaiseSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Lists share one envelope (APIDesign "Single resources and lists"). */
export const listOf = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), nextCursor: z.string().nullable(), hasMore: z.boolean() });

// ---- Templates --------------------------------------------------------------------------

export const TEMPLATE_KEYS = VALUE_SETS.eventType;
export const TemplateKeySchema = z.enum(TEMPLATE_KEYS);
export type TemplateKey = z.infer<typeof TemplateKeySchema>;

export const EventTemplateSchema = z.object({
  key: TemplateKeySchema,
  modules: z.array(z.object({ module: ModuleSchema, enabled: z.boolean() })),
  responseMode: ResponseModeSchema,
  /** Starter sub-events: day offset from the start date and local times. */
  subEvents: z.array(
    z.object({
      name: z.string(),
      dayOffset: z.number().int().nonnegative(),
      start: z.string(),
      end: z.string(),
    }),
  ),
  /**
   * Starter tasks: due `daysBefore` the start date (none if that's already past), linked to
   * the starter sub-event named `subEvent` when given.
   */
  tasks: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      category: z.string(),
      daysBefore: z.number().int().nonnegative().nullable(),
      subEvent: z.string().optional(),
    }),
  ),
});
export type EventTemplate = z.infer<typeof EventTemplateSchema>;

// ---- Events -----------------------------------------------------------------------------

export const EventSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  type: EventTypeSchema,
  description: z.string().nullable(),
  startsOn: DateOnlySchema,
  endsOn: DateOnlySchema,
  timeZone: z.string(),
  status: EventStatusSchema,
  guestScope: GuestScopeSchema,
  responseMode: ResponseModeSchema,
  budgetPaise: PaiseSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Event = z.infer<typeof EventSchema>;

/** POST /v1/events response: the event plus what the template created. */
export const CreatedEventSchema = EventSchema.extend({
  counts: z.object({
    subEvents: z.number().int(),
    venues: z.number().int(),
    tasks: z.number().int(),
  }),
});
export type CreatedEvent = z.infer<typeof CreatedEventSchema>;

const dateOrder = (value: { startsOn?: string; endsOn?: string }) =>
  !value.startsOn || !value.endsOn || value.endsOn >= value.startsOn;
const dateOrderIssue = { message: 'Must be on or after the start date', path: ['endsOn'] };

export const VenueInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a venue name').max(120),
  address: z.string().trim().max(300).nullable().optional(),
  mapUrl: z.url().max(500).nullable().optional(),
});

export const CreateEventSchema = z
  .object({
    templateKey: TemplateKeySchema,
    name: z.string().trim().min(1, 'Enter a name').max(120),
    startsOn: DateOnlySchema,
    endsOn: DateOnlySchema,
    timeZone: TimeZoneSchema.default('Asia/Kolkata'),
    venue: VenueInputSchema.optional(),
  })
  .refine(dateOrder, dateOrderIssue);
export type CreateEvent = z.infer<typeof CreateEventSchema>;

export const UpdateEventSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(120),
    description: z.string().trim().max(2_000).nullable(),
    startsOn: DateOnlySchema,
    endsOn: DateOnlySchema,
    timeZone: TimeZoneSchema,
    status: EventStatusSchema,
    budgetPaise: PaiseSchema.nullable(),
  })
  .partial()
  .refine(dateOrder, dateOrderIssue);
export type UpdateEvent = z.infer<typeof UpdateEventSchema>;

/** GET /v1/me/events item: an event I'm an active member of, with my role names. */
export const MyEventSchema = EventSchema.pick({
  id: true,
  slug: true,
  name: true,
  type: true,
  startsOn: true,
  endsOn: true,
  timeZone: true,
  status: true,
}).extend({ roles: z.array(z.string()) });
export type MyEvent = z.infer<typeof MyEventSchema>;

// ---- Modules ----------------------------------------------------------------------------

export const EventModuleSchema = z.object({
  module: ModuleSchema,
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
});
export type EventModule = z.infer<typeof EventModuleSchema>;

/** PUT E/modules replaces the whole set, guarded by the event's version. */
export const ReplaceModulesSchema = z.object({
  modules: z
    .array(EventModuleSchema.extend({ config: EventModuleSchema.shape.config.default({}) }))
    .refine((list) => new Set(list.map((item) => item.module)).size === list.length, {
      message: 'Each module may appear once',
    }),
});
export type ReplaceModules = z.infer<typeof ReplaceModulesSchema>;

// ---- Venues -----------------------------------------------------------------------------

export const VenueSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  mapUrl: z.string().nullable(),
});
export type Venue = z.infer<typeof VenueSchema>;
export const CreateVenueSchema = VenueInputSchema;
export type CreateVenue = z.infer<typeof CreateVenueSchema>;
export const UpdateVenueSchema = VenueInputSchema.partial();
export type UpdateVenue = z.infer<typeof UpdateVenueSchema>;

// ---- Sub-events -------------------------------------------------------------------------

export const SubEventSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  venueId: z.uuid().nullable(),
  capacity: z.number().int().positive().nullable(),
  visibility: VisibilitySchema,
  /** Only when the event's guest scope is per_sub_event. */
  responseMode: ResponseModeSchema.nullable(),
  groupLabel: z.string().nullable(),
  notes: z.string().nullable(),
  position: z.number().int(),
  version: z.number().int().positive(),
});
export type SubEvent = z.infer<typeof SubEventSchema>;

const timeOrder = (value: { startsAt?: string; endsAt?: string }) =>
  !value.startsAt || !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt);
const timeOrderIssue = { message: 'Must end after it starts', path: ['endsAt'] };

const subEventFields = {
  name: z.string().trim().min(1, 'Enter a name').max(120),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  venueId: z.uuid().nullable(),
  capacity: z.number().int().positive().max(1_000_000).nullable(),
  visibility: VisibilitySchema,
  responseMode: ResponseModeSchema.nullable(),
  groupLabel: z.string().trim().max(60).nullable(),
  notes: z.string().trim().max(2_000).nullable(),
  position: z.number().int().min(0).max(10_000),
};

export const CreateSubEventSchema = z
  .object(subEventFields)
  .partial()
  .required({ name: true, startsAt: true, endsAt: true })
  .refine(timeOrder, timeOrderIssue);
export type CreateSubEvent = z.infer<typeof CreateSubEventSchema>;

export const UpdateSubEventSchema = z
  .object(subEventFields)
  .partial()
  .refine(timeOrder, timeOrderIssue);
export type UpdateSubEvent = z.infer<typeof UpdateSubEventSchema>;
