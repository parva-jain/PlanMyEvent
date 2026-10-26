import type { NestExpressApplication } from '@nestjs/platform-express';
import { PROBLEM_CONTENT_TYPE, type Problem } from '@pme/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './create-app';

type ProblemBody = Problem & { requestId: string };

let app: NestExpressApplication;
beforeAll(async () => {
  app = await createApp();
});
afterAll(() => app.close());

describe('problem+json errors (RFC 9457)', () => {
  it('404 for an unknown route', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nope').expect(404);
    expect(res.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
    expect(res.body).toMatchObject({ status: 404, code: 'not_found', title: 'Not found' });
    expect((res.body as ProblemBody).type).toMatch(/\/errors\/not-found$/);
  });

  it('400 for malformed JSON, before any route runs', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/health/live')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(res.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
    expect(res.body).toMatchObject({ status: 400, code: 'bad_request' });
  });

  it('413 for a JSON body over 1 MB', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/health/live')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }))
      .expect(413);
    expect(res.body).toMatchObject({ status: 413, code: 'payload_too_large' });
  });

  it('never leaks internals: no stack trace and no X-Powered-By', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nope');
    expect(JSON.stringify(res.body)).not.toMatch(/at .+\.(ts|js):\d+/);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('X-Request-Id', () => {
  it('is generated for every response, and matches the requestId in errors', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nope');
    expect(res.headers['x-request-id']).toMatch(/^req_/);
    expect((res.body as ProblemBody).requestId).toBe(res.headers['x-request-id']);
  });

  it("echoes a well-formed client id, so one trace spans the client's logs and ours", async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health/live')
      .set('X-Request-Id', 'web-1234')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('web-1234');
  });

  it('is on body-parser errors too, which fail before Nest routing', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/health/live')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(res.headers['x-request-id']).toMatch(/^req_/);
    expect((res.body as ProblemBody).requestId).toBe(res.headers['x-request-id']);
  });
});
