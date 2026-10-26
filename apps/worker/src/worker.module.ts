import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigModule, WORKER_ENV } from './config/config.module';
import type { WorkerEnv } from './config/env';
import { redisConnection } from './config/redis-connection';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { LifecycleService } from './lifecycle/lifecycle.service';
import { OutboxModule } from './outbox/outbox.module';
import { SampleModule } from './queues/sample/sample.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [WORKER_ENV],
      useFactory: (env: WorkerEnv) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    BullModule.forRootAsync({
      inject: [WORKER_ENV],
      useFactory: (env: WorkerEnv) => ({ connection: redisConnection(env.REDIS_URL) }),
    }),
    DatabaseModule,
    OutboxModule,
    EmailModule,
    SampleModule,
  ],
  providers: [LifecycleService],
})
export class WorkerModule {}
