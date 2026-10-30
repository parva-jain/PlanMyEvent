import type { AddressInfo } from 'node:net';

import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  LIVE_NAMESPACE,
  LIVE_TOPIC,
  type ClientToServerEvents,
  type CreatedEvent,
  type CreatedMemberInvite,
  type EntityChanged,
  type LiveSignal,
  type Role,
  type ServerToClientEvents,
  type SubEvent,
} from '@pme/contracts';
import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SIGN_IN_CODE_SENDER } from '../src/auth/sign-in-codes';
import { PG_POOL } from '../src/database/database.module';
import { createApp } from './create-app';
import { asUser, capturingSender, testUsers, WEB_ORIGIN } from './users';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const { codes, sender } = capturingSender();
let app: NestExpressApplication;
let url: string;
const users = testUsers(() => app, codes);
const as = (cookie: string[]) => asUser(() => app, cookie);
const sockets: Client[] = [];
// Stands in for the worker's relay: the same emitter, over the same Redis channels.
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const worker = new Emitter(redis).of(LIVE_NAMESPACE);

beforeAll(async () => {
  app = await createApp({ providers: [{ token: SIGN_IN_CODE_SENDER, value: sender }] });
  await app.listen(0);
  url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}${LIVE_NAMESPACE}`;
});
afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await users.cleanUp();
  await app.close();
  redis.disconnect();
});

const list = <T>(res: { body: unknown }) => (res.body as { data: T[] }).data;

/** A socket the way the browser opens one: WebSocket only, with the cookie and the origin. */
function connect(cookie?: string[], origin = WEB_ORIGIN): Client {
  const socket: Client = io(url, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { origin, ...(cookie ? { cookie: cookie.join('; ') } : {}) },
  });
  sockets.push(socket);
  return socket;
}
const connected = (socket: Client) =>
  new Promise<void>((resolve, reject) => {
    // It may have connected already, while the test was doing something else.
    if (socket.connected) return resolve();
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
const refused = (socket: Client) =>
  new Promise<string>((resolve) => socket.once('connect_error', (error) => resolve(error.message)));
const join = (socket: Client, eventId: unknown) =>
  // eventId is unknown on purpose: the server must refuse what isn't a uuid.
  socket.emitWithAck('event:join', { eventId: eventId as string });
/** Resolves with the first entity.changed, or null if none arrives in time. */
const nextChange = (socket: Client, ms = 1_000) =>
  new Promise<EntityChanged | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once('entity.changed', (signal) => {
      clearTimeout(timer);
      resolve(signal);
    });
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
        startsOn: '2026-12-10',
        endsOn: '2026-12-12',
        timeZone: 'Asia/Kolkata',
      })
      .expect(201)
  ).body as CreatedEvent;
  return { owner, cookie, event, E: `/v1/events/${event.id}` };
}

describe('/live sockets', () => {
  it('refuse a socket without a session, or from another site', async () => {
    expect(await refused(connect())).toBe('unauthenticated');
    const { cookie } = await users.signIn();
    expect(await refused(connect(cookie, 'https://evil.example'))).toBe('csrf_failed');
  });

  it('join an event room only as a member', async () => {
    const { cookie, event } = await wedding();
    const socket = connect(cookie);
    await connected(socket);
    expect(await join(socket, event.id)).toEqual({ ok: true });
    expect(await join(socket, 'not-a-uuid')).toEqual({ ok: false, code: 'bad_request' });

    const outsider = connect((await users.signIn()).cookie);
    await connected(outsider);
    expect(await join(outsider, event.id)).toEqual({ ok: false, code: 'not_found' });
  });

  it('a write leaves an entity.changed in the outbox, and the worker delivers it to the room only', async () => {
    const { owner, cookie, event, E } = await wedding();
    const member = connect(cookie);
    const outsider = connect((await users.signIn()).cookie);
    await Promise.all([connected(member), connected(outsider)]);
    await join(member, event.id);

    const [haldi] = list<SubEvent>(await owner.get(`${E}/sub-events`));
    await owner
      .patch(`${E}/sub-events/${haldi!.id}`)
      .set('If-Match', '"1"')
      .send({ capacity: 80 })
      .expect(200);
    const pool = app.get<Pool>(PG_POOL);
    const { rows } = await pool.query<{ payload: LiveSignal }>(
      `select payload from outbox where event_id = $1 and topic = $2 order by id desc limit 1`,
      [event.id, LIVE_TOPIC],
    );
    const signal = rows[0]!.payload;
    expect(signal).toMatchObject({
      kind: 'emit',
      room: `event:${event.id}`,
      event: 'entity.changed',
      data: { entityType: 'sub_event', entityId: haldi!.id, op: 'updated', version: 2 },
    });

    const received = nextChange(member);
    const leaked = nextChange(outsider, 500);
    if (signal.kind === 'emit') worker.to(signal.room).emit(signal.event, signal.data);
    expect(await received).toMatchObject({ entityId: haldi!.id, version: 2 });
    expect(await leaked).toBeNull();
  });

  it("a removed member's sockets leave the room and are told", async () => {
    const { owner, event, E } = await wedding();
    const viewer = list<Role>(await owner.get(`${E}/roles`)).find(
      (role) => role.name === 'Viewer',
    )!;
    const invite = (
      await owner
        .post(`${E}/member-invites`)
        .send({ grants: [{ roleId: viewer.id }] })
        .expect(201)
    ).body as CreatedMemberInvite;
    const { cookie } = await users.signIn();
    await as(cookie).post(`/v1/member-invites/${invite.token}/accept`).expect(201);
    const socket = connect(cookie);
    await connected(socket);
    expect(await join(socket, event.id)).toEqual({ ok: true });

    const member = list<{ id: string; userId: string; version: number; isOwner: boolean }>(
      await owner.get(`${E}/members`),
    ).find((item) => !item.isOwner)!;
    await owner
      .delete(`${E}/members/${member.id}`)
      .set('If-Match', `"${member.version}"`)
      .expect(204);
    const pool = app.get<Pool>(PG_POOL);
    const { rows } = await pool.query<{ payload: LiveSignal }>(
      `select payload from outbox where event_id = $1 and topic = $2 order by id`,
      [event.id, LIVE_TOPIC],
    );
    const signals = rows.map((row) => row.payload);
    expect(signals).toContainEqual({ kind: 'leave', userId: member.userId, eventId: event.id });

    const told = new Promise<unknown>((resolve) => socket.once('member.removed', resolve));
    for (const item of signals.slice(-4)) {
      if (item.kind === 'leave') {
        worker.in(`user:${item.userId}`).socketsLeave(`event:${item.eventId}`);
      } else if (item.room.startsWith('user:')) {
        worker.to(item.room).emit(item.event, item.data);
      }
    }
    expect(await told).toEqual({ eventId: event.id });
    // Out of the room: later changes don't reach them.
    const after = nextChange(socket, 500);
    worker.to(`event:${event.id}`).emit('entity.changed', { eventId: event.id });
    expect(await after).toBeNull();
  });
});
