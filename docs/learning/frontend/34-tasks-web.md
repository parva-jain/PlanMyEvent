# 34 — Tasks in the web app

Milestone 6, step 6c · Oct 30, 2026

## What happened

The Tasks section is real now (`/events/{id}/tasks`):

- **List and board.** The list groups tasks by status. The board has a column per status and you drag cards between them, with a mouse, a finger or the keyboard (Space to pick up, arrows to move, Space to drop).
- **Filters:** assigned to me, sub-event, assignee and status. Helpers, who can't add tasks, start on "Assigned to me".
- **Quick add** at the top of the list: type, press Enter, and the task appears with a short glow.
- **Ticking off.** The box fills, the title is struck through, and 600 ms later the row slides into Done. On a phone you can also swipe a row to the right. Finishing every task of a sub-event plays confetti once and says "All Mehendi tasks done".
- **The panel** edits everything, assigns people, keeps a checklist of subtasks and deletes (with Undo). An assignee who only has `tasks.update_own` sees the fields but can change only the status.
- **Deleted sub-events.** A task whose sub-event was deleted shows a "Deleted sub-event" chip, and the panel can move it to the whole event.
- **My tasks** on the My events page lists my open tasks across events; each links to `/events/{id}/tasks?task=…`, which opens that task.

Tests: `tasks.spec.ts` covers starter tasks, quick add, ticking, the panel with subtasks, delete and undo, a keyboard drag on the board, the deleted sub-event, and My tasks.

## Key ideas

- **Optimistic updates for small, frequent actions.** Ticking a box or dropping a card changes the cached list at once, then saves. If the API refuses, the old list comes back and a snackbar says so. Larger edits in the panel wait for the server.
- **Fractional positions make a drop one write.** The dropped card gets a key between its new neighbours (`positionBetween(before, after)`), so no other card changes.
- **Collision detection matters for keyboard dragging.** Columns stretch to the tallest one. With "nearest corners", an empty column's top looked farther away than the card beside it, so the arrow key never left the column. Checking overlap first fixed it.
- **A component can unmount before its mutation finishes.** A ticked row moves to the Done group, which is a different list, so the row unmounts. `mutate(…, { onSuccess })` callbacks are skipped after unmounting; `mutateAsync().then(…)` still runs, so the celebration uses that.
- **Send only what changed.** The panel compares the form with the task and sends the difference. Re-sending an untouched, deleted sub-event would be refused.
- **Translation keys can collide.** `tasks.board` was both the "Board" label and a group of drag announcements; JSON keeps the last one, and next-intl failed at runtime. Each key now has one meaning.
