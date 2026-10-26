import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { citext, id, timestamps } from './columns.js';

/*
 * Identity tables (DatabaseDesign "Identity and tenancy"). Better Auth reads and writes them
 * through its Drizzle adapter, so property names follow its models: `users` maps Better
 * Auth's `image` to `avatarUrl`, and phone, locale and deletedAt are additional fields.
 * Sessions, accounts and verifications keep Better Auth's shape; we only add indexes.
 */

export const users = pgTable('users', {
  id: id(),
  email: citext().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  name: text().notNull(),
  /** E.164; WhatsApp linking in V2. */
  phone: text(),
  avatarUrl: text(),
  locale: text().notNull().default('en'),
  deletedAt: timestamp({ withTimezone: true }),
  ...timestamps(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    /** Better Auth's session token (it signs the cookie value; the token itself is random). */
    token: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    /** The provider's id for the user ("credential" accounts are not used). */
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

/** Email OTP codes (stored hashed) and OAuth state, with expiry. */
export const verifications = pgTable(
  'verifications',
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);
