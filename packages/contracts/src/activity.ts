import { z } from 'zod';

import { ChannelSchema } from './enums.js';

/**
 * Entity types the activity log records today. Each new module adds its own (task, expense,
 * attendance…); the feed's entityType filter accepts these.
 */
export const ACTIVITY_ENTITY_TYPES = [
  'event',
  'event_modules',
  'venue',
  'sub_event',
  'role',
  'member',
  'member_invite',
  'task',
  'budget_category',
  'expense',
  'household',
  'contact',
  'invitation',
  'attendance',
] as const;
export const ActivityEntityTypeSchema = z.enum(ACTIVITY_ENTITY_TYPES);
export type ActivityEntityType = z.infer<typeof ActivityEntityTypeSchema>;

/**
 * One activity_log row as the feed shows it (DatabaseDesign "activity_log"). before and
 * after hold the changed fields only: the whole row on create and delete.
 */
export const ActivityItemSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  actor: z.object({ userId: z.uuid().nullable(), label: z.string() }),
  channel: ChannelSchema,
  /** Dotted, `<entityType>.<verb>`: sub_event.update, member.join. */
  action: z.string(),
  entityType: z.string(),
  entityId: z.uuid(),
  /** The entity's name for display ("Haldi", "Priya Sharma"); null where it has none. */
  entityLabel: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  /** Ties entries from one request together. */
  requestId: z.string().nullable(),
  /** Set on an entry that records an undo: the entry it undid. */
  undoOfId: z.uuid().nullable(),
  /** Set once this entry has been undone. */
  undone: z
    .object({ at: z.iso.datetime({ offset: true }), byLabel: z.string(), entryId: z.uuid() })
    .nullable(),
  /**
   * Whether the caller may try to undo it: a supported change, not undone yet, and the caller
   * wrote it or has event.settings. Undo can still answer 409 if the entity changed since.
   */
  canUndo: z.boolean(),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

export const ActivityQuerySchema = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.uuid().optional(),
  /** A user id: entries by that person. */
  actor: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;

export const ActivityPageSchema = z.object({
  data: z.array(ActivityItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type ActivityPage = z.infer<typeof ActivityPageSchema>;

/** POST E/activity/{entryId}/undo: the entry that records the undo. */
export const UndoResultSchema = z.object({ entry: ActivityItemSchema });
export type UndoResult = z.infer<typeof UndoResultSchema>;
