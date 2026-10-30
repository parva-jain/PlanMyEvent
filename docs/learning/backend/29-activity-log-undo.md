# 29 — The activity log and undo

Milestone 5, step 5a · Oct 30, 2026

## What happened

Every change now leaves a row in `activity_log`, written in the same transaction as the change:

- **Recording.** Actions already returned `activity` entries; the runtime now stores them with the actor's name, the channel and the request id. Updates keep only the fields that changed: `{ name: 'Haldi' } → { name: 'Haldi ceremony' }`.
- **The feed** (`GET E/activity`, `activity.view`): newest first, 50 per page with a cursor, filters for an entity or a person. Each item has a name to show ("Haldi"), who undid it if anyone did, and `canUndo` for the reader.
- **Undo** (`POST E/activity/{entryId}/undo`): the person who made the change, or someone with `event.settings`, can reverse event details, modules, venues and sub-events. A change made since gives 409 with what it looks like now.

Tests: core (recording, undo paths and permissions), the database (rollback leaves no entry, pages, restore), the API (feed access, undo, conflicts, who may undo).

## Key ideas

- **Undo is just another action.** Undoing a rename runs `updateSubEvent` with the old name; undoing a delete runs a new `restoreSubEvent`. So undo gets the same permission check (sub-event scope included), version check and activity entry as any change, with no second set of rules.
- **The version is the "nothing changed since" check.** The entry's `after.version` becomes the reversal's expected version. If anyone edited the row since, the version moved and undo stops with 409.
- **Store names when you write.** `actor_label` is saved with the entry, so "Priya renamed Haldi" still reads right after Priya changes her name. Entity names come from the snapshot or the row, and soft-deleted rows keep theirs.
- **Lock the entry being undone.** `select … for update` on the entry plus `undone_at` means two people pressing Undo at once can't both reverse it.

## What testing taught us

- **Cursors and microseconds.** Postgres keeps microseconds; a JS `Date` keeps milliseconds. A cursor built from the timestamp could skip or repeat rows that land in the same millisecond, so the cursor names the last entry and SQL compares `(created_at, id)` against that row.
- **Cleanup order matters with new foreign keys.** The API tests' cleanup failed until it deleted log rows before their events and users.

## Self-check

**Why does undo of someone else's change need `event.settings`, but your own doesn't?**
Undoing your own mistake is the common case. Reverting a teammate's work is a bigger step, so it needs the permission that also controls event settings.

**What stops undo from overwriting a later edit?**
The reversal expects the version the entry produced. Any later edit bumped it, so the update matches no row and undo answers 409.

**Why aren't team changes undoable?**
Reversing "removed Rahul" would give someone access back, and "changed a role" affects everyone holding it. Those need their own rules, not a generic reversal.

## My notes

<!-- Write your own notes here. -->
