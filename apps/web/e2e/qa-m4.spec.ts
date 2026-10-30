import type { CreatedMemberInvite, Member, MyMembership, Role } from '@pme/contracts';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

import { API_URL, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

const H = { Origin: WEB_ORIGIN };
const ev = (id: string, path = '') => `${API_URL}/v1/events/${id}${path}`;

interface Person {
  api: APIRequestContext;
  page: Page;
  email: string;
}

/** A signed-in user in their own browser context. */
async function person(browser: Browser, name: string): Promise<Person> {
  const page = await (await browser.newContext()).newPage();
  const api = await signUp(page, name);
  const session = (await (await api.get(`${API_URL}/v1/auth/get-session`)).json()) as {
    user: { email: string };
  };
  return { api, page, email: session.user.email };
}

async function roleList(api: APIRequestContext, eventId: string) {
  return ((await (await api.get(ev(eventId, '/roles'))).json()) as { data: Role[] }).data;
}

async function invite(
  api: APIRequestContext,
  eventId: string,
  grants: { roleId: string; subEventIds?: string[] }[],
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const res = await api.post(ev(eventId, '/member-invites'), {
    headers: { ...H, ...headers },
    data: { grants: grants.map((g) => ({ subEventIds: [], ...g })), ...extra },
  });
  return { res, body: (await res.json()) as CreatedMemberInvite };
}

/** Owner makes an event; `who` joins it holding `roleName` (optionally scoped). */
async function joinAs(
  owner: APIRequestContext,
  eventId: string,
  who: APIRequestContext,
  roleName: string,
  subEventIds: string[] = [],
) {
  const roles = await roleList(owner, eventId);
  const { body } = await invite(owner, eventId, [
    { roleId: roles.find((r) => r.name === roleName)!.id, subEventIds },
  ]);
  const res = await who.post(`${API_URL}/v1/member-invites/${body.token}/accept`, { headers: H });
  expect(res.ok()).toBe(true);
}

const members = async (api: APIRequestContext, eventId: string) =>
  ((await (await api.get(ev(eventId, '/members'))).json()) as { data: Member[] }).data;

test.describe('qa m4: access', () => {
  test('non-member gets 404, a Viewer gets 403 on manage routes', async ({ browser }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const stranger = await person(browser, 'Stranger');
    const viewer = await person(browser, 'Vikram Viewer');
    await joinAs(owner.api, event.id, viewer.api, 'Viewer');

    for (const path of ['/members', '/roles', '/me', '/member-invites']) {
      expect((await stranger.api.get(ev(event.id, path))).status(), path).toBe(404);
    }
    expect((await viewer.api.get(ev(event.id, '/member-invites'))).status()).toBe(403);
    const roles = await roleList(viewer.api, event.id);
    const create = await viewer.api.post(ev(event.id, '/roles'), {
      headers: H,
      data: { name: 'Sneaky', permissions: ['event.view'] },
    });
    expect(create.status()).toBe(403);
    const admin = roles.find((r) => r.name === 'Admin')!;
    const patch = await viewer.api.patch(ev(event.id, `/roles/${admin.id}`), {
      headers: { ...H, 'If-Match': `"${admin.version}"` },
      data: { permissions: ['event.view'] },
    });
    expect(patch.status()).toBe(403);
  });

  test('a removed member loses access at once (permission cache)', async ({ browser }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const helper = await person(browser, 'Hari Helper');
    await joinAs(owner.api, event.id, helper.api, 'Helper');
    expect((await helper.api.get(ev(event.id, '/members'))).status()).toBe(200);

    const hm = (await members(owner.api, event.id)).find((m) => m.name === 'Hari Helper')!;
    const del = await owner.api.delete(ev(event.id, `/members/${hm.id}`), {
      headers: { ...H, 'If-Match': `"${hm.version}"` },
    });
    expect(del.status()).toBe(204);
    expect((await helper.api.get(ev(event.id, '/members'))).status()).toBe(404);
    expect((await helper.api.get(ev(event.id, '/me'))).status()).toBe(404);
  });

  test('a role manager cannot strip a role that outranks them', async ({ browser }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const created = await owner.api.post(ev(event.id, '/roles'), {
      headers: H,
      data: { name: 'Role keeper', permissions: ['event.view', 'members.view', 'roles.manage'] },
    });
    expect(created.status()).toBe(201);
    const rm = await person(browser, 'Ravi RoleKeeper');
    await joinAs(owner.api, event.id, rm.api, 'Role keeper');

    const admin = (await roleList(rm.api, event.id)).find((r) => r.name === 'Admin')!;
    const res = await rm.api.patch(ev(event.id, `/roles/${admin.id}`), {
      headers: { ...H, 'If-Match': `"${admin.version}"` },
      data: { permissions: ['event.view'] },
    });
    expect(res.status()).toBe(403);
  });

  test('a sub-event scoped Editor edits only their sub-event; deleting it drops the grant', async ({
    browser,
  }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const subs = (
      (await (await owner.api.get(ev(event.id, '/sub-events'))).json()) as {
        data: { id: string; name: string; version: number }[];
      }
    ).data;
    const [first, second] = subs;
    const scoped = await person(browser, 'Sana Scoped');
    await joinAs(owner.api, event.id, scoped.api, 'Editor', [first!.id]);

    const ok = await scoped.api.patch(ev(event.id, `/sub-events/${first!.id}`), {
      headers: { ...H, 'If-Match': `"${first!.version}"` },
      data: { name: 'Haldi (edited)' },
    });
    expect(ok.status()).toBe(200);
    const other = await scoped.api.patch(ev(event.id, `/sub-events/${second!.id}`), {
      headers: { ...H, 'If-Match': `"${second!.version}"` },
      data: { name: 'Hijack' },
    });
    expect(other.status()).toBe(403);
    // Scoped, so not allowed to create new sub-events or list the whole team's invites.
    expect(
      (
        await scoped.api.post(ev(event.id, '/sub-events'), { headers: H, data: { name: 'X' } })
      ).status(),
    ).toBe(403);

    const current = (await (
      await owner.api.get(ev(event.id, `/sub-events/${first!.id}`))
    ).json()) as {
      version: number;
    };
    expect(
      (
        await owner.api.delete(ev(event.id, `/sub-events/${first!.id}`), {
          headers: { ...H, 'If-Match': `"${current.version}"` },
        })
      ).status(),
    ).toBe(204);
    const me = (await (await scoped.api.get(ev(event.id, '/me'))).json()) as MyMembership;
    expect(me.permissions.wholeEvent).toEqual([]);
    expect(me.permissions.subEvents).toEqual({});
  });

  test('the owner cannot be removed, edited or leave; Owner role cannot be granted', async ({
    browser,
  }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const admin = await person(browser, 'Anil Admin');
    await joinAs(owner.api, event.id, admin.api, 'Admin');

    const list = await members(admin.api, event.id);
    const ownerMember = list.find((m) => m.isOwner)!;
    expect(
      (
        await admin.api.delete(ev(event.id, `/members/${ownerMember.id}`), {
          headers: { ...H, 'If-Match': `"${ownerMember.version}"` },
        })
      ).status(),
    ).toBe(403);
    expect((await owner.api.post(ev(event.id, '/leave'), { headers: H })).status()).toBe(409);

    const roles = await roleList(owner.api, event.id);
    const ownerRole = roles.find((r) => r.isOwner)!;
    const { res } = await invite(admin.api, event.id, [{ roleId: ownerRole.id }]);
    expect(res.status()).toBe(422);
  });
});

test.describe('qa m4: invites and concurrency', () => {
  test('an email invite only works for that address, once', async ({ browser }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const right = await person(browser, 'Right Person');
    const wrong = await person(browser, 'Wrong Person');
    const roles = await roleList(owner.api, event.id);
    const { res, body } = await invite(
      owner.api,
      event.id,
      [{ roleId: roles.find((r) => r.name === 'Helper')!.id }],
      { email: right.email.toUpperCase() },
    );
    expect(res.status()).toBe(201);

    const bad = await wrong.api.post(`${API_URL}/v1/member-invites/${body.token}/accept`, {
      headers: H,
    });
    expect(bad.status()).toBe(403);
    const good = await right.api.post(`${API_URL}/v1/member-invites/${body.token}/accept`, {
      headers: H,
    });
    expect(good.status()).toBe(201);
    // Single use: a second accept by the wrong person now reads as used up, not as a leak.
    const again = await wrong.api.post(`${API_URL}/v1/member-invites/${body.token}/accept`, {
      headers: H,
    });
    expect([403, 410]).toContain(again.status());
  });

  test('a single-use link raced by two people lets exactly one in', async ({ browser }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const [a, b] = [await person(browser, 'Racer A'), await person(browser, 'Racer B')];
    const roles = await roleList(owner.api, event.id);
    const { body } = await invite(
      owner.api,
      event.id,
      [{ roleId: roles.find((r) => r.name === 'Viewer')!.id }],
      { maxUses: 1 },
    );
    const url = `${API_URL}/v1/member-invites/${body.token}/accept`;
    const [ra, rb] = await Promise.all([
      a.api.post(url, { headers: H }),
      b.api.post(url, { headers: H }),
    ]);
    expect([ra.status(), rb.status()].sort()).toEqual([201, 410]);
    expect(await members(owner.api, event.id)).toHaveLength(2);
  });

  test('the same Idempotency-Key replays one invite, and a revoked link is dead', async ({
    browser,
  }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const roles = await roleList(owner.api, event.id);
    const grants = [{ roleId: roles.find((r) => r.name === 'Viewer')!.id }];
    const key = { 'Idempotency-Key': `qa-m4-${Date.now()}-abcdef` };
    const first = await invite(owner.api, event.id, grants, {}, key);
    const second = await invite(owner.api, event.id, grants, {}, key);
    expect(second.body.id).toBe(first.body.id);
    const open = (
      (await (await owner.api.get(ev(event.id, '/member-invites'))).json()) as {
        data: unknown[];
      }
    ).data;
    expect(open).toHaveLength(1);

    await owner.api.delete(ev(event.id, `/member-invites/${first.body.id}`), { headers: H });
    const late = await person(browser, 'Late Lata');
    const res = await late.api.post(`${API_URL}/v1/member-invites/${first.body.token}/accept`, {
      headers: H,
    });
    expect(res.status()).toBe(410);
  });

  test('two editors of one member: stale If-Match is 409, missing is 428', async ({ browser }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const admin = await person(browser, 'Anil Admin');
    await joinAs(owner.api, event.id, admin.api, 'Admin');
    const target = await person(browser, 'Tara Target');
    await joinAs(owner.api, event.id, target.api, 'Viewer');
    const roles = await roleList(owner.api, event.id);
    const t = (await members(owner.api, event.id)).find((m) => m.name === 'Tara Target')!;
    const put = (api: APIRequestContext, roleName: string, version?: number) =>
      api.put(ev(event.id, `/members/${t.id}/roles`), {
        headers: { ...H, ...(version === undefined ? {} : { 'If-Match': `"${version}"` }) },
        data: {
          assignments: [{ roleId: roles.find((r) => r.name === roleName)!.id, subEventIds: [] }],
        },
      });
    expect((await put(owner.api, 'Helper', t.version)).status()).toBe(200);
    expect((await put(admin.api, 'Editor', t.version)).status()).toBe(409);
    expect((await put(admin.api, 'Editor')).status()).toBe(428);
  });

  test('role names: duplicates, over-long and Hindi/emoji', async ({ browser }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const make = (name: string) =>
      owner.api.post(ev(event.id, '/roles'), { headers: H, data: { name, permissions: [] } });
    expect((await make('admin')).status()).toBe(422);
    expect((await make('x'.repeat(61))).status()).toBe(422);
    expect((await make('   ')).status()).toBe(422);
    expect((await make('खानपान प्रभारी 🍛')).status()).toBe(201);
  });
});

test.describe('qa m4: join page', () => {
  test('wrong account on an email invite shows the masked address and a way out', async ({
    browser,
  }) => {
    const owner = await person(browser, 'Priya Sharma');
    const event = await weddingVia(owner.api);
    const roles = await roleList(owner.api, event.id);
    const { body } = await invite(
      owner.api,
      event.id,
      [{ roleId: roles.find((r) => r.name === 'Viewer')!.id }],
      { email: 'someone.else@example.com' },
    );
    const wrong = await person(browser, 'Wrong Person');
    await wrong.page.goto(`/join/${body.token}`);
    await wrong.page.getByRole('button', { name: text('join.join') }).click();
    await expect(wrong.page.getByRole('alert').getByText(/so\*\*\*@example\.com/)).toBeVisible();
    await expect(
      wrong.page.getByRole('button', { name: text('join.switchAccount') }),
    ).toBeVisible();
  });
});
