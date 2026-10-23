import type { ConnectionOptions } from 'bullmq';

/** BullMQ takes ioredis options rather than a URL, so split REDIS_URL into its parts. */
export function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    // Workers block on Redis and must retry forever; BullMQ requires null here.
    maxRetriesPerRequest: null,
  };
}
