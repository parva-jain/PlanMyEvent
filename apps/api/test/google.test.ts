import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './create-app';

const WEB_ORIGIN = 'http://localhost:3000';

/** Starts Google sign-in the way the web app's button does. */
const startGoogle = (app: NestExpressApplication) =>
  request(app.getHttpServer())
    .post('/v1/auth/sign-in/social')
    .set('Origin', WEB_ORIGIN)
    .send({ provider: 'google', callbackURL: `${WEB_ORIGIN}/app` });

// Real Google can't run in CI; these check our side of the handshake with fake credentials.
describe('Google sign-in, with credentials set', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createApp({
      env: { GOOGLE_CLIENT_ID: 'test-client-id', GOOGLE_CLIENT_SECRET: 'test-client-secret' },
    });
  });
  afterAll(() => app.close());

  it('redirects to Google with our client id and the API callback URL', async () => {
    const res = await startGoogle(app).expect(200);
    const url = new URL((res.body as { url: string }).url);

    expect(url.host).toBe('accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4000/v1/auth/callback/google',
    );
    expect(url.searchParams.get('scope')).toContain('email');
    // CSRF protection for the OAuth round trip.
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('refuses a callback URL outside the web app', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/sign-in/social')
      .set('Origin', WEB_ORIGIN)
      .send({ provider: 'google', callbackURL: 'https://evil.example/steal' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('Google sign-in, without credentials', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    // Blank values count as unset, overriding any local apps/api/.env.
    app = await createApp({ env: { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' } });
  });
  afterAll(() => app.close());

  it('is off', async () => {
    const res = await startGoogle(app);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
