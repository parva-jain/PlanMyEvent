import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  CreatedEvent,
  CreatedMemberInvite,
  MyMembership,
  MyTask,
  Problem,
  Role,
  SubEvent,
  Task,
} from '@pme/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
import { createApp } from './create-app';
import { asUser, capturingSender, testUsers } from './users';

const { codes, sender } = capturingSender();
let app: NestExpressApplication;
const users = testUsers(() => app, codes);
const as = (cookie: string[]) => asUser(() => app, cookie);
const list = <T>(res: { body: unknown }) => (res.body as { data: T[] }).data;

beforeAll(async () => {
  app = await createApp({ providers: [{ token: SIGN_IN_CODE_SENDER, value: sender }] });
});
afterAll(async () => {
  await users.cleanUp();
  await app.close();
});

/** Priya's wedding, and a helper to add members with a role (optionally scoped). */
async function wedding() {
  const { cookie } = await users.signIn();
  const owner = as(cookie);
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
  const roles = list<Role>(await owner.get(`${E}/roles`));
  const subEvents = list<SubEvent>(await owner.get(`${E}/sub-events`));
  const join = async (roleName: string, subEventIds: string[] = []) => {
    const role = roles.find((item) => item.name === roleName)!;
    const invite = (
      await owner
        .post(`${E}/member-invites`)
        .send({ grants: [{ roleId: role.id, subEventIds }] })
        .expect(201)
    ).body as CreatedMemberInvite;
    const { cookie: memberCookie } = await users.signIn();
    const client = as(memberCookie);
    await client.post(`/v1/member-invites/${invite.token}/accept`).expect(201);
    const me = (await client.get(`${E}/me`).expect(200)).body as MyMembership;
    return { client, memberId: me.member.id };
  };
  return { owner, event, E, subEvents, join };
}

describe('tasks API', () => {
  it('lists the starter tasks; creates, edits with If-Match and deletes', async () => {
    const { owner, E } = await wedding();
    const tasks = list<Task>(await owner.get(`${E}/tasks`).expect(200));
    expect(tasks).toHaveLength(12);

    const created = await owner.post(`${E}/tasks`).send({ title: 'Book a band' }).expect(201);
    const task = created.body as Task;
    expect(created.headers.etag).toBe('"1"');
    await owner.patch(`${E}/tasks/${task.id}`).send({ status: 'done' }).expect(428);
    const done = await owner
      .patch(`${E}/tasks/${task.id}`)
      .set('If-Match', '"1"')
      .send({ status: 'done' })
      .expect(200);
    expect(done.body).toMatchObject({ status: 'done', version: 2 });
    expect((done.body as Task).completedAt).not.toBeNull();
    const stale = await owner
      .patch(`${E}/tasks/${task.id}`)
      .set('If-Match', '"1"')
      .send({ title: 'x' })
      .expect(409);
    expect((stale.body as Problem).code).toBe('version_conflict');
    await owner.delete(`${E}/tasks/${task.id}`).set('If-Match', '"2"').expect(204);
    await owner.get(`${E}/tasks/${task.id}`).expect(404);
  });

  it('a Helper ticks off their own task, and sees it in My tasks', async () => {
    const { owner, E, event, join } = await wedding();
    const helper = await join('Helper');
    const venue = list<Task>(await owner.get(`${E}/tasks`)).find(
      (task) => task.title === 'Book the venue',
    )!;
    await helper.client
      .patch(`${E}/tasks/${venue.id}`)
      .set('If-Match', '"1"')
      .send({ status: 'done' })
      .expect(403);
    await owner
      .put(`${E}/tasks/${venue.id}/assignees`)
      .set('If-Match', '"1"')
      .send({ memberIds: [helper.memberId] })
      .expect(200);

    const mine = list<MyTask>(await helper.client.get('/v1/me/tasks').expect(200));
    expect(mine.map((task) => task.id)).toEqual([venue.id]);
    expect(mine[0]!.event).toMatchObject({ id: event.id, name: 'Sharma Wedding' });

    await helper.client
      .patch(`${E}/tasks/${venue.id}`)
      .set('If-Match', '"2"')
      .send({ title: 'Mine' })
      .expect(403);
    await helper.client
      .patch(`${E}/tasks/${venue.id}`)
      .set('If-Match', '"2"')
      .send({ status: 'done' })
      .expect(200);
    // Done tasks leave My tasks.
    expect(list<MyTask>(await helper.client.get('/v1/me/tasks'))).toEqual([]);
  });

  it('a member scoped to one sub-event sees and writes only its tasks; strangers get 404', async () => {
    const { E, subEvents, join } = await wedding();
    const mehendi = subEvents.find((item) => item.name === 'Mehendi')!;
    const editor = await join('Editor', [mehendi.id]);
    const visible = list<Task>(await editor.client.get(`${E}/tasks`).expect(200));
    expect(visible.map((task) => task.title)).toEqual(['Book the mehendi artist']);
    await editor.client.post(`${E}/tasks`).send({ title: 'Band' }).expect(403);
    await editor.client
      .post(`${E}/tasks`)
      .send({ title: 'Henna cones', subEventId: mehendi.id })
      .expect(201);

    const { cookie } = await users.signIn();
    await as(cookie).get(`${E}/tasks`).expect(404);
  });

  it('moving a task to a sub-event takes its subtasks along', async () => {
    const { owner, E, subEvents, join } = await wedding();
    const haldi = subEvents.find((item) => item.name === 'Haldi')!;
    const task = (await owner.post(`${E}/tasks`).send({ title: 'Book a band' }).expect(201))
      .body as Task;
    await owner
      .post(`${E}/tasks`)
      .send({ title: 'Shortlist three', parentTaskId: task.id })
      .expect(201);
    await owner
      .patch(`${E}/tasks/${task.id}`)
      .set('If-Match', '"1"')
      .send({ subEventId: haldi.id })
      .expect(200);
    // Someone scoped to Haldi now sees the task and its subtask together.
    const editor = await join('Editor', [haldi.id]);
    const visible = list<Task>(await editor.client.get(`${E}/tasks`).expect(200));
    expect(
      visible.filter((item) => item.subEventId === haldi.id).map((item) => item.title),
    ).toEqual(expect.arrayContaining(['Book a band', 'Shortlist three']));
  });
});
