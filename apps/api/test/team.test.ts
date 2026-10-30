import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  CreatedEvent,
  CreatedMemberInvite,
  Member,
  MemberInvitePreview,
  MyEvent,
  MyMembership,
  Problem,
  Role,
  SubEvent,
} from '@pme/contracts';
import type { Database } from '@pme/db';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
import { DB } from '../src/database/database.module';
import { PermissionCache } from '../src/events/permission-cache';
import { REDIS } from '../src/redis/redis.module';
import { createApp } from './create-app';
import { asUser, capturingSender, testUsers } from './users';

const { codes, sender } = capturingSender();
let app: NestExpressApplication;
const users = testUsers(() => app, codes);
const as = (cookie: string[]) => asUser(() => app, cookie);

beforeAll(async () => {
  app = await createApp({ providers: [{ token: SIGN_IN_CODE_SENDER, value: sender }] });
});
afterAll(async () => {
  await users.cleanUp();
  await app.close();
});

const list = <T>(res: { body: unknown }) => (res.body as { data: T[] }).data;

/** An owner with a wedding, plus lookups for its roles and sub-events. */
async function wedding() {
  const owner = as((await users.signIn()).cookie);
  const event = (
    await owner
      .post('/v1/events')
      .send({
        templateKey: 'wedding',
        name: 'Sharma Wedding',
        startsOn: '2026-12-10',
        endsOn: '2026-12-12',
        timeZone: 'Asia/Kolkata',
      })
      .expect(201)
  ).body as CreatedEvent;
  const E = `/v1/events/${event.id}`;
  const roles = list<Role>(await owner.get(`${E}/roles`).expect(200));
  const subEvents = list<SubEvent>(await owner.get(`${E}/sub-events`).expect(200));
  return {
    owner,
    event,
    E,
    role: (name: string) => roles.find((role) => role.name === name)!,
    subEvent: (name: string) => subEvents.find((item) => item.name === name)!,
  };
}

/** Invites through a shareable link and joins as a new signed-in user. */
async function join(
  owner: ReturnType<typeof as>,
  E: string,
  grants: { roleId: string; subEventIds?: string[] }[],
) {
  const invite = (await owner.post(`${E}/member-invites`).send({ grants }).expect(201))
    .body as CreatedMemberInvite;
  const member = as((await users.signIn()).cookie);
  await member.post(`/v1/member-invites/${invite.token}/accept`).expect(201);
  return member;
}

describe('GET E/me and GET /v1/permissions', () => {
  it("returns the owner's membership and every permission", async () => {
    const { owner, E } = await wedding();
    const me = (await owner.get(`${E}/me`).expect(200)).body as MyMembership;
    expect(me.member).toMatchObject({ isOwner: true, assignments: [{ roleName: 'Owner' }] });
    expect(me.permissions.wholeEvent).toContain('event.delete');

    const catalog = list<{ key: string; area: string }>(
      await owner.get('/v1/permissions').expect(200),
    );
    expect(catalog).toContainEqual({ key: 'tasks.update_own', area: 'tasks' });
  });
});

describe('member invites', () => {
  it('preview without a session, accept, then 403 naming the missing permission', async () => {
    const { owner, E, event, role } = await wedding();
    const invite = (
      await owner
        .post(`${E}/member-invites`)
        .send({ grants: [{ roleId: role('Viewer').id }], maxUses: 3 })
        .expect(201)
    ).body as CreatedMemberInvite;
    expect(invite).toMatchObject({ maxUses: 3, usedCount: 0, email: null });
    expect(list(await owner.get(`${E}/member-invites`).expect(200))).toHaveLength(1);

    const preview = (
      await request(app.getHttpServer()).get(`/v1/member-invites/${invite.token}`).expect(200)
    ).body as MemberInvitePreview;
    expect(preview).toMatchObject({
      event: { name: 'Sharma Wedding', type: 'wedding' },
      roles: [{ name: 'Viewer', subEvents: [] }],
      emailHint: null,
    });

    const viewer = as((await users.signIn()).cookie);
    // Not a member yet: the event doesn't exist for them.
    await viewer.get(E).expect(404);
    const accepted = await viewer.post(`/v1/member-invites/${invite.token}/accept`).expect(201);
    expect(accepted.body).toEqual({ eventId: event.id, joined: true });

    await viewer.get(E).expect(200);
    const denied = await viewer.patch(E).set('If-Match', '"1"').send({ name: 'x' }).expect(403);
    expect(denied.body as Problem).toMatchObject({
      code: 'forbidden',
      permission: 'event.settings',
    });
    await viewer.get(`${E}/member-invites`).expect(403);

    const mine = list<MyEvent>(await viewer.get('/v1/me/events').expect(200));
    expect(mine).toEqual([expect.objectContaining({ id: event.id, roles: ['Viewer'] })]);
  });

  it('dead links: revoked is 410 link_revoked, unknown is 404', async () => {
    const { owner, E, role } = await wedding();
    const invite = (
      await owner.post(`${E}/member-invites`).send({ grants: [{ roleId: role('Helper').id }] })
    ).body as CreatedMemberInvite;
    await owner.delete(`${E}/member-invites/${invite.id}`).expect(204);
    const revoked = await request(app.getHttpServer())
      .get(`/v1/member-invites/${invite.token}`)
      .expect(410);
    expect((revoked.body as Problem).code).toBe('link_revoked');
    await request(app.getHttpServer()).get('/v1/member-invites/nope').expect(404);
    await request(app.getHttpServer())
      .post(`/v1/member-invites/${invite.token}/accept`)
      .expect(401);
  });

  it('email invites are single use and checked against the signed-in address', async () => {
    const { owner, E, role } = await wedding();
    const email = users.newEmail();
    const res = await owner
      .post(`${E}/member-invites`)
      .send({ email, grants: [{ roleId: role('Helper').id }], maxUses: 2 })
      .expect(422);
    expect((res.body as Problem).fields?.[0]?.path).toBe('maxUses');

    const invite = (
      await owner
        .post(`${E}/member-invites`)
        .send({ email, grants: [{ roleId: role('Helper').id }] })
    ).body as CreatedMemberInvite;
    const someoneElse = as((await users.signIn()).cookie);
    const wrong = await someoneElse.post(`/v1/member-invites/${invite.token}/accept`).expect(403);
    expect((wrong.body as Problem & { emailHint: string }).emailHint).toMatch(
      /\*\*\*@test\.local$/,
    );
    const right = as((await users.signIn(email)).cookie);
    await right.post(`/v1/member-invites/${invite.token}/accept`).expect(201);
  });
});

describe('sub-event scope', () => {
  it('lists only the sub-events a scoped member can see and edits only those', async () => {
    const { owner, E, role, subEvent } = await wedding();
    const mehendi = subEvent('Mehendi');
    const helper = await join(owner, E, [{ roleId: role('Editor').id, subEventIds: [mehendi.id] }]);

    // Scoped event.view still opens the event.
    await helper.get(E).expect(200);
    const visible = list<SubEvent>(await helper.get(`${E}/sub-events`).expect(200));
    expect(visible.map((item) => item.name)).toEqual(['Mehendi']);
    await helper.get(`${E}/sub-events/${subEvent('Haldi').id}`).expect(403);
    await helper
      .patch(`${E}/sub-events/${mehendi.id}`)
      .set('If-Match', '"1"')
      .send({ capacity: 200 })
      .expect(200);
    await helper
      .patch(`${E}/sub-events/${subEvent('Haldi').id}`)
      .set('If-Match', '"1"')
      .send({ capacity: 200 })
      .expect(403);

    const me = (await helper.get(`${E}/me`).expect(200)).body as MyMembership;
    expect(me.permissions.wholeEvent).toEqual([]);
    expect(me.permissions.subEvents[mehendi.id]).toContain('subevents.edit');
  });
});

describe('members and roles', () => {
  it('replaces roles with If-Match; the change applies on the next request', async () => {
    const { owner, E, role } = await wedding();
    const viewer = await join(owner, E, [{ roleId: role('Viewer').id }]);
    await viewer.post(`${E}/roles`).send({ name: 'Decor', permissions: [] }).expect(403);

    const member = list<Member>(await owner.get(`${E}/members`).expect(200)).find(
      (item) => !item.isOwner,
    )!;
    const path = `${E}/members/${member.id}/roles`;
    const body = { assignments: [{ roleId: role('Admin').id }] };
    await owner.put(path).send(body).expect(428);
    await owner.put(path).set('If-Match', '"99"').send(body).expect(409);
    const updated = await owner
      .put(path)
      .set('If-Match', `"${member.version}"`)
      .send(body)
      .expect(200);
    expect(updated.headers.etag).toBe(`"${member.version + 1}"`);

    // The cached Viewer permissions are retired by roles_version.
    await viewer
      .post(`${E}/roles`)
      .send({ name: 'Decor', permissions: ['budget.view'] })
      .expect(201);
    const beyond = await viewer
      .post(`${E}/roles`)
      .send({ name: 'Too much', permissions: ['event.delete'] })
      .expect(403);
    expect(beyond.body).toMatchObject({ permissions: ['event.delete'] });

    // Admins can't touch the Owner.
    const ownerMember = list<Member>(await owner.get(`${E}/members`)).find((item) => item.isOwner)!;
    await viewer
      .delete(`${E}/members/${ownerMember.id}`)
      .set('If-Match', `"${ownerMember.version}"`)
      .expect(403);
  });

  it('roles: unique names, Owner is immutable, a role in use is not deleted', async () => {
    const { owner, E, role } = await wedding();
    const custom = (
      await owner
        .post(`${E}/roles`)
        .send({ name: 'Catering Coordinator', permissions: ['event.view', 'budget.view'] })
        .expect(201)
    ).body as Role;
    expect(custom).toMatchObject({ isStandard: false, memberCount: 0, version: 1 });
    await owner
      .post(`${E}/roles`)
      .send({ name: 'catering coordinator', permissions: [] })
      .expect(422);
    await owner
      .post(`${E}/roles`)
      .send({ name: 'Bad', permissions: ['not.real'] })
      .expect(422);

    await owner
      .patch(`${E}/roles/${role('Owner').id}`)
      .set('If-Match', '"1"')
      .send({ name: 'Boss' })
      .expect(403);
    await join(owner, E, [{ roleId: custom.id }]);
    const inUse = await owner.delete(`${E}/roles/${custom.id}`).set('If-Match', '"1"').expect(409);
    expect((inUse.body as Problem).code).toBe('role_in_use');
  });

  it("a role manager can't strip or delete a role that outranks them", async () => {
    const { owner, E, role } = await wedding();
    const keeper = (
      await owner
        .post(`${E}/roles`)
        .send({ name: 'Role keeper', permissions: ['event.view', 'members.view', 'roles.manage'] })
        .expect(201)
    ).body as Role;
    const treasurer = (
      await owner
        .post(`${E}/roles`)
        .send({ name: 'Treasurer', permissions: ['event.view', 'budget.edit'] })
        .expect(201)
    ).body as Role;
    const manager = await join(owner, E, [{ roleId: keeper.id }]);

    await manager
      .patch(`${E}/roles/${role('Admin').id}`)
      .set('If-Match', '"1"')
      .send({ permissions: ['event.view'] })
      .expect(403);
    await manager.delete(`${E}/roles/${treasurer.id}`).set('If-Match', '"1"').expect(403);
    const admin = list<Role>(await owner.get(`${E}/roles`)).find((item) => item.name === 'Admin')!;
    expect(admin.permissions).toContain('members.manage');
  });

  it('leave and transfer ownership', async () => {
    const { owner, E, role } = await wedding();
    const editor = await join(owner, E, [{ roleId: role('Editor').id }]);
    await owner.post(`${E}/leave`).expect(409);

    const editorMember = list<Member>(await owner.get(`${E}/members`)).find(
      (item) => !item.isOwner,
    )!;
    await editor
      .post(`${E}/transfer-ownership`)
      .send({ memberId: editorMember.id, keepRoleId: role('Admin').id })
      .expect(403);
    const transferred = await owner
      .post(`${E}/transfer-ownership`)
      .send({ memberId: editorMember.id, keepRoleId: role('Admin').id })
      .expect(200);
    expect(transferred.body as Member).toMatchObject({ isOwner: true });

    const me = (await owner.get(`${E}/me`).expect(200)).body as MyMembership;
    expect(me.member).toMatchObject({ isOwner: false, assignments: [{ roleName: 'Admin' }] });
    await owner.post(`${E}/leave`).expect(204);
    await owner.get(E).expect(404);
  });
});

describe('permission cache', () => {
  it('caches under roles_version and falls back to Postgres when Redis fails', async () => {
    const { owner, E, event } = await wedding();
    const me = (await owner.get(`${E}/me`).expect(200)).body as MyMembership;
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys(`perm:${event.id}:${me.member.userId}:*`);
    expect(keys).toHaveLength(1);

    const broken = {
      get: () => Promise.reject(new Error('down')),
      set: () => Promise.reject(new Error('down')),
    } as unknown as Redis;
    const cache = new PermissionCache(app.get<Database>(DB), broken);
    expect(await cache.forUser(event.id, me.member.userId)).toMatchObject({
      memberId: me.member.id,
      isOwner: true,
    });
  });
});
