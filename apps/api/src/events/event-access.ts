import {
  createParamDecorator,
  Inject,
  Injectable,
  SetMetadata,
  applyDecorators,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@pme/contracts';
import { ActionError, type ActionContext } from '@pme/core';
import { canAccessEvent, type Database } from '@pme/db';

import type { AuthedRequest } from '../auth/session';
import { DB } from '../database/database.module';

const PERMISSION = 'eventPermission';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks `:eventId` access before the handler (APIDesign "Authorization"): non-members get
 * 404. Writes are checked again inside their core action's transaction; this guard is what
 * protects reads. Milestone 4 swaps `canAccessEvent` for effective permissions with
 * sub-event scope.
 */
@Injectable()
export class EventAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<Permission>(PERMISSION, context.getHandler());
    const req = context
      .switchToHttp()
      .getRequest<AuthedRequest & { params: { eventId?: string } }>();
    const eventId = req.params.eventId;
    if (!permission || !eventId || !req.user) {
      throw new Error('EventAccessGuard needs @EventRoute(permission), :eventId and a session');
    }
    if (!UUID.test(eventId) || !(await canAccessEvent(this.db, eventId, req.user.id, permission))) {
      throw new ActionError('not_found', 'Event not found');
    }
    return true;
  }
}

/** Marks a handler as an event route needing `permission` on `:eventId`. */
export const EventRoute = (permission: Permission) =>
  applyDecorators(SetMetadata(PERMISSION, permission), UseGuards(EventAccessGuard));

/** ActionContext for core actions on this event, by the signed-in user. */
export const EventContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActionContext => {
    const req = context
      .switchToHttp()
      .getRequest<AuthedRequest & { params: { eventId: string } }>();
    if (!req.user) throw new Error('EventContext used without a session');
    return {
      requestId: req.id ?? 'unknown',
      channel: 'app',
      actor: { kind: 'user', userId: req.user.id, memberId: null },
      eventId: req.params.eventId.toLowerCase(),
      now: new Date(),
    };
  },
);
