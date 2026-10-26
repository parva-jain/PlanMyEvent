import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@pme/contracts';

import { WORKER_ENV } from '../config/config.module';
import type { WorkerEnv } from '../config/env';
import { EmailCriticalProcessor } from './email.processor';
import { EMAIL_TRANSPORT, resendTransport, smtpTransport } from './transports';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.emailCritical })],
  providers: [
    {
      provide: EMAIL_TRANSPORT,
      inject: [WORKER_ENV],
      useFactory: (env: WorkerEnv) =>
        env.EMAIL_TRANSPORT === 'resend'
          ? resendTransport(env.RESEND_API_KEY!, env.EMAIL_FROM)
          : smtpTransport(env.SMTP_URL, env.EMAIL_FROM),
    },
    EmailCriticalProcessor,
  ],
})
export class EmailModule {}
