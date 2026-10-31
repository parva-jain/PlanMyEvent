import { z } from 'zod';

import { AttendanceSourceSchema, AttendanceStatusSchema, DeliveryStatusSchema } from './enums.js';

// ---- Invitations ----------------------------------------------------------------------------

/** One guest's (household's or contact's) answer for the whole event or one sub-event. */
export const AttendanceSummarySchema = z.object({
  id: z.uuid(),
  /** Null: the whole event. */
  subEventId: z.uuid().nullable(),
  status: AttendanceStatusSchema,
  partySize: z.number().int(),
  respondedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type AttendanceSummary = z.infer<typeof AttendanceSummarySchema>;

export const InvitationSchema = z.object({
  id: z.uuid(),
  /** Exactly one of householdId and contactId is set. */
  householdId: z.uuid().nullable(),
  contactId: z.uuid().nullable(),
  /** The household's or contact's name, for lists. */
  guestName: z.string(),
  deliveryStatus: DeliveryStatusSchema,
  /** The member who hands over the card. */
  distributorMemberId: z.uuid().nullable(),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  deliveredAt: z.iso.datetime({ offset: true }).nullable(),
  lastOpenedAt: z.iso.datetime({ offset: true }).nullable(),
  /** The sub-events it covers when guests are per sub-event; empty for the whole event. */
  subEventIds: z.array(z.uuid()),
  /** The guest's attendance rows: one for the whole event, or one per sub-event. */
  attendance: z.array(AttendanceSummarySchema),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Invitation = z.infer<typeof InvitationSchema>;

const subEventIds = z
  .array(z.uuid())
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Each sub-event may appear once' });

/**
 * POST E/invitations: a household or a contact. With guests per sub-event, subEventIds says
 * which sub-events (at least one); for the whole event it is left out.
 */
export const CreateInvitationSchema = z
  .object({
    householdId: z.uuid().optional(),
    contactId: z.uuid().optional(),
    subEventIds: subEventIds.optional(),
    distributorMemberId: z.uuid().nullable().optional(),
  })
  .refine((value) => !!value.householdId !== !!value.contactId, {
    message: 'Invite either a household or a contact',
    path: ['householdId'],
  });
export type CreateInvitation = z.infer<typeof CreateInvitationSchema>;

/** POST E/invitations/bulk: up to 200 at once; ones that can't be invited are reported. */
export const BulkCreateInvitationsSchema = z
  .object({
    householdIds: z.array(z.uuid()).max(200).default([]),
    contactIds: z.array(z.uuid()).max(200).default([]),
    subEventIds: subEventIds.optional(),
    distributorMemberId: z.uuid().nullable().optional(),
  })
  .refine((value) => value.householdIds.length + value.contactIds.length >= 1, {
    message: 'Choose at least one guest',
    path: ['householdIds'],
  })
  .refine((value) => value.householdIds.length + value.contactIds.length <= 200, {
    message: 'At most 200 guests at once',
    path: ['householdIds'],
  });
export type BulkCreateInvitations = z.infer<typeof BulkCreateInvitationsSchema>;

/** Why a guest wasn't invited. */
export const InviteSkipReasonSchema = z.enum([
  'already_invited',
  'household_invited',
  'member_invited',
  'not_found',
]);
export type InviteSkipReason = z.infer<typeof InviteSkipReasonSchema>;

export const BulkCreateInvitationsResultSchema = z.object({
  created: z.array(InvitationSchema),
  skipped: z.array(
    z.object({
      householdId: z.uuid().nullable(),
      contactId: z.uuid().nullable(),
      reason: InviteSkipReasonSchema,
    }),
  ),
});
export type BulkCreateInvitationsResult = z.infer<typeof BulkCreateInvitationsResultSchema>;

/** PATCH E/invitations/{id}: delivery, distributor and (per sub-event) which sub-events. */
export const UpdateInvitationSchema = z
  .object({
    deliveryStatus: DeliveryStatusSchema,
    distributorMemberId: z.uuid().nullable(),
    subEventIds: subEventIds.min(1, 'Choose at least one sub-event'),
  })
  .partial();
export type UpdateInvitation = z.infer<typeof UpdateInvitationSchema>;

/** What a distributor without guests.invite may change on an invitation they hand over. */
export const DISTRIBUTOR_FIELDS = [
  'deliveryStatus',
] as const satisfies readonly (keyof UpdateInvitation)[];

/** PATCH E/invitations/bulk: one delivery status or distributor for many, no If-Match. */
export const BulkUpdateInvitationsSchema = z
  .object({
    invitationIds: z.array(z.uuid()).min(1).max(500),
    deliveryStatus: DeliveryStatusSchema.optional(),
    distributorMemberId: z.uuid().nullable().optional(),
  })
  .refine(
    (value) => value.deliveryStatus !== undefined || value.distributorMemberId !== undefined,
    { message: 'Set a delivery status or a distributor', path: ['deliveryStatus'] },
  );
export type BulkUpdateInvitations = z.infer<typeof BulkUpdateInvitationsSchema>;

export const InvitationQuerySchema = z.object({
  deliveryStatus: DeliveryStatusSchema.optional(),
  /** A member id, or "me". */
  distributor: z.union([z.uuid(), z.literal('me')]).optional(),
  subEventId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type InvitationQuery = z.infer<typeof InvitationQuerySchema>;

/** GET E/invitations/{id}/share: the magic link and a WhatsApp message to forward. */
export const InvitationShareSchema = z.object({
  url: z.url(),
  message: z.string(),
  /** wa.me link with the message, to the primary contact's phone when known. */
  whatsappUrl: z.url(),
});
export type InvitationShare = z.infer<typeof InvitationShareSchema>;

// ---- Attendance -----------------------------------------------------------------------------

export const AttendanceSchema = AttendanceSummarySchema.extend({
  householdId: z.uuid().nullable(),
  contactId: z.uuid().nullable(),
  guestName: z.string(),
  invitationId: z.uuid().nullable(),
  source: AttendanceSourceSchema,
  checkedInAt: z.iso.datetime({ offset: true }).nullable(),
  version: z.number().int().positive(),
});
export type Attendance = z.infer<typeof AttendanceSchema>;

export const AttendanceQuerySchema = z.object({
  subEventId: z.union([z.uuid(), z.literal('event')]).optional(),
  status: AttendanceStatusSchema.optional(),
  source: AttendanceSourceSchema.optional(),
  /** Guest name search. */
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type AttendanceQuery = z.infer<typeof AttendanceQuerySchema>;

/** PATCH E/attendance/{id}: an organizer corrects a guest's answer or party size. */
export const UpdateAttendanceSchema = z
  .object({
    status: z.enum(['invited', 'confirmed', 'declined', 'cancelled']),
    partySize: z.number().int().min(1, 'At least 1').max(50, 'At most 50'),
  })
  .partial();
export type UpdateAttendance = z.infer<typeof UpdateAttendanceSchema>;
