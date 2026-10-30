# 37. Reviewing milestone 6

Before merging tasks and budget, I re-read the core actions, the stores, the queries, the undo planners and the migrations. Two bugs turned up. Each got a test that failed first.

## A subtask follows its parent, including when the parent moves

The rule was half there. Changing a subtask's sub-event directly is refused ("A subtask follows its parent task"), but moving the parent didn't move its subtasks. After moving "Book a band" to Haldi, its subtask stayed in the whole event:

- Someone scoped to Haldi saw the task but not its checklist.
- Someone without Haldi access could still edit the subtask.

Now `updateTask` calls `tasks.moveSubtasks` whenever the parent's sub-event changes, in the same transaction. Undoing the move runs `updateTask` again, so the subtasks come back with it. A core test and an API test against Postgres cover it.

**Lesson:** an invariant like "X follows Y" needs enforcing in two places: where X changes and where Y changes. The first is easy to remember; the second is easy to miss.

## Double taps and optimistic versions

A quick change lets you tick subtasks right from the list. The update is optimistic: the cache changes at once, but the cached version number stays the same until the server answers. A second tap before then sends `If-Match` with the old version, the server answers 409 and the cache rolls back. The row now ignores a tap while that subtask's save is in flight.

## Something that turned out fine

I suspected that undoing a Helper's tick-off would fail. Undo replays the task's old fields, and Helpers may only change status and position. A test showed it works: the activity log stores only the fields that changed, so undo sends `status` alone. The test stays as a guard.
