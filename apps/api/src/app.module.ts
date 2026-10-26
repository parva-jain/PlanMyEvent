import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';

import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ProblemFilter } from './errors/problem.filter';
import { HealthModule } from './health/health.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { LiveModule } from './live/live.module';
import { LoggingModule } from './logging/logging.module';
import { MeModule } from './me/me.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule,
    LoggingModule,
    LifecycleModule,
    DatabaseModule,
    RedisModule,
    AuthModule,
    HealthModule,
    MeModule,
    LiveModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}
