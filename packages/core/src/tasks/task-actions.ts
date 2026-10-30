import {
  can,
  OWN_TASK_FIELDS,
  positionBetween,
  type CreateTask,
  type Task,
  type UpdateTask,
} from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import type { ActionContext } from '../context.js';
import { ActionError } from '../errors.js';
import { versionMismatch } from '../events/versioned.js';
import type { CoreTx, TaskChanges } from '../ports.js';
import { actorAccess, memberPermissions, requirePermission, userIdOf } from '../team/access.js';

const fieldError = (path: string, message: string) =>
  new ActionError('validation_failed', message, { fields: [{ path, message }] });

async function findTask(tx: CoreTx, ctx: ActionContext, taskId: string): Promise<Task> {
  const task = await tx.tasks.find(ctx.eventId!, taskId);
  if (!task) throw new ActionError('not_found', 'Task not found');
  return task;
}

/** The sub-event must exist in this event (the composite foreign key enforces it too). */
async function assertSubEvent(tx: CoreTx, eventId: string, subEventId: string | null | undefined) {
  if (subEventId && !(await tx.subEvents.find(eventId, subEventId))) {
    throw fieldError('subEventId', 'Sub-event not found in this event');
  }
}

/**
 * Assignees must be active members who can see the task, so it shows up in their "My tasks"
 * (a helper scoped to Mehendi can't be given a Haldi task).
 */
async function assertAssignable(
  tx: CoreTx,
  eventId: string,
  memberIds: readonly string[],
  subEventId: string | null,
  path: string,
) {
  for (const [index, memberId] of memberIds.entries()) {
    const member = await tx.members.find(eventId, memberId);
    if (!member || member.status !== 'active') {
      throw fieldError(`${path}.${index}`, 'Not a member of this event');
    }
    const permissions = await memberPermissions(tx, eventId, member.assignments);
    if (!can(permissions, 'tasks.view', subEventId)) {
      throw fieldError(`${path}.${index}`, `${member.name} can't see this task`);
    }
  }
}

/** Last in its column: top-level tasks by status, subtasks under their parent. */
async function nextPosition(
  tx: CoreTx,
  eventId: string,
  task: { status: Task['status']; parentTaskId: string | null },
) {
  const last = await tx.tasks.lastPosition(
    eventId,
    task.parentTaskId ? { parentTaskId: task.parentTaskId } : { status: task.status },
  );
  return positionBetween(last, null);
}

/** DatabaseDesign: completed_at is set if and only if the status is done. */
function completion(ctx: ActionContext, status: Task['status']): TaskChanges {
  return status === 'done'
    ? { completedAt: ctx.now, completedByUserId: userIdOf(ctx) }
    : { completedAt: null, completedByUserId: null };
}

// ---- Create -----------------------------------------------------------------------------------

/**
 * POST E/tasks (tasks.edit in the task's sub-event). A subtask sits under a top-level task
 * (one level only) and takes its sub-event unless given one. Assigning needs tasks.assign.
 */
export const createTask: ActionDefinition<CreateTask, Task, CoreTx> = {
  name: 'tasks.create',
  permission: 'tasks.edit',
  async subEventOf(tx, ctx, input) {
    if (input.subEventId !== undefined) return input.subEventId;
    if (!input.parentTaskId) return null;
    return (await tx.tasks.find(ctx.eventId!, input.parentTaskId))?.subEventId ?? null;
  },
  async execute(tx, ctx, input) {
    const eventId = ctx.eventId!;
    let subEventId = input.subEventId ?? null;
    if (input.parentTaskId) {
      const parent = await tx.tasks.find(eventId, input.parentTaskId);
      if (!parent) throw fieldError('parentTaskId', 'Task not found in this event');
      if (parent.parentTaskId) throw fieldError('parentTaskId', "Subtasks can't have subtasks");
      if (input.subEventId === undefined) subEventId = parent.subEventId;
    }
    await assertSubEvent(tx, eventId, subEventId);
    const assigneeIds = input.assigneeIds ?? [];
    if (assigneeIds.length) {
      await requirePermission(tx, ctx, 'tasks.assign', subEventId);
      await assertAssignable(tx, eventId, assigneeIds, subEventId, 'assigneeIds');
    }
    const status = input.status ?? 'todo';
    const parentTaskId = input.parentTaskId ?? null;
    const [task] = await tx.tasks.insert(eventId, [
      {
        title: input.title,
        description: input.description ?? null,
        status,
        priority: input.priority ?? 'medium',
        category: input.category ?? null,
        dueOn: input.dueOn ?? null,
        subEventId,
        parentTaskId,
        position: input.position ?? (await nextPosition(tx, eventId, { status, parentTaskId })),
        ...(status === 'done' ? completion(ctx, status) : {}),
        assigneeIds,
      },
    ]);
    return {
      result: task!,
      activity: [
        { action: 'create', entityType: 'task', entityId: task!.id, before: null, after: task },
      ],
    };
  },
};

// ---- Update -----------------------------------------------------------------------------------

/**
 * PATCH E/tasks/{taskId}. tasks.edit in the task's sub-event (and in the new one when moving
 * it); without it, an assignee holding tasks.update_own may change status and position only
 * (APIDesign "Helpers updating their own tasks"). Checked here rather than by runAction,
 * since which permission applies depends on the task and the body.
 */
export const updateTask: ActionDefinition<
  { taskId: string; expectedVersion: number; changes: UpdateTask },
  Task,
  CoreTx
> = {
  name: 'tasks.update',
  permission: null,
  async execute(tx, ctx, { taskId, expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const access = await actorAccess(tx, ctx);
    const before = await findTask(tx, ctx, taskId);
    if (!can(access, 'tasks.edit', before.subEventId)) {
      const own =
        can(access, 'tasks.update_own', before.subEventId) &&
        before.assignees.some((assignee) => assignee.memberId === access.memberId) &&
        Object.keys(changes).every((key) => (OWN_TASK_FIELDS as readonly string[]).includes(key));
      if (!own) {
        if (!can(access, 'tasks.view', before.subEventId)) {
          throw new ActionError('not_found', 'Task not found');
        }
        throw new ActionError('forbidden', 'You need the tasks.edit permission', {
          permission: 'tasks.edit',
        });
      }
    }
    if (changes.subEventId !== undefined && changes.subEventId !== before.subEventId) {
      if (before.parentTaskId) {
        throw fieldError('subEventId', 'A subtask follows its parent task');
      }
      await assertSubEvent(tx, eventId, changes.subEventId);
      await requirePermission(tx, ctx, 'tasks.edit', changes.subEventId);
    }

    const extra: TaskChanges = {};
    if (changes.status && changes.status !== before.status) {
      Object.assign(extra, completion(ctx, changes.status));
      // A card moved to another column without a place goes last there.
      if (!changes.position && !before.parentTaskId) {
        extra.position = await nextPosition(tx, eventId, {
          status: changes.status,
          parentTaskId: null,
        });
      }
    }
    const after = await tx.tasks.update(eventId, taskId, expectedVersion, {
      ...changes,
      ...extra,
    });
    if (!after) versionMismatch(await tx.tasks.find(eventId, taskId), expectedVersion);
    if (after.subEventId !== before.subEventId) {
      await tx.tasks.moveSubtasks(eventId, taskId, after.subEventId);
    }
    return {
      result: after,
      activity: [{ action: 'update', entityType: 'task', entityId: taskId, before, after }],
    };
  },
};

// ---- Assignees --------------------------------------------------------------------------------

/** PUT E/tasks/{taskId}/assignees (tasks.assign in the task's sub-event), guarded by its version. */
export const replaceTaskAssignees: ActionDefinition<
  { taskId: string; expectedVersion: number; memberIds: string[] },
  Task,
  CoreTx
> = {
  name: 'tasks.assign',
  permission: 'tasks.assign',
  async subEventOf(tx, ctx, input) {
    return (await tx.tasks.find(ctx.eventId!, input.taskId))?.subEventId ?? null;
  },
  async execute(tx, ctx, { taskId, expectedVersion, memberIds }) {
    const eventId = ctx.eventId!;
    const task = await findTask(tx, ctx, taskId);
    await assertAssignable(tx, eventId, memberIds, task.subEventId, 'memberIds');
    const after = await tx.tasks.replaceAssignees(eventId, taskId, expectedVersion, memberIds);
    if (!after) versionMismatch(await tx.tasks.find(eventId, taskId), expectedVersion);
    // The log keeps the member ids (undo puts them back) and the task's version and title.
    const snapshot = (item: Task) => ({
      title: item.title,
      subEventId: item.subEventId,
      memberIds: item.assignees.map((assignee) => assignee.memberId),
      version: item.version,
    });
    return {
      result: after,
      activity: [
        {
          action: 'assign',
          entityType: 'task',
          entityId: taskId,
          before: snapshot(task),
          after: snapshot(after),
        },
      ],
    };
  },
};

// ---- Delete and restore -----------------------------------------------------------------------

/** DELETE E/tasks/{taskId}: soft delete, subtasks included, guarded by If-Match. */
export const deleteTask: ActionDefinition<
  { taskId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'tasks.delete',
  permission: 'tasks.edit',
  async subEventOf(tx, ctx, input) {
    return (await tx.tasks.find(ctx.eventId!, input.taskId))?.subEventId ?? null;
  },
  async execute(tx, ctx, { taskId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const before = await findTask(tx, ctx, taskId);
    if (!(await tx.tasks.softDelete(eventId, taskId, expectedVersion))) {
      versionMismatch(await tx.tasks.find(eventId, taskId), expectedVersion);
    }
    return {
      result: undefined,
      activity: [{ action: 'delete', entityType: 'task', entityId: taskId, before, after: null }],
    };
  },
};

/**
 * Brings back a soft-deleted task with the subtasks deleted alongside it (undo of a delete).
 * The caller passes the sub-event it was in, since a deleted task can't be looked up.
 */
export const restoreTask: ActionDefinition<
  { taskId: string; subEventId: string | null },
  Task,
  CoreTx
> = {
  name: 'tasks.restore',
  permission: 'tasks.edit',
  subEventOf: (_tx, _ctx, input) => input.subEventId,
  async execute(tx, ctx, { taskId }) {
    const after = await tx.tasks.restore(ctx.eventId!, taskId);
    if (!after) throw new ActionError('not_found', 'Task not found');
    if (after.parentTaskId && !(await tx.tasks.find(ctx.eventId!, after.parentTaskId))) {
      throw new ActionError('not_found', 'Its parent task was deleted');
    }
    return {
      result: after,
      activity: [{ action: 'restore', entityType: 'task', entityId: taskId, before: null, after }],
    };
  },
};
