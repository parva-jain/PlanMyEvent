import { describe, expect, it } from 'vitest';

import { publishLive, type Publisher } from './live-publisher';

const EVENT = '01900000-0000-7000-8000-000000000001';
const USER = '01900000-0000-7000-8000-000000000002';

function recorder(fail = false) {
  const sent: { channel: string; message: string }[] = [];
  const publisher: Publisher = {
    publish: (channel, message) => {
      sent.push({ channel, message: message.toString('latin1') });
      return fail ? Promise.reject(new Error('Connection is closed')) : Promise.resolve(1);
    },
  };
  return { sent, publisher };
}

describe('publishLive', () => {
  it("broadcasts to an event room on the /live namespace's adapter channel", async () => {
    const { sent, publisher } = recorder();
    await publishLive(publisher, {
      kind: 'emit',
      room: `event:${EVENT}`,
      event: 'entity.changed',
      data: { eventId: EVENT },
    });
    expect(sent).toHaveLength(1);
    // The Redis adapter's per-room channel: <key>#<namespace>#<room>#.
    expect(sent[0]!.channel).toBe(`socket.io#/live#event:${EVENT}#`);
    expect(sent[0]!.message).toContain('entity.changed');
  });

  it("asks every API instance to take a user's sockets out of an event room", async () => {
    const { sent, publisher } = recorder();
    await publishLive(publisher, { kind: 'leave', userId: USER, eventId: EVENT });
    expect(sent[0]!.channel).toBe('socket.io-request#/live#');
    expect(sent[0]!.message).toContain(`user:${USER}`);
    expect(sent[0]!.message).toContain(`event:${EVENT}`);
  });

  it('rejects when Redis does, so the outbox row is retried', async () => {
    const { publisher } = recorder(true);
    await expect(
      publishLive(publisher, { kind: 'leave', userId: USER, eventId: EVENT }),
    ).rejects.toThrow('Connection is closed');
  });
});
