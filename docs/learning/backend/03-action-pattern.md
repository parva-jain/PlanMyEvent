# 03 — The action pattern

Session C · milestone 1, item 5 · Oct 22, 2026

## Key ideas

- **Every write goes through one core action**, run by `runAction` in `packages/core/src/action.ts`.
- **One transaction:** permission check, the change, the `activity_log` row and the `outbox` rows commit together or not at all.
- **Side effects are written down, not performed.** Socket signals, emails and jobs become outbox rows; the outbox relay (milestone 5) publishes them after the commit.
- **Actions describe, the wrapper writes.** `execute` returns `{ result, activity, outbox }`, and `runAction` persists them, so nobody can forget the log or the outbox.
- **Dependency inversion.** Core defines `ActionRuntime<TTx>` (a port). `packages/db` will implement it with Drizzle and the tests use a fake, so core has no NestJS or Drizzle imports.
- **Fail closed.** The placeholder permission check rejects everything until milestone 4.

## Self-check

**What is the dual-write problem, in one sentence?**
When one change must update the database and also do something outside it (a socket event, an email), a crash between the two leaves them disagreeing, because there's no single commit covering both.

**Why is an outbox row better than emitting the socket event directly?**
The outbox row commits in the same transaction as the change, so either both exist or neither does. If Redis or the worker is down, the row waits and is published later. A direct emit could fire for a change that then rolls back, or be lost if the process dies after the commit.

**Why must outbox consumers be idempotent, and what field supports that?**
Delivery is at-least-once: the relay can crash after publishing but before marking the row published, so the same message may go out twice. `dedupeKey` becomes the BullMQ job id, so a repeated job is ignored, and clients treat a repeated `entity.changed` as a harmless re-fetch.

**What does `ActionRuntime` buy us, compared with core importing Drizzle directly?**
The same actions run from the API, the worker and later AI and WhatsApp without depending on any framework. Unit tests run with a fake and no database, and the storage layer can change without touching business rules.

**Why should a placeholder permission check reject rather than allow?**
An allow-all placeholder is easy to forget and would silently ship unguarded writes to production. A rejecting one fails loudly the first time a real action needs a permission, which forces the real check to be built.

## My notes

<!-- Write your own notes here. -->
