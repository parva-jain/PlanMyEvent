# 06 — Queues and BullMQ

Item 7, step 1 · Oct 23, 2026

## Key ideas

- **Slow or external work never runs in a request** (CLAUDE.md rule 13). The API records the work; a separate **worker** process does it in the background.
- **A queue** is a to-do list shared between processes that survives restarts: producers add jobs, consumers process them.
- **BullMQ** stores queues in Redis keys (`bull:<queue>:wait`, `:active`, `:completed`, `:failed`, one hash per job). Redis's atomic operations mean two workers never take the same job.
- **Job life:** waiting → active → completed, or on a throw, retry with back-off until attempts run out → failed (dead letters, alert).
- **Settings per queue:** attempts and back-off, concurrency, deterministic job ids.
- **Worker shutdown:** stop taking jobs, finish the active one (max 30 s), close, exit. A killed job's lock expires, and BullMQ re-queues it as "stalled".

## Self-check

**Why can't the API just send the email inside the request?**
The user would wait on a slow provider, a provider outage would fail an otherwise successful change, and big batches would tie up the API for everyone. A queue answers instantly and retries in the background.

**What does Redis's atomicity protect against when two workers share a queue?**
Two workers grabbing the same job at once. Moving a job from waiting to active is a single atomic step, so exactly one worker wins.

**If Redis is never the source of truth, why is it fine for BullMQ to keep jobs there?**
The source of truth is the outbox table in Postgres, written in the same transaction as the change. Redis is only the delivery mechanism. If it loses jobs, the unrelayed outbox rows can be published again, and deterministic job ids keep re-delivery from duplicating work.

**How does a deterministic job id stop a duplicate email?**
The id is built from what the job is about (invitation id plus template version), so a re-delivered outbox row produces the same id, and BullMQ ignores an add whose id already exists.

**What happens to an active job when the worker is killed mid-way?**
Its lock stops being renewed and expires. BullMQ detects it as stalled and moves it back to waiting for another attempt, which is why handlers must be safe to run twice.

## My notes

<!-- Write your own notes here. -->
