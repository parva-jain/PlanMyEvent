import { describe, expect, it } from 'vitest';

import { redisConnection } from './redis-connection';

describe('redisConnection', () => {
  it('splits a local URL into ioredis options', () => {
    expect(redisConnection('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
      username: undefined,
      password: undefined,
      db: 0,
      tls: undefined,
      maxRetriesPerRequest: null,
    });
  });

  it('reads credentials, database number and TLS from a managed-Redis URL', () => {
    const options = redisConnection('rediss://default:p%40ss%2Fword@cache.example.com:6380/2');
    expect(options).toMatchObject({
      host: 'cache.example.com',
      port: 6380,
      username: 'default',
      password: 'p@ss/word',
      db: 2,
      tls: {},
    });
  });

  it('defaults the port to 6379', () => {
    expect(redisConnection('redis://cache')).toMatchObject({ port: 6379 });
  });

  it('never limits retries, as BullMQ workers require', () => {
    expect(redisConnection('redis://cache')).toMatchObject({ maxRetriesPerRequest: null });
  });
});
