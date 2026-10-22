import { ERROR_CODES, type ErrorCode } from '@pme/contracts';

/** Domain error carrying a stable API error code; the API maps it to problem+json. */
export class ActionError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ActionError';
    this.status = ERROR_CODES[code];
  }
}
