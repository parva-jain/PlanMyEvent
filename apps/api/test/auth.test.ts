import { randomInt } from 'node:crypto';

import { Controller, HttpCode, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Me, Problem } from '@pme/contracts';
import { newId } from '@pme/db';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER, type SignInCodeSender } from '../src/auth/sign-in-codes';
import { PG_POOL } from '../src/database/database.module';
import { createApp } from './create-app';

const WEB_ORIGIN = 'http://localhost:3000';

/** Stands in for any cookie-authenticated write, to exercise the CSRF check. */
@Controller('test-write')
class TestWriteController {
  @Post()
  @HttpCode(204)
  write() {}
}

/** Captures codes instead of writing outbox rows (core and db tests cover the outbox). */
const codes = new Map<string, string>();
const capturingSender: SignInCodeSender = {
  send: ({ email, code }) => {
    codes.set(email, code);
    return Promise.resolve();
  },
};

let app: NestExpressApplication;
let pool: Pool;
const emails: string[] = [];

beforeAll(async () => {
  app = await createApp({
    providers: [{ token: SIGN_IN_CODE_SENDER, value: capturingSender }],
    controllers: [TestWriteController],
  });
  pool = app.get<Pool>(PG_POOL);
});

afterAll(async () => {
  // Sessions, accounts cascade with the user; verifications expire on their own.
  await pool.query(
    'delete from workspaces where owner_user_id in (select id from users where email = any($1))',
    [emails],
  );
  await pool.query('delete from users where email = any($1)', [emails]);
  await app.close();
});

/** Unique per test, so runs never share users or rate-limit counters. */
function newEmail() {
  const email = `${newId()}@test.local`;
  emails.push(email);
  return email;
}
const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

function client(ip = randomIp()) {
  const http = () => request(app.getHttpServer());
  return {
    sendCode: (email: string) =>
      http()
        .post('/v1/auth/email-otp/send-verification-otp')
        .set('Origin', WEB_ORIGIN)
        .set('X-Forwarded-For', ip)
        .send({ email, type: 'sign-in' }),
    signIn: (email: string, otp: string) =>
      http()
        .post('/v1/auth/sign-in/email-otp')
        .set('Origin', WEB_ORIGIN)
        .set('X-Forwarded-For', ip)
        .send({ email, otp }),
    me: (cookie?: string[]) => {
      const req = http().get('/v1/me');
      return cookie ? req.set('Cookie', cookie) : req;
    },
  };
}

async function signedIn(email = newEmail()) {
  const api = client();
  await api.sendCode(email).expect(200);
  const res = await api.signIn(email, codes.get(email)!).expect(200);
  return { api, email, cookie: res.headers['set-cookie'] as unknown as string[] };
}

describe('email sign-in', () => {
  it('signs in with a code, then /v1/me returns the user and their personal workspace', async () => {
    const { api, email, cookie } = await signedIn();

    expect(codes.get(email)).toMatch(/^\d{6}$/);
    expect(cookie.join(';')).toMatch(/HttpOnly/i);
    expect(cookie.join(';')).toMatch(/SameSite=Lax/i);

    const res = await api.me(cookie).expect(200);
    const me = res.body as Me;
    expect(me.user.email).toBe(email);
    expect(me.workspace).toMatchObject({ plan: 'free' });

    const { rows } = await pool.query<{ id: string }>(
      'select id from workspaces where owner_user_id = $1',
      [me.user.id],
    );
    expect(rows).toEqual([{ id: me.workspace.id }]);
  });

  it('uses UUIDv7 ids and never stores the code in plain text', async () => {
    const email = newEmail();
    await client().sendCode(email).expect(200);
    const {
      rows: [verification],
    } = await pool.query<{ id: string; value: string }>(
      'select id, value from verifications where identifier = $1',
      [`sign-in-otp-${email}`],
    );

    expect(verification?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(verification?.value).not.toContain(codes.get(email));
  });

  it('rejects a wrong code', async () => {
    const email = newEmail();
    const api = client();
    await api.sendCode(email).expect(200);
    const wrong = codes.get(email) === '000000' ? '111111' : '000000';
    const res = await api.signIn(email, wrong);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('limits codes per email address, whatever the IP', async () => {
    const email = newEmail();
    for (let attempt = 0; attempt < 5; attempt++) {
      await client().sendCode(email).expect(200);
    }
    await client().sendCode(email).expect(429);
  });

  it('signing out ends the session', async () => {
    const { api, cookie } = await signedIn();
    await request(app.getHttpServer())
      .post('/v1/auth/sign-out')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({})
      .expect(200);
    await api.me(cookie).expect(401);
  });
});

describe('PATCH /v1/me', () => {
  const patch = (cookie: string[], body: object) =>
    request(app.getHttpServer())
      .patch('/v1/me')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send(body);

  it('sets the name and an Indian mobile number, and /v1/me shows them', async () => {
    const { api, cookie } = await signedIn();
    const res = await patch(cookie, { name: '  Vikram Singh ', phone: '+919876543210' }).expect(
      200,
    );
    expect((res.body as Me).user).toMatchObject({ name: 'Vikram Singh', phone: '+919876543210' });

    const me = (await api.me(cookie).expect(200)).body as Me;
    expect(me.user).toMatchObject({ name: 'Vikram Singh', phone: '+919876543210' });
  });

  it('rejects an empty name and a non-Indian number with field errors', async () => {
    const { cookie } = await signedIn();
    const res = await patch(cookie, { name: ' ', phone: '+14155550100' }).expect(422);
    const problem = res.body as Problem & { fields: { path: string }[] };
    expect(problem.code).toBe('validation_failed');
    expect(problem.fields.map((field) => field.path).sort()).toEqual(['name', 'phone']);
  });
});

describe('CORS', () => {
  it('lets the web app call auth routes cross-origin, with credentials', async () => {
    const res = await request(app.getHttpServer())
      .options('/v1/auth/email-otp/send-verification-otp')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('only ever allows the web app origin, so browsers refuse other sites', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health/live')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
  });
});

describe('session guard', () => {
  it('answers 401 problem+json without a session', async () => {
    const res = await client().me().expect(401);
    expect(res.body as Problem).toMatchObject({ status: 401, code: 'unauthenticated' });
  });

  it('keeps health checks public', async () => {
    await request(app.getHttpServer()).get('/v1/health/live').expect(200);
  });

  it('refuses cookie-authenticated writes from another origin (CSRF)', async () => {
    const { cookie } = await signedIn();
    const write = () => request(app.getHttpServer()).post('/v1/test-write').set('Cookie', cookie);

    const res = await write().set('Origin', 'https://evil.example').expect(403);
    expect(res.body as Problem).toMatchObject({ code: 'csrf_failed' });
    await write().expect(403);
    await write().set('Origin', WEB_ORIGIN).expect(204);
  });
});
