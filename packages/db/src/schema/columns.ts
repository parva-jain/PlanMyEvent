import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

import { newId } from '../uuid.js';

/** Case-insensitive text (citext extension, migration 0000), for emails. */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/** Raw bytes, e.g. SHA-256 digests of tokens and request bodies. */
export const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/** UUIDv7 primary key generated in the app (DatabaseDesign "Primary keys"). */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => newId());

/** created_at and updated_at, both timestamptz default now(); updated_at refreshes on update. */
export const timestamps = () => ({
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
