# 31 — Live screens and undo in the web app

Milestone 5, step 5c · Oct 30, 2026

## What happened

The web app now listens to the `/live` socket from step 5b and shows the activity log:

- **Live screens.** While an event is open, one socket per tab sits in that event's room. When someone else changes something, the screens showing it re-fetch, and the changed row glows with "Rahul just updated this".
- **Activity** (`/events/{id}/activity`): every change grouped by day in the event's time zone, with "Name: Haldi → Haldi ceremony" lines. It has filters (type, only mine) and an Undo button where undo is allowed. Undone entries are struck through with "Undone by Priya". If the thing changed since, a dialog compares what undo would set with what's there now.
- **Undo bar.** Deleting a sub-event or a venue shows "Radisson Lawn deleted · Undo" for 5 seconds.
- **Removed from the team.** The removed member's screen says so at once, instead of failing on the next click.
- **Fallback.** If the socket stays down, what's on screen re-fetches every 30 seconds until it's back.

Tests: Playwright adds `live.spec.ts`, which runs on desktop and phone with two browsers (an owner and an Editor). It checks:

- a change appears without a reload;
- the owner undoes it from Activity;
- a new entry arrives while the log is open;
- undo works after deleting a venue;
- a removed member is told.

## Key ideas

- **Signals are hints, REST is the truth.** A signal only says "sub-event X changed". The client marks the matching queries stale, and TanStack Query re-fetches the ones on screen. Permissions are applied by the same API guard as always.
- **Skip your own echo.** Every write from this tab sends an `X-Request-Id` the tab remembers. The signal carries that id back, so the tab that made the change doesn't re-fetch or glow for it; its own mutation already updated the screen. Reads don't send the header: a custom header would add a CORS preflight to every GET.
- **Versions beat ordering.** Signals can arrive late or twice. If the cache already holds version 5 of a row, a signal about version 4 is ignored.
- **Gaps are re-fetched, not replayed.** Signals aren't stored. After a reconnect, the client re-fetches everything on screen, and rooms are joined again, because Socket.io forgets them on reconnect.
- **Find the entry by request id.** A DELETE returns 204 with no body. The undo bar already knows the request id it sent, so it looks up that entity's history for the entry with the same id and undoes it. No API change was needed.
- **Something that outlives its screen can't use that screen's hooks.** The undo bar stays up after the edit panel closes, or after you leave the page. So its Undo is a plain function holding the query client, not a `useMutation` from a component that may be gone.
- **Hold the list still while reading.** If you've scrolled down, new entries wait above the one that was on top, and a "2 new changes" pill offers to go up. Nothing jumps under your finger.

## What testing taught us

- **Lint catches impure renders.** `Date.now()` in render was flagged by the React Compiler rule. "Today" is now captured once with `useState(() => new Date())`.
- **Visible isn't opaque.** Playwright counts an element at opacity 0 as visible. The highlight label stays in the DOM for 2 s, so "Rahul just updated this" can be asserted reliably even though it fades.
