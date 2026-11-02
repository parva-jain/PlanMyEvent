import { LIVE_TOPIC } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { undoActivity } from '../activity/undo.js';
import { createHousehold, createContact } from '../guests/guest-actions.js';
import { createInvitation, updateAttendance } from '../guests/invitation-actions.js';
import { testWedding } from '../testing/wedding.js';
import { mergeRows, startGuestScopeSwitch, switchGuestScope } from './guest-scope-actions.js';

async function wedding() {
  const wedding = await testWedding();
  await wedding.addMember('editor', [{ roleId: wedding.role('Editor').id, subEventIds: [] }]);
  const sharmas = await wedding.run('owner', createHousehold, {
    name: 'Sharma family',
    expectedCount: 3,
  });
  const card = await wedding.run('owner', createInvitation, { householdId: sharmas.id });
  const live = () => [...wedding.subEvents.values()].filter((item) => !item.deleted);
  const rowsOf = (householdId: string) =>
    [...wedding.attendance.values()].filter((row) => row.householdId === householdId);
  return { ...wedding, sharmas, card, live, rowsOf };
}

describe('guest scope', () => {
  it('only event.settings may switch; the request is checked, then queued', async () => {
    const { run, outbox, event } = await wedding();
    await expect(
      run('editor', startGuestScopeSwitch, {
        switchId: crypto.randomUUID(),
        guestScope: 'per_sub_event',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      run('owner', startGuestScopeSwitch, {
        switchId: crypto.randomUUID(),
        guestScope: 'whole_event',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });

    const switchId = crypto.randomUUID();
    await expect(
      run('owner', startGuestScopeSwitch, { switchId, guestScope: 'per_sub_event' }),
    ).resolves.toEqual({ jobId: switchId });
    expect(outbox.at(-1)).toMatchObject({
      topic: 'event.guest_scope',
      payload: { switchId, eventId: event.id, userId: 'owner', guestScope: 'per_sub_event' },
    });
  });

  it('per sub-event: every answer is copied onto each sub-event, and invitations cover them all', async () => {
    const { run, sharmas, card, live, rowsOf, events, event, invitations, activity, outbox } =
      await wedding();
    const row = card.attendance[0]!;
    await run('owner', updateAttendance, {
      attendanceId: row.id,
      expectedVersion: 1,
      changes: { status: 'confirmed', partySize: 5 },
    });
    const versionBefore = events.get(event.id)!.version;

    const result = await run('owner', switchGuestScope, { guestScope: 'per_sub_event' });
    const subEvents = live();
    expect(result).toEqual({ guestScope: 'per_sub_event', attendanceRows: subEvents.length });
    const rows = rowsOf(sharmas.id);
    expect(rows.map((item) => item.subEventId).sort()).toEqual(
      subEvents.map((item) => item.id).sort(),
    );
    expect(rows.every((item) => item.status === 'confirmed' && item.partySize === 5)).toBe(true);
    expect(invitations.get(card.id)!.subEventIds.sort()).toEqual(
      subEvents.map((item) => item.id).sort(),
    );
    // Sub-events take the event's response mode.
    expect(subEvents.every((item) => item.responseMode === event.responseMode)).toBe(true);
    expect(events.get(event.id)).toMatchObject({
      guestScope: 'per_sub_event',
      version: versionBefore + 1,
    });
    expect(activity.at(-1)).toMatchObject({
      action: 'event.guest_scope',
      entityType: 'event',
      before: { guestScope: 'whole_event' },
      after: { guestScope: 'per_sub_event' },
    });
    // Every open screen hears the event changed.
    expect(outbox.at(-1)).toMatchObject({ topic: LIVE_TOPIC });

    // Running it again changes nothing.
    await expect(run('owner', switchGuestScope, { guestScope: 'per_sub_event' })).resolves.toEqual({
      guestScope: 'per_sub_event',
      attendanceRows: 0,
    });
  });

  it('back to the whole event: each guest keeps the most committed answer and the largest party', async () => {
    const { run, sharmas, card, live, rowsOf, invitations, attendance } = await wedding();
    const ravi = await run('owner', createContact, { name: 'Ravi' });
    await run('owner', createInvitation, { contactId: ravi.id });
    await run('owner', switchGuestScope, { guestScope: 'per_sub_event' });

    const [first, second, third] = rowsOf(sharmas.id);
    await run('owner', updateAttendance, {
      attendanceId: first!.id,
      expectedVersion: first!.version,
      changes: { status: 'declined' },
    });
    await run('owner', updateAttendance, {
      attendanceId: second!.id,
      expectedVersion: second!.version,
      changes: { status: 'confirmed', partySize: 2 },
    });
    await run('owner', updateAttendance, {
      attendanceId: third!.id,
      expectedVersion: third!.version,
      changes: { partySize: 6 },
    });

    const result = await run('owner', switchGuestScope, { guestScope: 'whole_event' });
    expect(result).toEqual({ guestScope: 'whole_event', attendanceRows: 2 });
    expect(rowsOf(sharmas.id)).toMatchObject([
      { id: second!.id, subEventId: null, status: 'confirmed', partySize: 6 },
    ]);
    const raviRows = [...attendance.values()].filter((item) => item.contactId === ravi.id);
    expect(raviRows).toMatchObject([{ subEventId: null, status: 'invited' }]);
    expect(invitations.get(card.id)!.subEventIds).toEqual([]);
    expect(live().every((item) => item.responseMode === null)).toBe(true);
  });

  it("undo refuses guest changes made before a switch, since they'd come back in the old shape", async () => {
    const { run, sharmas, card, activity } = await wedding();
    await run('owner', updateAttendance, {
      attendanceId: card.attendance[0]!.id,
      expectedVersion: 1,
      changes: { status: 'confirmed' },
    });
    const answered = activity.at(-1)!;
    const household = activity.find((item) => item.entityId === sharmas.id)!;
    await run('owner', switchGuestScope, { guestScope: 'per_sub_event' });

    await expect(run('owner', undoActivity, { entryId: answered.id })).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'guest_scope_changed' },
    });
    // Households and contacts keep their shape, so their undo still works.
    await expect(run('owner', undoActivity, { entryId: household.id })).resolves.toMatchObject({
      entityType: 'household',
    });
  });

  it('merging ranks checked in, then confirmed, then invited, then declined; cancelled last', () => {
    const row = (
      id: string,
      status: 'invited' | 'declined' | 'cancelled' | 'checked_in',
      partySize = 1,
    ) => ({
      id,
      householdId: 'h',
      contactId: null,
      subEventId: id,
      status,
      partySize,
    });
    expect(
      mergeRows([row('a', 'declined', 4), row('b', 'invited', 2), row('c', 'cancelled', 9)]),
    ).toEqual([{ keepId: 'b', status: 'invited', partySize: 4, removeIds: ['a', 'c'] }]);
    expect(mergeRows([row('a', 'cancelled', 3), row('b', 'cancelled', 5)])).toEqual([
      { keepId: 'b', status: 'cancelled', partySize: 5, removeIds: ['a'] },
    ]);
    expect(mergeRows([row('a', 'invited'), row('b', 'checked_in')])[0]).toMatchObject({
      keepId: 'b',
      status: 'checked_in',
    });
  });
});
