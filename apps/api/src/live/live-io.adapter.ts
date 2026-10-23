import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * WebSocket-only transport (no sticky sessions needed) and CORS for the web origin.
 * The Redis adapter for multi-instance fan-out arrives in milestone 5.
 */
export class LiveIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly webOrigin: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      cors: { origin: this.webOrigin, credentials: true },
    }) as Server;
  }
}
