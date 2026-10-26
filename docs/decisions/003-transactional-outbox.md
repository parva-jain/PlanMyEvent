# 003. Transactional outbox for every write

- Status: Accepted
- Date: 2026-10-13

## Context

A single change (e.g. completing a task) must update the row, write an activity log entry, notify open screens, and sometimes send emails or queue jobs. If these happen as separate steps and the server crashes or Redis is down between them, the database and its side effects disagree: a task is done but nobody is notified, or an email is sent for a change that rolled back.

## Decision

Every core action runs in **one database transaction** that writes the change, the `activity_log` row and one or more `outbox` rows describing side effects. A relay in the worker claims unpublished outbox rows (`SELECT … FOR UPDATE SKIP LOCKED`, woken by `LISTEN/NOTIFY` with 500 ms polling as backup), publishes them to Redis pub/sub or BullMQ, and marks them published.

Request handlers never send emails, emit socket events or enqueue jobs directly.

## Consequences

- No accepted write loses its side effects; if Redis or the worker is down, work waits in the outbox.
- Delivery is at-least-once, so every consumer must be idempotent: deterministic BullMQ job ids, and clients treat a repeated `entity.changed` as a harmless re-fetch.
- Side effects arrive slightly after the response (typically milliseconds); the user's own screen updates from the API response immediately.
- One extra table and a relay process to operate; published rows are deleted after 7 days.
