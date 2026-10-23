# 005. Dash-separated deterministic job ids

- Status: Accepted
- Date: 2026-10-23

## Context

Deterministic job ids make outbox delivery idempotent: a re-delivered outbox row produces the same BullMQ job id, and BullMQ ignores the duplicate. SystemDesign and DatabaseDesign showed ids like `invite-email:<invitationId>:<templateVersion>`.

BullMQ 6 rejects custom job ids that contain `:` unless they have exactly three parts, a compatibility exception for old repeatable jobs that its source marks to be removed in the next breaking release. It also rejects ids that are plain integers. The documented format worked only by coincidence and would break on an upgrade or with a fourth part.

## Decision

Build every job id and outbox `dedupe_key` from parts joined with `-`, e.g. `invite-email-<invitationId>-<templateVersion>`, through the shared `jobId()` helper in `packages/contracts`. It rejects `:` and integer-only ids.

## Consequences

- One helper enforces the rule for the outbox (core) and the worker, so it can't drift.
- UUIDv7 ids contain only hex digits and `-`, so ids stay readable and unambiguous; ids are never parsed back into parts.
- Redis cache keys (`perm:{eventId}:...`) and socket rooms (`event:{id}`) are unaffected: they aren't job ids, and `:` is conventional there.
