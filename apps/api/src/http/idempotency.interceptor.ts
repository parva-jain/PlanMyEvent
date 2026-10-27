import { createHash } from 'node:crypto';

import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ActionError } from '@pme/core';
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
  type Database,
} from '@pme/db';
import type { Response } from 'express';
import { catchError, from, of, switchMap, throwError, type Observable } from 'rxjs';

import type { AuthedRequest } from '../auth/session';
import { DB } from '../database/database.module';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Idempotency-Key on POST (APIDesign "Idempotency-Key", CLAUDE.md rule 7): the first request
 * runs and its response is stored; a retry with the same key and body gets that response
 * again, a different body gets 422, and a retry while the first still runs gets 409.
 * Keys are scoped per user. Failed requests release their key so the retry runs for real.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.headers['idempotency-key'];
    if (req.method !== 'POST' || typeof key !== 'string' || !req.user) {
      return next.handle();
    }
    if (!KEY_PATTERN.test(key)) {
      throw new ActionError('bad_request', 'Idempotency-Key must be 8-128 letters, digits, - or _');
    }
    const scope = `user:${req.user.id}`;
    // Nest sets the status after interceptors run, so take it from the route: @HttpCode or 201.
    const status = this.reflector.get<number>(HTTP_CODE_METADATA, context.getHandler()) ?? 201;
    const hash = createHash('sha256')
      .update(`${req.method} ${req.originalUrl}\n${JSON.stringify(req.body ?? null)}`)
      .digest();

    return from(claimIdempotencyKey(this.db, scope, key, hash)).pipe(
      switchMap((claim) => {
        switch (claim.kind) {
          case 'replay':
            res.setHeader('Idempotent-Replayed', 'true');
            return of(claim.body);
          case 'in_progress':
            res.setHeader('Retry-After', '1');
            return throwError(
              () =>
                new ActionError(
                  'request_in_progress',
                  'The first request with this key is still running',
                ),
            );
          case 'reused':
            return throwError(
              () =>
                new ActionError(
                  'idempotency_key_reused',
                  'This key was used for a different request',
                ),
            );
          case 'claimed':
            return next.handle().pipe(
              switchMap((body) =>
                from(completeIdempotencyKey(this.db, scope, key, status, body ?? null)).pipe(
                  switchMap(() => of(body)),
                ),
              ),
              catchError((error: unknown) =>
                from(releaseIdempotencyKey(this.db, scope, key)).pipe(
                  switchMap(() => throwError(() => error)),
                ),
              ),
            );
        }
      }),
    );
  }
}
