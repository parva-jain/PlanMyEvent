import { VALUE_SETS, type ValueSetName } from '@pme/contracts';
import { check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Check constraint for a text column holding a shared value set, e.g.
 * `valueSetCheck('tasks_status_check', t.status, 'taskStatus')`.
 */
export function valueSetCheck(name: string, column: AnyPgColumn, valueSet: ValueSetName) {
  const values = VALUE_SETS[valueSet].map((value) => `'${value}'`).join(', ');
  return check(name, sql`${column} in (${sql.raw(values)})`);
}
