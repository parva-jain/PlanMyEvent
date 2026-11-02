import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  Attendance,
  CreatedEvent,
  CreatedMemberInvite,
  Event,
  Household,
  Invitation,
  InvitationShare,
  JobAccepted,
  JobStatus,
  MyMembership,
  Problem,
  Role,
  SubEvent,
} from '@pme/contracts';
import { runAction, switchGuestScope, type ActionRuntime, type CoreTx } from '@pme/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
import { ACTION_RUNTIME } from '../src/database/database.module';
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

/** Priya's wedding with the Sharma family invited, as invite + RSVP. */
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
  const me = (await owner.get(`${E}/me`).expect(200)).body as MyMembership;
  const sharmas = (
    await owner
      .post(`${E}/households`)
      .send({ name: 'Sharma family', expectedCount: 4 })
      .expect(201)
  ).body as Household;
  const card = (await owner.post(`${E}/invitations`).send({ householdId: sharmas.id }).expect(201))
    .body as Invitation;
  /** What the worker does with the queued job, run here against the same database. */
  const runSwitch = (guestScope: Event['guestScope']) =>
    runAction(
      app.get<ActionRuntime<CoreTx>>(ACTION_RUNTIME),
      {
        requestId: crypto.randomUUID(),
        channel: 'app',
        actor: { kind: 'user', userId: me.member.userId, memberId: null },
        eventId: event.id,
        now: new Date(),
      },
      switchGuestScope,
      { guestScope },
    );
  return { owner, event, E, sharmas, card, runSwitch };
}

describe('guest scope and response mode', () => {
  it('the event takes replies once its response mode is invite + RSVP', async () => {
    const { owner, E, card } = await wedding();
    const event = (await owner.get(E).expect(200)).body as Event;
    expect(event.responseMode).toBe('invite_only');
    await owner
      .patch(E)
      .set('If-Match', `"${event.version}"`)
      .send({ responseMode: 'invite_rsvp' })
      .expect(200);

    const share = (await owner.get(`${E}/invitations/${card.id}/share`).expect(200))
      .body as InvitationShare;
    const token = share.url.split('/i/')[1]!;
    await request(app.getHttpServer())
      .post(`/v1/public/invites/${token}/rsvp`)
      .set('X-Forwarded-For', randomIp())
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ responses: [{ subEventId: null, attending: true, partySize: 3 }] })
      .expect(200);
  });

  it('a switch needs event.settings, runs as a job, and only one at a time', async () => {
    const { owner, event, E } = await wedding();
    const roles = list<Role>(await owner.get(`${E}/roles`));
    const invite = (
      await owner
        .post(`${E}/member-invites`)
        .send({ grants: [{ roleId: roles.find((role) => role.name === 'Editor')!.id }] })
        .expect(201)
    ).body as CreatedMemberInvite;
    const { cookie } = await users.signIn();
    const editor = as(cookie);
    await editor.post(`/v1/member-invites/${invite.token}/accept`).expect(201);
    await editor
      .post(`${E}/guest-scope`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ guestScope: 'per_sub_event' })
      .expect(403);

    // Already whole-event: refused before anything is queued.
    await owner
      .post(`${E}/guest-scope`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ guestScope: 'whole_event' })
      .expect(422);

    const accepted = await owner
      .post(`${E}/guest-scope`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ guestScope: 'per_sub_event' })
      .expect(202);
    const { jobId, statusUrl } = accepted.body as JobAccepted;
    expect(accepted.headers.location).toBe(statusUrl);
    const status = (await owner.get(statusUrl).expect(200)).body as JobStatus;
    expect(status).toMatchObject({
      jobId,
      kind: 'event.guest_scope',
      eventId: event.id,
      status: 'queued',
    });

    const again = await owner
      .post(`${E}/guest-scope`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ guestScope: 'per_sub_event' })
      .expect(409);
    expect((again.body as Problem & { reason: string }).reason).toBe('job_already_running');
  });

  it('switching copies answers onto every sub-event, and switching back merges them', async () => {
    const { owner, E, sharmas, card, runSwitch } = await wedding();
    const subEvents = list<SubEvent>(await owner.get(`${E}/sub-events`));
    const [row] = list<Attendance>(await owner.get(`${E}/attendance`));
    await owner
      .patch(`${E}/attendance/${row!.id}`)
      .set('If-Match', '"1"')
      .send({ status: 'confirmed', partySize: 5 })
      .expect(200);

    await expect(runSwitch('per_sub_event')).resolves.toEqual({
      guestScope: 'per_sub_event',
      attendanceRows: subEvents.length,
    });
    const event = (await owner.get(E).expect(200)).body as Event;
    expect(event.guestScope).toBe('per_sub_event');
    const spread = list<Attendance>(await owner.get(`${E}/attendance`));
    expect(spread).toHaveLength(subEvents.length);
    expect(spread.every((item) => item.status === 'confirmed' && item.partySize === 5)).toBe(true);
    const invitation = (await owner.get(`${E}/invitations/${card.id}`).expect(200))
      .body as Invitation;
    expect([...invitation.subEventIds].sort()).toEqual(subEvents.map((item) => item.id).sort());
    // Sub-events now carry their own response mode.
    const after = list<SubEvent>(await owner.get(`${E}/sub-events`));
    expect(after.every((item) => item.responseMode === 'invite_only')).toBe(true);

    // Different answers per sub-event, then back to one list.
    const [first, second] = spread;
    await owner
      .patch(`${E}/attendance/${first!.id}`)
      .set('If-Match', `"${first!.version}"`)
      .send({ status: 'declined' })
      .expect(200);
    await owner
      .patch(`${E}/attendance/${second!.id}`)
      .set('If-Match', `"${second!.version}"`)
      .send({ partySize: 7 })
      .expect(200);
    await expect(runSwitch('whole_event')).resolves.toEqual({
      guestScope: 'whole_event',
      attendanceRows: 1,
    });
    const merged = list<Attendance>(await owner.get(`${E}/attendance`));
    expect(merged).toMatchObject([
      { householdId: sharmas.id, subEventId: null, status: 'confirmed', partySize: 7 },
    ]);
    const back = (await owner.get(`${E}/invitations/${card.id}`).expect(200)).body as Invitation;
    expect(back.subEventIds).toEqual([]);

    // The answer changed before the switch can't be undone into the old shape.
    const entries = list<{ id: string; action: string }>(
      await owner.get(`${E}/activity?limit=100`),
    );
    const answered = entries.filter((item) => item.action === 'attendance.update').at(-1)!;
    const refused = await owner.post(`${E}/activity/${answered.id}/undo`).expect(409);
    expect(refused.body as Problem).toMatchObject({
      code: 'conflict',
      reason: 'guest_scope_changed',
    });
  });
});
