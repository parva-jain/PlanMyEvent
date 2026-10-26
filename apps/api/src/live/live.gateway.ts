import { Logger } from '@nestjs/common';
import {
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';

type JoinAck = { ok: true } | { ok: false; code: string };

/**
 * Stub of the /live namespace (APIDesign "Real-time contract"). Sockets carry only
 * "something changed" signals. Auth on connect lands in M2, rooms and signals in M5.
 */
@WebSocketGateway({ namespace: '/live' })
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LiveGateway.name);

  handleConnection(client: Socket): void {
    this.logger.debug(`socket connected ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`socket disconnected ${client.id}`);
  }

  @SubscribeMessage('event:join')
  join(): JoinAck {
    // TODO(M5): check active membership and event.view, then join room event:{eventId}.
    return { ok: false, code: 'unauthenticated' };
  }

  @SubscribeMessage('event:leave')
  leave(): JoinAck {
    return { ok: true };
  }
}
