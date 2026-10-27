import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ActionError } from '@pme/core';
import type { Request } from 'express';

/**
 * The version a PATCH, PUT or DELETE expects, from `If-Match: "3"` (CLAUDE.md rule 8):
 * 428 when missing, 400 when it isn't a version this API issued.
 */
export const IfMatch = createParamDecorator((_data: unknown, context: ExecutionContext): number => {
  const header = context.switchToHttp().getRequest<Request>().headers['if-match'];
  if (!header) {
    throw new ActionError('precondition_required', 'Send If-Match with the version you edited');
  }
  const match = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim());
  if (!match) {
    throw new ActionError('bad_request', 'If-Match must be a version, e.g. "3"');
  }
  return Number(match[1]);
});
