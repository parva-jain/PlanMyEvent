import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  BudgetCategoryTotals,
  CreatedEvent,
  CreatedMemberInvite,
  Expense,
  Problem,
  Role,
  SubEvent,
} from '@pme/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
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
  const categories = list<BudgetCategoryTotals>(await owner.get(`${E}/budget-categories`));
  const category = (name: string) => categories.find((item) => item.name === name)!;
  const join = async (roleName: string, subEventIds: string[] = []) => {
    const role = list<Role>(await owner.get(`${E}/roles`)).find((item) => item.name === roleName)!;
    const invite = (
      await owner
        .post(`${E}/member-invites`)
        .send({ grants: [{ roleId: role.id, subEventIds }] })
        .expect(201)
    ).body as CreatedMemberInvite;
    const { cookie: memberCookie } = await users.signIn();
    const client = as(memberCookie);
    await client.post(`/v1/member-invites/${invite.token}/accept`).expect(201);
    return client;
  };
  return { owner, E, category, join };
}

describe('budget API', () => {
  it('records an expense once per Idempotency-Key, and the category totals follow', async () => {
    const { owner, E, category } = await wedding();
    const body = {
      categoryId: category('Catering').id,
      title: 'Caterer advance',
      vendorName: 'Shree Caterers',
      amountPaise: 18_000_000,
      paidPaise: 2_000_000,
      paymentStatus: 'advance_paid',
      paidOn: '2026-10-20',
      transactionRef: '429817365012',
    };
    const missing = await owner.post(`${E}/expenses`).send(body).expect(400);
    expect((missing.body as Problem).code).toBe('bad_request');

    const key = randomUUID();
    const first = await owner.post(`${E}/expenses`).set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);
    const retry = await owner.post(`${E}/expenses`).set('Idempotency-Key', key).send(body);
    expect(retry.body).toEqual(first.body);
    expect(list<Expense>(await owner.get(`${E}/expenses`))).toHaveLength(1);

    const dup = await owner
      .post(`${E}/expenses`)
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, title: 'Again' })
      .expect(409);
    expect((dup.body as Problem).code).toBe('duplicate_transaction_ref');

    const totals = list<BudgetCategoryTotals>(await owner.get(`${E}/budget-categories`)).find(
      (item) => item.name === 'Catering',
    );
    expect(totals).toMatchObject({ committedPaise: 18_000_000, paidPaise: 2_000_000 });

    const expense = first.body as Expense;
    const paid = await owner
      .patch(`${E}/expenses/${expense.id}`)
      .set('If-Match', '"1"')
      .send({ paymentStatus: 'paid' })
      .expect(200);
    expect(paid.body).toMatchObject({ paidPaise: 18_000_000, version: 2 });
    const wrong = await owner
      .patch(`${E}/expenses/${expense.id}`)
      .set('If-Match', '"2"')
      .send({ paymentStatus: 'planned', paidPaise: 100 })
      .expect(422);
    expect((wrong.body as Problem).code).toBe('validation_failed');
  });

  it("a category with expenses can't be deleted; an empty one can", async () => {
    const { owner, E, category } = await wedding();
    const decor = category('Decor');
    await owner
      .post(`${E}/expenses`)
      .set('Idempotency-Key', randomUUID())
      .send({ categoryId: decor.id, title: 'Flowers', amountPaise: 500_000 })
      .expect(201);
    const refused = await owner
      .delete(`${E}/budget-categories/${decor.id}`)
      .set('If-Match', '"1"')
      .expect(409);
    expect(refused.body).toMatchObject({ code: 'conflict', reason: 'category_in_use' });
    await owner
      .delete(`${E}/budget-categories/${category('Gifts').id}`)
      .set('If-Match', '"1"')
      .expect(204);
  });

  it('Helpers see no budget; a scoped Editor sees and writes only their sub-event', async () => {
    const { owner, E, category, join } = await wedding();
    const helper = await join('Helper');
    await helper.get(`${E}/budget-categories`).expect(403);

    const mehendi = list<SubEvent>(await owner.get(`${E}/sub-events`)).find(
      (item) => item.name === 'Mehendi',
    )!;
    await owner
      .post(`${E}/expenses`)
      .set('Idempotency-Key', randomUUID())
      .send({ categoryId: category('Venue').id, title: 'Lawn', amountPaise: 9_000_000 })
      .expect(201);
    const editor = await join('Editor', [mehendi.id]);
    expect(list<Expense>(await editor.get(`${E}/expenses`).expect(200))).toEqual([]);
    await editor
      .post(`${E}/expenses`)
      .set('Idempotency-Key', randomUUID())
      .send({ categoryId: category('Mehendi').id, title: 'Henna', amountPaise: 300_000 })
      .expect(403);
    await editor
      .post(`${E}/expenses`)
      .set('Idempotency-Key', randomUUID())
      .send({
        categoryId: category('Mehendi').id,
        subEventId: mehendi.id,
        title: 'Henna',
        amountPaise: 300_000,
      })
      .expect(201);
    const venue = list<BudgetCategoryTotals>(await editor.get(`${E}/budget-categories`)).find(
      (item) => item.name === 'Venue',
    );
    // The lawn is whole-event: not in a Mehendi editor's totals.
    expect(venue?.committedPaise).toBe(0);
  });
});
