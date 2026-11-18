import { LIVE_TOPIC, userRoom, type LiveSignal } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { runAction } from '../action.js';
import { replaceTaskAssignees, createTask, updateTask } from '../tasks/task-actions.js';
import { replaceMemberRoles } from '../team/member-actions.js';
import { ctxFor, testWedding } from '../testing/wedding.js';
import { markNotificationsRead, notifyDueTasks } from './notification-actions.js';

async function wedding() {
  const wedding = await testWedding();
  const editor = await wedding.addMember('editor', [
    { roleId: wedding.role('Editor').id, subEventIds: [] },
  ]);
  const helper = await wedding.addMember('helper', [
    { roleId: wedding.role('Helper').id, subEventIds: [] },
  ]);
  const owner = [...wedding.members.values()].find((member) => member.userId === 'owner')!;
  /** notification.new signals in the outbox, by recipient room. */
  const bellSignals = () =>
    wedding.outbox
      .filter((message) => message.topic === LIVE_TOPIC)
      .map((message) => message.payload as LiveSignal)
      .filter((signal) => signal.kind === 'emit' && signal.event === 'notification.new')
      .map((signal) => (signal.kind === 'emit' ? signal.room : ''));
  const system = (dueOn: string) =>
    runAction(
      wedding.runtime,
      {
        ...ctxFor('owner', wedding.event.id),
        actor: { kind: 'system', name: 'scheduler' },
        channel: 'system',
      },
      notifyDueTasks,
      { dueOn },
    );
  return { ...wedding, editor, helper, owner, bellSignals, system };
}

describe('task assigned', () => {
  it('tells each new assignee except the person assigning, with a live signal', async () => {
    const { run, editor, helper, notifications, bellSignals } = await wedding();
    const task = await run('owner', createTask, {
      title: 'Book a band',
      assigneeIds: [editor.id, helper.id],
    });
    expect(notifications).toEqual([
      expect.objectContaining({
        userId: 'editor',
        type: 'task_assigned',
        data: { taskId: task.id, taskTitle: 'Book a band', actorUserId: 'owner' },
      }),
      expect.objectContaining({ userId: 'helper', type: 'task_assigned' }),
    ]);
    expect(bellSignals()).toEqual([userRoom('editor'), userRoom('helper')]);
  });

  it('skips the assigner and people already on the task', async () => {
    const { run, editor, helper, owner, notifications } = await wedding();
    const task = await run('editor', createTask, { title: 'Flowers', assigneeIds: [editor.id] });
    expect(notifications).toHaveLength(0);
    await run('editor', replaceTaskAssignees, {
      taskId: task.id,
      expectedVersion: task.version,
      memberIds: [editor.id, helper.id, owner.id],
    });
    expect(notifications.map((row) => row.userId)).toEqual(['helper', 'owner']);
  });

  it('is not sent for other task changes', async () => {
    const { run, helper, notifications } = await wedding();
    const task = await run('owner', createTask, { title: 'Cake', assigneeIds: [helper.id] });
    await run('owner', updateTask, {
      taskId: task.id,
      expectedVersion: task.version,
      changes: { title: 'Wedding cake' },
    });
    expect(notifications).toHaveLength(1);
  });
});

describe('role changed', () => {
  it('tells the member their new roles, unless nothing changed', async () => {
    const { run, helper, role, notifications, bellSignals } = await wedding();
    const updated = await run('owner', replaceMemberRoles, {
      memberId: helper.id,
      expectedVersion: helper.version,
      body: { assignments: [{ roleId: role('Editor').id, subEventIds: [] }] },
    });
    expect(notifications).toEqual([
      expect.objectContaining({
        userId: 'helper',
        type: 'role_changed',
        data: { memberId: helper.id, roleNames: ['Editor'], actorUserId: 'owner' },
      }),
    ]);
    expect(bellSignals()).toEqual([userRoom('helper')]);
    await run('owner', replaceMemberRoles, {
      memberId: helper.id,
      expectedVersion: updated.version,
      body: { assignments: [{ roleId: role('Editor').id, subEventIds: [] }] },
    });
    expect(notifications).toHaveLength(1);
  });
});

describe('due-date reminders', () => {
  it('tell assignees of unfinished tasks due that day, once, and only from the scheduler', async () => {
    const { run, helper, editor, notifications, system } = await wedding();
    const due = await run('owner', createTask, {
      title: 'Print cards',
      dueOn: '2026-11-02',
      assigneeIds: [helper.id, editor.id],
    });
    await run('owner', createTask, {
      title: 'Done already',
      dueOn: '2026-11-02',
      status: 'done',
      assigneeIds: [helper.id],
    });
    await run('owner', createTask, { title: 'Nobody', dueOn: '2026-11-02' });
    notifications.length = 0;

    expect(await system('2026-11-02')).toEqual({ notified: 2 });
    expect(notifications).toEqual([
      expect.objectContaining({
        userId: 'helper',
        type: 'task_due',
        data: { taskId: due.id, taskTitle: 'Print cards', dueOn: '2026-11-02' },
      }),
      expect.objectContaining({ userId: 'editor', type: 'task_due' }),
    ]);
    // The scan runs every half hour: the second pass sends nothing.
    expect(await system('2026-11-02')).toEqual({ notified: 0 });

    await expect(run('owner', notifyDueTasks, { dueOn: '2026-11-02' })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('marking read', () => {
  it('marks only my own, by id or all, and returns what is left', async () => {
    const { run, runtime, helper, editor, notifications } = await wedding();
    for (const title of ['A', 'B', 'C']) {
      await run('owner', createTask, { title, assigneeIds: [helper.id, editor.id] });
    }
    const mine = notifications.filter((row) => row.userId === 'helper');
    const read = (userId: string, input: Parameters<typeof markNotificationsRead.execute>[2]) =>
      runAction(runtime, ctxFor(userId, null), markNotificationsRead, input);

    // Someone else's id changes nothing.
    expect(await read('editor', { ids: [mine[0]!.id] })).toEqual({ updated: 0, unreadCount: 3 });
    expect(await read('helper', { ids: [mine[0]!.id] })).toEqual({ updated: 1, unreadCount: 2 });
    expect(await read('helper', { all: true })).toEqual({ updated: 2, unreadCount: 0 });
    expect(notifications.filter((row) => row.userId === 'editor' && row.readAt)).toHaveLength(0);
  });
});
