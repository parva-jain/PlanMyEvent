import { generateKeyBetween } from 'fractional-indexing';
import { z } from 'zod';

import { TaskPrioritySchema, TaskStatusSchema } from './enums.js';
import { DateOnlySchema } from './events.js';

// ---- Ordering -------------------------------------------------------------------------------

/**
 * Tasks keep their order within a status column with fractional indexes (DatabaseDesign
 * "tasks.position"): moving one card writes one row. Keys compare byte by byte, so Postgres
 * sorts them with `collate "C"`.
 */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

const isPosition = (value: string) => {
  try {
    generateKeyBetween(value, null);
    return true;
  } catch {
    return false;
  }
};

export const PositionSchema = z
  .string()
  .max(64)
  .refine(isPosition, { message: 'Not a valid position' });

// ---- Tasks ----------------------------------------------------------------------------------

export const TaskAssigneeSchema = z.object({
  memberId: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
});
export type TaskAssignee = z.infer<typeof TaskAssigneeSchema>;

export const TaskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  /** Free label, e.g. Catering, Decor. */
  category: z.string().nullable(),
  dueOn: DateOnlySchema.nullable(),
  /** Null = the whole event. */
  subEventId: z.uuid().nullable(),
  /** Set on subtasks (one level only). */
  parentTaskId: z.uuid().nullable(),
  position: z.string(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  assignees: z.array(TaskAssigneeSchema),
  /** On top-level tasks: how many subtasks, and how many are done. */
  subtasks: z.object({ total: z.number().int(), done: z.number().int() }),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Task = z.infer<typeof TaskSchema>;

const taskFields = {
  title: z.string().trim().min(1, 'Enter a title').max(200),
  description: z.string().trim().max(5_000).nullable(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  category: z.string().trim().max(60).nullable(),
  dueOn: DateOnlySchema.nullable(),
  subEventId: z.uuid().nullable(),
  position: PositionSchema,
};

/** POST E/tasks. Assignees need tasks.assign; without a position the task goes last. */
export const CreateTaskSchema = z
  .object({
    ...taskFields,
    parentTaskId: z.uuid().nullable(),
    assigneeIds: z.array(z.uuid()).max(20),
  })
  .partial()
  .required({ title: true });
export type CreateTask = z.infer<typeof CreateTaskSchema>;

/** PATCH E/tasks/{taskId}. Helpers with tasks.update_own may change status and position only. */
export const UpdateTaskSchema = z.object(taskFields).partial();
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;

/** Fields an assignee may change with tasks.update_own (ticking off, moving the card). */
export const OWN_TASK_FIELDS = [
  'status',
  'position',
] as const satisfies readonly (keyof UpdateTask)[];

/** PUT E/tasks/{taskId}/assignees: the whole set, guarded by the task's version. */
export const ReplaceAssigneesSchema = z.object({
  memberIds: z
    .array(z.uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Each member may appear once' }),
});
export type ReplaceAssignees = z.infer<typeof ReplaceAssigneesSchema>;

export const TaskQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  subEventId: z.uuid().optional(),
  /** A member id: their tasks. */
  assignee: z.uuid().optional(),
  dueBefore: DateOnlySchema.optional(),
  parentTaskId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type TaskQuery = z.infer<typeof TaskQuerySchema>;

/** GET /v1/me/tasks item: one of my open tasks, with its event. */
export const MyTaskSchema = TaskSchema.extend({
  event: z.object({ id: z.uuid(), name: z.string(), timeZone: z.string() }),
});
export type MyTask = z.infer<typeof MyTaskSchema>;
