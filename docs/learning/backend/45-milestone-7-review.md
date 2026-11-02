# 45 — Reviewing milestone 7

Milestone 7, step 7g · Nov 2, 2026

Before merging guests, invitations and RSVP, I re-read the undo planners, the guest-scope switch, the public invite query and how errors leave the API. Two problems from 7c.1 were still open. Both are fixed now, each with a test.

## Undo and a reshaped guest list

Undo replays the old values of one row. That only works if the row still has the same shape. A guest-scope switch changes the shape underneath:

- Going to per sub-event deletes each whole-event attendance row and makes copies, one per sub-event.
- Going back merges each guest's rows into one.
- Invitations get new sub-event links.

So undoing "Sharma family confirmed" from before a switch would look for a row that no longer exists. Undoing a withdrawn invitation would restore its answers under sub-events it no longer has. Some of these failed with a version conflict, but others went through and left odd rows.

The fix is a rule, not a repair. `undoActivity` asks the log when the event last recorded `event.guest_scope`. If the entry is for an invitation or attendance row and is older than that, the answer is 409 `conflict` with reason `guest_scope_changed`. Households and contacts aren't reshaped by a switch, so their undo still works. The lookup uses the existing `(entity_type, entity_id, created_at)` index on the activity log, since the switch's entry is about the event itself.

**Lesson:** undo is safe when nothing structural happened in between. Structural changes need to draw a line in the log, and undo needs to respect it.

## Busy is not broken

Every action's transaction sets `lock_timeout = '2s'`. A guest replying while a switch holds the event row waits, and after 2 seconds Postgres cancels with code `55P03`. That reached the API as an unknown error: 500, logged as a bug and sent to Sentry.

Now `toProblem` recognises `55P03`, including when Drizzle wraps the driver's error in `cause`. The answer is 503 `service_unavailable` with `Retry-After: 2`. It isn't treated as a bug. The invite page says the hosts are updating the invitation and asks the guest to try again. The idempotency key is released on failure, so the retry runs normally.

## Something that turned out fine

The public invite query reads only the invitation the token points to: its own sub-event links and its own attendance rows. No query on that path can return another guest or a headcount, which is the rule from 7d.
