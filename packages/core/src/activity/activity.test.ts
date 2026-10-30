import { describe, expect, it } from 'vitest';

import { changedOnly } from '../action.js';
import { replaceModules, updateEvent } from '../events/event-actions.js';
import {
  createSubEvent,
  createVenue,
  deleteSubEvent,
  deleteVenue,
  updateSubEvent,
  updateVenue,
} from '../events/program-actions.js';
import { testWedding } from '../testing/wedding.js';
import { createRole } from '../team/role-actions.js';
import { isUndoable, undoActivity } from './undo.js';

async function wedding() {
  const wedding = await testWedding();
  const last = () => wedding.activity.at(-1)!;
  const undo = (userId: string, entryId = last().id) =>
    wedding.run(userId, undoActivity, { entryId });
  return { ...wedding, last, undo };
}

describe('recording activity', () => {
  it('keeps only the changed fields of an update', () => {
    expect(
      changedOnly({
        action: 'update',
        entityType: 'sub_event',
        entityId: 's1',
        before: { name: 'Haldi', capacity: null, version: 1 },
        after: { name: 'Haldi ceremony', capacity: null, version: 2 },
      }),
    ).toMatchObject({
      before: { name: 'Haldi', version: 1 },
      after: { name: 'Haldi ceremony', version: 2 },
    });
    const created = {
      action: 'create',
      entityType: 'venue',
      entityId: 'v1',
      before: null,
      after: { name: 'Lawn' },
    };
    expect(changedOnly(created)).toBe(created);
  });

  it('writes <entityType>.<verb>, the actor, the channel and the request id', async () => {
    const { activity, event, run, subEvent } = await wedding();
    expect(activity[0]).toMatchObject({
      eventId: event.id,
      action: 'event.create',
      actorUserId: 'owner',
      actorLabel: 'Priya',
      channel: 'app',
    });
    const haldi = subEvent('Haldi');
    await run('owner', updateSubEvent, {
      subEventId: haldi.id,
      expectedVersion: haldi.version,
      changes: { name: 'Haldi ceremony' },
    });
    expect(activity.at(-1)).toMatchObject({
      action: 'sub_event.update',
      entityId: haldi.id,
      before: { name: 'Haldi', version: 1 },
      after: { name: 'Haldi ceremony', version: 2 },
      requestId: 'req_owner',
      undoOfId: null,
    });
  });
});

describe('undo', () => {
  it('reverts an update, links the new entry, and refuses a second undo', async () => {
    const { run, subEvent, undo, last, activity, subEvents } = await wedding();
    const haldi = subEvent('Haldi');
    await run('owner', updateSubEvent, {
      subEventId: haldi.id,
      expectedVersion: 1,
      changes: { name: 'Haldi ceremony', capacity: 80 },
    });
    const changed = last();

    await expect(undo('owner')).resolves.toEqual({ entityType: 'sub_event', entityId: haldi.id });
    expect(subEvents.get(haldi.id)).toMatchObject({ name: 'Haldi', capacity: null, version: 3 });
    expect(last()).toMatchObject({ action: 'sub_event.update', undoOfId: changed.id });
    expect(activity.find((item) => item.id === changed.id)?.undoneAt).not.toBeNull();

    await expect(undo('owner', changed.id)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'already_undone' },
    });
    // An undo entry isn't undone in turn.
    await expect(undo('owner')).rejects.toMatchObject({ details: { reason: 'not_undoable' } });
  });

  it('answers 409 with the current state when the entity changed since', async () => {
    const { run, subEvent, undo, activity, subEvents } = await wedding();
    const haldi = subEvent('Haldi');
    await run('owner', updateSubEvent, {
      subEventId: haldi.id,
      expectedVersion: 1,
      changes: { name: 'Haldi ceremony' },
    });
    const rename = activity.at(-1)!;
    await run('owner', updateSubEvent, {
      subEventId: haldi.id,
      expectedVersion: 2,
      changes: { notes: 'Bring marigolds' },
    });

    await expect(undo('owner', rename.id)).rejects.toMatchObject({
      code: 'version_conflict',
      details: { current: { name: 'Haldi ceremony', version: 3 } },
    });
    expect(subEvents.get(haldi.id)).toMatchObject({ name: 'Haldi ceremony', version: 3 });
  });

  it('undoes a create by deleting and a delete by restoring', async () => {
    const { run, undo, subEvents, venues, last } = await wedding();
    const party = await run('owner', createSubEvent, {
      name: 'After party',
      startsAt: '2026-12-12T17:30:00Z',
      endsAt: '2026-12-12T20:30:00Z',
    });
    await undo('owner');
    expect(subEvents.get(party.id)?.deleted).toBe(true);
    expect(last()).toMatchObject({ action: 'sub_event.delete' });

    const lawn = await run('owner', createVenue, { name: 'Radisson Lawn' });
    await run('owner', deleteVenue, { venueId: lawn.id });
    await undo('owner');
    expect(venues.get(lawn.id)?.deleted).toBe(false);
    expect(last()).toMatchObject({ action: 'venue.restore' });
  });

  it('restores a deleted sub-event, and undoes event, module and venue changes', async () => {
    const { run, undo, subEvent, subEvents, events, modules, event, tx } = await wedding();
    const mehendi = subEvent('Mehendi');
    await run('owner', deleteSubEvent, { subEventId: mehendi.id, expectedVersion: 1 });
    await undo('owner');
    expect(subEvents.get(mehendi.id)).toMatchObject({ deleted: false, version: 3 });

    await run('owner', updateEvent, { expectedVersion: 1, changes: { name: 'Verma Wedding' } });
    await undo('owner');
    expect(events.get(event.id)).toMatchObject({ name: 'Sharma Wedding', version: 3 });

    const before = structuredClone(modules.get(event.id));
    await run('owner', replaceModules, {
      expectedVersion: 3,
      body: { modules: [{ module: 'gallery', enabled: false, config: {} }] },
    });
    await undo('owner');
    expect(await tx.events.listModules(event.id)).toEqual(before);

    const lawn = await run('owner', createVenue, { name: 'Lawn' });
    await run('owner', updateVenue, { venueId: lawn.id, changes: { name: 'Radisson Lawn' } });
    await undo('owner');
    expect((await tx.venues.find(event.id, lawn.id))?.name).toBe('Lawn');
  });

  it("lets the author or event.settings undo; the reversal needs the change's own permission", async () => {
    const { run, undo, subEvent, role, addMember, last } = await wedding();
    await addMember('editor', [{ roleId: role('Editor').id, subEventIds: [] }]);
    await addMember('admin', [{ roleId: role('Admin').id, subEventIds: [] }]);
    const haldi = subEvent('Haldi');
    const sangeet = subEvent('Sangeet');
    await addMember('haldi', [{ roleId: role('Editor').id, subEventIds: [haldi.id] }]);

    await run('owner', updateSubEvent, {
      subEventId: haldi.id,
      expectedVersion: 1,
      changes: { notes: 'x' },
    });
    // Someone else's change needs event.settings, which Editors don't have.
    await expect(undo('editor')).rejects.toMatchObject({
      code: 'forbidden',
      details: { permission: 'event.settings' },
    });
    await expect(undo('admin')).resolves.toBeDefined();

    // A Haldi-scoped Editor undoes their own Haldi change, but nobody undoes beyond scope.
    await run('haldi', updateSubEvent, {
      subEventId: haldi.id,
      expectedVersion: 3,
      changes: { notes: 'y' },
    });
    await expect(undo('haldi')).resolves.toBeDefined();
    await run('owner', deleteSubEvent, { subEventId: sangeet.id, expectedVersion: 1 });
    const deleted = last();
    await expect(undo('haldi', deleted.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(undo('outsider', deleted.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it("doesn't undo team changes", async () => {
    const { run, undo, last } = await wedding();
    await run('owner', createRole, { name: 'Decor', permissions: ['event.view'] });
    expect(isUndoable(last())).toBe(false);
    await expect(undo('owner')).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'not_undoable' },
    });
  });
});
