# 48 — Dashboard and bell in the web app

Milestone 8, step 8c · Nov 23, 2026

The event home stops being a placeholder. It shows the Stitch dashboard: what needs attention, four stat cards, upcoming deadlines, sub-events filling up, budget by category and registrations. The top bar gets a bell for notifications.

## One request, sections that may be missing

`GET E/dashboard` returns every section the caller may see, and `null` for the rest. The screen follows that: a card renders only when its section came back. A helper without `budget.view` simply has no budget card. The web never decides permissions itself; the API already left the data out.

"Needs your attention" isn't an API field. The web builds it from numbers it already has:

| Item | From |
| --- | --- |
| N tasks overdue | `tasks.overdue` |
| N payments due this week | `budget.paymentsDue` |
| Haldi is nearly full | `subEvents[].taken / capacity >= 0.9` |

When an item resolves, the next fetch no longer has it, and `ListPresence` collapses it out (MOTION.md 6.5).

## Which signal refreshes the dashboard

The socket sends both `entity.changed` and `dashboard.changed`. It would be tempting to re-fetch the dashboard on `entity.changed` for a task, but that races the server's cache. The relay sends `entity.changed` first, then moves the cache generation, then sends `dashboard.changed`. A fetch triggered by the first signal can still get the old cached numbers. So the dashboard listens only to `dashboard.changed`, which arrives after the cache has moved on.

Its query key sits under `['events', eventId]`, so the "re-fetch everything on screen" after a socket reconnect includes it for free.

Numbers don't re-stagger on refresh. TanStack Query keeps the old data while re-fetching, and `CountUp` counts from the old value to the new one.

## Ticking off a deadline

The deadlines list has the task checkbox from the Tasks page. The Tasks page's own hook (`useToggleDone`) writes into the task list's cache. On the dashboard that list usually isn't loaded, and writing one task into an empty cache would make the Tasks page briefly show just that task. So the dashboard has its own small mutation:

1. Hide the row at once (a local set of completed ids; `ListPresence` collapses it).
2. `PATCH` the task with its `If-Match` version.
3. On error, show the row again with a snackbar.
4. Either way, mark the task lists stale, so they re-fetch the next time they're on screen.

## The bell

The bell's badge and the panel's list share one query. `GET /v1/notifications` returns `unreadCount` on every page, so the first page is all the badge needs. `notification.new` arrives in my personal room (`user:{id}`). The server joins every socket to it on connect, so the event shell's socket already receives it; the handler only invalidates the query.

The wiggle needs no signal of its own. The bell remembers the last count it saw, and when the count goes *up* it wiggles once. A batch of five notifications is one re-fetch and one wiggle. The first load doesn't wiggle, because there's no previous count yet.

Marking read is optimistic: the rows lose their tint and the badge drops at once. The real counts come back with the re-fetch afterwards.

## A small chart, done properly

"Registrations this week" is seven bars. Even a chart that small follows the rules:

- One series, so no legend; the card title names it.
- Bars rise from the baseline (600 ms, staggered).
- Each bar shows its count on hover.
- A visually hidden table gives screen readers the same numbers.

## When fake APIs meet a new page

The shell tests fake the API, and their catch-all answers every `E/*` path with an empty list. The new home page expected a dashboard object and crashed. The fix belongs in the test: it now fakes `E/dashboard` and `/v1/notifications` with real shapes, as it already did for `E/me`.
