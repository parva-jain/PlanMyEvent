import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { CreatedEvent } from '@pme/contracts';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/** en.json, so expected text follows copy edits. */
export const messages = JSON.parse(
  readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, unknown>>;

/** Looks up `a.b.c` in en.json. */
export function text(path: string): string {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages) as string;
}

/** The API Playwright starts (playwright.config.ts) and Mailpit's API. */
export const API_URL = 'http://localhost:4100';
export const WEB_ORIGIN = 'http://localhost:3100';
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

export const isPhone = () => test.info().project.name === 'phone';
export const newEmail = () => `e2e-${randomUUID()}@test.local`;
export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

/** Reads the sign-in code the worker emailed to Mailpit (outbox → relay → queue → SMTP). */
export async function codeFromMailpit(email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages: found } = (await res.json()) as { messages: { Subject: string }[] };
    const code = found[0]?.Subject.match(/^(\d{6}) /)?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in code for ${email} in Mailpit`);
}

/**
 * Signs a new user in through the API with the page's own cookie jar (no UI), names them,
 * and returns a request context that writes like the web app (Origin set). For tests about
 * what comes after sign-in; auth.spec.ts covers the sign-in screens.
 */
export async function signUp(page: Page, name = 'Priya Sharma'): Promise<APIRequestContext> {
  const email = newEmail();
  const headers = { Origin: WEB_ORIGIN, 'X-Forwarded-For': randomIp() };
  const api = page.context().request;
  expect(
    (
      await api.post(`${API_URL}/v1/auth/email-otp/send-verification-otp`, {
        headers,
        data: { email, type: 'sign-in' },
      })
    ).ok(),
  ).toBe(true);
  const otp = await codeFromMailpit(email);
  expect(
    (
      await api.post(`${API_URL}/v1/auth/sign-in/email-otp`, { headers, data: { email, otp } })
    ).ok(),
  ).toBe(true);
  expect((await api.patch(`${API_URL}/v1/me`, { headers, data: { name } })).ok()).toBe(true);
  return api;
}

/** Creates a wedding through the API, to start tests that are about using an event. */
export async function weddingVia(api: APIRequestContext, name = 'Sharma Wedding') {
  const res = await api.post(`${API_URL}/v1/events`, {
    headers: { Origin: WEB_ORIGIN },
    data: {
      templateKey: 'wedding',
      name,
      startsOn: '2026-12-10',
      endsOn: '2026-12-12',
      timeZone: 'Asia/Kolkata',
      venue: { name: 'Radisson Lawn' },
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as CreatedEvent;
}
