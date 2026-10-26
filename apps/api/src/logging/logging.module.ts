import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';
import { redactUrl } from './redact-url';
import { genRequestId } from './request-id';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req, res) => req.id ?? genRequestId(req, res),
          customProps: (req) => ({ requestId: req.id }),
          autoLogging: { ignore: (req) => req.url?.startsWith('/v1/health') ?? false },
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: redactUrl(req.url),
            }),
          },
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
