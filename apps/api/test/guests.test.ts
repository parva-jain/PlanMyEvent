import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  importRows,
  parseCsv,
  type ActivityPage,
  type Contact,
  type ContactImportResult,
  type CreatedEvent,
  type CreatedMemberInvite,
  type Household,
  type JobAccepted,
  type JobStatus,
  type MyMembership,
  type Problem,
  type Role,
  type SubEvent,
} from '@pme/contracts';
import { importContacts, runAction } from '@pme/core';
import { createActionRuntime, type Database } from '@pme/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
import { DB } from '../src/database/database.module';
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
  const subEvents = list<SubEvent>(await owner.get(`${E}/sub-events`));
  const join = async (roleName: string, subEventIds: string[] = []) => {
    const roles = list<Role>(await owner.get(`${E}/roles`));
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

describe('guests API', () => {
  it('creates households and contacts, searches and filters, and edits with If-Match', async () => {
    const { owner, E } = await wedding();
    const sharmas = (
      await owner
        .post(`${E}/households`)
        .send({ name: 'Sharma family', expectedCount: 4 })
        .expect(201)
    ).body as Household;
    const asha = (
      await owner
        .post(`${E}/contacts`)
        .send({
          name: 'Asha Sharma',
          phone: '98765 43210',
          email: 'Asha@Example.com',
          tags: ['VIP', 'Bride side'],
          householdId: sharmas.id,
        })
        .expect(201)
    ).body as Contact;
    expect(asha).toMatchObject({ phone: '+919876543210', householdId: sharmas.id });
    await owner
      .post(`${E}/contacts`)
      .send({ name: 'Ravi Kumar', tags: ['Groom side'] })
      .expect(201);
    const bad = await owner.post(`${E}/contacts`).send({ name: 'X', phone: '123' }).expect(422);
    expect((bad.body as Problem).code).toBe('validation_failed');

    const names = async (query: string) =>
      list<Contact>(await owner.get(`${E}/contacts${query}`).expect(200)).map((item) => item.name);
    expect(await names('?q=shar')).toEqual(['Asha Sharma']);
    expect(await names('?q=43210')).toEqual(['Asha Sharma']);
    expect(await names('?q=example.com')).toEqual(['Asha Sharma']);
    expect(await names('?tag=Groom%20side')).toEqual(['Ravi Kumar']);
    expect(await names(`?householdId=${sharmas.id}`)).toEqual(['Asha Sharma']);
    // A literal % matches nothing rather than everything.
    expect(await names('?q=%25')).toEqual([]);

    await owner
      .patch(`${E}/households/${sharmas.id}`)
      .send({ primaryContactId: asha.id })
      .expect(428);
    const updated = await owner
      .patch(`${E}/households/${sharmas.id}`)
      .set('If-Match', '"1"')
      .send({ primaryContactId: asha.id })
      .expect(200);
    expect(updated.body).toMatchObject({ primaryContactId: asha.id, version: 2 });
    expect(
      list<Household>(await owner.get(`${E}/households?q=sharma`).expect(200)).map((h) => h.name),
    ).toEqual(['Sharma family']);

    // Deleting the household leaves Asha, outside any household.
    await owner.delete(`${E}/households/${sharmas.id}`).set('If-Match', '"2"').expect(204);
    const after = (await owner.get(`${E}/contacts/${asha.id}`).expect(200)).body as Contact;
    expect(after.householdId).toBeNull();
    await owner.delete(`${E}/contacts/${asha.id}`).set('If-Match', '"1"').expect(204);
    await owner.get(`${E}/contacts/${asha.id}`).expect(404);
  });

  it("guests need a whole-event grant, and their entries stay out of others' activity feeds", async () => {
    const { owner, E, subEvents, join } = await wedding();
    await owner.post(`${E}/contacts`).send({ name: 'Asha', phone: '9876543210' }).expect(201);
    const mehendi = subEvents.find((item) => item.name === 'Mehendi')!;
    const scoped = await join('Editor', [mehendi.id]);
    await scoped.client.get(`${E}/contacts`).expect(403);
    await scoped.client.post(`${E}/contacts`).send({ name: 'Ravi' }).expect(403);

    // Reads the activity feed, but not the guest list.
    await owner
      .post(`${E}/roles`)
      .send({ name: 'Feed reader', permissions: ['event.view', 'activity.view'] })
      .expect(201);
    const reader = await join('Feed reader');
    const feed = (await reader.client.get(`${E}/activity`).expect(200)).body as ActivityPage;
    expect(feed.data.some((item) => item.entityType === 'contact')).toBe(false);
    const ownerFeed = (await owner.get(`${E}/activity`).expect(200)).body as ActivityPage;
    expect(ownerFeed.data.find((item) => item.entityType === 'contact')).toMatchObject({
      entityLabel: 'Asha',
    });

    const { cookie } = await users.signIn();
    await as(cookie).get(`${E}/contacts`).expect(404);
  });

  it('accepts a CSV import as a job the starter can follow; worker chunks match by phone and email', async () => {
    const { owner, event, E } = await wedding();
    const csv =
      'Name,Mobile,Email,Family,Tags\n' +
      'Asha Sharma,98765 43210,asha@example.com,Sharma family,VIP\n' +
      'Rohit Sharma,,,Sharma family,\n';
    const mapping = {
      name: ['Name'],
      phone: 'Mobile',
      email: 'Email',
      household: 'Family',
      tags: 'Tags',
    };
    const key = () => crypto.randomUUID();
    await owner.post(`${E}/contacts/import`).send({ csv, mapping }).expect(400);
    const bad = await owner
      .post(`${E}/contacts/import`)
      .set('Idempotency-Key', key())
      .send({ csv, mapping: { ...mapping, notes: 'Remarks' } })
      .expect(422);
    expect((bad.body as Problem).detail).toBe('Not in the file: Remarks');

    const accepted = await owner
      .post(`${E}/contacts/import`)
      .set('Idempotency-Key', key())
      .send({ csv, mapping })
      .expect(202);
    const job = accepted.body as JobAccepted;
    expect(job).toMatchObject({ status: 'queued', statusUrl: `/v1/jobs/${job.jobId}` });
    expect(accepted.headers.location).toBe(job.statusUrl);
    const status = (await owner.get(job.statusUrl).expect(200)).body as JobStatus;
    expect(status).toMatchObject({
      kind: 'contacts.import',
      eventId: event.id,
      progress: { done: 0, total: 2 },
    });
    // Only the starter may follow it.
    const { cookie } = await users.signIn();
    await as(cookie).get(job.statusUrl).expect(404);

    // What the worker runs for each chunk, against Postgres.
    const me = (await owner.get(`${E}/me`).expect(200)).body as MyMembership;
    const runtime = createActionRuntime(app.get<Database>(DB));
    const chunk = (text: string): Promise<ContactImportResult> =>
      runAction(
        runtime,
        {
          requestId: job.jobId,
          channel: 'app',
          actor: { kind: 'user', userId: me.member.userId, memberId: null },
          eventId: event.id,
          now: new Date(),
        },
        importContacts,
        {
          importId: job.jobId,
          rows: importRows(parseCsv(text), mapping),
          householdSizes: { 'sharma family': 2 },
        },
      );
    expect(await chunk(csv)).toMatchObject({ created: 2, householdsCreated: 1 });
    const again = await chunk(
      'Name,Mobile,Email,Family,Tags\n' +
        'A. Sharma,+919876543210,,,VIP\n' +
        'Asha,,ASHA@example.com,,Bride side\n',
    );
    expect(again).toMatchObject({ created: 0, updated: 1, skipped: 1 });
    const asha = list<Contact>(await owner.get(`${E}/contacts?q=asha`).expect(200));
    expect(asha).toHaveLength(1);
    expect(asha[0]).toMatchObject({ name: 'Asha Sharma', tags: ['VIP', 'Bride side'] });
    const sharmas = list<Household>(await owner.get(`${E}/households`).expect(200));
    expect(sharmas).toMatchObject([{ name: 'Sharma family', expectedCount: 2 }]);
  });
});
