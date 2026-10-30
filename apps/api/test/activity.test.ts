import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  ActivityPage,
  CreatedEvent,
  CreatedMemberInvite,
  Problem,
  Role,
  SubEvent,
  UndoResult,
} from '@pme/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
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

const list = <T>(res: { body: unknown }) => (res.body as { data: T[] }).data;

async function wedding() {
  const owner = as((await users.signIn()).cookie);
  const event = (
    await owner
      .post('/v1/events')
      .send({
        templateKey: 'wedding',
        name: 'Sharma Wedding',
        startsOn: '2026-12-10',
        endsOn: '2026-12-12',
        timeZone: 'Asia/Kolkata',
      })
      .expect(201)
  ).body as CreatedEvent;
  const E = `/v1/events/${event.id}`;
  const roles = list<Role>(await owner.get(`${E}/roles`).expect(200));
  const subEvents = list<SubEvent>(await owner.get(`${E}/sub-events`).expect(200));
  const join = async (roleName: string) => {
    const roleId = roles.find((role) => role.name === roleName)!.id;
    const invite = (
      await owner
        .post(`${E}/member-invites`)
        .send({ grants: [{ roleId }] })
        .expect(201)
    ).body as CreatedMemberInvite;
    const member = as((await users.signIn()).cookie);
    await member.post(`/v1/member-invites/${invite.token}/accept`).expect(201);
    return member;
  };
  const haldi = subEvents.find((item) => item.name === 'Haldi')!;
  return { owner, E, join, haldi };
}

describe('GET E/activity', () => {
  it('lists changes newest first for activity.view; others get 403, non-members 404', async () => {
    const { owner, E, join, haldi } = await wedding();
    await owner
      .patch(`${E}/sub-events/${haldi.id}`)
      .set('If-Match', '"1"')
      .send({ name: 'Haldi ceremony' })
      .expect(200);

    const page = (await owner.get(`${E}/activity?limit=1`).expect(200)).body as ActivityPage;
    expect(page.data[0]).toMatchObject({
      action: 'sub_event.update',
      entityLabel: 'Haldi ceremony',
      before: { name: 'Haldi' },
      after: { name: 'Haldi ceremony' },
      canUndo: true,
    });
    expect(page.hasMore).toBe(true);
    const next = (await owner.get(`${E}/activity?limit=1&cursor=${page.nextCursor}`).expect(200))
      .body as ActivityPage;
    expect(next.data[0]).toMatchObject({ action: 'event.create' });

    const helper = await join('Helper');
    const forbidden = await helper.get(`${E}/activity`).expect(403);
    expect(forbidden.body).toMatchObject({ code: 'forbidden', permission: 'activity.view' });
    const outsider = as((await users.signIn()).cookie);
    await outsider.get(`${E}/activity`).expect(404);
    await owner.get(`${E}/activity?limit=500`).expect(422);
  });
});

describe('POST E/activity/{entryId}/undo', () => {
  it('reverts the change, links the undo entry, and refuses a second undo', async () => {
    const { owner, E, haldi } = await wedding();
    await owner
      .patch(`${E}/sub-events/${haldi.id}`)
      .set('If-Match', '"1"')
      .send({ name: 'Haldi ceremony', capacity: 80 })
      .expect(200);
    const [change] = list<{ id: string }>(await owner.get(`${E}/activity?limit=1`));

    const undone = (await owner.post(`${E}/activity/${change!.id}/undo`).expect(200))
      .body as UndoResult;
    expect(undone.entry).toMatchObject({ action: 'sub_event.update', undoOfId: change!.id });
    const current = (await owner.get(`${E}/sub-events/${haldi.id}`).expect(200)).body as SubEvent;
    expect(current).toMatchObject({ name: 'Haldi', capacity: null, version: 3 });

    const again = await owner.post(`${E}/activity/${change!.id}/undo`).expect(409);
    expect(again.body as Problem).toMatchObject({ code: 'conflict', reason: 'already_undone' });
  });

  it('answers 409 version_conflict with the current state when it changed since', async () => {
    const { owner, E, haldi } = await wedding();
    const patch = (version: number, body: object) =>
      owner.patch(`${E}/sub-events/${haldi.id}`).set('If-Match', `"${version}"`).send(body);
    await patch(1, { name: 'Haldi ceremony' }).expect(200);
    const [rename] = list<{ id: string }>(await owner.get(`${E}/activity?limit=1`));
    await patch(2, { notes: 'Marigolds' }).expect(200);

    const conflict = await owner.post(`${E}/activity/${rename!.id}/undo`).expect(409);
    expect(conflict.body).toMatchObject({
      code: 'version_conflict',
      current: { name: 'Haldi ceremony', version: 3 },
    });
  });

  it("an Editor undoes their own change but not the owner's", async () => {
    const { owner, E, join, haldi } = await wedding();
    const editor = await join('Editor');
    await owner
      .patch(`${E}/sub-events/${haldi.id}`)
      .set('If-Match', '"1"')
      .send({ notes: 'Owner note' })
      .expect(200);
    const [ownerChange] = list<{ id: string; canUndo: boolean }>(
      await editor.get(`${E}/activity?limit=1`),
    );
    expect(ownerChange!.canUndo).toBe(false);
    const refused = await editor.post(`${E}/activity/${ownerChange!.id}/undo`).expect(403);
    expect(refused.body).toMatchObject({ permission: 'event.settings' });

    await editor
      .patch(`${E}/sub-events/${haldi.id}`)
      .set('If-Match', '"2"')
      .send({ notes: 'Editor note' })
      .expect(200);
    const [own] = list<{ id: string; canUndo: boolean }>(await editor.get(`${E}/activity?limit=1`));
    expect(own!.canUndo).toBe(true);
    await editor.post(`${E}/activity/${own!.id}/undo`).expect(200);
  });
});
