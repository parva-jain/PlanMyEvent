import type {
  CreatedMemberInvite,
  Household,
  Invitation,
  MyMembership,
  Role,
} from '@pme/contracts';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { API_URL, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

const headers = { Origin: WEB_ORIGIN };

async function list<T>(api: APIRequestContext, path: string): Promise<T[]> {
  return ((await (await api.get(`${API_URL}${path}`)).json()) as { data: T[] }).data;
}

test.describe('people', () => {
  test('add a household with a member, invite it, and mark the card delivered', async ({
    page,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    await page.goto(`/events/${event.id}/people`);
    await expect(page.getByTestId('people-empty')).toBeVisible();

    await page.getByRole('button', { name: text('people.addGuests') }).click();
    const form = page.getByTestId('guest-form');
    await form.getByLabel(text('people.panel.householdName')).fill('Sharma family');
    await form.getByRole('button', { name: text('people.panel.more') }).click();
    await expect(form.getByTestId('expected-count')).toHaveText('3');
    await form.getByRole('button', { name: text('people.panel.createHousehold') }).click();

    // The panel turns into the household.
    const household = page.getByTestId('household-panel');
    await household.getByRole('button', { name: text('people.panel.addMember') }).click();
    const member = household.getByTestId('contact-form');
    await member.getByLabel(text('people.panel.name')).fill('Asha Sharma');
    await member.getByLabel(text('people.panel.phone')).fill('98765 43210');
    await member.getByRole('button', { name: text('people.panel.addMember') }).click();
    const memberRow = household.getByTestId('member-row');
    await expect(memberRow).toContainText('Asha Sharma');
    await expect(memberRow).toContainText('+91 98765 43210');
    // The first member with a phone becomes the primary contact.
    await expect(memberRow).toContainText(text('people.panel.primary'));

    await household.getByRole('button', { name: text('people.invitation.invite') }).click();
    await expect(household.getByTestId('invitation-card')).toBeVisible();
    await page.keyboard.press('Escape');

    const row = page.getByTestId('guest-row').filter({ hasText: 'Sharma family' });
    await expect(row.getByTestId('delivery-status').first()).toHaveText(
      text('people.delivery.not_sent'),
    );

    await page.getByRole('tab', { name: new RegExp(text('people.tabs.invitations')) }).click();
    await page.getByRole('button', { name: 'Mark the card for Sharma family delivered' }).click();
    const card = page.getByTestId('invitation-row').filter({ hasText: 'Sharma family' });
    await expect(card.getByTestId('delivery-status')).toHaveText(
      text('people.delivery.delivered_in_person'),
    );

    await page.getByRole('tab', { name: text('people.tabs.responses') }).click();
    await expect(page.getByTestId('response-row')).toContainText(text('people.attendance.invited'));

    const [invitation] = await list<Invitation>(owner, `/v1/events/${event.id}/invitations`);
    expect(invitation).toMatchObject({
      guestName: 'Sharma family',
      deliveryStatus: 'delivered_in_person',
      attendance: [{ partySize: 3 }],
    });
  });

  test('import a CSV: columns are guessed, problems are counted, and guests are added', async ({
    page,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    await page.goto(`/events/${event.id}/people/import`);

    const csv = [
      'Name,Mobile,Family,Side',
      'Rajesh Gupta,9820144521,Gupta family,Bride side',
      'Sunita Gupta,9820144522,Gupta family,Bride side',
      'Ravi Kumar,12345,,Groom side',
      ',9000000000,,',
    ].join('\n');
    await page
      .locator('#import-file')
      .setInputFiles({ name: 'guests.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByTestId('file-chip')).toContainText('guests.csv');
    await page.getByRole('button', { name: text('people.import.next') }).click();

    const mapping = page.getByTestId('column-mapping');
    await expect(mapping.getByLabel('What Mobile holds')).toHaveValue('phone');
    await expect(mapping.getByLabel('What Family holds')).toHaveValue('household');
    await expect(mapping.getByLabel('What Side holds')).toHaveValue('tags');
    await page.getByRole('button', { name: text('people.import.next') }).click();

    const review = page.getByTestId('import-review');
    await expect(review).toContainText(text('people.import.noName'));
    await page.getByRole('button', { name: 'Import 4 rows' }).click();

    const result = page.getByTestId('import-result');
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toContainText(`${text('people.import.created')}3`);
    await expect(result).toContainText(`${text('people.import.householdsCreated')}1`);
    await expect(page.getByTestId('import-errors')).toContainText('Line 5');

    await page.getByRole('link', { name: text('people.import.toGuests') }).click();
    await expect(page.getByTestId('guest-row')).toHaveCount(2);
    await expect(page.getByTestId('guest-row').first()).toContainText('Rajesh Gupta, Sunita Gupta');
  });

  test('a distributor sees only their cards and marks one delivered', async ({ page, browser }) => {
    const ownerContext = await browser.newContext();
    const owner = await signUp(await ownerContext.newPage(), 'Priya Sharma');
    const event = await weddingVia(owner);
    const E = `${API_URL}/v1/events/${event.id}`;

    const helper = await signUp(page, 'Ramesh Uncle');
    const roles = await list<Role>(owner, `/v1/events/${event.id}/roles`);
    const invite = (await (
      await owner.post(`${E}/member-invites`, {
        headers,
        data: { grants: [{ roleId: roles.find((role) => role.name === 'Helper')!.id }] },
      })
    ).json()) as CreatedMemberInvite;
    expect(
      (await helper.post(`${API_URL}/v1/member-invites/${invite.token}/accept`, { headers })).ok(),
    ).toBe(true);
    const me = (await (await helper.get(`${E}/me`)).json()) as MyMembership;

    for (const name of ['Gupta family', 'Verma family']) {
      const created = (await (
        await owner.post(`${E}/households`, { headers, data: { name, expectedCount: 4 } })
      ).json()) as Household;
      const res = await owner.post(`${E}/invitations`, {
        headers,
        data: {
          householdId: created.id,
          ...(name === 'Gupta family' && { distributorMemberId: me.member.id }),
        },
      });
      expect(res.status()).toBe(201);
    }

    await page.goto(`/events/${event.id}`);
    await page.getByTestId('cards-to-deliver-link').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(text('people.myCards.title'));
    const cards = page.getByTestId('cards-to-deliver').getByTestId('card-row');
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Gupta family');
    await expect(page.getByText('Verma family')).toHaveCount(0);

    await cards.getByRole('button', { name: 'Mark the card for Gupta family delivered' }).click();
    await expect(page.getByTestId('my-cards-summary')).toContainText('1 / 1');
    await expect(page.getByTestId('cards-to-deliver').getByTestId('card-row')).toHaveCount(0);
    await ownerContext.close();
  });
});
