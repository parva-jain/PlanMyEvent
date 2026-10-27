# 009. A minimal outbox relay ships in milestone 2

- Status: Accepted
- Date: 2026-10-26

## Context

Sign-in codes (milestone 2) are the first email the app sends. CLAUDE.md rule 2 says requests never send email directly: side effects are outbox rows, relayed to BullMQ after the commit (decision 003). The milestone list put the outbox relay in milestone 5, so milestone 2 would have needed a temporary exception for auth emails.

## Decision

Build the relay now, small, and add to it later:

- **Tables and writes.** The `outbox` table from DatabaseDesign. `packages/db` implements core's `writeOutbox`, so every action's outbox rows commit with its change.
- **Routing.** `OUTBOX_ROUTES` in `@pme/contracts` maps each topic to a queue, a job name, retries and back-off. The first topic is `email.critical` → queue `email-critical` (5 attempts, exponential from 5 s; SystemDesign 5.3).
- **Relay.** It runs in the worker (`OutboxRelayService`). It claims due rows with `FOR UPDATE SKIP LOCKED`, adds jobs with `jobId = dedupe_key`, and marks rows published or schedules a retry. It only takes topics it has routes for.
- **Secrets.** Routes marked `sensitive` (sign-in codes) have their rows deleted as soon as they are published, and their jobs are removed from Redis when they finish. They are never kept 7 days.
- **Email.** The worker's `email-critical` processor sends through SMTP (Mailpit locally) or Resend.
- **Configuration, all through env:**
  - `OUTBOX_RELAY_ENABLED` (default true);
  - `OUTBOX_POLL_MS` (500);
  - `OUTBOX_BATCH_SIZE` (100);
  - `EMAIL_TRANSPORT` (`smtp` or `resend`), `SMTP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`.

Milestone 5 keeps this relay and adds `entity.changed`, the activity log, undo, sockets, LISTEN/NOTIFY wake-ups and the 7-day cleanup job.

## Alternatives considered

- **Send the code from the request, as a temporary exception.** Simple, but the first email would already break rule 2, and a slow provider would slow sign-in.
- **Enqueue to BullMQ directly from the request.** No dual-write safety. A Redis outage would lose codes silently.

## Consequences

- Sign-in emails survive Redis or worker outages: rows wait and go out later.
- The relay holds a database transaction while it adds jobs to Redis. Batches are small, and a lock timeout bounds the wait.
- A sign-in code sits in Postgres in plain text for the moment between the commit and the relay (usually under a second), then is deleted. The code itself expires after 5 minutes.
- Verified Oct 26, 2026: a code requested through the API arrived in Mailpit; its outbox row was gone; the worker log had neither the address nor the code.
