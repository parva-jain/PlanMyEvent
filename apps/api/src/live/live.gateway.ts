import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  canSomewhere,
  eventRoom,
  EventJoinSchema,
  LIVE_NAMESPACE,
  MAX_EVENT_ROOMS,
  MAX_SOCKETS_PER_USER,
  userRoom,
  type ClientToServerEvents,
  type JoinAck,
  type ServerToClientEvents,
} from '@pme/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import type { Namespace, Socket } from 'socket.io';

import { AUTH, type Auth } from '../auth/auth';
import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';
import { PermissionCache } from '../events/permission-cache';

interface SocketData {
  userId: string;
}
type LiveSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type LiveNamespace = Namespace<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

/** connect_error messages the client can act on. */
const REFUSED = {
  unauthenticated: 'unauthenticated',
  csrfFailed: 'csrf_failed',
  tooManySockets: 'too_many_sockets',
} as const;

/**
 * The /live namespace (APIDesign "Real-time contract"). Sockets carry only "something
 * changed" signals, published by the worker from the outbox; clients re-fetch through REST.
 * A socket signs in with the session cookie and joins its user room; it joins an event's room
 * only as an active member, checked like any read (PermissionCache, Postgres behind it).
 */
@WebSocketGateway({ namespace: LIVE_NAMESPACE })
export class LiveGateway implements OnGatewayInit<LiveNamespace> {
  private readonly logger = new Logger(LiveGateway.name);

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly permissions: PermissionCache,
  ) {}

  /** Signs every socket in before it connects; refusals arrive as connect_error. */
  afterInit(namespace: LiveNamespace): void {
    namespace.use((socket, next) => {
      this.signIn(socket).then(next, (error: unknown) => {
        this.logger.warn(`Socket sign-in failed: ${String(error)}`);
        next(new Error(REFUSED.unauthenticated));
      });
    });
  }

  private async signIn(socket: LiveSocket): Promise<Error | undefined> {
    const { headers } = socket.request;
    // Cookie-authenticated sockets must come from the web app: CORS doesn't cover WebSockets,
    // so without this another site could open one with the user's cookie.
    if (headers.origin !== this.env.WEB_ORIGIN) return new Error(REFUSED.csrfFailed);
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) return new Error(REFUSED.unauthenticated);
    const userId = session.user.id;
    // Counted per API instance; several tabs and devices fit well within it.
    const open = socket.nsp.adapter.rooms.get(userRoom(userId))?.size ?? 0;
    if (open >= MAX_SOCKETS_PER_USER) return new Error(REFUSED.tooManySockets);
    socket.data.userId = userId;
    await socket.join(userRoom(userId));
    return undefined;
  }

  @SubscribeMessage('event:join')
  async join(
    @ConnectedSocket() socket: LiveSocket,
    @MessageBody() body: unknown,
  ): Promise<JoinAck> {
    const parsed = EventJoinSchema.safeParse(body);
    if (!parsed.success) return { ok: false, code: 'bad_request' };
    const room = eventRoom(parsed.data.eventId.toLowerCase());
    if (socket.rooms.has(room)) return { ok: true };
    const joined = [...socket.rooms].filter((name) => name.startsWith('event:')).length;
    if (joined >= MAX_EVENT_ROOMS) return { ok: false, code: 'too_many_rooms' };

    const access = await this.permissions.forUser(
      parsed.data.eventId.toLowerCase(),
      socket.data.userId,
    );
    // Same answers as REST: 404 for non-members, 403 without event.view anywhere.
    if (!access) return { ok: false, code: 'not_found' };
    if (!canSomewhere(access, 'event.view')) return { ok: false, code: 'forbidden' };
    await socket.join(room);
    return { ok: true };
  }

  @SubscribeMessage('event:leave')
  async leave(
    @ConnectedSocket() socket: LiveSocket,
    @MessageBody() body: unknown,
  ): Promise<JoinAck> {
    const parsed = EventJoinSchema.safeParse(body);
    if (parsed.success) await socket.leave(eventRoom(parsed.data.eventId.toLowerCase()));
    return { ok: true };
  }
}
