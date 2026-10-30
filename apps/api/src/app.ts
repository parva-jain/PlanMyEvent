import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { Logger } from 'nestjs-pino';

import { AUTH, type Auth } from './auth/auth';
import { API_ENV } from './config/config.module';
import type { ApiEnv } from './config/env';
import { LiveIoAdapter } from './live/live-io.adapter';
import { genRequestId } from './logging/request-id';
import { setupOpenApi } from './openapi/openapi';

/** Shared by main.ts and the e2e tests so both run the same HTTP setup. */
export function configureApp(app: NestExpressApplication): ApiEnv {
  const env = app.get<ApiEnv>(API_ENV);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('v1');
  // Request id before the body parser, so even malformed-JSON errors carry one.
  app.use((req: Request & { id?: string }, res: Response, next: NextFunction) => {
    req.id = genRequestId(req, res);
    next();
  });
  // CORS before anything that answers requests, Better Auth included: the web app calls
  // every route cross-origin.
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'ETag'],
  });
  // Better Auth reads its own request bodies, so it goes before the JSON parser.
  app.use('/v1/auth', toNodeHandler(app.get<Auth>(AUTH)));
  app.useBodyParser('json', { limit: '1mb' });
  app.useWebSocketAdapter(new LiveIoAdapter(app, env));
  app.set('trust proxy', 1);
  // ETag is the resource version (APIDesign), never Express's body hash.
  app.set('etag', false);
  app.disable('x-powered-by');
  if (env.NODE_ENV !== 'production') {
    setupOpenApi(app);
  }
  return env;
}
