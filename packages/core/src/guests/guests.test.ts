import { LIVE_TOPIC, type LiveSignal } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { undoActivity } from '../activity/undo.js';
import { testWedding } from '../testing/wedding.js';
import {
  createContact,
  createHousehold,
  deleteContact,
  deleteHousehold,
  updateContact,
  updateHousehold,
} from './guest-actions.js';

async function wedding() {
  const wedding = await testWedding();
  await wedding.addMember('editor', [{ roleId: wedding.role('Editor').id, subEventIds: [] }]);
  await wedding.addMember('mehendi-editor', [
    { roleId: wedding.role('Editor').id, subEventIds: [wedding.subEvent('Mehendi').id] },
  ]);
  await wedding.addMember('viewer', [{ roleId: wedding.role('Viewer').id, subEventIds: [] }]);
  const undo = (userId: string) =>
    wedding.run(userId, undoActivity, { entryId: wedding.activity.at(-1)!.id });
  return { ...wedding, undo };
}

describe('contacts', () => {
  it('need guests.edit for the whole event, and are logged and signalled', async () => {
    const { run, outbox, activity } = await wedding();
    await expect(run('viewer', createContact, { name: 'Asha' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    // Guests belong to the whole event: a sub-event scope isn't enough.
    await expect(run('mehendi-editor', createContact, { name: 'Asha' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    const asha = await run('editor', createContact, { name: 'Asha', tags: ['VIP'] });
    expect(asha).toMatchObject({ name: 'Asha', householdId: null, tags: ['VIP'], version: 1 });
    expect(activity.at(-1)).toMatchObject({ action: 'contact.create', entityId: asha.id });
    const signal = outbox.at(-1)!;
    expect(signal.topic).toBe(LIVE_TOPIC);
    expect((signal.payload as LiveSignal & { kind: 'emit' }).data).toMatchObject({
      entityType: 'contact',
      op: 'created',
    });
  });

  it('store phones in E.164, Indian numbers with +91', async () => {
    const { run } = await wedding();
    const asha = await run('editor', createContact, { name: 'Asha', phone: '098765 43210' });
    expect(asha.phone).toBe('+919876543210');
    const moved = await run('editor', updateContact, {
      contactId: asha.id,
      expectedVersion: 1,
      changes: { phone: '+44 20 7946 0958' },
    });
    expect(moved.phone).toBe('+442079460958');
  });

  it('join only a household of this event', async () => {
    const { run } = await wedding();
    await expect(
      run('editor', createContact, {
        name: 'Asha',
        householdId: '00000000-0000-7000-8000-999999999999',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('undo puts back an edit and a delete', async () => {
    const { run, undo, contacts } = await wedding();
    const asha = await run('editor', createContact, { name: 'Asha' });
    await run('editor', updateContact, {
      contactId: asha.id,
      expectedVersion: 1,
      changes: { name: 'Asha Sharma', tags: ['Bride side'] },
    });
    await undo('editor');
    expect(contacts.get(asha.id)).toMatchObject({ name: 'Asha', tags: [] });
    await run('editor', deleteContact, { contactId: asha.id, expectedVersion: 3 });
    expect(contacts.get(asha.id)?.deleted).toBe(true);
    await undo('editor');
    expect(contacts.get(asha.id)?.deleted).toBe(false);
  });
});

describe('households', () => {
  it('have an expected count and a primary contact from among their own', async () => {
    const { run } = await wedding();
    const sharmas = await run('editor', createHousehold, {
      name: 'Sharma family',
      expectedCount: 4,
    });
    expect(sharmas).toMatchObject({ expectedCount: 4, primaryContactId: null });
    const outsider = await run('editor', createContact, { name: 'Ravi' });
    await expect(
      run('editor', updateHousehold, {
        householdId: sharmas.id,
        expectedVersion: 1,
        changes: { primaryContactId: outsider.id },
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    const asha = await run('editor', createContact, { name: 'Asha', householdId: sharmas.id });
    const updated = await run('editor', updateHousehold, {
      householdId: sharmas.id,
      expectedVersion: 1,
      changes: { primaryContactId: asha.id },
    });
    expect(updated.primaryContactId).toBe(asha.id);
  });

  it('lose their primary contact when that person moves out or is deleted', async () => {
    const { run, households, activity } = await wedding();
    const sharmas = await run('editor', createHousehold, { name: 'Sharma family' });
    const asha = await run('editor', createContact, { name: 'Asha', householdId: sharmas.id });
    await run('editor', updateHousehold, {
      householdId: sharmas.id,
      expectedVersion: 1,
      changes: { primaryContactId: asha.id },
    });
    await run('editor', updateContact, {
      contactId: asha.id,
      expectedVersion: 1,
      changes: { householdId: null },
    });
    expect(households.get(sharmas.id)?.primaryContactId).toBeNull();
    expect(activity.at(-1)).toMatchObject({ action: 'household.update', entityId: sharmas.id });

    const ravi = await run('editor', createContact, { name: 'Ravi', householdId: sharmas.id });
    await run('editor', updateHousehold, {
      householdId: sharmas.id,
      expectedVersion: 3,
      changes: { primaryContactId: ravi.id },
    });
    await run('editor', deleteContact, { contactId: ravi.id, expectedVersion: 1 });
    expect(households.get(sharmas.id)?.primaryContactId).toBeNull();
  });

  it('deleting one leaves its contacts, outside any household until undo', async () => {
    const { run, undo, tx, event } = await wedding();
    const sharmas = await run('editor', createHousehold, { name: 'Sharma family' });
    const asha = await run('editor', createContact, { name: 'Asha', householdId: sharmas.id });
    await run('editor', deleteHousehold, { householdId: sharmas.id, expectedVersion: 1 });
    expect(await tx.contacts.find(event.id, asha.id)).toMatchObject({ householdId: null });
    await undo('editor');
    expect(await tx.contacts.find(event.id, asha.id)).toMatchObject({ householdId: sharmas.id });
  });
});
