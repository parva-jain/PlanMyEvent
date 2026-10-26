import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './create-app';

describe('health, with Postgres and Redis up', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  it('GET /v1/health/live answers without touching dependencies', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /v1/health/ready reports both dependencies up', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/ready').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      checks: { postgres: { status: 'up' }, redis: { status: 'up' } },
    });
    expect(res.headers['retry-after']).toBeUndefined();
  });
});

describe('health, with Redis down', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    // Nothing listens on port 1, so every connection is refused at once.
    app = await createApp({ REDIS_URL: 'redis://127.0.0.1:1' });
  });
  afterAll(() => app.close());

  it('still starts, and stays live', async () => {
    await request(app.getHttpServer()).get('/v1/health/live').expect(200);
  });

  it('is not ready: 503 with Retry-After, naming the dependency that is down', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/ready').expect(503);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.body).toMatchObject({
      status: 'error',
      checks: { postgres: { status: 'up' }, redis: { status: 'down' } },
    });
  });
});

describe('health, with Postgres down', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createApp({ DATABASE_URL: 'postgres://pme:pme@127.0.0.1:1/pme' });
  });
  afterAll(() => app.close());

  it('is not ready: 503, naming the dependency that is down', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/ready').expect(503);
    expect(res.body).toMatchObject({
      status: 'error',
      checks: { postgres: { status: 'down' }, redis: { status: 'up' } },
    });
  });
});
