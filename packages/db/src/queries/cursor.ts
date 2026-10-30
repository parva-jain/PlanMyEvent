import { ActionError } from '@pme/core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursors name the last row seen, by id (APIDesign "Pagination"): opaque to clients. */
export const encodeCursor = (id: string) =>
  Buffer.from(JSON.stringify({ i: id })).toString('base64url');

export function decodeCursor(value: string): string {
  try {
    const { i } = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { i?: unknown };
    if (typeof i === 'string' && UUID.test(i)) return i;
  } catch {
    // Falls through to the error below.
  }
  throw new ActionError('bad_request', 'Invalid cursor');
}
