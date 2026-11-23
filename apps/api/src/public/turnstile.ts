import { Inject, Injectable, Logger } from '@nestjs/common';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Cloudflare's documented always-pass test secret: nothing to ask, so no network call. */
export const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';
const TIMEOUT_MS = 5_000;

/** Checks a Turnstile token from a public form; injectable so tests can swap it. */
export interface TurnstileVerifier {
  /** True for a real visitor; throws when Cloudflare can't be reached. */
  verify(token: string, ip: string | undefined): Promise<boolean>;
}

export const TURNSTILE_VERIFIER = Symbol('TURNSTILE_VERIFIER');

/**
 * Cloudflare's siteverify (APIDesign "Public registration: plus Turnstile"). Every token is
 * single-use and valid for 5 minutes; Cloudflare says whether it was solved by a person.
 */
@Injectable()
export class CloudflareTurnstile implements TurnstileVerifier {
  private readonly logger = new Logger('Turnstile');

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  async verify(token: string, ip: string | undefined): Promise<boolean> {
    // Development, CI and e2e use the test secret: they work offline.
    if (this.env.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET) return token.length > 0;
    const body = new URLSearchParams({ secret: this.env.TURNSTILE_SECRET_KEY, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Turnstile siteverify answered ${res.status}`);
    const result = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    if (!result.success) {
      this.logger.debug(`Turnstile refused: ${(result['error-codes'] ?? []).join(', ')}`);
    }
    return result.success;
  }
}
