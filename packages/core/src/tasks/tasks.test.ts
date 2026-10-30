import { LIVE_TOPIC, type LiveSignal, type Task } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { undoActivity } from '../activity/undo.js';
import { testWedding } from '../testing/wedding.js';
import { createTask, deleteTask, replaceTaskAssignees, updateTask } from './task-actions.js';

async function wedding() {
  const wedding = await testWedding();
  const editor = await wedding.addMember('editor', [
    { roleId: wedding.role('Editor').id, subEventIds: [] },
  ]);
  const mehendiEditor = await wedding.addMember('mehendi-editor', [
    { roleId: wedding.role('Editor').id, subEventIds: [wedding.subEvent('Mehendi').id] },
  ]);
  const helper = await wedding.addMember('helper', [
    { roleId: wedding.role('Helper').id, subEventIds: [] },
  ]);
  await wedding.addMember('viewer', [{ roleId: wedding.role('Viewer').id, subEventIds: [] }]);
  const task = (title: string) =>
    [...wedding.tasks.values()].find((item) => item.title === title && !item.deletedAt)!;
  const undo = (userId: string) =>
    wedding.run(userId, undoActivity, { entryId: wedding.activity.at(-1)!.id });
  return { ...wedding, editor, mehendiEditor, helper, task, undo };
}

describe('starter tasks', () => {
  it('come with the template, in order, linked to their sub-event, without past due dates', async () => {
    const { tasks, subEvent } = await testWedding();
    const list = [...tasks.values()];
    expect(list).toHaveLength(12);
    const positions = list.map((task) => task.position);
    expect([...positions].sort()).toEqual(positions);
    expect(list.find((task) => task.templateKey === 'mehendi-artist')).toMatchObject({
      subEventId: subEvent('Mehendi').id,
      category: 'Mehendi',
    });
    // The wedding starts 10 Dec; "today" in the test context is 30 Oct.
    expect(list.find((task) => task.templateKey === 'invitations')?.dueOn).toBe('2026-11-10');
    expect(list.find((task) => task.templateKey === 'book-venue')?.dueOn).toBeNull();
  });
});

describe('creating tasks', () => {
  it('needs tasks.edit where the task goes, and logs and signals it', async () => {
    const { run, subEvent, outbox, activity } = await wedding();
    await expect(run('viewer', createTask, { title: 'Book a band' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    // Scoped to Mehendi: Mehendi tasks yes, whole-event tasks no.
    await expect(run('mehendi-editor', createTask, { title: 'Book a band' })).rejects.toMatchObject(
      { code: 'forbidden' },
    );
    const mehendi = subEvent('Mehendi');
    const task = await run('mehendi-editor', createTask, {
      title: 'Henna cones',
      subEventId: mehendi.id,
    });
    expect(task).toMatchObject({ status: 'todo', priority: 'medium', subEventId: mehendi.id });
    expect(activity.at(-1)).toMatchObject({ action: 'task.create', entityId: task.id });
    const signal = outbox.at(-1)!;
    expect(signal.topic).toBe(LIVE_TOPIC);
    expect((signal.payload as LiveSignal & { kind: 'emit' }).data).toMatchObject({
      entityType: 'task',
      op: 'created',
      subEventId: mehendi.id,
    });
  });

  it('goes last in its column unless placed', async () => {
    const { run, tasks } = await wedding();
    const task = await run('editor', createTask, { title: 'Book a band' });
    const todo = [...tasks.values()].filter((item) => item.status === 'todo' && !item.parentTaskId);
    expect(
      todo
        .map((item) => item.position)
        .sort()
        .at(-1),
    ).toBe(task.position);
  });

  it('allows one level of subtasks, which take the parent sub-event', async () => {
    const { run, task: find } = await wedding();
    const parent = find('Book the mehendi artist');
    const sub = await run('editor', createTask, {
      title: 'Shortlist three',
      parentTaskId: parent.id,
    });
    expect(sub).toMatchObject({ parentTaskId: parent.id, subEventId: parent.subEventId });
    await expect(
      run('editor', createTask, { title: 'Call them', parentTaskId: sub.id }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(
      (await run('editor', createTask, { title: 'x', parentTaskId: parent.id })).id,
    ).toBeTruthy();
  });

  it('assigning needs tasks.assign, and the assignee must be able to see the task', async () => {
    const { run, helper, mehendiEditor, editor } = await wedding();
    await expect(
      run('helper', createTask, { title: 'x', assigneeIds: [helper.id] }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    // A member scoped to Mehendi can't be given a whole-event task.
    await expect(
      run('editor', createTask, { title: 'x', assigneeIds: [mehendiEditor.id] }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    const task = await run('editor', createTask, {
      title: 'x',
      assigneeIds: [helper.id, editor.id],
    });
    expect(task.assignees.map((item) => item.memberId)).toEqual([helper.id, editor.id]);
  });
});

describe('updating tasks', () => {
  it('done sets completedAt and moves the card last in Done; back to To do clears it', async () => {
    const { run, task: find } = await wedding();
    const venue = find('Book the venue');
    const done = await run('editor', updateTask, {
      taskId: venue.id,
      expectedVersion: 1,
      changes: { status: 'done' },
    });
    expect(done.completedAt).toBe('2026-10-30T00:00:00.000Z');
    const caterer = await run('editor', updateTask, {
      taskId: find('Book the caterer').id,
      expectedVersion: 1,
      changes: { status: 'done' },
    });
    expect(caterer.position > done.position).toBe(true);
    const back = await run('editor', updateTask, {
      taskId: venue.id,
      expectedVersion: 2,
      changes: { status: 'todo' },
    });
    expect(back.completedAt).toBeNull();
  });

  it('a Helper may tick off their own task, nothing more', async () => {
    const { run, helper, task: find } = await wedding();
    const venue = find('Book the venue');
    const change = (changes: Partial<Task>, version: number) =>
      run('helper', updateTask, { taskId: venue.id, expectedVersion: version, changes });
    // Not theirs yet.
    await expect(change({ status: 'done' }, 1)).rejects.toMatchObject({ code: 'forbidden' });
    await run('owner', replaceTaskAssignees, {
      taskId: venue.id,
      expectedVersion: 1,
      memberIds: [helper.id],
    });
    await expect(change({ title: 'Mine now' }, 2)).rejects.toMatchObject({ code: 'forbidden' });
    expect((await change({ status: 'done' }, 2)).status).toBe('done');
  });

  it('a stale version is a conflict carrying the current task', async () => {
    const { run, task: find } = await wedding();
    const venue = find('Book the venue');
    await run('editor', updateTask, {
      taskId: venue.id,
      expectedVersion: 1,
      changes: { title: 'A' },
    });
    await expect(
      run('editor', updateTask, { taskId: venue.id, expectedVersion: 1, changes: { title: 'B' } }),
    ).rejects.toMatchObject({ code: 'version_conflict', details: { current: { title: 'A' } } });
  });

  it('moving a task to a sub-event needs tasks.edit there too', async () => {
    const { run, task: find, subEvent } = await wedding();
    const artist = find('Book the mehendi artist');
    await expect(
      run('mehendi-editor', updateTask, {
        taskId: artist.id,
        expectedVersion: 1,
        changes: { subEventId: subEvent('Haldi').id },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('undo', () => {
  it('reverses an edit, an assignment and a delete with its subtasks', async () => {
    const { run, undo, task: find, helper, tasks } = await wedding();
    const venue = find('Book the venue');
    await run('editor', updateTask, {
      taskId: venue.id,
      expectedVersion: 1,
      changes: { title: 'Book the lawn', priority: 'high' },
    });
    await undo('editor');
    expect(find('Book the venue')).toMatchObject({ priority: 'medium', version: 3 });

    await run('editor', replaceTaskAssignees, {
      taskId: venue.id,
      expectedVersion: 3,
      memberIds: [helper.id],
    });
    await undo('editor');
    expect(find('Book the venue').assigneeIds).toEqual([]);

    const sub = await run('editor', createTask, { title: 'Visit lawns', parentTaskId: venue.id });
    await run('editor', deleteTask, { taskId: venue.id, expectedVersion: 5 });
    expect(tasks.get(sub.id)?.deletedAt).toBeTruthy();
    await undo('editor');
    expect(tasks.get(venue.id)?.deletedAt).toBeUndefined();
    expect(tasks.get(sub.id)?.deletedAt).toBeUndefined();
  });
});
