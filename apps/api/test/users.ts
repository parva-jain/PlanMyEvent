import { randomInt } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { newId } from '@pme/db';
import type { Pool } from 'pg';
import request from 'supertest';

import type { SignInCodeSender } from '../src/auth/sign-in-codes';
import { PG_POOL } from '../src/database/database.module';

export const WEB_ORIGIN = 'http://localhost:3000';

/** Captures sign-in codes instead of writing outbox rows (core and db tests cover those). */
export function capturingSender() {
  const codes = new Map<string, string>();
  const sender: SignInCodeSender = {
    send: ({ email, code }) => {
      codes.set(email, code);
      return Promise.resolve();
    },
  };
  return { codes, sender };
}

/** An authenticated client for one signed-in user; writes carry the web app's Origin. */
export function asUser(app: () => NestExpressApplication, cookie: string[]) {
  const http = () => request(app().getHttpServer());
  const write = (method: 'post' | 'patch' | 'put' | 'delete', path: string) =>
    http()[method](path).set('Origin', WEB_ORIGIN).set('Cookie', cookie);
  return {
    get: (path: string) => http().get(path).set('Cookie', cookie),
    post: (path: string) => write('post', path),
    patch: (path: string) => write('patch', path),
    put: (path: string) => write('put', path),
    delete: (path: string) => write('delete', path),
  };
}

export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

/**
 * Signs in fresh users through the real sign-in endpoints and removes them afterwards.
 * Unique emails and random client IPs keep runs independent of each other and of rate limits.
 */
export function testUsers(app: () => NestExpressApplication, codes: Map<string, string>) {
  const emails: string[] = [];
  const newEmail = () => {
    const email = `${newId()}@test.local`;
    emails.push(email);
    return email;
  };

  return {
    newEmail,

    async signIn(email = newEmail()) {
      const ip = randomIp();
      const http = () => request(app().getHttpServer());
      await http()
        .post('/v1/auth/email-otp/send-verification-otp')
        .set('Origin', WEB_ORIGIN)
        .set('X-Forwarded-For', ip)
        .send({ email, type: 'sign-in' })
        .expect(200);
      const res = await http()
        .post('/v1/auth/sign-in/email-otp')
        .set('Origin', WEB_ORIGIN)
        .set('X-Forwarded-For', ip)
        .send({ email, otp: codes.get(email) })
        .expect(200);
      const cookie = res.headers['set-cookie'] as unknown as string[];
      // Creates the personal workspace if the post-commit hook hasn't yet.
      await http().get('/v1/me').set('Cookie', cookie).expect(200);
      return { email, cookie };
    },

    /** Deletes everything the users created, children first. */
    async cleanUp() {
      const pool = app().get<Pool>(PG_POOL);
      const { rows } = await pool.query<{ id: string }>(
        'select id from users where email = any($1)',
        [emails],
      );
      const userIds = rows.map((row) => row.id);
      // Events they created (ownership may have moved to another test user since).
      const created = `select id from events where owner_user_id = any($1)
        or id in (select event_id from members where user_id = any($1) and invited_by_user_id is null)`;
      const { rows: eventRows } = await pool.query<{ id: string }>(created, [userIds]);
      const eventIds = eventRows.map((row) => row.id);
      // Households and contacts point at each other; break the circle first.
      await pool.query('update households set primary_contact_id = null where event_id = any($1)', [
        eventIds,
      ]);
      for (const table of [
        'activity_log',
        'task_assignees',
        'tasks',
        'expenses',
        'budget_categories',
        'contacts',
        'households',
        'role_assignment_scopes',
        'role_assignments',
        'member_invites',
        'members',
        'roles',
        'sub_events',
        'venues',
        'event_modules',
      ]) {
        await pool.query(`delete from ${table} where event_id = any($1)`, [eventIds]);
      }
      await pool.query('delete from outbox where event_id = any($1)', [eventIds]);
      await pool.query('delete from events where id = any($1)', [eventIds]);
      // Memberships, invites and their log entries in other users' events.
      await pool.query('delete from activity_log where actor_user_id = any($1)', [userIds]);
      await pool.query(
        'delete from role_assignments where member_id in (select id from members where user_id = any($1))',
        [userIds],
      );
      await pool.query('delete from members where user_id = any($1)', [userIds]);
      await pool.query('delete from member_invites where created_by_user_id = any($1)', [userIds]);
      await pool.query('delete from idempotency_keys where scope = any($1)', [
        userIds.map((id) => `user:${id}`),
      ]);
      await pool.query('delete from workspaces where owner_user_id = any($1)', [userIds]);
      await pool.query('delete from users where id = any($1)', [userIds]);
    },
  };
}
