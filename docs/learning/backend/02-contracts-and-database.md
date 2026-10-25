# 02 — Contracts and the database

Session B · milestone 1, items 3–4 · Oct 22, 2026

## Key ideas

- **Zod schemas are the single source of truth.** One schema gives runtime validation (`.parse`) and a compile-time type (`z.infer`). The API, the web app and the OpenAPI docs all use the same definition.
- **Errors are RFC 9457 problems** with a stable `code` that clients switch on. `title` and `detail` are for humans and may change.
- **Value sets** live once in `VALUE_SETS` (`as const` keeps literal types, `satisfies` checks the shape) and generate both Zod enums and database check constraints.
- **Drizzle workflow:** edit the TS schema, run `db:generate` to produce a SQL file, review and commit it, then `db:migrate` applies pending files in journal order.
- **Extensions:** `citext` for case-insensitive emails, `pg_trgm` for fuzzy name search.
- **Advisory lock** around migrations, so two deploys never migrate at once.
- **Pool settings** (`max`, connection and statement timeouts) are the first line of defence against database overload and hangs.
- **UUIDv7** is time-ordered, so it's index-friendly and still unguessable.

## Self-check

**Why does a Zod schema beat a TypeScript interface plus a validation function?**
An interface disappears at runtime, so you'd still need a separate validator, and the two can drift apart: someone adds a field to one and forgets the other. A Zod schema is the validator, and the type is derived from it, so they can never disagree.

**Why text plus check constraints over Postgres enums?**
Adding a value means replacing one check constraint in a simple migration. Postgres enum types can't have values removed and are awkward to change inside transactions. The check is also generated from the same TypeScript list the app uses.

**What does the advisory lock solve, and why a separate connection?**
Two deploys starting together could both run the same migration and fail halfway. `pg_advisory_lock` is a Postgres-wide named mutex, so the second process waits. A session-level lock belongs to the connection that took it, so it's held on a dedicated client that stays open for the whole run while Drizzle migrates through its own pool.

**Why is UUIDv7 kinder to indexes than v4?**
A v4 is fully random, so each insert lands at a random spot in the B-tree index, causing page splits and cache misses. A v7 starts with a timestamp, so new keys arrive in roughly increasing order and get appended near the end of the index, like an auto-increment. The random tail keeps them unguessable.

## My notes

<!-- Write your own notes here. -->
