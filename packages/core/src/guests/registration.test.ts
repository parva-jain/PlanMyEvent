import type { EmailJob } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { runAction } from '../action.js';
import type { ActionContext } from '../context.js';
import { testWedding } from '../testing/wedding.js';
import { createContact } from './guest-actions.js';
import { createInvitation } from './invitation-actions.js';
import { respondToInvitation } from './rsvp-actions.js';
import { createAttendance, registerForEvent, type RegisterInput } from './registration-actions.js';

const LINK = 'https://planmyevent.test/i/';

async function fest(guestScope: 'whole_event' | 'per_sub_event' = 'per_sub_event') {
  const wedding = await testWedding();
  await wedding.addMember('editor', [{ roleId: wedding.role('Editor').id, subEventIds: [] }]);
  const event = wedding.events.get(wedding.event.id)!;
  event.guestScope = guestScope;
  event.responseMode = 'open_registration';
  const haldi = wedding.subEvent('Haldi');
  const sangeet = wedding.subEvent('Sangeet');
  for (const item of [haldi, sangeet]) {
    item.visibility = 'public';
    item.responseMode = 'open_registration';
  }
  haldi.capacity = 3;
  let request = 0;
  const register = (input: Partial<RegisterInput> & { name?: string }) => {
    const ctx: ActionContext = {
      requestId: `visit-${++request}`,
      channel: 'public_link',
      actor: { kind: 'visitor', name: input.name ?? 'Anil' },
      eventId: wedding.event.id,
      now: new Date('2026-11-01T10:00:00Z'),
    };
    return runAction(wedding.runtime, ctx, registerForEvent, {
      name: 'Anil',
      subEventIds: guestScope === 'per_sub_event' ? [haldi.id] : [],
      partySize: 1,
      linkBase: LINK,
      ...input,
    });
  };
  const emails = () =>
    wedding.outbox
      .filter((message) => message.topic === 'email.critical')
      .map((message) => message.payload as EmailJob);
  return { ...wedding, event, haldi, sangeet, register, emails };
}

describe('open registration', () => {
  it('makes a contact, an invitation sent digitally and registered rows, and emails the link', async () => {
    const { register, haldi, sangeet, contacts, invitations, attendance, emails, activity } =
      await fest();
    const result = await register({
      email: 'Anil@Example.com',
      phone: '98765 43210',
      subEventIds: [haldi.id, sangeet.id],
      partySize: 2,
    });
    expect(result).toEqual({ subEventIds: [haldi.id, sangeet.id], confirmationEmail: true });

    const contact = [...contacts.values()].find((item) => item.name === 'Anil')!;
    expect(contact).toMatchObject({
      email: 'anil@example.com',
      phone: '+919876543210',
      tags: ['registered'],
    });
    const invitation = [...invitations.values()].find((item) => item.contactId === contact.id)!;
    expect(invitation).toMatchObject({ deliveryStatus: 'sent_digitally' });
    expect(invitation.sentAt).not.toBeNull();
    const rows = [...attendance.values()].filter((row) => row.invitationId === invitation.id);
    expect(rows.map((row) => [row.subEventId, row.status, row.source, row.partySize])).toEqual([
      [haldi.id, 'registered', 'registered', 2],
      [sangeet.id, 'registered', 'registered', 2],
    ]);

    expect(emails()).toEqual([
      expect.objectContaining({
        template: 'registration-confirmed',
        to: 'anil@example.com',
        guestName: 'Anil',
        url: `${LINK}token-${invitation.id}-1`,
        partySize: 2,
        items: [
          { name: 'Haldi', startsAt: haldi.startsAt },
          { name: 'Sangeet', startsAt: sangeet.startsAt },
        ],
      }),
    ]);
    // Logged as the visitor, through the public link channel.
    expect(activity.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['contact.create', 'invitation.register']),
    );
  });

  it('refuses a full sub-event with capacity_full, counting party sizes', async () => {
    const { register, haldi } = await fest();
    await register({ email: 'a@example.com', partySize: 2 });
    await expect(register({ email: 'b@example.com', partySize: 2 })).rejects.toMatchObject({
      code: 'capacity_full',
      details: { subEventId: haldi.id, spotsLeft: 1 },
    });
    await expect(register({ email: 'c@example.com', partySize: 1 })).resolves.toBeTruthy();
  });

  it('answers the same for someone already on the list, and only re-sends to the email on file', async () => {
    const { register, run, haldi, invitations, emails } = await fest();
    const meera = await run('editor', createContact, {
      name: 'Meera',
      phone: '9876500000',
      email: 'meera@example.com',
    });
    await run('editor', createInvitation, { contactId: meera.id, subEventIds: [haldi.id] });
    const before = invitations.size;

    // By phone, with a different email typed: no new contact, and the link goes to Meera only.
    const result = await register({ name: 'Someone', phone: '98765 00000' });
    expect(result).toEqual({ subEventIds: [haldi.id], confirmationEmail: false });
    expect(invitations.size).toBe(before);
    expect(emails()).toEqual([expect.objectContaining({ to: 'meera@example.com' })]);

    const again = await register({ name: 'Meera', email: 'meera@example.com' });
    expect(again.confirmationEmail).toBe(true);
    expect(emails()).toHaveLength(2);
  });

  it('a phone match never takes a typed email: a new contact instead', async () => {
    const { register, run, contacts } = await fest();
    await run('editor', createContact, { name: 'Meera', phone: '9876500000' });
    await register({ name: 'Intruder', phone: '98765 00000', email: 'x@example.com' });
    expect([...contacts.values()].filter((item) => item.phone === '+919876500000')).toHaveLength(2);
  });

  it('refuses sub-events not open to registration, a closed event, and other actors', async () => {
    const { register, run, event, subEvent } = await fest();
    const mehendi = subEvent('Mehendi');
    await expect(
      register({ email: 'a@example.com', subEventIds: [mehendi.id] }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(register({ email: 'a@example.com', subEventIds: [] })).rejects.toMatchObject({
      code: 'validation_failed',
    });

    event.status = 'completed';
    await expect(register({ email: 'a@example.com' })).rejects.toMatchObject({
      code: 'registration_closed',
    });
    event.status = 'draft';
    await expect(register({ email: 'a@example.com' })).rejects.toMatchObject({
      code: 'not_found',
    });
    event.status = 'planning';
    await expect(
      run('editor', registerForEvent, {
        name: 'Anil',
        subEventIds: [],
        partySize: 1,
        linkBase: LINK,
        email: 'a@example.com',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a registrant cancels through their link, and registering again brings the row back', async () => {
    const { register, haldi, invitations, attendance, runtime, event, emails } = await fest();
    await register({ email: 'anil@example.com', partySize: 3 });
    const invitation = [...invitations.values()].at(-1)!;
    const asGuest = (attending: boolean) =>
      runAction(
        runtime,
        {
          requestId: 'guest',
          channel: 'public_link',
          actor: { kind: 'guest', invitationId: invitation.id },
          eventId: event.id,
          now: new Date('2026-11-02T10:00:00Z'),
        },
        respondToInvitation,
        { responses: [{ subEventId: haldi.id, attending, partySize: 1 }] },
      );
    // Registrants can't change their party size here: capacity is checked on the event page.
    await expect(asGuest(true)).rejects.toMatchObject({ code: 'validation_failed' });
    await asGuest(false);
    const row = () => [...attendance.values()].find((item) => item.invitationId === invitation.id)!;
    expect(row().status).toBe('cancelled');

    // Haldi holds 3: the place is free again, for someone else or for Anil.
    await register({ email: 'anil@example.com', partySize: 2 });
    expect(row()).toMatchObject({ status: 'registered', partySize: 2 });
    expect(invitations.size).toBe(1);
    expect(emails()).toHaveLength(2);
  });

  it('with whole-event guests, registers for the event and checks every sub-event capacity', async () => {
    const { register, event, haldi, attendance, emails } = await fest('whole_event');
    await register({ email: 'a@example.com', partySize: 3 });
    expect([...attendance.values()].map((row) => [row.subEventId, row.status])).toEqual([
      [null, 'registered'],
    ]);
    expect(emails()[0]).toMatchObject({ items: [] });
    // Haldi holds 3: the event is full.
    await expect(register({ email: 'b@example.com' })).rejects.toMatchObject({
      code: 'capacity_full',
      details: { subEventId: haldi.id },
    });
    event.responseMode = 'invite_rsvp';
    await expect(register({ email: 'c@example.com' })).rejects.toMatchObject({
      code: 'registration_closed',
    });
  });
});

describe('walk-ins (POST E/attendance)', () => {
  it('checks in a new walk-in, and checks in an invited guest on their own row', async () => {
    const { run, haldi, attendance, contacts } = await fest();
    const walkIn = await run('editor', createAttendance, {
      contact: { name: 'Ravi', phone: '9876511111' },
      subEventId: haldi.id,
      partySize: 2,
      status: 'checked_in',
    });
    expect(walkIn).toMatchObject({ status: 'checked_in', source: 'registered', partySize: 2 });
    expect(walkIn.checkedInAt).not.toBeNull();
    expect([...contacts.values()].some((item) => item.phone === '+919876511111')).toBe(true);

    const meera = await run('editor', createContact, { name: 'Meera' });
    const card = await run('editor', createInvitation, {
      contactId: meera.id,
      subEventIds: [haldi.id],
    });
    const arrived = await run('editor', createAttendance, {
      contactId: meera.id,
      subEventId: haldi.id,
      partySize: 1,
      status: 'checked_in',
    });
    expect(arrived.id).toBe(card.attendance[0]!.id);
    expect(attendance.get(arrived.id)).toMatchObject({ status: 'checked_in', source: 'invited' });
  });

  it('needs guests.edit in that sub-event, and the right scope', async () => {
    const { run, addMember, role, haldi, sangeet } = await fest();
    await addMember('desk', [{ roleId: role('Helper').id, subEventIds: [] }]);
    const input = {
      contact: { name: 'Ravi' },
      subEventId: haldi.id,
      partySize: 1,
      status: 'checked_in' as const,
    };
    await expect(run('desk', createAttendance, input)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      run('editor', createAttendance, { ...input, subEventId: null }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      run('editor', createAttendance, { ...input, subEventId: sangeet.id }),
    ).resolves.toMatchObject({ subEventId: sangeet.id });
  });
});
