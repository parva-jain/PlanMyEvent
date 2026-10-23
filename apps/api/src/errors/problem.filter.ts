import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { PROBLEM_CONTENT_TYPE } from '@pme/contracts';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';

import { toProblem } from './problem';

/** Every HTTP error leaves as application/problem+json with a stable code (CLAUDE.md rule 9). */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();
    const { problem, expected } = toProblem(exception);

    if (!expected) {
      this.logger.error(exception);
      Sentry.captureException(exception, { tags: { requestId: req.id } });
    }

    if (res.headersSent) {
      return;
    }
    res
      .status(problem.status)
      .type(PROBLEM_CONTENT_TYPE)
      .json({ ...problem, requestId: req.id });
  }
}
