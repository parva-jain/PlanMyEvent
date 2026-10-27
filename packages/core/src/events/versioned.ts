import { ActionError } from '../errors.js';

/**
 * After a guarded write matched no row: 404 if the row is gone, otherwise 409 with the
 * current row so the client can show what changed (APIDesign "Version guard").
 */
export function versionMismatch(current: { version: number } | null, expected: number): never {
  if (!current) {
    throw new ActionError('not_found', 'Not found');
  }
  throw new ActionError(
    'version_conflict',
    `Expected version ${expected}, current version is ${current.version}.`,
    { current },
  );
}
