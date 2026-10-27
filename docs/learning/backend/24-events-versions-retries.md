# 24 — Events, versions and retries

Milestone 3, step 3a · Oct 27, 2026

## What happened

Events now exist. `POST /v1/events` creates one from a template in a single transaction: the event, its modules, an optional first venue, and starter sub-events placed on the event's dates in its time zone. Then the event, its modules, venues and sub-events can be read and edited.

| Layer | New |
| --- | --- |
| contracts | Permission catalog; event, module, venue and sub-event schemas; the list envelope |
| core | Templates (wedding, conference, fair, celebration, custom); `zonedTimeToUtc`; slugs; actions for events, modules, venues and sub-events; an in-memory `CoreTx` for tests |
| db | Tables `events`, `event_modules`, `venues`, `sub_events`, `idempotency_keys` (migration 0002); stores; `canAccessEvent`; `eventQueries`; idempotency helpers |
| api | `/v1/events…` routes, `/v1/event-templates`, `/v1/me/events`; `ETag`, `If-Match`, `Idempotency-Key`; `EventAccessGuard` |

Tests: core 25, db 16, API 51.

## Key ideas

- **Optimistic locking.** Every versioned row has `version`. Writes say "update … where version = 3"; zero rows means someone else got there first. The API turns that into 409 with the current row, so the client can show the change instead of silently overwriting it. No locks are held while a person thinks.
- **ETag and If-Match are the HTTP face of it.** Responses carry `ETag: "3"`; edits must send `If-Match: "3"`. Missing → 428, stale → 409.
- **Idempotency keys make retries safe.** A phone on a bad network may send "create event" twice. With the same `Idempotency-Key` the second request gets the first one's stored response; nothing runs twice.
- **The database guards tenancy too.** `sub_events(event_id, venue_id)` references `venues(event_id, id)`, so even buggy code can't attach another event's venue. Core turns that mistake into a friendly field error first.
- **Times: store UTC, think locally.** Templates say "Haldi 10:00 on day 1"; `zonedTimeToUtc` turns that into the right instant for the event's time zone (DST-safe), and Postgres stores UTC.
- **One access function for now.** Until roles exist, the owner can do everything and others get 404. Because reads (the guard) and writes (core's permission check) both call `canAccessEvent`, milestone 4 changes one function.

## What testing taught us

- **Drizzle wraps database errors.** The unique-violation code was on `error.cause`, not `error`, so slug collisions would have crashed instead of retrying. The real-Postgres test caught it.
- **Savepoints keep a transaction alive.** A failed insert aborts a Postgres transaction. Wrapping the slug insert in a nested transaction (a savepoint) lets the action retry with a new slug.
- **A test that passes first time still has to fail once.** Letting anyone access any event made exactly the access test fail.
- **Watch builds differ from real builds.** `nest start --watch` put test files into `dist/`, and Vitest picked them up. Vitest now only looks in `src/`.

## Self-check

**Why does PUT /modules need the event's version?**
Modules have no version of their own. Two people replacing the set at once would silently lose one change, so the event's version guards it (APIDesign: sets use the parent's version).

**What does a retry with the same Idempotency-Key and a different body get, and why?**
422 `idempotency_key_reused`. Same key means "the same action"; a different body means the client has a bug, and replaying the old response would hide it.

**Why does a stranger get 404, not 403, for someone else's event?**
A 403 would confirm the event exists. Only members learn that; they get 403 when they lack a permission (milestone 4).

**Why are template times converted in core, not in the database?**
The conversion needs the event's time zone and dates at creation time. Doing it in the action keeps one clear rule: everything stored is UTC.

## My notes

<!-- Write your own notes here. -->
