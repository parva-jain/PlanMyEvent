import { HttpException, HttpStatus } from '@nestjs/common';
import { ActionError } from '@pme/core';
import {
  ERROR_CODES,
  problemType,
  type ErrorCode,
  type FieldError,
  type Problem,
} from '@pme/contracts';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

const DEFAULT_CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'bad_request',
  401: 'unauthenticated',
  402: 'plan_limit_reached',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'validation_failed',
  428: 'precondition_required',
  429: 'rate_limited',
  503: 'service_unavailable',
};

const TITLES: Partial<Record<ErrorCode, string>> = {
  bad_request: 'The request could not be read',
  unauthenticated: 'Sign in to continue',
  forbidden: 'You do not have permission to do this',
  not_found: 'Not found',
  payload_too_large: 'The request is too large',
  validation_failed: 'Some fields need attention',
  rate_limited: 'Too many requests, try again shortly',
  internal_error: 'Something went wrong on our side',
  service_unavailable: 'The service is temporarily unavailable',
};

/** Body-parser errors carry an http-errors `status`/`type` instead of being HttpExceptions. */
interface HttpLikeError {
  status: number;
  type?: string;
  expose?: boolean;
  message: string;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    error instanceof Error &&
    typeof (error as Partial<HttpLikeError>).status === 'number' &&
    (error as Partial<HttpLikeError>).expose === true
  );
}

function fieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function build(code: ErrorCode, status: number, detail?: string, extra: object = {}): Problem {
  return {
    type: problemType(code),
    title: TITLES[code] ?? code.replaceAll('_', ' '),
    status,
    code,
    ...(detail ? { detail } : {}),
    ...extra,
  };
}

/** Maps anything thrown into an RFC 9457 problem. `expected` is false for real bugs. */
export function toProblem(error: unknown): { problem: Problem; expected: boolean } {
  if (error instanceof ZodValidationException) {
    const zodError = error.getZodError();
    const fields = zodError instanceof ZodError ? fieldErrors(zodError) : [];
    return {
      problem: build('validation_failed', 422, 'The request did not match the schema.', { fields }),
      expected: true,
    };
  }
  if (error instanceof ActionError) {
    return {
      problem: build(error.code, ERROR_CODES[error.code], error.message, error.details),
      expected: true,
    };
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const code =
      DEFAULT_CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal_error' : 'bad_request');
    const detail = status >= 500 ? undefined : error.message;
    return { problem: build(code, status, detail), expected: status < 500 };
  }
  if (isHttpLikeError(error)) {
    const code = error.type === 'entity.too.large' ? 'payload_too_large' : 'bad_request';
    return { problem: build(code, error.status, error.message), expected: true };
  }
  return {
    problem: build('internal_error', HttpStatus.INTERNAL_SERVER_ERROR),
    expected: false,
  };
}
