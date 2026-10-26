import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { EmailJobSchema, QUEUES } from '@pme/contracts';
import type { Job } from 'bullmq';

import { renderEmail } from './templates';
import { EMAIL_TRANSPORT, type EmailTransport } from './transports';

/**
 * email-critical queue (SystemDesign 5.3): sign-in codes now, member invites in milestone 4.
 * Logs the job id and template only: never the address or the code.
 */
@Processor(QUEUES.emailCritical, { concurrency: 10 })
export class EmailCriticalProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailCriticalProcessor.name);

  constructor(@Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    const email = EmailJobSchema.parse(job.data);
    await this.transport.send({ to: email.to, ...renderEmail(email) });
    this.logger.log(`sent ${email.template} email (job ${job.id})`);
  }
}
