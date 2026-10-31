import { describe, expect, it } from 'vitest';

import { runAction, type ActionDefinition } from '../action.js';
import type { ActionContext } from '../context.js';
import type { CoreTx } from '../ports.js';
import { testWedding } from '../testing/wedding.js';
import { createContact, createHousehold } from './guest-actions.js';
import { createInvitation, deleteInvitation } from './invitation-actions.js';
import { recordInvitationOpened, respondToInvitation } from './rsvp-actions.js';

async function wedding() {
  const wedding = await testWedding();
  await wedding.addMember('editor', [{ roleId: wedding.role('Editor').id, subEventIds: [] }]);
  const sharmas = await wedding.run('editor', createHousehold, {
    name: 'Sharma family',
    expectedCount: 4,
  });
  const event = wedding.events.get(wedding.event.id)!;
  /** Runs an action as the guest holding this invitation's link. */
  const asGuest = <I, R>(
    invitationId: string,
    action: ActionDefinition<I, R, CoreTx>,
    input: I,
    now = new Date('2026-11-01T10:00:00Z'),
  ) => {
    const ctx: ActionContext = {
      requestId: 'guest-request',
      channel: 'public_link',
      actor: { kind: 'guest', invitationId },
      eventId: wedding.event.id,
      now,
    };
    return runAction(wedding.runtime, ctx, action, input);
  };
  return { ...wedding, sharmas, event, asGuest };
}

describe('RSVP', () => {
  it('a household answers how many are coming; the last answer wins and is logged', async () => {
    const { run, sharmas, event, asGuest, activity, attendance } = await wedding();
    event.responseMode = 'invite_rsvp';
    const card = await run('editor', createInvitation, { householdId: sharmas.id });
    const rowId = card.attendance[0]!.id;
    await asGuest(card.id, respondToInvitation, {
      responses: [{ subEventId: null, attending: true, partySize: 6 }],
    });
    expect(attendance.get(rowId)).toMatchObject({ status: 'confirmed', partySize: 6 });
    expect(activity.at(-1)).toMatchObject({
      action: 'attendance.respond',
      channel: 'public_link',
      actorUserId: null,
      after: { status: 'confirmed', partySize: 6 },
    });
    // Changing their mind keeps the party size they gave.
    await asGuest(card.id, respondToInvitation, {
      responses: [{ subEventId: null, attending: false }],
    });
    expect(attendance.get(rowId)).toMatchObject({ status: 'declined', partySize: 6 });
  });

  it('refuses invite-only events, parts not on the invitation, and a withdrawn link', async () => {
    const { run, sharmas, event, asGuest, subEvent } = await wedding();
    const card = await run('editor', createInvitation, { householdId: sharmas.id });
    const answer = { responses: [{ subEventId: null, attending: true, partySize: 2 }] };
    // The wedding template is invite only: shown, not answered.
    await expect(asGuest(card.id, respondToInvitation, answer)).rejects.toMatchObject({
      code: 'validation_failed',
    });
    event.responseMode = 'invite_rsvp';
    await expect(
      asGuest(card.id, respondToInvitation, {
        responses: [{ subEventId: subEvent('Mehendi').id, attending: true, partySize: 2 }],
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      asGuest(card.id, respondToInvitation, {
        responses: [{ subEventId: null, attending: true }],
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await run('editor', deleteInvitation, { invitationId: card.id, expectedVersion: 1 });
    await expect(asGuest(card.id, respondToInvitation, answer)).rejects.toMatchObject({
      code: 'link_revoked',
    });
  });

  it('per sub-event, answers each sub-event that takes replies', async () => {
    const { run, event, asGuest, subEvent, subEvents } = await wedding();
    event.guestScope = 'per_sub_event';
    const [mehendi, dinner] = [subEvent('Mehendi'), subEvent('Haldi')];
    subEvents.get(dinner.id)!.responseMode = 'invite_rsvp';
    const ravi = await run('editor', createContact, { name: 'Ravi' });
    const card = await run('editor', createInvitation, {
      contactId: ravi.id,
      subEventIds: [mehendi.id, dinner.id],
    });
    await expect(
      asGuest(card.id, respondToInvitation, {
        responses: [{ subEventId: mehendi.id, attending: true, partySize: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    const [row] = await asGuest(card.id, respondToInvitation, {
      responses: [{ subEventId: dinner.id, attending: true, partySize: 2 }],
    });
    expect(row).toMatchObject({ subEventId: dinner.id, status: 'confirmed', partySize: 2 });
  });

  it('notes the link was opened at most once an hour', async () => {
    const { run, sharmas, asGuest, invitations } = await wedding();
    const card = await run('editor', createInvitation, { householdId: sharmas.id });
    const at = (iso: string) => asGuest(card.id, recordInvitationOpened, {}, new Date(iso));
    await at('2026-11-01T10:00:00Z');
    await at('2026-11-01T10:30:00Z');
    expect(invitations.get(card.id)?.lastOpenedAt).toBe('2026-11-01T10:00:00.000Z');
    await at('2026-11-01T11:30:00Z');
    expect(invitations.get(card.id)?.lastOpenedAt).toBe('2026-11-01T11:30:00.000Z');
    // Not a change organizers need to merge with.
    expect(invitations.get(card.id)?.version).toBe(1);
  });
});
