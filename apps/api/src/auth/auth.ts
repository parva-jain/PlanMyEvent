import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { newId, schema, type Database } from '@pme/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins';

import type { ApiEnv } from '../config/env';
import type { RateLimiter } from './rate-limit';
import type { SignInCodeSender } from './sign-in-codes';

const DAY = 24 * 60 * 60;
/** APIDesign "Authentication": 30-day sliding sessions. */
const SESSION_SECONDS = 30 * DAY;
const CODE_SECONDS = 5 * 60;

/** APIDesign "Rate limits". Better Auth keys these by IP and path. */
const IP_RULES = {
  '/email-otp/send-verification-otp': { window: 60 * 60, max: 20 },
  '/sign-in/email-otp': { window: 15 * 60, max: 10 },
};
/** Per email address, on top of the IP limit: protects inboxes and the email budget. */
const CODES_PER_EMAIL = { window: 15 * 60, max: 5 };

export const AUTH = Symbol('AUTH');

export interface AuthDeps {
  env: ApiEnv;
  db: Database;
  rateLimiter: RateLimiter;
  signInCodes: SignInCodeSender;
  /** Runs after the user row commits (Better Auth's `after` hooks run post-commit). */
  onUserCreated: (user: { id: string; name: string }) => Promise<void>;
}

/**
 * Better Auth, mounted at /v1/auth (APIDesign "Sign-in endpoints"): Google and email OTP,
 * sessions in Postgres (never only in Redis, CLAUDE.md rule 12), UUIDv7 ids, OTPs stored
 * hashed, codes delivered through the outbox.
 */
export function createAuth({ env, db, rateLimiter, signInCodes, onUserCreated }: AuthDeps) {
  const logger = new Logger('Auth');
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {};

  return betterAuth({
    appName: 'Plan My Event',
    baseURL: env.API_URL,
    basePath: '/v1/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      transaction: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
    }),
    user: {
      fields: { image: 'avatarUrl' },
      additionalFields: {
        phone: { type: 'string', required: false, input: false },
        locale: { type: 'string', required: false, defaultValue: 'en', input: false },
      },
    },
    session: { expiresIn: SESSION_SECONDS, updateAge: DAY },
    socialProviders: google,
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: CODE_SECONDS,
        storeOTP: 'hashed',
        // Better Auth runs this as a background task and only logs its errors, so callers
        // can't tell existing accounts apart; limits therefore live in the `before` hook.
        async sendVerificationOTP({ email, otp, type }) {
          if (type === 'sign-in') {
            await signInCodes.send({ email, code: otp, expiresInMinutes: CODE_SECONDS / 60 });
          }
        },
      }),
    ],
    rateLimit: {
      enabled: true,
      customRules: IP_RULES,
      customStorage: { consume: (key, rule) => rateLimiter.consume(`auth:${key}`, rule) },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/email-otp/send-verification-otp') return;
        const body = ctx.body as { email?: unknown; type?: unknown } | undefined;
        if (body?.type !== 'sign-in') {
          throw new APIError('BAD_REQUEST', { message: 'Only sign-in codes are supported' });
        }
        if (typeof body.email !== 'string') return; // the endpoint's own validation answers
        const emailKey = createHash('sha256').update(body.email.toLowerCase()).digest('hex');
        const limit = await rateLimiter.consume(`otp-email:${emailKey}`, CODES_PER_EMAIL);
        if (!limit.allowed) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message: 'Too many codes requested for this email, try again shortly',
          });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await onUserCreated({ id: user.id, name: user.name });
            } catch (error) {
              // Not fatal: GET /v1/me creates the workspace when it's missing.
              logger.error(error, 'Creating the personal workspace failed');
            }
          },
        },
      },
    },
    advanced: {
      database: { generateId: () => newId() },
      useSecureCookies: env.API_URL.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    logger: {
      level: 'warn',
      log: (level, message, ...args) => {
        const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        logger[method](args.length ? { message, args } : message);
      },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
