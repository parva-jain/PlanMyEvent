import {
  applyDecorators,
  createParamDecorator,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, canSomewhere, type Permission } from '@pme/contracts';
import { ActionError, type ActionContext, type MemberAccess } from '@pme/core';

import type { AuthedRequest } from '../auth/session';
import { PermissionCache } from './permission-cache';

const ACCESS = 'eventAccess';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How the guard picks the scope (APIDesign "How a route declares access"):
 * - 'event' (default): needs a whole-event grant.
 * - 'list': granted anywhere; the handler filters to the sub-events it covers.
 * - { param }: the sub-event named by that route param, or the whole event.
 * - permission null: any active member (E/me, leave).
 */
export type EventScope = 'event' | 'list' | { param: string };

interface EventAccessRule {
  permission: Permission | null;
  scope: EventScope;
}

export type EventRequest = AuthedRequest & {
  params: Record<string, string | undefined>;
  eventAccess?: MemberAccess;
};

/**
 * Checks `:eventId` before the handler: non-members get 404, members without the permission
 * 403 naming it (APIDesign "404 or 403"). Writes are checked again inside their core action's
 * transaction, without the cache; this guard is what protects reads.
 */
@Injectable()
export class EventAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.get<EventAccessRule>(ACCESS, context.getHandler());
    const req = context.switchToHttp().getRequest<EventRequest>();
    const eventId = req.params.eventId;
    if (!rule || !eventId || !req.user) {
      throw new Error('EventAccessGuard needs @EventRoute(permission), :eventId and a session');
    }
    const access = UUID.test(eventId)
      ? await this.permissions.forUser(eventId.toLowerCase(), req.user.id)
      : null;
    if (!access) throw new ActionError('not_found', 'Event not found');
    req.eventAccess = access;

    const { permission, scope } = rule;
    if (permission === null) return true;
    const allowed =
      scope === 'list'
        ? canSomewhere(access, permission)
        : can(
            access,
            permission,
            scope === 'event' ? null : req.params[scope.param]?.toLowerCase(),
          );
    if (!allowed) {
      throw new ActionError('forbidden', `You need the ${permission} permission`, { permission });
    }
    return true;
  }
}

/** Marks a handler as an event route needing `permission` on `:eventId`. */
export const EventRoute = (permission: Permission | null, scope: EventScope = 'event') =>
  applyDecorators(
    SetMetadata(ACCESS, { permission, scope } satisfies EventAccessRule),
    UseGuards(EventAccessGuard),
  );

/** The caller's effective permissions, as the guard resolved them. */
export const EventAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MemberAccess => {
    const access = context.switchToHttp().getRequest<EventRequest>().eventAccess;
    if (!access) throw new Error('EventAccess used without @EventRoute');
    return access;
  },
);

/** ActionContext for core actions on this event, by the signed-in member. */
export const EventContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActionContext => {
    const req = context.switchToHttp().getRequest<EventRequest>();
    if (!req.user) throw new Error('EventContext used without a session');
    return {
      requestId: req.id ?? 'unknown',
      channel: 'app',
      actor: { kind: 'user', userId: req.user.id, memberId: req.eventAccess?.memberId ?? null },
      eventId: req.params.eventId!.toLowerCase(),
      now: new Date(),
    };
  },
);
