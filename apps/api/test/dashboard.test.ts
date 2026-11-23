import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  dashboardGenerationKey,
  type CreatedEvent,
  type CreatedMemberInvite,
  type Dashboard,
  type Role,
  type SubEvent,
} from '@pme/contracts';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
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

async function wedding() {
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
  return { owner, event, E };
}

describe('dashboard API', () => {
  it('gives the owner every section, served from the cache until the generation moves', async () => {
    const { owner, event, E } = await wedding();
    const first = (await owner.get(`${E}/dashboard`).expect(200)).body as Dashboard;
    expect(first.countdown).toMatchObject({
      eventStartsOn: '2027-01-10',
      timeZone: 'Asia/Kolkata',
    });
    expect(first.subEvents).toHaveLength(5);
    expect(first.tasks!.total).toBe(event.counts.tasks);
    expect(first.budget!.categories).toHaveLength(12);
    expect(first.invitations).toEqual({
      total: 0,
      notSent: 0,
      sentDigitally: 0,
      deliveredInPerson: 0,
    });
    expect(first.registrations!.daily).toHaveLength(14);
    expect(first.team).toEqual({ members: 1 });

    await owner.post(`${E}/tasks`).send({ title: 'Book a band' }).expect(201);
    // Still the cached numbers: in production the relay moves the generation.
    const cached = (await owner.get(`${E}/dashboard`).expect(200)).body as Dashboard;
    expect(cached.generatedAt).toBe(first.generatedAt);
    expect(cached.tasks!.total).toBe(first.tasks!.total);

    await app.get<Redis>(REDIS).incr(dashboardGenerationKey(event.id));
    const fresh = (await owner.get(`${E}/dashboard`).expect(200)).body as Dashboard;
    expect(fresh.tasks!.total).toBe(first.tasks!.total + 1);
  });

  it('shows a helper scoped to one sub-event only that sub-event, without budget', async () => {
    const { owner, E } = await wedding();
    const roles = (await owner.get(`${E}/roles`)).body as { data: Role[] };
    const helperRole = roles.data.find((item) => item.name === 'Helper')!;
    const subEvents = (await owner.get(`${E}/sub-events`).expect(200)).body as {
      data: SubEvent[];
    };
    const haldi = subEvents.data.find((item) => item.name === 'Haldi')!;
    const invite = (
      await owner
        .post(`${E}/member-invites`)
        .send({ grants: [{ roleId: helperRole.id, subEventIds: [haldi.id] }] })
        .expect(201)
    ).body as CreatedMemberInvite;
    const helper = as((await users.signIn()).cookie);
    await helper.post(`/v1/member-invites/${invite.token}/accept`).expect(201);

    const view = (await helper.get(`${E}/dashboard`).expect(200)).body as Dashboard;
    expect(view.subEvents.map((item) => item.name)).toEqual(['Haldi']);
    expect(view.budget).toBeNull();
    expect(view.invitations).toBeNull();
    expect(view.headcounts).toBeNull();
    expect(view.team).toBeNull();
  });

  it('answers 404 to non-members and 401 when signed out', async () => {
    const { E } = await wedding();
    const stranger = as((await users.signIn()).cookie);
    await stranger.get(`${E}/dashboard`).expect(404);
    await asUser(() => app, [])
      .get(`${E}/dashboard`)
      .expect(401);
  });
});
