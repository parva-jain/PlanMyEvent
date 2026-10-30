import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * WebSocket-only transport (no sticky sessions needed), and the Redis adapter, so a signal
 * published by the worker (or another API instance) reaches sockets on every instance
 * (SystemDesign "Real-time"). Redis down: sockets stay connected and signals wait in the
 * outbox; the clients' 30 s polling covers the gap.
 */
export class LiveIoAdapter extends IoAdapter {
  private readonly clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly env: { WEB_ORIGIN: string; REDIS_URL: string },
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      cors: { origin: this.env.WEB_ORIGIN, credentials: true },
    }) as Server;
    const pub = new Redis(this.env.REDIS_URL);
    const sub = pub.duplicate();
    for (const client of [pub, sub]) {
      // Reconnects on its own; the API's Redis module already logs outages.
      client.on('error', () => undefined);
      this.clients.push(client);
    }
    server.adapter(createAdapter(pub, sub));
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    for (const client of this.clients) client.disconnect();
  }
}
