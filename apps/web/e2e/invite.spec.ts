import type {
  Contact,
  Household,
  Invitation,
  InvitationShare,
  PublicInvite,
  Rsvp,
} from '@pme/contracts';
import { expect, test, type Page } from '@playwright/test';

import { API_URL, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

const headers = { Origin: WEB_ORIGIN };

/** A fake token with the real shape (43 base64url characters). */
const TOKEN = 'a'.repeat(43);

function invitePage(overrides: Partial<PublicInvite> = {}): PublicInvite {
  return {
    event: {
      name: 'Sharma Wedding',
      type: 'wedding',
      description: null,
      startsOn: '2026-12-10',
      endsOn: '2026-12-12',
      timeZone: 'Asia/Kolkata',
    },
    guestName: 'Gupta family',
    guestScope: 'whole_event',
    scopes: [
      {
        subEventId: null,
        subEvent: null,
        responseMode: 'invite_rsvp',
        canRespond: true,
        status: 'invited',
        partySize: 2,
        respondedAt: null,
      },
    ],
    schedule: [
      {
        id: '01900000-0000-7000-8000-000000000001',
        name: 'Wedding Ceremony',
        startsAt: '2026-12-12T05:30:00.000Z',
        endsAt: '2026-12-12T09:30:00.000Z',
        venue: { name: 'Radisson Blu', address: 'Ring Road, Indore', mapUrl: null },
      },
    ],
    ...overrides,
  };
}

/**
 * Serves the public invite endpoints from `page` and answers RSVPs by applying them, so the
 * screens can be driven through states the API can't be put in from a test yet (response
 * modes are set in Settings with step 7c.1). The API's own tests cover the real endpoints.
 */
async function serveInvite(page: Page, initial: PublicInvite) {
  let current = initial;
  const sent: { body: Rsvp; key: string | undefined }[] = [];
  const cors = {
    'Access-Control-Allow-Origin': WEB_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'content-type, idempotency-key, x-request-id',
  };
  await page.route(`${API_URL}/v1/public/invites/${TOKEN}**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Rsvp;
      sent.push({ body, key: request.headers()['idempotency-key'] });
      const now = new Date().toISOString();
      current = {
        ...current,
        scopes: current.scopes.map((scope) => {
          const answer = body.responses.find((item) => item.subEventId === scope.subEventId);
          return answer
            ? {
                ...scope,
                status: answer.attending ? 'confirmed' : 'declined',
                partySize: answer.partySize ?? scope.partySize,
                respondedAt: now,
              }
            : scope;
        }),
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      json: current,
    });
  });
  return sent;
}

test.describe('guest invitation', () => {
  test('a guest opens their link and sees only their own invitation; withdrawn and unknown links say so', async ({
    page,
    browser,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    const E = `${API_URL}/v1/events/${event.id}`;
    const sharmas = (await (
      await owner.post(`${E}/households`, {
        headers,
        data: { name: 'Sharma family', expectedCount: 4 },
      })
    ).json()) as Household;
    await owner.post(`${E}/contacts`, {
      headers,
      data: { name: 'Asha Sharma', phone: '9876543210', householdId: sharmas.id },
    });
    // Another guest, who must never appear on the Sharmas' page.
    const ravi = (await (
      await owner.post(`${E}/contacts`, {
        headers,
        data: { name: 'Ravi Kumar', phone: '9123456780' },
      })
    ).json()) as Contact;
    const card = (await (
      await owner.post(`${E}/invitations`, { headers, data: { householdId: sharmas.id } })
    ).json()) as Invitation;
    await owner.post(`${E}/invitations`, { headers, data: { contactId: ravi.id } });
    const share = (await (
      await owner.get(`${E}/invitations/${card.id}/share`)
    ).json()) as InvitationShare;

    // The guest has no account: a fresh browser.
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(new URL(share.url).pathname);
    await expect(guest.getByRole('heading', { level: 1 })).toHaveText('Sharma Wedding');
    await expect(guest.getByTestId('invite-greeting')).toContainText('Dear Sharma family,');
    // The wedding template is invite only: shown, not answered.
    await expect(guest.getByTestId('invite-only')).toContainText(text('invite.noReplyTitle'));
    const body = await guest.locator('body').innerText();
    for (const secret of ['Ravi', 'Asha', '98765', '91234']) expect(body).not.toContain(secret);

    // Withdrawn: the page says so instead of showing the invitation.
    await owner.delete(`${E}/invitations/${card.id}`, {
      headers: { ...headers, 'If-Match': '"1"' },
    });
    await guest.reload();
    await expect(guest.getByTestId('invite-problem')).toContainText(text('invite.withdrawnTitle'));

    await guest.goto(`/i/${'b'.repeat(43)}`);
    await expect(guest.getByTestId('invite-problem')).toContainText(text('invite.inactiveTitle'));
    await guestContext.close();
  });

  test('replying yes with how many, then changing the reply', async ({ page }) => {
    const sent = await serveInvite(page, invitePage());
    await page.goto(`/i/${TOKEN}`);
    await expect(page.getByTestId('invite-schedule')).toContainText('Wedding Ceremony');
    // 11:00 in Asia/Kolkata, whatever the browser's zone.
    await expect(page.getByTestId('invite-schedule')).toContainText('11:00');

    const form = page.getByTestId('rsvp-form');
    await expect(form.getByRole('button', { name: text('invite.send') })).toBeDisabled();
    await form.getByRole('radio', { name: text('invite.yes') }).click();
    await expect(form.getByTestId('party-size')).toHaveText('2');
    await form.getByRole('button', { name: text('invite.more') }).click();
    await expect(form.getByTestId('party-size')).toHaveText('3');
    await form.getByRole('button', { name: text('invite.send') }).click();

    const done = page.getByTestId('rsvp-done');
    await expect(done).toContainText(text('invite.seeYou'));
    await expect(done).toContainText('3 of you are coming to Sharma Wedding.');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toEqual({
      responses: [{ subEventId: null, attending: true, partySize: 3 }],
    });
    expect(sent[0]!.key).toMatch(/^[0-9a-f-]{36}$/);

    await done.getByRole('button', { name: text('invite.change') }).click();
    await form.getByRole('radio', { name: text('invite.no') }).click();
    await form.getByRole('button', { name: text('invite.send') }).click();
    await expect(done).toContainText(text('invite.thanks'));
    expect(sent[1]!.body).toEqual({ responses: [{ subEventId: null, attending: false }] });
    // A changed answer is a new request, with its own key.
    expect(sent[1]!.key).not.toBe(sent[0]!.key);
  });

  test('per sub-event: each part that takes replies is answered; invite-only ones are listed', async ({
    page,
  }) => {
    const part = (id: string, name: string, canRespond: boolean) => ({
      subEventId: id,
      subEvent: {
        id,
        name,
        startsAt: '2026-12-11T13:30:00.000Z',
        endsAt: '2026-12-11T17:30:00.000Z',
        venue: null,
      },
      responseMode: canRespond ? ('invite_rsvp' as const) : ('invite_only' as const),
      canRespond,
      status: 'invited' as const,
      partySize: 4,
      respondedAt: null,
    });
    const sangeet = '01900000-0000-7000-8000-00000000000a';
    const reception = '01900000-0000-7000-8000-00000000000b';
    const haldi = '01900000-0000-7000-8000-00000000000c';
    const sent = await serveInvite(
      page,
      invitePage({
        guestScope: 'per_sub_event',
        schedule: [],
        scopes: [
          part(sangeet, 'Sangeet', true),
          part(reception, 'Reception', true),
          part(haldi, 'Haldi', false),
        ],
      }),
    );
    await page.goto(`/i/${TOKEN}`);

    const form = page.getByTestId('rsvp-form');
    await expect(form.getByTestId('rsvp-scope')).toHaveCount(2);
    await expect(form).toContainText('No reply needed for Haldi.');
    await form
      .getByRole('radiogroup', { name: 'Coming to Sangeet?' })
      .getByRole('radio', { name: text('invite.yes') })
      .click();
    await expect(form.getByRole('button', { name: text('invite.send') })).toBeDisabled();
    await form
      .getByRole('radiogroup', { name: 'Coming to Reception?' })
      .getByRole('radio', { name: text('invite.no') })
      .click();
    await form.getByRole('button', { name: text('invite.send') }).click();

    await expect(page.getByTestId('rsvp-summary')).toContainText('Sangeet: 4 coming');
    await expect(page.getByTestId('rsvp-summary')).toContainText('Reception: not coming');
    expect(sent[0]!.body).toEqual({
      responses: [
        { subEventId: sangeet, attending: true, partySize: 4 },
        { subEventId: reception, attending: false },
      ],
    });
  });
});
