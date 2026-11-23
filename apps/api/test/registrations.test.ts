import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  Attendance,
  CreatedEvent,
  Problem,
  PublicEvent,
  PublicInvite,
  RegistrationResult,
  SubEvent,
} from '@pme/contracts';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
import { PG_POOL } from '../src/database/database.module';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from '../src/public/turnstile';
import { createApp } from './create-app';
import { asUser, capturingSender, randomIp, testUsers } from './users';

const { codes, sender } = capturingSender();
/** Cloudflare isn't called in tests: the token 'bot' fails, anything else passes. */
const turnstile: TurnstileVerifier = { verify: (token) => Promise.resolve(token !== 'bot') };
let app: NestExpressApplication;
const users = testUsers(() => app, codes);
const as = (cookie: string[]) => asUser(() => app, cookie);
const list = <T>(res: { body: unknown }) => (res.body as { data: T[] }).data;
const sql = (text: string, values: unknown[]) => app.get<Pool>(PG_POOL).query(text, values);

beforeAll(async () => {
  app = await createApp({
    providers: [
      { token: SIGN_IN_CODE_SENDER, value: sender },
      { token: TURNSTILE_VERIFIER, value: turnstile },
    ],
  });
});
afterAll(async () => {
  await users.cleanUp();
  await app.close();
});

/** A conference with separate lists per session; the workshop is public with 2 places. */
async function conference() {
  const owner = as((await users.signIn()).cookie);
  const event = (
    await owner
      .post('/v1/events')
      .send({
        templateKey: 'conference',
        name: 'DevFest Bhopal',
        startsOn: '2027-03-10',
        endsOn: '2027-03-11',
        timeZone: 'Asia/Kolkata',
      })
      .expect(201)
  ).body as CreatedEvent;
  const E = `/v1/events/${event.id}`;
  await sql(`update events set guest_scope = 'per_sub_event', status = 'planning' where id = $1`, [
    event.id,
  ]);
  const [workshop, talk] = list<SubEvent>(await owner.get(`${E}/sub-events`));
  for (const [item, capacity] of [
    [workshop!, 2],
    [talk!, null],
  ] as const) {
    await owner
      .patch(`${E}/sub-events/${item.id}`)
      .set('If-Match', `"${item.version}"`)
      .send({ visibility: 'public', responseMode: 'open_registration', capacity })
      .expect(200);
  }
  return { owner, event, E, workshop: workshop!, talk: talk! };
}

/** A visitor's browser: no cookie, its own IP. */
function visitor(slug: string, ip = randomIp()) {
  const http = () => request(app.getHttpServer());
  return {
    page: () => http().get(`/v1/public/events/${slug}`).set('X-Forwarded-For', ip),
    register: (body: object, key: string | null = crypto.randomUUID()) => {
      const req = http().post(`/v1/public/events/${slug}/registrations`).set('X-Forwarded-For', ip);
      if (key) req.set('Idempotency-Key', key);
      return req.send({ turnstileToken: 'ok', ...body });
    },
  };
}

const emailsTo = async (eventId: string, to: string) =>
  (
    await sql(
      `select payload from outbox where event_id = $1 and topic = 'email.critical' and payload->>'to' = $2`,
      [eventId, to],
    )
  ).rows.map((row: { payload: { url: string } }) => row.payload);

describe('public event page and registration', () => {
  it('shows public sessions with places left, cacheable, and 404s drafts and private events', async () => {
    const { event, workshop } = await conference();
    const res = await visitor(event.slug).page().expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60, s-maxage=60');
    const page = res.body as PublicEvent;
    expect(page.event).toMatchObject({ name: 'DevFest Bhopal', slug: event.slug });
    expect(page.subEvents.find((item) => item.id === workshop.id)).toMatchObject({
      capacity: 2,
      spotsLeft: 2,
      registration: 'open',
    });

    await sql(`update events set status = 'draft' where id = $1`, [event.id]);
    await visitor(event.slug).page().expect(404);
    await visitor('no-such-event').page().expect(404);
  });

  it('registers, emails a working link, replays a retry, and fills up', async () => {
    const { event, workshop } = await conference();
    const anil = visitor(event.slug);
    const key = crypto.randomUUID();
    const body = {
      name: 'Anil',
      email: 'anil@example.com',
      subEventIds: [workshop.id],
      partySize: 1,
    };
    const first = await anil.register(body, key).expect(201);
    expect(first.body as RegistrationResult).toEqual({
      subEventIds: [workshop.id],
      confirmationEmail: true,
    });
    // A retry with the same key gets the same answer and registers nobody twice.
    const again = await anil.register(body, key).expect(201);
    expect(again.headers['idempotent-replayed']).toBe('true');

    const [email] = await emailsTo(event.id, 'anil@example.com');
    const token = email!.url.split('/i/')[1]!;
    const invite = (
      await request(app.getHttpServer()).get(`/v1/public/invites/${token}`).expect(200)
    ).body as PublicInvite;
    expect(invite.scopes).toEqual([
      expect.objectContaining({ subEventId: workshop.id, status: 'registered', canCancel: true }),
    ]);

    await visitor(event.slug)
      .register({ name: 'Meera', email: 'meera@example.com', subEventIds: [workshop.id] })
      .expect(201);
    const full = await visitor(event.slug)
      .register({ name: 'Ravi', email: 'ravi@example.com', subEventIds: [workshop.id] })
      .expect(409);
    expect(full.body as Problem).toMatchObject({ code: 'capacity_full' });
    const page = (await visitor(event.slug).page().expect(200)).body as PublicEvent;
    expect(page.subEvents.find((item) => item.id === workshop.id)).toMatchObject({
      spotsLeft: 0,
      registration: 'full',
    });

    // Anil cancels through the link: the place is free again.
    await request(app.getHttpServer())
      .post(`/v1/public/invites/${token}/rsvp`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ responses: [{ subEventId: workshop.id, attending: false }] })
      .expect(200);
    await visitor(event.slug)
      .register({ name: 'Ravi', email: 'ravi@example.com', subEventIds: [workshop.id] })
      .expect(201);
  });

  it('refuses bots, a missing Idempotency-Key, bad input, and the sixth try a minute from one IP', async () => {
    const { event, talk } = await conference();
    const one = visitor(event.slug);
    const base = { name: 'Anil', email: 'anil@example.com', subEventIds: [talk.id] };
    expect(
      ((await one.register({ ...base, turnstileToken: 'bot' }).expect(403)).body as Problem).code,
    ).toBe('captcha_failed');
    // Refused before the handler: these don't count toward the limit.
    await one.register(base, null).expect(400);
    await one.register({ ...base, email: undefined }).expect(422);
    // The bot try was the first of five; four more pass (the same person: nothing changes).
    for (let index = 0; index < 4; index++) await one.register(base).expect(201);
    expect(((await one.register(base).expect(429)).body as Problem).code).toBe('rate_limited');
  });
});

describe('walk-ins (POST E/attendance)', () => {
  it('an organizer checks in a walk-in; both contact forms at once, or signed out, are refused', async () => {
    const { owner, E, talk } = await conference();
    const res = await owner
      .post(`${E}/attendance`)
      .send({ contact: { name: 'Ravi', phone: '9876511111' }, subEventId: talk.id, partySize: 2 })
      .expect(201);
    expect(res.body as Attendance).toMatchObject({
      status: 'checked_in',
      source: 'registered',
      partySize: 2,
      guestName: 'Ravi',
    });
    await owner
      .post(`${E}/attendance`)
      .send({ contact: { name: 'Ravi' }, contactId: crypto.randomUUID(), subEventId: talk.id })
      .expect(422);
    await asUser(() => app, [])
      .post(`${E}/attendance`)
      .send({ contact: { name: 'Ravi' }, subEventId: talk.id })
      .expect(401);
  });
});
