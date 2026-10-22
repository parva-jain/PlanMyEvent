import { z } from 'zod';

/**
 * Closed value sets from docs/DatabaseDesign.md "Enumerations".
 * The database stores these as text + check constraints generated from these lists,
 * so web, API and database always agree. Add values at the end; removing one needs
 * a data migration first.
 */
export const VALUE_SETS = {
  plan: ['free', 'pro'],
  eventType: ['wedding', 'conference', 'fair', 'celebration', 'custom'],
  eventStatus: ['draft', 'planning', 'live', 'completed', 'archived'],
  guestScope: ['whole_event', 'per_sub_event'],
  responseMode: ['invite_only', 'invite_rsvp', 'open_registration'],
  visibility: ['public', 'private', 'invite_only'],
  module: ['guests', 'registration', 'gallery'],
  memberStatus: ['active', 'removed'],
  taskStatus: ['todo', 'in_progress', 'blocked', 'done'],
  taskPriority: ['low', 'medium', 'high', 'urgent'],
  paymentStatus: ['planned', 'advance_paid', 'partially_paid', 'paid'],
  deliveryStatus: ['not_sent', 'sent_digitally', 'delivered_in_person'],
  attendanceSource: ['invited', 'registered'],
  attendanceStatus: [
    'invited',
    'confirmed',
    'declined',
    'registered',
    'waitlisted',
    'cancelled',
    'checked_in',
  ],
  mediaKind: ['gallery', 'receipt', 'cover'],
  mediaStatus: ['pending', 'ready', 'failed'],
  channel: ['app', 'public_link', 'system', 'ai', 'whatsapp'],
  webhookStatus: ['received', 'processing', 'processed', 'failed'],
  usageMetric: ['ai_call', 'email_sent', 'whatsapp_message', 'storage_bytes'],
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type ValueSetName = keyof typeof VALUE_SETS;
export type ValueOf<TName extends ValueSetName> = (typeof VALUE_SETS)[TName][number];

export const PlanSchema = z.enum(VALUE_SETS.plan);
export const EventTypeSchema = z.enum(VALUE_SETS.eventType);
export const EventStatusSchema = z.enum(VALUE_SETS.eventStatus);
export const GuestScopeSchema = z.enum(VALUE_SETS.guestScope);
export const ResponseModeSchema = z.enum(VALUE_SETS.responseMode);
export const VisibilitySchema = z.enum(VALUE_SETS.visibility);
export const ModuleSchema = z.enum(VALUE_SETS.module);
export const MemberStatusSchema = z.enum(VALUE_SETS.memberStatus);
export const TaskStatusSchema = z.enum(VALUE_SETS.taskStatus);
export const TaskPrioritySchema = z.enum(VALUE_SETS.taskPriority);
export const PaymentStatusSchema = z.enum(VALUE_SETS.paymentStatus);
export const DeliveryStatusSchema = z.enum(VALUE_SETS.deliveryStatus);
export const AttendanceSourceSchema = z.enum(VALUE_SETS.attendanceSource);
export const AttendanceStatusSchema = z.enum(VALUE_SETS.attendanceStatus);
export const MediaKindSchema = z.enum(VALUE_SETS.mediaKind);
export const MediaStatusSchema = z.enum(VALUE_SETS.mediaStatus);
export const ChannelSchema = z.enum(VALUE_SETS.channel);
export const WebhookStatusSchema = z.enum(VALUE_SETS.webhookStatus);
export const UsageMetricSchema = z.enum(VALUE_SETS.usageMetric);

export type Plan = z.infer<typeof PlanSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type EventStatus = z.infer<typeof EventStatusSchema>;
export type GuestScope = z.infer<typeof GuestScopeSchema>;
export type ResponseMode = z.infer<typeof ResponseModeSchema>;
export type Visibility = z.infer<typeof VisibilitySchema>;
export type Module = z.infer<typeof ModuleSchema>;
export type MemberStatus = z.infer<typeof MemberStatusSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;
export type AttendanceSource = z.infer<typeof AttendanceSourceSchema>;
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;
export type MediaKind = z.infer<typeof MediaKindSchema>;
export type MediaStatus = z.infer<typeof MediaStatusSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type WebhookStatus = z.infer<typeof WebhookStatusSchema>;
export type UsageMetric = z.infer<typeof UsageMetricSchema>;
