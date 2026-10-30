import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { CreatedEvent, Event, MyEvent, Problem, SubEvent, Venue } from '@pme/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
import { createApp } from './create-app';
import { asUser, capturingSender, testUsers } from './users';

const { codes, sender } = capturingSender();
let app: NestExpressApplication;
const users = testUsers(() => app, codes);

beforeAll(async () => {
  app = await createApp({ providers: [{ token: SIGN_IN_CODE_SENDER, value: sender }] });
});
afterAll(async () => {
  await users.cleanUp();
  await app.close();
});

const as = (cookie: string[]) => asUser(() => app, cookie);

const wedding = {
  templateKey: 'wedding',
  name: 'Sharma Wedding',
  startsOn: '2026-12-10',
  endsOn: '2026-12-12',
  timeZone: 'Asia/Kolkata',
  venue: { name: 'Radisson Lawn', address: 'Indore' },
};

async function ownerWithEvent() {
  const { cookie } = await users.signIn();
  const client = as(cookie);
  const res = await client.post('/v1/events').send(wedding).expect(201);
  return { client, event: res.body as CreatedEvent, cookie };
}

describe('POST /v1/events', () => {
  it('creates from a template with ETag, starter sub-events and the venue', async () => {
    const { client, event } = await ownerWithEvent();
    expect(event).toMatchObject({
      name: 'Sharma Wedding',
      type: 'wedding',
      status: 'planning',
      version: 1,
      counts: { subEvents: 5, venues: 1, tasks: 12, budgetCategories: 12 },
    });
    expect(event.slug).toMatch(/^sharma-wedding-[a-z2-9]{4}$/);

    const res = await client.get(`/v1/events/${event.id}`).expect(200);
    expect(res.headers.etag).toBe('"1"');

    const mine = (await client.get('/v1/me/events').expect(200)).body as { data: MyEvent[] };
    expect(mine.data.map((item) => item.id)).toContain(event.id);
  });

  it('replays a retried request with the same Idempotency-Key instead of creating twice', async () => {
    const { cookie } = await users.signIn();
    const client = as(cookie);
    const key = randomUUID();

    const first = await client
      .post('/v1/events')
      .set('Idempotency-Key', key)
      .send(wedding)
      .expect(201);
    const retry = await client
      .post('/v1/events')
      .set('Idempotency-Key', key)
      .send(wedding)
      .expect(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect((retry.body as Event).id).toBe((first.body as Event).id);
    expect(retry.headers.etag).toBe('"1"');

    const mine = (await client.get('/v1/me/events').expect(200)).body as { data: MyEvent[] };
    expect(mine.data).toHaveLength(1);

    const reused = await client
      .post('/v1/events')
      .set('Idempotency-Key', key)
      .send({ ...wedding, name: 'Another' })
      .expect(422);
    expect((reused.body as Problem).code).toBe('idempotency_key_reused');
  });

  it('validates the body with field errors', async () => {
    const { cookie } = await users.signIn();
    const res = await as(cookie)
      .post('/v1/events')
      .send({ ...wedding, endsOn: '2026-12-01', timeZone: 'Mars/Olympus' })
      .expect(422);
    const fields = (res.body as Problem).fields!.map((field) => field.path).sort();
    expect(fields).toEqual(['endsOn', 'timeZone']);
  });
});

describe('access', () => {
  it("answers 404 for someone else's event, a malformed id, and a missing one", async () => {
    const { event } = await ownerWithEvent();
    const stranger = as((await users.signIn()).cookie);

    await stranger.get(`/v1/events/${event.id}`).expect(404);
    await stranger.get(`/v1/events/${event.id}/sub-events`).expect(404);
    await stranger
      .patch(`/v1/events/${event.id}`)
      .set('If-Match', '"1"')
      .send({ name: 'x' })
      .expect(404);
    await stranger.get('/v1/events/not-a-uuid').expect(404);
    await stranger.get(`/v1/events/${randomUUID()}`).expect(404);
  });

  it('needs a session', async () => {
    const { event } = await ownerWithEvent();
    await request(app.getHttpServer()).get(`/v1/events/${event.id}`).expect(401);
  });
});

describe('PATCH /v1/events/:id (version guard)', () => {
  it('needs If-Match (428), refuses a stale one (409 with current), then updates', async () => {
    const { client, event } = await ownerWithEvent();
    const path = `/v1/events/${event.id}`;

    const missing = await client.patch(path).send({ name: 'No header' }).expect(428);
    expect((missing.body as Problem).code).toBe('precondition_required');

    const updated = await client
      .patch(path)
      .set('If-Match', '"1"')
      .send({ name: 'Sharma–Verma Wedding', budgetPaise: 15_00_000_00 })
      .expect(200);
    expect(updated.headers.etag).toBe('"2"');
    expect(updated.body as Event).toMatchObject({ budgetPaise: 150000000, version: 2 });

    const stale = await client
      .patch(path)
      .set('If-Match', '"1"')
      .send({ name: 'Stale' })
      .expect(409);
    expect(stale.body as Problem).toMatchObject({
      code: 'version_conflict',
      current: { name: 'Sharma–Verma Wedding', version: 2 },
    });
  });
});

describe('modules', () => {
  it('reads and replaces the set under the event version', async () => {
    const { client, event } = await ownerWithEvent();
    const path = `/v1/events/${event.id}/modules`;
    const before = (await client.get(path).expect(200)).body as { data: { module: string }[] };
    expect(before.data.map((item) => item.module)).toEqual(['gallery', 'guests', 'registration']);

    await client
      .put(path)
      .set('If-Match', '"1"')
      .send({ modules: [{ module: 'guests', enabled: true }] })
      .expect(200);
    await client
      .put(path)
      .set('If-Match', '"1"')
      .send({ modules: [{ module: 'gallery', enabled: true }] })
      .expect(409);
    const after = (await client.get(path).expect(200)).body as { data: unknown[] };
    expect(after.data).toEqual([{ module: 'guests', enabled: true, config: {} }]);
  });
});

describe('venues and sub-events', () => {
  it('lists starter sub-events by start time, with their venue', async () => {
    const { client, event } = await ownerWithEvent();
    const { data } = (await client.get(`/v1/events/${event.id}/sub-events`).expect(200)).body as {
      data: SubEvent[];
    };
    expect(data.map((item) => item.name)).toEqual([
      'Haldi',
      'Mehendi',
      'Sangeet',
      'Wedding',
      'Reception',
    ]);
    // Haldi at 10:00 India time on the first day.
    expect(data[0]!.startsAt).toBe('2026-12-10T04:30:00.000Z');
    const venues = (await client.get(`/v1/events/${event.id}/venues`).expect(200)).body as {
      data: Venue[];
    };
    expect(data.every((item) => item.venueId === venues.data[0]!.id)).toBe(true);
  });

  it('creates, updates with If-Match and deletes a sub-event', async () => {
    const { client, event } = await ownerWithEvent();
    const base = `/v1/events/${event.id}/sub-events`;
    const created = (
      await client
        .post(base)
        .send({
          name: 'After party',
          startsAt: '2026-12-12T16:00:00Z',
          endsAt: '2026-12-12T19:00:00Z',
        })
        .expect(201)
    ).body as SubEvent;
    expect(created).toMatchObject({ visibility: 'invite_only', venueId: null, version: 1 });

    const updated = await client
      .patch(`${base}/${created.id}`)
      .set('If-Match', '"1"')
      .send({ capacity: 150 })
      .expect(200);
    expect(updated.headers.etag).toBe('"2"');

    await client.delete(`${base}/${created.id}`).expect(428);
    await client.delete(`${base}/${created.id}`).set('If-Match', '"1"').expect(409);
    await client.delete(`${base}/${created.id}`).set('If-Match', '"2"').expect(204);
    await client.get(`${base}/${created.id}`).expect(404);
  });

  it('deleting a venue clears it from sub-events', async () => {
    const { client, event } = await ownerWithEvent();
    const venues = (await client.get(`/v1/events/${event.id}/venues`).expect(200)).body as {
      data: Venue[];
    };
    await client.delete(`/v1/events/${event.id}/venues/${venues.data[0]!.id}`).expect(204);
    const { data } = (await client.get(`/v1/events/${event.id}/sub-events`).expect(200)).body as {
      data: SubEvent[];
    };
    expect(data.every((item) => item.venueId === null && item.version === 2)).toBe(true);
  });

  it("refuses another event's venue", async () => {
    const first = await ownerWithEvent();
    const otherEvent = (await first.client.post('/v1/events').send(wedding).expect(201))
      .body as Event;
    const venues = (await first.client.get(`/v1/events/${first.event.id}/venues`).expect(200))
      .body as {
      data: Venue[];
    };
    const res = await first.client
      .post(`/v1/events/${otherEvent.id}/sub-events`)
      .send({
        name: 'Borrowed hall',
        startsAt: '2026-12-10T10:00:00Z',
        endsAt: '2026-12-10T11:00:00Z',
        venueId: venues.data[0]!.id,
      })
      .expect(422);
    expect((res.body as Problem).fields?.[0]?.path).toBe('venueId');
  });
});

describe('GET /v1/event-templates', () => {
  it('lists the five templates', async () => {
    const { cookie } = await users.signIn();
    const { data } = (await as(cookie).get('/v1/event-templates').expect(200)).body as {
      data: { key: string }[];
    };
    expect(data.map((template) => template.key)).toEqual([
      'wedding',
      'conference',
      'fair',
      'celebration',
      'custom',
    ]);
  });
});
