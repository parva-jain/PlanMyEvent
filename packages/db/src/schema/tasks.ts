import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { valueSetCheck } from '../check.js';
import { users } from './auth.js';
import { id, timestamps } from './columns.js';
import { events, subEvents } from './events.js';
import { members } from './team.js';

/** DatabaseDesign "tasks". Subtasks are one level deep (enforced in the action). */
export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    subEventId: uuid(),
    parentTaskId: uuid(),
    title: text().notNull(),
    description: text(),
    status: text().notNull().default('todo'),
    priority: text().notNull().default('medium'),
    category: text(),
    dueOn: date({ mode: 'string' }),
    /** Fractional index within the status column; sort with collate "C". */
    position: text().notNull(),
    completedAt: timestamp({ withTimezone: true }),
    completedByUserId: uuid().references((): AnyPgColumn => users.id),
    templateKey: text(),
    version: integer().notNull().default(1),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('tasks_event_id_id_unique').on(t.eventId, t.id),
    index('tasks_event_status_due_idx')
      .on(t.eventId, t.status, t.dueOn)
      .where(sql`${t.deletedAt} is null`),
    index('tasks_event_sub_event_idx')
      .on(t.eventId, t.subEventId)
      .where(sql`${t.deletedAt} is null`),
    index('tasks_parent_task_id_idx')
      .on(t.parentTaskId)
      .where(sql`${t.parentTaskId} is not null`),
    foreignKey({
      name: 'tasks_sub_event_fk',
      columns: [t.eventId, t.subEventId],
      foreignColumns: [subEvents.eventId, subEvents.id],
    }),
    foreignKey({
      name: 'tasks_parent_task_fk',
      columns: [t.eventId, t.parentTaskId],
      foreignColumns: [t.eventId, t.id],
    }),
    check('tasks_title_check', sql`char_length(${t.title}) between 1 and 200`),
    check('tasks_completed_check', sql`(${t.status} = 'done') = (${t.completedAt} is not null)`),
    valueSetCheck('tasks_status_check', t.status, 'taskStatus'),
    valueSetCheck('tasks_priority_check', t.priority, 'taskPriority'),
  ],
);

/** Who a task is assigned to; index(member_id) serves "My tasks". */
export const taskAssignees = pgTable(
  'task_assignees',
  {
    taskId: uuid().notNull(),
    eventId: uuid().notNull(),
    memberId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.memberId] }),
    index('task_assignees_member_id_idx').on(t.memberId),
    foreignKey({
      name: 'task_assignees_task_fk',
      columns: [t.eventId, t.taskId],
      foreignColumns: [tasks.eventId, tasks.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_assignees_member_fk',
      columns: [t.eventId, t.memberId],
      foreignColumns: [members.eventId, members.id],
    }).onDelete('cascade'),
  ],
);
