import { createHash } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  ActivityPage,
  Attendance,
  BulkCreateInvitationsResult,
  Contact,
  CreatedEvent,
  CreatedMemberInvite,
  Household,
  Invitation,
  InvitationShare,
  MyMembership,
  Problem,
  Role,
  SubEvent,
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

/** The Sharma family (4, Asha primary with a phone) and Ravi on his own. */
async function guests(owner: ReturnType<typeof as>, E: string) {
  const sharmas = (
    await owner
      .post(`${E}/households`)
      .send({ name: 'Sharma family', expectedCount: 4 })
      .expect(201)
  ).body as Household;
  const asha = (
    await owner
      .post(`${E}/contacts`)
      .send({ name: 'Asha', phone: '9876543210', householdId: sharmas.id })
      .expect(201)
  ).body as Contact;
  await owner
    .patch(`${E}/households/${sharmas.id}`)
    .set('If-Match', '"1"')
    .send({ primaryContactId: asha.id })
    .expect(200);
  const ravi = (await owner.post(`${E}/contacts`).send({ name: 'Ravi' }).expect(201))
    .body as Contact;
  return { sharmas, asha, ravi };
}

const tokenHash = async (invitationId: string) =>
  (
    await app
      .get<Pool>(PG_POOL)
      .query<{ token_hash: Buffer }>('select token_hash from invitations where id = $1', [
        invitationId,
      ])
  ).rows[0]!.token_hash;

describe('invitations API', () => {
  it('invites a household, shares a derived link and a WhatsApp message, and regenerates it', async () => {
    const { owner, E } = await wedding();
    const { sharmas } = await guests(owner, E);
    const invitation = (
      await owner.post(`${E}/invitations`).send({ householdId: sharmas.id }).expect(201)
    ).body as Invitation;
    expect(invitation).toMatchObject({
      guestName: 'Sharma family',
      attendance: [{ subEventId: null, status: 'invited', partySize: 4 }],
    });
    const again = await owner
      .post(`${E}/invitations`)
      .send({ householdId: sharmas.id })
      .expect(409);
    expect((again.body as Problem & { reason: string }).reason).toBe('already_invited');

    const share = (await owner.get(`${E}/invitations/${invitation.id}/share`).expect(200))
      .body as InvitationShare;
    const token = share.url.split('/i/')[1]!;
    expect(share.url).toBe(`http://localhost:3000/i/${token}`);
    // Only the token's SHA-256 is stored.
    expect(
      (await tokenHash(invitation.id)).equals(createHash('sha256').update(token).digest()),
    ).toBe(true);
    expect(share.message).toContain('Sharma family');
    expect(share.whatsappUrl.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    // The same link every time, until it's regenerated.
    expect(
      ((await owner.get(`${E}/invitations/${invitation.id}/share`)).body as InvitationShare).url,
    ).toBe(share.url);
    await owner
      .post(`${E}/invitations/${invitation.id}/regenerate-link`)
      .set('If-Match', '"1"')
      .expect(200);
    const fresh = (await owner.get(`${E}/invitations/${invitation.id}/share`).expect(200))
      .body as InvitationShare;
    expect(fresh.url).not.toBe(share.url);
  });

  it('a distributor sees and marks only their own cards', async () => {
    const { owner, E, join } = await wedding();
    const { sharmas, ravi } = await guests(owner, E);
    const uncle = await join('Helper');
    const result = (
      await owner
        .post(`${E}/invitations/bulk`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ householdIds: [sharmas.id], distributorMemberId: uncle.memberId })
        .expect(201)
    ).body as BulkCreateInvitationsResult;
    const card = result.created[0]!;
    await owner.post(`${E}/invitations`).send({ contactId: ravi.id }).expect(201);

    await uncle.client.get(`${E}/contacts`).expect(403);
    const mine = list<Invitation>(await uncle.client.get(`${E}/invitations`).expect(200));
    expect(mine.map((item) => item.guestName)).toEqual(['Sharma family']);
    const delivered = await uncle.client
      .patch(`${E}/invitations/${card.id}`)
      .set('If-Match', '"1"')
      .send({ deliveryStatus: 'delivered_in_person' })
      .expect(200);
    expect((delivered.body as Invitation).deliveredAt).not.toBeNull();
    await uncle.client
      .patch(`${E}/invitations/${card.id}`)
      .set('If-Match', '"2"')
      .send({ distributorMemberId: null })
      .expect(403);
    // The feed names invitations by their guest.
    const ownerFeed = (await owner.get(`${E}/activity`).expect(200)).body as ActivityPage;
    expect(ownerFeed.data.find((item) => item.entityType === 'invitation')).toMatchObject({
      action: 'invitation.update',
      entityLabel: 'Sharma family',
    });
  });

  it('per sub-event: invitations name sub-events, and scoped members see only theirs', async () => {
    const { owner, event, E, subEvents, join } = await wedding();
    const { sharmas, ravi } = await guests(owner, E);
    await app
      .get<Pool>(PG_POOL)
      .query(`update events set guest_scope = 'per_sub_event' where id = $1`, [event.id]);
    const id = (name: string) => subEvents.find((item) => item.name === name)!.id;
    const [mehendi, haldi] = [id('Mehendi'), id('Haldi')];
    await owner
      .post(`${E}/invitations`)
      .send({ householdId: sharmas.id, subEventIds: [mehendi, haldi] })
      .expect(201);
    await owner
      .post(`${E}/invitations`)
      .send({ contactId: ravi.id, subEventIds: [haldi] })
      .expect(201);

    const scoped = await join('Editor', [mehendi]);
    const theirs = list<Invitation>(await scoped.client.get(`${E}/invitations`).expect(200));
    expect(theirs.map((item) => item.guestName)).toEqual(['Sharma family']);
    const rows = list<Attendance>(await scoped.client.get(`${E}/attendance`).expect(200));
    expect(rows.map((row) => [row.guestName, row.subEventId, row.partySize])).toEqual([
      ['Sharma family', mehendi, 4],
    ]);
    const all = list<Attendance>(
      await owner.get(`${E}/attendance?subEventId=${haldi}&q=rav`).expect(200),
    );
    expect(all.map((row) => row.guestName)).toEqual(['Ravi']);
  });

  it('withdrawing cancels attendance; undo brings back the answer; inviting again reopens the row', async () => {
    const { owner, E } = await wedding();
    const { ravi } = await guests(owner, E);
    const card = (await owner.post(`${E}/invitations`).send({ contactId: ravi.id }).expect(201))
      .body as Invitation;
    const row = card.attendance[0]!;
    await owner
      .patch(`${E}/attendance/${row.id}`)
      .set('If-Match', '"1"')
      .send({ status: 'confirmed', partySize: 2 })
      .expect(200);
    await owner.delete(`${E}/invitations/${card.id}`).set('If-Match', '"1"').expect(204);
    const cancelled = list<Attendance>(await owner.get(`${E}/attendance`).expect(200));
    expect(cancelled).toMatchObject([{ id: row.id, status: 'cancelled' }]);

    const feed = (await owner.get(`${E}/activity?entityType=invitation`).expect(200))
      .body as ActivityPage;
    await owner.post(`${E}/activity/${feed.data[0]!.id}/undo`).expect(200);
    expect(list<Attendance>(await owner.get(`${E}/attendance`).expect(200))).toMatchObject([
      { id: row.id, status: 'confirmed', partySize: 2 },
    ]);

    const restored = (await owner.get(`${E}/invitations/${card.id}`).expect(200))
      .body as Invitation;
    await owner
      .delete(`${E}/invitations/${card.id}`)
      .set('If-Match', `"${restored.version}"`)
      .expect(204);
    const again = (await owner.post(`${E}/invitations`).send({ contactId: ravi.id }).expect(201))
      .body as Invitation;
    expect(again.attendance).toMatchObject([{ id: row.id, status: 'invited' }]);

    const bulk = await owner
      .patch(`${E}/invitations/bulk`)
      .send({ invitationIds: [again.id], deliveryStatus: 'sent_digitally' })
      .expect(200);
    expect((bulk.body as { updated: Invitation[] }).updated[0]!.sentAt).not.toBeNull();
  });
});
