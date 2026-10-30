import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';

import { ActivityModule } from './activity/activity.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ProblemFilter } from './errors/problem.filter';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { ETagInterceptor } from './http/etag.interceptor';
import { IdempotencyInterceptor } from './http/idempotency.interceptor';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { LiveModule } from './live/live.module';
import { LoggingModule } from './logging/logging.module';
import { MeModule } from './me/me.module';
import { RedisModule } from './redis/redis.module';
import { TeamModule } from './team/team.module';

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
    EventsModule,
    TeamModule,
    ActivityModule,
    LiveModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // Outermost first: ETag sees the final body (fresh or replayed); idempotency stores the
    // serialized body.
    { provide: APP_INTERCEPTOR, useClass: ETagInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}
