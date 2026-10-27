# 25 — Events in the web app

Milestone 3, step 3b · Oct 27, 2026

## What happened

| Route | What it does |
| --- | --- |
| `/app` | My events: cards with the event accent, type, status and days to go; an empty state for new accounts |
| `/events/new` | Wizard: template → details (live preview) → review (the starter sub-events the API will create) → "Your plan is ready" |
| `/events/[eventId]` | The shell on a real event; the switcher lists your events and keeps the section when switching |
| `…/schedule` | Sub-events by day in the event's time zone; add, edit and delete in a side panel (desktop) or sheet (phone); venues |
| `…/settings` | Event details and modules, saved with If-Match; a 409 shows the other person's version to re-apply onto |

New shared pieces: `Skeleton`, `ListPresence`, `SidePanel`/`EditPanel`, `timeZoneOptions`. Time helpers and starter sub-event placement moved to `@pme/contracts`.

## Key ideas

- **The URL is the state.** The event id lives in the path, so reload, back and sharing a link all land on the same event and section. Switching events swaps the id and keeps the section.
- **Show event times in the event's zone, not the browser's.** A wedding in Indore shows "10:00" to a cousin in London too. `utcToZonedParts` and `zonedTimeToUtc` convert at the edges; everything stored is UTC.
- **One source for "what will be created".** The wizard's review uses the same `starterSubEvents` as the API, so the preview can't drift from the result.
- **Conflicts are a normal outcome, not an error.** A stale save gets 409 with the current row; the form switches to that version and says so, instead of overwriting or failing.
- **One Idempotency-Key per wizard visit.** A double tap, or a retry after a dropped connection, still creates one event.

## What testing taught us

- **Browsers disagree on time-zone names.** Chrome lists India as `Asia/Calcutta`. A select whose value isn't among its options silently shows the first option, so the default looked like "Africa/Abidjan". Found by looking at a screenshot, now covered by a test.
- **A full disk looks like flaky tests.** Truncated trace files and random timeouts came from the disk filling during a build; clearing my scratch copy fixed it.
- **An overloaded machine looks like a slow database.** A trivial indexed `SELECT` hit the 5-second statement timeout with the load average at 100. Two Playwright workers and a 10-second expect timeout keep real-stack tests reliable on a laptop; CI's clean runner is the final word.
- **Dev servers keep stale route types.** After moving routes, a running `next dev` kept the old ones in `.next/dev/types`, which broke `next build` and `tsc` in the same folder until it restarts.

## Self-check

**Why does the Schedule page group by date using the event's time zone?**
A sub-event at 23:30 India time is the previous evening in UTC. Grouping by the UTC date would put the Sangeet on the wrong day.

**What happens when two organisers edit the same sub-event at once?**
The second save sends an If-Match the server no longer has, gets 409 with the current row, and the panel shows it with a note. Nobody's change is lost silently.

**Why is the wizard's Idempotency-Key created with `useState(() => crypto.randomUUID())`?**
It's created once per visit and stays the same across re-renders and retries, which is exactly what makes a retry recognisable.

**Why did templates' placement logic move to contracts instead of the web app importing core?**
Core imports `node:crypto` (slugs), which can't go into a browser bundle. Contracts is pure TypeScript shared by both.

## My notes

<!-- Write your own notes here. -->
