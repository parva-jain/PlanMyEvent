import { describe, expect, it } from 'vitest';

import { isUuidV7, newId } from './uuid.js';

describe('newId', () => {
  it('returns UUIDv7 values', () => {
    expect(isUuidV7(newId())).toBe(true);
  });

  it('is time-ordered, so new rows append to the primary-key index', () => {
    const ids = Array.from({ length: 50 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('isUuidV7', () => {
  it('rejects other UUID versions and non-UUIDs', () => {
    expect(isUuidV7('9b2d4c1e-3f5a-4b6c-8d7e-1f2a3b4c5d6e')).toBe(false); // v4
    expect(isUuidV7('not-a-uuid')).toBe(false);
  });
});
