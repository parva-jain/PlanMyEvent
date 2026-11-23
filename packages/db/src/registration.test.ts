import {
  createAttendance,
  createContact,
  createEvent,
  createHousehold,
  createInvitation,
  registerForEvent,
  runAction,
  updateEvent,
  updateSubEvent,
  type ActionContext,
  type ActionDefinition,
  type CoreTx,
  type RegisterInput,
} from '@pme/core';
import type { CreatedEvent, SubEvent } from '@pme/contracts';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashLinkToken } from './invitation-links.js';
import { eventQueries } from './queries/events.js';
import { publicEventPage, publicQueries } from './queries/public.js';
import { createActionRuntime } from './runtime.js';
import { activityLog } from './schema/activity.js';
import { events } from './schema/events.js';
import { attendance } from './schema/invitations.js';
import { outbox } from './schema/outbox.js';
import { workspaces } from './schema/workspaces.js';
import {
  connectTestDb,
  deleteTestEvents,
  deleteTestUser,
  insertTestUser,
} from './testing/test-db.js';

const { pool, db } = connectTestDb();
const runtime = createActionRuntime(db, { invitationLinkKey: 'registration-test-key-0123456789' });
let owner: string;
let event: CreatedEvent;
let workshop: SubEvent;
let talk: SubEvent;

const ctx = (eventId: string | null): ActionContext => ({
  requestId: `req_${Math.random().toString(36).slice(2)}`,
  channel: 'app',
  actor: { kind: 'user', userId: owner, memberId: null },
  eventId,
  now: new Date(),
});
const run = <I, R>(action: ActionDefinition<I, R, CoreTx>, input: I) =>
  runAction(runtime, ctx(event.id), action, input);
const register = (input: Partial<RegisterInput>) =>
  runAction(
    runtime,
    {
      requestId: `visit_${Math.random().toString(36).slice(2)}`,
      channel: 'public_link',
      actor: { kind: 'visitor', name: input.name ?? 'Anil' },
      eventId: event.id,
      now: new Date(),
    },
    registerForEvent,
    {
      name: 'Anil',
      subEventIds: [workshop.id],
      partySize: 1,
      linkBase: 'http://localhost:3000/i/',
      ...input,
    },
  );

beforeAll(async () => {
  owner = await insertTestUser(db, 'Priya Sharma');
  await db.insert(workspaces).values({ ownerUserId: owner, name: "Priya's workspace" });
  event = await runAction(runtime, ctx(null), createEvent, {
    templateKey: 'conference',
    name: 'DevFest Bhopal',
    startsOn: '2027-03-10',
    endsOn: '2027-03-11',
    timeZone: 'Asia/Kolkata',
  });
  // Separate guest lists per sub-event (set directly: the switch is a job, tested elsewhere),
  // with two public sessions open to registration.
  await db.update(events).set({ guestScope: 'per_sub_event' }).where(eq(events.id, event.id));
  const full = await eventQueries(db).listSubEvents(event.id);
  [workshop, talk] = [full[0]!, full[1]!];
  await run(updateEvent, {
    expectedVersion: event.version,
    changes: { status: 'planning' },
  });
  for (const [item, capacity] of [
    [workshop, 2],
    [talk, null],
  ] as const) {
    await run(updateSubEvent, {
      subEventId: item.id,
      expectedVersion: item.version,
      changes: { visibility: 'public', capacity },
    });
  }
});

afterAll(async () => {
  await deleteTestEvents(db, [event.id]);
  await deleteTestUser(db, owner);
  await pool.end();
});

describe('open registration in Postgres', () => {
  it('shows the public page with places left, and 404s a slug with nothing public', async () => {
    const found = (await publicEventPage(db, event.slug))!;
    expect(found.eventId).toBe(event.id);
    expect(found.page.guestScope).toBe('per_sub_event');
    const session = found.page.subEvents.find((item) => item.id === workshop.id)!;
    expect(session).toMatchObject({ capacity: 2, spotsLeft: 2, registration: 'open' });
    expect(await publicEventPage(db, 'no-such-event-slug')).toBeNull();
  });

  it('registers with a working magic link, logged as the visitor', async () => {
    await register({ name: 'Anil Kumar', email: 'anil@example.com', subEventIds: [workshop.id] });
    const [email] = await db
      .select()
      .from(outbox)
      .where(and(eq(outbox.topic, 'email.critical'), eq(outbox.eventId, event.id)));
    const payload = email!.payload as { url: string; to: string };
    expect(payload.to).toBe('anil@example.com');
    // The emailed link opens this registrant's invitation.
    const token = payload.url.split('/i/')[1]!;
    const lookup = await publicQueries(db).lookupInvite(hashLinkToken(token));
    expect(lookup).toMatchObject({ kind: 'live', eventId: event.id });
    const [entry] = await db
      .select({ actorLabel: activityLog.actorLabel, action: activityLog.action })
      .from(activityLog)
      .where(and(eq(activityLog.eventId, event.id), eq(activityLog.action, 'invitation.register')));
    expect(entry).toEqual({
      actorLabel: 'Anil Kumar (registration)',
      action: 'invitation.register',
    });
  });

  it('gives the last place to exactly one of two registrations racing for it', async () => {
    const results = await Promise.allSettled([
      register({ email: 'one@example.com' }),
      register({ email: 'two@example.com' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const refused = results.find((result) => result.status === 'rejected')!;
    expect(refused.reason).toMatchObject({ code: 'capacity_full' });
    const page = (await publicEventPage(db, event.slug))!.page;
    expect(page.subEvents.find((item) => item.id === workshop.id)).toMatchObject({
      spotsLeft: 0,
      registration: 'full',
    });
  });

  it('checks in a walk-in, and an invited household arriving on its own row', async () => {
    const walkIn = await run(createAttendance, {
      contact: { name: 'Ravi' },
      subEventId: talk.id,
      partySize: 1,
      status: 'checked_in',
    });
    expect(walkIn).toMatchObject({ status: 'checked_in', source: 'registered', guestName: 'Ravi' });

    const family = await run(createHousehold, { name: 'Verma family', expectedCount: 3 });
    const card = await run(createInvitation, { householdId: family.id, subEventIds: [talk.id] });
    const [member] = await db
      .select({ id: attendance.id })
      .from(attendance)
      .where(eq(attendance.invitationId, card.id));
    const person = await run(createContact, { name: 'Sunil Verma', householdId: family.id });
    const arrived = await run(createAttendance, {
      contactId: person.id,
      subEventId: talk.id,
      partySize: 3,
      status: 'checked_in',
    });
    expect(arrived.id).toBe(member!.id);
    expect(arrived).toMatchObject({ status: 'checked_in', partySize: 3, source: 'invited' });
  });
});
