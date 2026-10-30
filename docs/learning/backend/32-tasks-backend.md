# 32 — Tasks on the server

Milestone 6, step 6a · Oct 30, 2026

## What happened

Events now have tasks:

- **Two tables** (migration 0005): `tasks` and `task_assignees`. Composite foreign keys keep a task's sub-event, parent task and assignees inside its own event.
- **Five actions** in `packages/core/src/tasks/`: create, update, assign, delete and restore. Each one is permission-checked, version-checked, logged and turned into a live signal, like every other action.
- **Starter tasks.** A new wedding comes with 12 tasks, such as "Book the caterer" and "Book the mehendi artist" (the latter linked to Mehendi). Each is due a set number of days before the event.
- **Routes:** `GET/POST E/tasks`, `GET/PATCH/DELETE E/tasks/{id}`, `PUT E/tasks/{id}/assignees` and `GET /v1/me/tasks`.
- **Undo** works for task edits, assignments, creates and deletes. Undoing a delete brings back its subtasks too.

Tests: 10 in core (permissions, scopes, Helpers, ordering, undo), 6 in db (real ordering, cascades, My tasks), and 3 API flows.

## Key ideas

- **Fractional indexes for drag-and-drop.** Each card's `position` is a short string, and a card dropped between `a0` and `a1` gets `a0V`. Moving a card rewrites only that card, never renumbering the column. These keys must be compared byte by byte. A database collation for human text (like `en_US`) may sort them differently, so every `order by position` says `collate "C"`.
- **Which permission applies can depend on the row.** A Helper has `tasks.update_own`, not `tasks.edit`. Only the action knows whether this task is theirs and whether the body touches only status and position. So the PATCH route lets any member through, and the action decides, inside the transaction. Undo reuses the same action, so it gets the same rule.
- **"Can they see it?" is part of assigning.** A helper scoped to Mehendi can't be assigned a Haldi task. Otherwise it would sit in their "My tasks" but return 403 when opened.
- **The same timestamp marks a group.** `now()` in Postgres is fixed for the whole transaction, so a parent and the subtasks deleted with it share one `deleted_at`. Restore brings back exactly those, and leaves out a subtask deleted on its own earlier.
- **Compare timestamps in SQL, not JS.** Postgres stores microseconds and a JS `Date` keeps milliseconds. Reading `deleted_at` into JS and sending it back would match nothing, so restore compares with a subquery.
- **Lists filter, single rows refuse.** `GET E/tasks` returns only the tasks your sub-event scope covers. `GET E/tasks/{id}` for a task outside it is 403.

## What testing taught us

- **Mind the empty column.** A test expected a card moved to Done to change position. The Done column was empty, so its first key was `a0`, the same as its old key in To do. The code was right; the test now checks the order of two cards.
- **Waiting out a timer is a race on a busy machine.** A Playwright test from step 5c failed once in the full run: under load, the click on Undo came after the 5-second window. It now hovers the bar first, which pauses the countdown, just as a user's pointer would.
