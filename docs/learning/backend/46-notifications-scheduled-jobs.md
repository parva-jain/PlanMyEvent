# 46 — Notifications and scheduled jobs

Milestone 8, step 8a · Nov 18, 2026

Members now get told when something concerns them: a task assigned to them, a task due today, a change to their roles. The worker also gets a clock. A new `scheduled` queue runs repeating jobs that clean up old rows and look for tasks due today.

## Where a notification is written

A notification is a row in `notifications` (migration 0009), one per person, across events. There were two ways to write it:

1. The action writes an outbox row, and a `notifications` queue in the worker inserts the rows later.
2. The action inserts the rows itself, in its own transaction.

We chose 2. A notification row is data, not a side effect like an email. Writing it in the same transaction means it exists exactly when the change commits, with no extra queue to retry. The side effect is the **live signal**: `notify()` in core inserts the rows and returns `notification.new` outbox messages, one to each recipient's `user:{id}` room. The relay sends those like every other signal.

`notify()` drops the person acting: assigning a task to yourself tells nobody.

| Type | Sent by | To |
| --- | --- | --- |
| `task_assigned` | `createTask`, `replaceTaskAssignees` | Members newly on the task |
| `role_changed` | `replaceMemberRoles` (only if the roles really changed) | The member |
| `task_due` | `notifyDueTasks`, run by the scheduler | Assignees of unfinished tasks due today |

The payload keeps ids and the task title at the time. Names that can change (the event, the person who assigned it) are looked up when the list is read, so a renamed event shows its new name.

## A clock in the worker

BullMQ's `upsertJobScheduler(name, { every }, template)` keeps **one** schedule per name in Redis, however many workers call it at boot. So every worker can register the four jobs without making duplicates:

| Job | Every | Does |
| --- | --- | --- |
| `outbox-cleanup` | hour | Deletes outbox rows published more than 7 days ago |
| `idempotency-cleanup` | hour | Deletes expired Idempotency-Key rows |
| `notifications-cleanup` | day | Deletes read notifications older than 90 days |
| `task-due-scan` | 30 min | Due-date reminders |

The deletes run in batches of 5,000 (`delete … where id in (select … limit 5000)`), so a large backlog never holds one long transaction. They live in `packages/db/src/maintenance.ts`, not in core. They tidy infrastructure tables and change nothing a user sees, so the "every write is a core action" rule is about domain data, and these jobs aren't that. The reminder *does* tell users something, so it goes through a core action (`notifyDueTasks`), run as the system actor.

## Running a job twice is harmless

Schedulers run late, twice, or after a crash. Each job is safe to repeat:

- deletes are by age, so a second run finds nothing;
- every reminder has a **dedupe key** `task_due-<taskId>-<date>`, with a partial unique index on `(user_id, dedupe_key)`. The insert uses `on conflict do nothing` and returns only the rows it wrote, so only those get a live signal.

## Time zones

"Due today" means today **where the event is**. One SQL query finds the events where it's now past 8:00 local time and some assigned, unfinished task is due on the local date (`now() at time zone e.time_zone`). Each event then runs in its own transaction. If one fails, the others still go through, and the job throws at the end so BullMQ retries; events already done insert nothing the second time.

## API

- `GET /v1/notifications?cursor&limit&unread=true`: newest first, with `unreadCount` for the bell, so the first page is all the shell needs.
- `POST /v1/notifications/read` with `{ "ids": [...] }` or `{ "all": true }`. It only ever touches the caller's own rows; someone else's ids update nothing.

## Self-check

1. Why is a notification row written inside the action's transaction, while an email goes through the outbox?
2. What stops two workers from each creating a `task-due-scan` schedule?
3. The scan runs at 08:00 and again at 08:30. Why does the helper get one reminder, not two?
4. Why does the reminder carry the task title, but the list looks up the event name when it's read?
