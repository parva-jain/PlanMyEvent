import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  CreatedEvent,
  CreatedMemberInvite,
  MyMembership,
  NotificationPage,
  Role,
} from '@pme/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
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

describe('notifications API', () => {
  it('a helper sees the task they were given and the role change, then marks them read', async () => {
    const owner = as((await users.signIn()).cookie);
    const event = (
      await owner
        .post('/v1/events')
        .send({
          templateKey: 'wedding',
          name: 'Sharma Wedding',
          startsOn: '2027-01-10',
          endsOn: '2027-01-12',
          timeZone: 'Asia/Kolkata',
        })
        .expect(201)
    ).body as CreatedEvent;
    const E = `/v1/events/${event.id}`;
    const roles = (await owner.get(`${E}/roles`)).body as { data: Role[] };
    const role = (name: string) => roles.data.find((item) => item.name === name)!;
    const invite = (
      await owner
        .post(`${E}/member-invites`)
        .send({ grants: [{ roleId: role('Helper').id, subEventIds: [] }] })
        .expect(201)
    ).body as CreatedMemberInvite;
    const helper = as((await users.signIn()).cookie);
    await helper.post(`/v1/member-invites/${invite.token}/accept`).expect(201);
    const me = (await helper.get(`${E}/me`).expect(200)).body as MyMembership;

    await owner
      .post(`${E}/tasks`)
      .send({ title: 'Book a band', assigneeIds: [me.member.id] })
      .expect(201);
    await owner
      .put(`${E}/members/${me.member.id}/roles`)
      .set('If-Match', `"${me.member.version}"`)
      .send({ assignments: [{ roleId: role('Editor').id, subEventIds: [] }] })
      .expect(200);

    const page = (await helper.get('/v1/notifications').expect(200)).body as NotificationPage;
    expect(page.unreadCount).toBe(2);
    expect(page.data.map((item) => item.type)).toEqual(['role_changed', 'task_assigned']);
    expect(page.data[1]).toMatchObject({
      data: { taskTitle: 'Book a band' },
      event: { id: event.id, name: 'Sharma Wedding' },
    });
    expect(page.data[1]!.actor?.name).toBeTruthy();
    // The owner caused both, so the owner has none.
    const ownerPage = (await owner.get('/v1/notifications').expect(200)).body as NotificationPage;
    expect(ownerPage.unreadCount).toBe(0);

    // Someone else's ids change nothing.
    await owner
      .post('/v1/notifications/read')
      .send({ ids: [page.data[0]!.id] })
      .expect(200, { updated: 0, unreadCount: 0 });
    await helper
      .post('/v1/notifications/read')
      .send({ ids: [page.data[0]!.id] })
      .expect(200, { updated: 1, unreadCount: 1 });
    await helper.post('/v1/notifications/read').send({ all: true }).expect(200, {
      updated: 1,
      unreadCount: 0,
    });
    const unread = (await helper.get('/v1/notifications?unread=true').expect(200))
      .body as NotificationPage;
    expect(unread.data).toEqual([]);
  });

  it('answers 422 to bodies with both or neither, and 401 when signed out', async () => {
    const user = as((await users.signIn()).cookie);
    await user.post('/v1/notifications/read').send({}).expect(422);
    await user
      .post('/v1/notifications/read')
      .send({ all: true, ids: ['0192f6c1-0000-7000-8000-000000000000'] })
      .expect(422);
    await asUser(() => app, [])
      .get('/v1/notifications')
      .expect(401);
  });
});
