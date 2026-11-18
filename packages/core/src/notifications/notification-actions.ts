import {
  jobId,
  LIVE_TOPIC,
  userRoom,
  type MarkNotificationsRead,
  type MarkNotificationsReadResult,
  type NotificationNew,
} from '@pme/contracts';

import type { ActionDefinition, OutboxMessage } from '../action.js';
import type { ActionContext } from '../context.js';
import { ActionError } from '../errors.js';
import type { CoreTx, NewNotification, StoredNotification } from '../ports.js';
import { userIdOf } from '../team/access.js';

/**
 * notification.new to each recipient's own room (APIDesign "Real-time contract"), written in
 * the same transaction as the notification rows, so the bell updates once they commit.
 */
export function notificationSignals(rows: readonly StoredNotification[]): OutboxMessage[] {
  return rows.map((row) => {
    const data: NotificationNew = { notificationId: row.id, type: row.type };
    return {
      topic: LIVE_TOPIC,
      dedupeKey: jobId('live', 'notification', row.id),
      payload: { kind: 'emit', room: userRoom(row.userId), event: 'notification.new', data },
    };
  });
}

/**
 * Inserts notifications and returns the live signals for the ones written. Nobody is told
 * about their own change; a repeated dedupe key inserts nothing.
 */
export async function notify(
  tx: CoreTx,
  ctx: ActionContext,
  list: readonly NewNotification[],
): Promise<OutboxMessage[]> {
  const actorUserId = ctx.actor.kind === 'user' ? ctx.actor.userId : null;
  const wanted = list.filter((item) => item.userId !== actorUserId);
  if (!wanted.length) return [];
  return notificationSignals(await tx.notifications.insert(wanted));
}

/** POST /v1/notifications/read: mark some of mine, or all, as read. */
export const markNotificationsRead: ActionDefinition<
  MarkNotificationsRead,
  MarkNotificationsReadResult,
  CoreTx
> = {
  name: 'notifications.read',
  permission: null,
  outsideEvent: true,
  noActivity: 'Reading your own notifications changes nothing anyone else sees',
  async execute(tx, ctx, input) {
    const userId = userIdOf(ctx);
    const updated = await tx.notifications.markRead(
      userId,
      input.all ? null : (input.ids ?? []),
      ctx.now,
    );
    return { result: { updated, unreadCount: await tx.notifications.unreadCount(userId) } };
  },
};

/**
 * Run by the scheduled queue for one event, on the event's local date: tells each assignee of
 * an unfinished task due that day, once (the dedupe key holds the task and the date).
 */
export const notifyDueTasks: ActionDefinition<{ dueOn: string }, { notified: number }, CoreTx> = {
  name: 'notifications.taskDue',
  permission: null,
  noActivity: 'A reminder changes no event data',
  async execute(tx, ctx, { dueOn }) {
    if (ctx.actor.kind !== 'system') {
      throw new ActionError('forbidden', 'Only the scheduler sends due-date reminders');
    }
    const eventId = ctx.eventId!;
    const due = await tx.tasks.listDue(eventId, dueOn);
    const outbox = await notify(
      tx,
      ctx,
      due.flatMap((task) =>
        task.userIds.map((userId) => ({
          userId,
          eventId,
          type: 'task_due' as const,
          data: { taskId: task.taskId, taskTitle: task.title, dueOn },
          dedupeKey: `task_due-${task.taskId}-${dueOn}`,
        })),
      ),
    );
    return { result: { notified: outbox.length }, outbox };
  },
};
