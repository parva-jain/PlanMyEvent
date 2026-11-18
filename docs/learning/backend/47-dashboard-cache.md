# 47 — Dashboard cache

Milestone 8, step 8b · Nov 18, 2026

The event home becomes a dashboard: countdown, task progress, budget, headcounts, sub-event fill, invitation distribution and registrations, in one request. It is the most-read screen and the most expensive read, so this step is mostly about caching it correctly.

## One cache per event, many views

Members see different dashboards. A helper scoped to Haldi sees Haldi's tasks only; someone without `budget.view` sees no budget. Caching each member's view would multiply the work and the keys. Instead:

1. `loadDashboardAggregate` (packages/db) computes the event's numbers once, **split by sub-event**. Tasks are counted per `sub_event_id`, expenses per category and sub-event, and invitations per *set* of sub-events they cover.
2. That aggregate is what Redis holds.
3. Core's `dashboardFor(aggregate, access, now)` adds up the scopes this member covers. It is a pure function, so it is tested without a database.

Why invitations are grouped by the set of sub-events they cover: one invitation can cover Haldi and Sangeet. A member scoped to both must count it once, not twice. With counts per set, the projection keeps the sets that touch any of the member's sub-events and sums them, so each invitation counts once.

The same trick covers "upcoming deadlines". The aggregate keeps the 5 earliest open tasks *of each scope*. Any member's top 5 must be among those, whatever their scope.

## Invalidation by generation, not by delete

The plan said "the relay deletes `dash:{eventId}` on changes". That has a race:

1. A request starts computing the dashboard.
2. A change commits; the relay deletes the key.
3. The request finishes and writes its value, which is now stale, for 30 seconds.

So the key carries a generation instead: `dash:v1:{eventId}:{generation}`. A reader looks up `dash-gen:{eventId}` first, then the value under that generation. The relay `INCR`s the generation after each relevant change. In the race above, the slow request writes under the *old* generation, which nobody reads again. It's the same idea as `rolesVersion` in the permission cache.

`v1` is the aggregate's shape. If a deploy changes `DashboardAggregate`, bump it, and old values are simply ignored.

## Stampede lock

When the value is missing and 50 people are watching, 50 requests would recompute at once. Only the one that wins `SET …:lock NX PX 5000` computes. The others check every 50 ms for up to half a second, then compute it themselves rather than wait longer. If the holder crashes, the lock expires on its own.

Every Redis call is wrapped. If Redis is down, the request reads Postgres directly, which is slower but never wrong.

## Throttling `dashboard.changed` across workers

A check-in rush could fire hundreds of changes a second. Clients only need "re-fetch" once a second. The throttle has to hold across several worker processes, so the window lives in Redis:

- `SET dash-signal:{eventId} 1 PX 1000 NX` succeeds: this worker owns the window and sends now.
- It fails: someone sent less than a second ago. Schedule **one** trailing send for when the window ends (`PTTL`), then try to claim again.

Without the trailing send, a change in the middle of a window would never be signalled. Screens would show the numbers from before it until the next change.

Which changes count is a list in contracts (`DASHBOARD_ENTITY_TYPES`): tasks, expenses, categories, invitations, attendance, sub-events, the event and members. Contact edits don't move any number, so they don't refresh anyone's dashboard.

## Small things worth knowing

- `date - $1` in Postgres is ambiguous when `$1` is an untyped parameter: `date - date` (an integer) or `date - integer` (a date)? It picked the first and failed. Writing `$1::int` settles it.
- A sub-event-scoped member has `event.view` only on their sub-events, so the route uses the guard's `'list'` scope (granted anywhere), not `'event'`.
- "Needs your attention" isn't an API field. The web derives it from `tasks.overdue`, `budget.paymentsDue` and sub-events near capacity, so the API stays a set of numbers.
