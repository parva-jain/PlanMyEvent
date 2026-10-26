import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ActionContext } from '@pme/core';
import type { Request } from 'express';

/** The signed-in user, as the session guard attaches it to the request. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  locale: string;
}

export type AuthedRequest = Request & { id?: string; user?: SessionUser; sessionId?: string };

function signedInUser(req: AuthedRequest): SessionUser {
  if (!req.user) {
    throw new Error('Used on a public route: the session guard did not run');
  }
  return req.user;
}

/** `@CurrentUser() user: SessionUser` in a controller method behind the session guard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  signedInUser(context.switchToHttp().getRequest<AuthedRequest>()),
);

/**
 * `@UserContext() ctx: ActionContext` for core actions run by the signed-in user. Event
 * routes (milestone 3) will add eventId and the member id.
 */
export const UserContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActionContext => {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    return {
      requestId: req.id ?? 'unknown',
      channel: 'app',
      actor: { kind: 'user', userId: signedInUser(req).id, memberId: null },
      eventId: null,
      now: new Date(),
    };
  },
);
