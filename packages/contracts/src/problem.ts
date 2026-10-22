import { z } from 'zod';

/** Stable error codes from docs/APIDesign.md "Error codes". Clients switch on these. */
export const ERROR_CODES = {
  bad_request: 400,
  unauthenticated: 401,
  plan_limit_reached: 402,
  forbidden: 403,
  csrf_failed: 403,
  not_found: 404,
  version_conflict: 409,
  request_in_progress: 409,
  capacity_full: 409,
  conflict: 409,
  role_in_use: 409,
  duplicate_transaction_ref: 409,
  rsvp_closed: 409,
  link_expired: 410,
  link_revoked: 410,
  payload_too_large: 413,
  unsupported_media_type: 415,
  validation_failed: 422,
  idempotency_key_reused: 422,
  client_upgrade_required: 426,
  precondition_required: 428,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_CODES;

export const ErrorCodeSchema = z.enum(Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

/**
 * Problem `type` URI for a code. Relative to the API origin (allowed by RFC 9457 §3.1.1)
 * until the production domain is chosen.
 */
export function problemType(code: ErrorCode): string {
  return `/errors/${code.replaceAll('_', '-')}`;
}

export const FieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/** RFC 9457 problem+json body, extended with a stable `code` and the request id. */
export const ProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int().min(400).max(599),
    code: ErrorCodeSchema,
    detail: z.string().optional(),
    instance: z.string().optional(),
    requestId: z.string().optional(),
    fields: z.array(FieldErrorSchema).optional(),
  })
  .loose()
  .meta({ id: 'Problem' });

export type FieldError = z.infer<typeof FieldErrorSchema>;
export type Problem = z.infer<typeof ProblemSchema>;

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
