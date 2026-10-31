import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobStatusSchema } from '@pme/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { CurrentUser, type SessionUser } from '../auth/session';
import { UuidPipe } from '../http/uuid.pipe';
import { JobStatuses } from './job-statuses';

export class JobStatusDto extends createZodDto(JobStatusSchema) {}

/** GET /v1/jobs/{jobId}: a job I started (APIDesign "Async jobs"); the socket is the fast path. */
@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly statuses: JobStatuses) {}

  @Get(':jobId')
  @ZodResponse({ type: JobStatusDto })
  async get(@Param('jobId', UuidPipe) jobId: string, @CurrentUser() user: SessionUser) {
    const { userId: _userId, ...status } = await this.statuses.forUser(jobId, user.id);
    return status;
  }
}
