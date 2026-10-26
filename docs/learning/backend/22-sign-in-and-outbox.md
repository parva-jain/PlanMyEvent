# 22 — Sign-in and the outbox

Milestone 2, step 2a · Oct 26, 2026

## What happened

A sign-in code now travels the full path the architecture was designed for:

```
POST /v1/auth/email-otp/send-verification-otp
  → Better Auth stores the code (hashed) and calls our sender
  → core action queueSignInCode writes an outbox row (email.critical)       [API, one transaction]
  → worker relay claims the row (FOR UPDATE SKIP LOCKED), adds a BullMQ job,
    deletes the row (sensitive)                                              [worker]
  → email-critical processor renders the email and sends it (SMTP / Resend)  [worker]
POST /v1/auth/sign-in/email-otp → session cookie → GET /v1/me
```

| Package | New |
| --- | --- |
| `packages/db` | Tables `users`, `sessions`, `accounts`, `verifications`, `workspaces`, `outbox` (migration 0001); `createActionRuntime` (real outbox writes); `relayOutboxBatch` |
| `packages/core` | Ports (`CoreTx`, `WorkspaceStore`); actions `ensurePersonalWorkspace`, `queueSignInCode` |
| `packages/contracts` | `OUTBOX_ROUTES`, `QUEUES`, email job schemas, `MeSchema` |
| `apps/api` | Better Auth at `/v1/auth`, `SessionGuard` (+ `@Public()`, CSRF origin check), `GET /v1/me`, Redis rate limiter |
| `apps/worker` | `OutboxRelayService`, `EmailCriticalProcessor`, SMTP and Resend transports, env switches |

Tests: core 7, db 10 (real Postgres), API 32 (full sign-in flow), worker 12.

## Key ideas

- **Ports keep core clean.** Core declares what it needs (`WorkspaceStore.createPersonal`) and `packages/db` implements it with Drizzle. Core still imports neither Drizzle nor Nest, and its tests use an in-memory fake.
- **Idempotency through the database.** "One personal workspace per user" is a partial unique index. `INSERT … ON CONFLICT DO NOTHING` then makes creating it safe to repeat, even five times at once (tested).
- **SKIP LOCKED makes a queue out of a table.** Each relay locks the rows it takes and skips rows another relay holds. Several workers can relay at once without double-sending.
- **At-least-once plus deterministic ids gives effectively-once.** A crash after adding the job but before the commit re-adds it next pass; BullMQ ignores the duplicate job id.
- **Secrets get a shorter life.** Sign-in code rows are deleted the moment they're relayed, jobs are removed from Redis when done, and logs show job ids, never addresses or codes.
- **Fail closed on public writes.** If Redis can't count requests, code requests are refused rather than unlimited.

## What testing taught us

- **Read the library, not just the docs.** Better Auth runs `after` hooks once its transaction has committed, and runs the email sender as a background task that only logs errors (so attackers can't tell accounts apart by timing). The first fact changed where the workspace is created (decision 010). The second moved the per-email limit into a `before` hook: a limit thrown from the sender was silently ignored, which a test caught.
- **Isolate tests from a running dev stack.** Tests use unique emails, random client IPs and `test.*` outbox topics. A local worker never takes their rows, and repeated runs never hit rate limits.
- **One package, two module systems.** The API is CommonJS, `@pme/db` is ESM, and drizzle's types differ between the two builds. The API test talks SQL through the pool instead of importing drizzle helpers.

## Self-check

**Why is the code sent through the outbox instead of directly from the request?**
If the provider is slow, sign-in stays fast. If Redis or the worker is down, the row waits and the email goes out later. And no request ever performs a side effect outside its transaction (rule 2).

**What stops two relays from sending the same email?**
`FOR UPDATE SKIP LOCKED` gives each row to one relay. If a row is published twice anyway (a crash before commit), the job id is the dedupe key, so BullMQ keeps one job.

**Why does `GET /v1/me` call `ensurePersonalWorkspace`?**
The workspace is created after Better Auth's transaction commits. If that hook ever fails, the next `/v1/me` creates it, so a user is never stuck without one.

**Why does the CSRF check apply only to cookie requests?**
Browsers attach cookies automatically, even to requests started by other sites. Bearer tokens are added by our own code, so a foreign page can't send them.

## My notes

<!-- Write your own notes here. -->
