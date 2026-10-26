import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActionError } from '@pme/core';
import { fromNodeHeaders } from 'better-auth/node';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';
import { AUTH, type Auth } from './auth';
import { IS_PUBLIC } from './public.decorator';
import type { AuthedRequest } from './session';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Every route needs a session unless marked @Public() (APIDesign "Authentication").
 * Cookie-authenticated writes must also come from the web app's origin (APIDesign
 * "CSRF and CORS"); bearer-token clients (mobile, later) are exempt.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const usesCookie = Boolean(req.headers.cookie) && !req.headers.authorization;
    if (usesCookie && !SAFE_METHODS.has(req.method) && req.headers.origin !== this.env.WEB_ORIGIN) {
      throw new ActionError('csrf_failed', 'Requests must come from the Plan My Event app');
    }

    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      throw new ActionError('unauthenticated', 'Sign in to continue');
    }
    const { user } = session;
    req.sessionId = session.session.id;
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone ?? null,
      avatarUrl: user.image ?? null,
      locale: (user.locale as string | undefined) ?? 'en',
    };
    return true;
  }
}
