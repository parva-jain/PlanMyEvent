import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  ActivityPage,
  Attendance,
  Contact,
  CreatedEvent,
  CreatedMemberInvite,
  Household,
  Invitation,
  InvitationShare,
  MyMembership,
  Problem,
  PublicInvite,
  Role,
  SubEvent,
} from '@pme/contracts';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
import { PG_POOL } from '../src/database/database.module';
import { createApp } from './create-app';
import { asUser, capturingSender, randomIp, testUsers } from './users';

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

/** A guest's browser: no cookie, its own IP. */
function guest(token: string) {
  const ip = randomIp();
  const http = () => request(app.getHttpServer());
  return {
    view: () => http().get(`/v1/public/invites/${token}`).set('X-Forwarded-For', ip),
    rsvp: (body: object, key = crypto.randomUUID()) =>
      http()
        .post(`/v1/public/invites/${token}/rsvp`)
        .set('X-Forwarded-For', ip)
        .set('Idempotency-Key', key)
        .send(body),
  };
}

const sql = (text: string, values: unknown[]) => app.get<Pool>(PG_POOL).query(text, values);

/** Two guests invited; each gets their link. */
async function invited(perSubEvent = false) {
  const { owner, event, E, subEvents } = await wedding();
  const id = (name: string) => subEvents.find((item) => item.name === name)!.id;
  if (perSubEvent) {
    await sql(`update events set guest_scope = 'per_sub_event' where id = $1`, [event.id]);
    await sql(`update sub_events set response_mode = 'invite_rsvp' where id = $1`, [id('Haldi')]);
  } else {
    await sql(`update events set response_mode = 'invite_rsvp' where id = $1`, [event.id]);
  }
  const sharmas = (
    await owner
      .post(`${E}/households`)
      .send({ name: 'Sharma family', expectedCount: 4 })
      .expect(201)
  ).body as Household;
  await owner
    .post(`${E}/contacts`)
    .send({ name: 'Asha Sharma', phone: '9876543210', householdId: sharmas.id })
    .expect(201);
  const ravi = (await owner.post(`${E}/contacts`).send({ name: 'Ravi Kumar' }).expect(201))
    .body as Contact;
  const sharmaCard = (
    await owner
      .post(`${E}/invitations`)
      .send({ householdId: sharmas.id, ...(perSubEvent && { subEventIds: [id('Haldi')] }) })
      .expect(201)
  ).body as Invitation;
  const raviCard = (
    await owner
      .post(`${E}/invitations`)
      .send({
        contactId: ravi.id,
        ...(perSubEvent && { subEventIds: [id('Mehendi'), id('Haldi')] }),
      })
      .expect(201)
  ).body as Invitation;
  const tokenOf = async (card: Invitation) =>
    (
      (await owner.get(`${E}/invitations/${card.id}/share`).expect(200)).body as InvitationShare
    ).url.split('/i/')[1]!;
  return {
    owner,
    E,
    id,
    sharmaCard,
    raviCard,
    sharmaToken: await tokenOf(sharmaCard),
    raviToken: await tokenOf(raviCard),
  };
}

describe('public invite and RSVP', () => {
  it('shows a guest only their own invitation, and takes their answer', async () => {
    const { owner, E, sharmaCard, sharmaToken } = await invited();
    const sharmas = guest(sharmaToken);
    const page = (await sharmas.view().expect(200)).body as PublicInvite;
    expect(page).toMatchObject({
      event: { name: 'Sharma Wedding' },
      guestName: 'Sharma family',
      guestScope: 'whole_event',
      scopes: [
        { subEventId: null, canRespond: true, status: 'invited', partySize: 4, respondedAt: null },
      ],
    });
    expect(page.schedule.map((item) => item.name)).toContain('Mehendi');
    // Nobody else: not Ravi, not even the household's own contacts or any count of guests.
    const text = JSON.stringify(page);
    expect(text).not.toContain('Ravi');
    expect(text).not.toContain('Asha');
    expect(text).not.toContain('9876543210');
    expect(Object.keys(page).sort()).toEqual([
      'event',
      'guestName',
      'guestScope',
      'schedule',
      'scopes',
    ]);
    const opened = (await owner.get(`${E}/invitations/${sharmaCard.id}`).expect(200))
      .body as Invitation;
    expect(opened.lastOpenedAt).not.toBeNull();

    await request(app.getHttpServer())
      .post(`/v1/public/invites/${sharmaToken}/rsvp`)
      .send({ responses: [{ subEventId: null, attending: true, partySize: 6 }] })
      .expect(400);
    const key = crypto.randomUUID();
    const answer = { responses: [{ subEventId: null, attending: true, partySize: 6 }] };
    const answered = (await sharmas.rsvp(answer, key).expect(200)).body as PublicInvite;
    expect(answered.scopes).toMatchObject([{ status: 'confirmed', partySize: 6 }]);
    // A retry with the same key gets the same answer back, without answering twice.
    expect((await sharmas.rsvp(answer, key).expect(200)).body).toEqual(answered);

    const rows = list<Attendance>(await owner.get(`${E}/attendance`).expect(200));
    expect(rows.find((row) => row.guestName === 'Sharma family')).toMatchObject({
      status: 'confirmed',
      partySize: 6,
    });
    const feed = (await owner.get(`${E}/activity?entityType=attendance`).expect(200))
      .body as ActivityPage;
    expect(feed.data).toHaveLength(1);
    expect(feed.data[0]).toMatchObject({
      action: 'attendance.respond',
      channel: 'public_link',
      actor: { userId: null, label: 'Sharma family (link)' },
      canUndo: false,
    });
  });

  it('per sub-event: the guest sees their sub-events and answers the ones that take replies', async () => {
    const { id, raviToken } = await invited(true);
    const ravi = guest(raviToken);
    const page = (await ravi.view().expect(200)).body as PublicInvite;
    expect(page.guestScope).toBe('per_sub_event');
    expect(page.schedule).toEqual([]);
    // In schedule order; the Mehendi is invite only.
    expect(page.scopes.map((scope) => [scope.subEvent?.name, scope.canRespond])).toEqual([
      ['Haldi', true],
      ['Mehendi', false],
    ]);

    expect(JSON.stringify(page)).not.toContain('Sharma family');
    const refused = await ravi
      .rsvp({ responses: [{ subEventId: id('Mehendi'), attending: true, partySize: 1 }] })
      .expect(422);
    expect((refused.body as Problem).code).toBe('validation_failed');
    const answered = (
      await ravi.rsvp({ responses: [{ subEventId: id('Haldi'), attending: false }] }).expect(200)
    ).body as PublicInvite;
    expect(answered.scopes.find((scope) => scope.subEventId === id('Haldi'))?.status).toBe(
      'declined',
    );
  });

  it('an unknown or regenerated link is 404, a withdrawn one 410', async () => {
    const { owner, E, raviCard, raviToken, sharmaCard, sharmaToken } = await invited();
    await guest('not-a-real-token').view().expect(404);
    await owner
      .post(`${E}/invitations/${raviCard.id}/regenerate-link`)
      .set('If-Match', '"1"')
      .expect(200);
    await guest(raviToken).view().expect(404);
    await owner.delete(`${E}/invitations/${sharmaCard.id}`).set('If-Match', '"1"').expect(204);
    const gone = await guest(sharmaToken).view().expect(410);
    expect((gone.body as Problem).code).toBe('link_revoked');
    await guest(sharmaToken)
      .rsvp({ responses: [{ subEventId: null, attending: true, partySize: 2 }] })
      .expect(410);
  });
});
