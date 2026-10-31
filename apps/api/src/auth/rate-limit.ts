import type { Redis } from 'ioredis';

/**
 * Fixed-window counter in Redis: one atomic INCR (+ EXPIRE on the first hit) per request.
 * Returns the seconds to wait when the limit is reached.
 */
const CONSUME = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if count > tonumber(ARGV[2]) then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 1 then ttl = tonumber(ARGV[1]) end
  return ttl
end
return -1
`;

/** How long to tell clients to wait when Redis can't be asked. */
const UNAVAILABLE_RETRY_SECONDS = 30;

export interface RateLimitRule {
  /** Seconds. */
  window: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number | null;
}

/**
 * Rate limits. If Redis is unavailable, public writes like sign-in fail closed (SystemDesign
 * "Failure modes"), so nobody can flood the email provider while limits can't be counted;
 * signed-in routes pass `failOpen` (APIDesign "Rate limits").
 */
export function createRateLimiter(
  redis: Redis,
  prefix = 'ratelimit',
  { failOpen = false }: { failOpen?: boolean } = {},
) {
  return {
    async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
      try {
        const retry = (await redis.eval(
          CONSUME,
          1,
          `${prefix}:${key}`,
          rule.window,
          rule.max,
        )) as number;
        return retry < 0
          ? { allowed: true, retryAfter: null }
          : { allowed: false, retryAfter: retry };
      } catch {
        return failOpen
          ? { allowed: true, retryAfter: null }
          : { allowed: false, retryAfter: UNAVAILABLE_RETRY_SECONDS };
      }
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
