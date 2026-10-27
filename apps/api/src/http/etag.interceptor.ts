import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { tap, type Observable } from 'rxjs';

/** Versioned resources answer with `ETag: "<version>"` (APIDesign "Headers"). */
@Injectable()
export class ETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap((body: unknown) => {
        if (context.getType() !== 'http') return;
        const version = (body as { version?: unknown } | null)?.version;
        if (typeof version === 'number') {
          context.switchToHttp().getResponse<Response>().setHeader('ETag', `"${version}"`);
        }
      }),
    );
  }
}
