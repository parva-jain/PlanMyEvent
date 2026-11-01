# 44 — Switching guest scope

Milestone 7, step 7c.1 · Nov 1, 2026

An event's guests either belong to the **whole event** (one invitation, one reply, one headcount) or are **separate per sub-event** (the Mehendi has fewer guests than the reception). An owner can switch between the two at any time, even after replies have come in. This step builds that switch, and lets the event choose how guests respond.

## What a switch does

DatabaseDesign "Switching guest scope" spells out the rules:

| Direction | Attendance | Invitations | Sub-events |
| --- | --- | --- | --- |
| To per sub-event | Each whole-event answer is copied onto every sub-event (same status and party), then the original row goes | Cover every sub-event | Take the event's response mode |
| Back to whole event | Each guest's rows merge into one | Cover the whole event (no sub-event links) | Drop their response modes |

Merging needs a rule for which answer wins. The most committed one does: checked in, then confirmed or registered, then waitlisted, then invited, then declined. Cancelled wins only if every row is cancelled. The party size is the largest among the rows still live. This rule is `mergeRows` in core: a pure function with its own test.

## Rules in core, bulk writes in the database

A switch can touch thousands of rows, so it can't be one store call per row. The new `GuestScopeStore` port splits the work:

- **core** decides *what* happens: which status wins and who gets copies;
- **db** does it in bulk: copies inserted 1,000 at a time, and the merge as one `update … from unnest($ids, $statuses, $sizes)`.

The in-memory store used by core's tests follows the same rules, so the rules are tested without Postgres and the SQL is tested in the API tests.

## One transaction, one lock

The switch runs in one transaction that starts with `select … for update` on the event row. Meanwhile a guest might be sending their RSVP. That action used to read the event with a plain `select`, which a row lock doesn't block. It could read "whole event", wait, then write a whole-event answer just after the switch made everything per sub-event.

So the guest actions that depend on the scope (RSVP, invite, change sub-events) now read the event with `select … for share`. A shared lock waits for the switch's exclusive lock, then reads the new scope. RSVPs don't lock each other, because shared locks don't conflict with one another.

## As a job

`POST E/guest-scope` checks the request at once (already that scope? no sub-events to copy onto?), returning 422 if it can't run. Otherwise it answers 202 and queues the switch through the outbox, the same way CSV imports go (step 7b), on the same `imports` queue under a second job name. The worker runs `switchGuestScope` as the member who asked, so `event.settings` is checked again when it runs.

Only one switch per event at a time: the API keeps the latest switch's job id in Redis and refuses a second request with 409 (`reason: job_already_running`) while that job is queued or running. If Redis is down this check fails open, which is safe because a second switch to the same scope finds nothing to do (`activity: []`).

## Every screen re-reads

The switch writes one activity entry for the event, so the outbox sends one `entity.changed` for it. On the web, an `event` change now refreshes **everything** on screen for that event, not just the event's own query, since a switch rewrites guests, invitations and replies.

## Response mode

`PATCH E` now takes `responseMode` (invite only, or invite + RSVP); open registration waits for the public registration page in milestone 8. With separate lists, each sub-event has its own response mode, edited on the sub-event. The Settings card "People and responses" shows both, plus the switch: a confirmation dialog, a progress bar while the job runs, and a check when it's done.

## Try it

- In Settings, choose "Invite + RSVP", invite a household, open its link in a private window and reply.
- Switch to separate lists, look at the Responses tab per sub-event, change one answer, and switch back: the guest keeps their warmest reply and largest party.
