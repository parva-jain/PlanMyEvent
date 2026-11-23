import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  CreatedEvent,
  CreatedMemberInvite,
  Media,
  MediaPage,
  Problem,
  Role,
  UploadTicket,
} from '@pme/contracts';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
import { PG_POOL } from '../src/database/database.module';
import { createApp } from './create-app';
import { asUser, capturingSender, testUsers } from './users';

const { codes, sender } = capturingSender();
let app: NestExpressApplication;
const users = testUsers(() => app, codes);
const as = (cookie: string[]) => asUser(() => app, cookie);
const sql = (text: string, values: unknown[]) => app.get<Pool>(PG_POOL).query(text, values);

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
  const roles = (await owner.get(`${E}/roles`)).body as { data: Role[] };
  const invite = (
    await owner
      .post(`${E}/member-invites`)
      .send({ grants: [{ roleId: roles.data.find((r) => r.name === 'Helper')!.id }] })
      .expect(201)
  ).body as CreatedMemberInvite;
  const helper = as((await users.signIn()).cookie);
  await helper.post(`/v1/member-invites/${invite.token}/accept`).expect(201);
  return { owner, helper, event, E };
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0]);

describe('media API with storage', () => {
  it('a helper uploads a photo straight to storage, confirms it, and sees it processing', async () => {
    const { helper, owner, event, E } = await wedding();
    const ticket = (
      await helper
        .post(`${E}/uploads`)
        .send({ kind: 'gallery', mime: 'image/jpeg', bytes: JPEG.length })
        .expect(201)
    ).body as UploadTicket;
    expect(ticket.headers).toEqual({ 'Content-Type': 'image/jpeg' });

    // Not there yet.
    const early = await helper.post(`${E}/media/${ticket.mediaId}/complete`).expect(409);
    expect((early.body as Problem).code).toBe('conflict');

    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.headers,
      body: JPEG,
    });
    expect(put.status).toBe(200);
    // Only the uploader confirms.
    await owner.post(`${E}/media/${ticket.mediaId}/complete`).expect(403);
    const media = (await helper.post(`${E}/media/${ticket.mediaId}/complete`).expect(200))
      .body as Media;
    expect(media).toMatchObject({ status: 'pending', kind: 'gallery', urls: null });
    expect(media.uploadedBy).toBeTruthy();

    // The worker's job is in the outbox.
    const jobs = await sql(
      `select payload from outbox where event_id = $1 and topic = 'media.process'`,
      [event.id],
    );
    expect(jobs.rows).toEqual([{ payload: { mediaId: ticket.mediaId, eventId: event.id } }]);

    // The uploader sees their photo arriving; others see only ready ones.
    const mine = (await helper.get(`${E}/media`).expect(200)).body as MediaPage;
    expect(mine.data.map((item) => item.id)).toEqual([ticket.mediaId]);
    const theirs = (await owner.get(`${E}/media`).expect(200)).body as MediaPage;
    expect(theirs.data).toEqual([]);
  });

  it('keeps receipts to budget editors, checks types and sizes, and hides events from strangers', async () => {
    const { helper, owner, E } = await wedding();
    await helper
      .post(`${E}/uploads`)
      .send({ kind: 'receipt', mime: 'application/pdf', bytes: 1000 })
      .expect(403);
    await owner
      .post(`${E}/uploads`)
      .send({ kind: 'receipt', mime: 'application/pdf', bytes: 1000 })
      .expect(201);
    await owner
      .post(`${E}/uploads`)
      .send({ kind: 'gallery', mime: 'application/pdf', bytes: 1000 })
      .expect(422);
    await owner
      .post(`${E}/uploads`)
      .send({ kind: 'gallery', mime: 'image/jpeg', bytes: 16 * 1024 * 1024 })
      .expect(422);
    await helper.get(`${E}/media?kind=receipt`).expect(403);
    // A receipt's details are the budget's too.
    const receipt = (
      await owner
        .post(`${E}/uploads`)
        .send({ kind: 'receipt', mime: 'image/png', bytes: 2000 })
        .expect(201)
    ).body as UploadTicket;
    await helper.get(`${E}/media/${receipt.mediaId}`).expect(404);
    await owner.get(`${E}/media/${receipt.mediaId}`).expect(200);
    const stranger = as((await users.signIn()).cookie);
    await stranger
      .post(`${E}/uploads`)
      .send({ kind: 'gallery', mime: 'image/jpeg', bytes: 1000 })
      .expect(404);
  });
});
