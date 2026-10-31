import { describe, expect, it } from 'vitest';

import { undoActivity } from '../activity/undo.js';
import { testWedding } from '../testing/wedding.js';
import { createContact, createHousehold } from './guest-actions.js';
import {
  createInvitation,
  createInvitations,
  deleteInvitation,
  regenerateInvitationLink,
  updateAttendance,
  updateInvitation,
  updateInvitations,
} from './invitation-actions.js';

async function wedding() {
  const wedding = await testWedding();
  await wedding.addMember('editor', [{ roleId: wedding.role('Editor').id, subEventIds: [] }]);
  await wedding.addMember('mehendi-editor', [
    { roleId: wedding.role('Editor').id, subEventIds: [wedding.subEvent('Mehendi').id] },
  ]);
  const uncle = await wedding.addMember('uncle', [
    { roleId: wedding.role('Helper').id, subEventIds: [] },
  ]);
  const sharmas = await wedding.run('editor', createHousehold, {
    name: 'Sharma family',
    expectedCount: 4,
  });
  const asha = await wedding.run('editor', createContact, {
    name: 'Asha',
    householdId: sharmas.id,
  });
  const ravi = await wedding.run('editor', createContact, { name: 'Ravi' });
  const perSubEvent = () => {
    wedding.events.get(wedding.event.id)!.guestScope = 'per_sub_event';
  };
  const undo = (userId: string) =>
    wedding.run(userId, undoActivity, { entryId: wedding.activity.at(-1)!.id });
  return { ...wedding, uncle, sharmas, asha, ravi, perSubEvent, undo };
}

describe('inviting', () => {
  it('a household to the whole event starts its attendance at the expected count', async () => {
    const { run, sharmas, activity } = await wedding();
    await expect(
      run('mehendi-editor', createInvitation, { householdId: sharmas.id }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const invitation = await run('editor', createInvitation, { householdId: sharmas.id });
    expect(invitation).toMatchObject({
      guestName: 'Sharma family',
      deliveryStatus: 'not_sent',
      subEventIds: [],
      attendance: [{ subEventId: null, status: 'invited', partySize: 4 }],
    });
    expect(activity.at(-1)).toMatchObject({ action: 'invitation.create' });
    await expect(
      run('editor', createInvitation, { householdId: sharmas.id, subEventIds: [] }),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'already_invited' } });
  });

  it('per sub-event, chooses sub-events and makes one attendance row each', async () => {
    const { run, ravi, subEvent, perSubEvent } = await wedding();
    const mehendi = subEvent('Mehendi').id;
    // Whole event: no sub-events to choose.
    await expect(
      run('editor', createInvitation, { contactId: ravi.id, subEventIds: [mehendi] }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    perSubEvent();

    const wedding_ = subEvent('Wedding').id;
    const invitation = await run('editor', createInvitation, {
      contactId: ravi.id,
      subEventIds: [mehendi, wedding_],
    });
    expect(invitation.subEventIds).toEqual([mehendi, wedding_]);
    expect(invitation.attendance.map((row) => [row.subEventId, row.partySize])).toEqual([
      [mehendi, 1],
      [wedding_, 1],
    ]);
  });

  it("won't invite someone twice through their household", async () => {
    const { run, sharmas, asha, ravi } = await wedding();
    await run('editor', createInvitation, { contactId: asha.id });
    const result = await run('editor', createInvitations, {
      householdIds: [sharmas.id],
      contactIds: [ravi.id, asha.id],
    });
    expect(result.created.map((item) => item.guestName)).toEqual(['Ravi']);
    expect(result.skipped).toEqual([
      { householdId: sharmas.id, contactId: null, reason: 'member_invited' },
      { householdId: null, contactId: asha.id, reason: 'already_invited' },
    ]);
  });
});

describe('delivery', () => {
  it('stamps sent and delivered, and the distributor may mark their own cards only', async () => {
    const { run, sharmas, ravi, uncle } = await wedding();
    const card = await run('editor', createInvitation, {
      householdId: sharmas.id,
      distributorMemberId: uncle.id,
    });
    const other = await run('editor', createInvitation, { contactId: ravi.id });
    // A Helper without guests.invite: their own card's delivery status, nothing more.
    await expect(
      run('uncle', updateInvitation, {
        invitationId: card.id,
        expectedVersion: 1,
        changes: { distributorMemberId: null },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      run('uncle', updateInvitation, {
        invitationId: other.id,
        expectedVersion: 1,
        changes: { deliveryStatus: 'delivered_in_person' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const delivered = await run('uncle', updateInvitation, {
      invitationId: card.id,
      expectedVersion: 1,
      changes: { deliveryStatus: 'delivered_in_person' },
    });
    expect(delivered.deliveryStatus).toBe('delivered_in_person');
    expect(delivered.deliveredAt).not.toBeNull();

    const { updated, missing } = await run('editor', updateInvitations, {
      invitationIds: [card.id, other.id, '00000000-0000-7000-8000-999999999999'],
      deliveryStatus: 'sent_digitally',
    });
    expect(updated.map((item) => item.deliveryStatus)).toEqual([
      'sent_digitally',
      'sent_digitally',
    ]);
    expect(updated[1]!.sentAt).not.toBeNull();
    expect(missing).toEqual(['00000000-0000-7000-8000-999999999999']);
  });

  it('a new link bumps the version; the old one is the store’s to kill', async () => {
    const { run, ravi, invitations } = await wedding();
    const card = await run('editor', createInvitation, { contactId: ravi.id });
    await run('editor', regenerateInvitationLink, { invitationId: card.id, expectedVersion: 1 });
    expect(invitations.get(card.id)?.tokenVersion).toBe(2);
  });
});

describe('changing and withdrawing', () => {
  it('taking a sub-event away cancels that attendance; adding one invites', async () => {
    const { run, ravi, subEvent, perSubEvent } = await wedding();
    perSubEvent();
    const [mehendi, haldi] = [subEvent('Mehendi').id, subEvent('Haldi').id];
    const card = await run('editor', createInvitation, {
      contactId: ravi.id,
      subEventIds: [mehendi],
    });
    const after = await run('editor', updateInvitation, {
      invitationId: card.id,
      expectedVersion: 1,
      changes: { subEventIds: [haldi] },
    });
    expect(after.subEventIds).toEqual([haldi]);
    expect(Object.fromEntries(after.attendance.map((row) => [row.subEventId, row.status]))).toEqual(
      {
        [mehendi]: 'cancelled',
        [haldi]: 'invited',
      },
    );
  });

  it('withdrawing cancels attendance; undo brings back the answers it had', async () => {
    const { run, undo, sharmas, attendance, invitations } = await wedding();
    const card = await run('editor', createInvitation, { householdId: sharmas.id });
    const row = card.attendance[0]!;
    await run('editor', updateAttendance, {
      attendanceId: row.id,
      expectedVersion: 1,
      changes: { status: 'confirmed', partySize: 5 },
    });
    await run('editor', deleteInvitation, { invitationId: card.id, expectedVersion: 1 });
    expect(attendance.get(row.id)?.status).toBe('cancelled');
    expect(invitations.get(card.id)?.deleted).toBe(true);
    await undo('editor');
    expect(attendance.get(row.id)).toMatchObject({ status: 'confirmed', partySize: 5 });
    expect(invitations.get(card.id)?.deleted).toBe(false);
  });

  it('attendance follows sub-event scope', async () => {
    const { run, ravi, subEvent, perSubEvent } = await wedding();
    perSubEvent();
    const [mehendi, haldi] = [subEvent('Mehendi').id, subEvent('Haldi').id];
    const card = await run('editor', createInvitation, {
      contactId: ravi.id,
      subEventIds: [mehendi, haldi],
    });
    const at = (id: string) => card.attendance.find((row) => row.subEventId === id)!;
    await expect(
      run('mehendi-editor', updateAttendance, {
        attendanceId: at(haldi).id,
        expectedVersion: 1,
        changes: { status: 'declined' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const mehendiRow = await run('mehendi-editor', updateAttendance, {
      attendanceId: at(mehendi).id,
      expectedVersion: 1,
      changes: { status: 'declined' },
    });
    expect(mehendiRow.status).toBe('declined');
  });
});
