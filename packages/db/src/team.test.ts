import {
  acceptMemberInvite,
  createEvent,
  createMemberInvite,
  createRole,
  deleteSubEvent,
  runAction,
  updateEvent,
  updateSubEvent,
  type ActionContext,
} from '@pme/core';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { rolesVersionOf } from './access.js';
import { eventQueries } from './queries/events.js';
import { teamQueries } from './queries/team.js';
import { createActionRuntime } from './runtime.js';
import { outbox } from './schema/outbox.js';
import { roleAssignments, roles } from './schema/team.js';
import { workspaces } from './schema/workspaces.js';
import { users } from './schema/auth.js';
import {
  connectTestDb,
  deleteTestEvents,
  deleteTestUser,
  insertTestUser,
} from './testing/test-db.js';

const { pool, db } = connectTestDb();
const runtime = createActionRuntime(db);
const team = teamQueries(db);
const createdEvents: string[] = [];
const createdUsers: string[] = [];
let owner: string;

const ctxFor = (userId: string, eventId: string | null = null): ActionContext => ({
  requestId: 'req_test',
  channel: 'app',
  actor: { kind: 'user', userId, memberId: null },
  eventId,
  now: new Date(),
});

async function user(name: string) {
  const id = await insertTestUser(db, name);
  createdUsers.push(id);
  return id;
}

async function newEvent() {
  const event = await runAction(runtime, ctxFor(owner), createEvent, {
    templateKey: 'wedding',
    name: 'Team Test Wedding',
    startsOn: '2026-12-10',
    endsOn: '2026-12-12',
    timeZone: 'Asia/Kolkata',
  });
  createdEvents.push(event.id);
  const roleList = await team.listRoles(event.id);
  const role = (name: string) => roleList.find((item) => item.name === name)!;
  const subEvents = await eventQueries(db).listSubEvents(event.id);
  const subEvent = (name: string) => subEvents.find((item) => item.name === name)!;
  return { event, role, subEvent, ctx: ctxFor(owner, event.id) };
}

/** Invites and accepts, the way a new member joins. */
async function join(
  eventId: string,
  grants: { roleId: string; subEventIds: string[] }[],
  name = 'Member',
) {
  const userId = await user(name);
  const [{ email }] = (await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))) as [{ email: string }];
  const invite = await runAction(runtime, ctxFor(owner, eventId), createMemberInvite, {
    body: { grants, maxUses: 1, expiresInDays: 7 },
    linkBase: 'http://localhost:3000/join/',
    inviterName: 'Priya',
  });
  await runAction(runtime, ctxFor(userId), acceptMemberInvite, {
    token: invite.token,
    userEmail: email,
  });
  return userId;
}

beforeAll(async () => {
  owner = await user('Priya Sharma');
  await db.insert(workspaces).values({ ownerUserId: owner, name: "Priya's workspace" });
});

afterAll(async () => {
  await deleteTestEvents(db, createdEvents);
  for (const id of createdUsers) await deleteTestUser(db, id);
  await pool.end();
});

describe('createEvent', () => {
  it('stores the standard roles and the owner as the first member', async () => {
    const { event } = await newEvent();
    const roleList = await team.listRoles(event.id);
    expect(roleList.map((role) => [role.name, role.memberCount])).toEqual([
      ['Owner', 1],
      ['Admin', 0],
      ['Editor', 0],
      ['Helper', 0],
      ['Viewer', 0],
    ]);
    const mine = await team.myMembership(event.id, owner);
    expect(mine?.member).toMatchObject({ isOwner: true, name: 'Priya Sharma' });
    expect(mine?.permissions.wholeEvent).toContain('event.delete');

    const myEvents = await eventQueries(db).listEventsForUser(owner);
    expect(myEvents.find((item) => item.id === event.id)?.roles).toEqual(['Owner']);
  });

  it('allows one Owner role per event and unique names ignoring case, in the database', async () => {
    const { event } = await newEvent();
    await expect(
      db.insert(roles).values({ eventId: event.id, name: 'Second owner', isOwner: true }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(
      runAction(runtime, ctxFor(owner, event.id), createRole, { name: 'ADMIN', permissions: [] }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});

describe('effective permissions against Postgres', () => {
  it('403 names the permission; scoped grants apply only in their sub-event', async () => {
    const { event, role, subEvent, ctx } = await newEvent();
    const decor = await runAction(runtime, ctx, createRole, {
      name: 'Decor',
      permissions: ['event.view', 'subevents.view', 'subevents.edit'],
    });
    const mehendi = subEvent('Mehendi');
    const decorUser = await join(
      event.id,
      [{ roleId: decor.id, subEventIds: [mehendi.id] }],
      'Decor',
    );
    const viewer = await join(event.id, [{ roleId: role('Viewer').id, subEventIds: [] }], 'Viewer');

    await expect(
      runAction(runtime, ctxFor(viewer, event.id), updateEvent, {
        expectedVersion: 1,
        changes: { name: 'Nope' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden', details: { permission: 'event.settings' } });

    const decorCtx = ctxFor(decorUser, event.id);
    await expect(
      runAction(runtime, decorCtx, updateSubEvent, {
        subEventId: mehendi.id,
        expectedVersion: 1,
        changes: { capacity: 150 },
      }),
    ).resolves.toMatchObject({ capacity: 150 });
    await expect(
      runAction(runtime, decorCtx, updateSubEvent, {
        subEventId: subEvent('Haldi').id,
        expectedVersion: 1,
        changes: { capacity: 150 },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    expect((await team.myMembership(event.id, decorUser))?.permissions).toEqual({
      wholeEvent: [],
      subEvents: { [mehendi.id]: ['event.view', 'subevents.edit', 'subevents.view'] },
    });

    // Deleting Mehendi removes the scoped assignment instead of widening it.
    const before = await rolesVersionOf(db, event.id);
    await runAction(runtime, ctx, deleteSubEvent, { subEventId: mehendi.id, expectedVersion: 2 });
    expect(await rolesVersionOf(db, event.id)).toBe(before! + 1);
    const member = (await team.myMembership(event.id, decorUser))!.member;
    expect(member.assignments).toEqual([]);
    expect(
      await db
        .select()
        .from(roleAssignments)
        .where(and(eq(roleAssignments.eventId, event.id), eq(roleAssignments.memberId, member.id))),
    ).toEqual([]);
  });
});

describe('member invites against Postgres', () => {
  it('writes the invite email to the outbox and stores only the token hash', async () => {
    const { event, role, ctx } = await newEvent();
    const invite = await runAction(runtime, ctx, createMemberInvite, {
      body: {
        email: 'cousin@example.com',
        grants: [{ roleId: role('Helper').id, subEventIds: [] }],
        maxUses: 1,
        expiresInDays: 7,
      },
      linkBase: 'http://localhost:3000/join/',
      inviterName: 'Priya',
    });
    const [row] = await db
      .select()
      .from(outbox)
      .where(eq(outbox.dedupeKey, `member-invite-${invite.id}`));
    expect(row).toMatchObject({ topic: 'email.critical', eventId: event.id });
    await db.delete(outbox).where(eq(outbox.id, row!.id));

    const { rows } = await pool.query<{ n: number }>(
      'select count(*)::int as n from member_invites where token_hash = sha256($1::bytea)',
      [Buffer.from(invite.token)],
    );
    expect(rows[0]!.n).toBe(1);
    await expect(team.invitePreview(Buffer.from('x'), new Date())).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('two people accepting a single-use link at once: one joins, one gets link_expired', async () => {
    const { event, role, ctx } = await newEvent();
    const invite = await runAction(runtime, ctx, createMemberInvite, {
      body: {
        grants: [{ roleId: role('Viewer').id, subEventIds: [] }],
        maxUses: 1,
        expiresInDays: 7,
      },
      linkBase: 'http://localhost:3000/join/',
      inviterName: 'Priya',
    });
    const [a, b] = [await user('A'), await user('B')];
    const results = await Promise.allSettled(
      [a, b].map((userId) =>
        runAction(runtime, ctxFor(userId), acceptMemberInvite, {
          token: invite.token,
          userEmail: `${userId}@test.local`,
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'link_expired' },
    });
    expect(await team.listOpenInvites(event.id)).toEqual([]);
    expect((await team.listMembers(event.id)).map((member) => member.name).sort()).toEqual(
      expect.arrayContaining(['Priya Sharma']),
    );
  });
});
