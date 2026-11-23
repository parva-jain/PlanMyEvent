import { z } from 'zod';

/*
 * In-app notifications (PRD "Activity log and notifications", DatabaseDesign "notifications").
 * Per user, across events. The payload keeps ids and short text for rendering; names that can
 * change (the event, the actor) are read when listing.
 */

export const TaskAssignedDataSchema = z.object({
  taskId: z.uuid(),
  taskTitle: z.string(),
  /** Who assigned it; their current name comes back as `actor`. */
  actorUserId: z.uuid().nullable(),
});

export const TaskDueDataSchema = z.object({
  taskId: z.uuid(),
  taskTitle: z.string(),
  dueOn: z.iso.date(),
});

export const RoleChangedDataSchema = z.object({
  memberId: z.uuid(),
  /** Role names after the change; empty when every role was taken away. */
  roleNames: z.array(z.string()),
  actorUserId: z.uuid().nullable(),
});

export const JobFailedDataSchema = z.object({
  jobId: z.uuid(),
  kind: z.string(),
});

/** What each type's payload holds; the type picks the shape. */
export const NotificationDataSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('task_assigned'), data: TaskAssignedDataSchema }),
  z.object({ type: z.literal('task_due'), data: TaskDueDataSchema }),
  z.object({ type: z.literal('role_changed'), data: RoleChangedDataSchema }),
  z.object({ type: z.literal('job_failed'), data: JobFailedDataSchema }),
]);
export type NotificationData = z.infer<typeof NotificationDataSchema>;

const NotificationBaseSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  readAt: z.iso.datetime({ offset: true }).nullable(),
  /** Null for notifications about the account rather than an event. */
  event: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** The person who caused it, by current name; null for system notifications. */
  actor: z.object({ userId: z.uuid(), name: z.string() }).nullable(),
});

export const NotificationSchema = z.intersection(NotificationBaseSchema, NotificationDataSchema);
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Only unread ones. */
  unread: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;

export const NotificationPageSchema = z.object({
  data: z.array(NotificationSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  /** For the bell badge, so the first page is all the shell needs. */
  unreadCount: z.number().int().min(0),
});
export type NotificationPage = z.infer<typeof NotificationPageSchema>;

/** POST /v1/notifications/read: some ids, or everything with { all: true }. */
export const MarkNotificationsReadSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100).optional(),
    all: z.literal(true).optional(),
  })
  .strict()
  .refine((body) => (body.ids === undefined) !== (body.all === undefined), {
    message: 'Send either ids or all, not both',
  });
export type MarkNotificationsRead = z.infer<typeof MarkNotificationsReadSchema>;

export const MarkNotificationsReadResultSchema = z.object({
  updated: z.number().int().min(0),
  unreadCount: z.number().int().min(0),
});
export type MarkNotificationsReadResult = z.infer<typeof MarkNotificationsReadResultSchema>;
