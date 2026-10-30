# 30 — Live updates

Milestone 5, step 5b · Oct 30, 2026

## What happened

A change made by one person can now reach everyone else's open screen:

1. **The action writes the signal.** When `runAction` records an activity entry, it also writes an `entity.changed` signal to the outbox, in the same transaction. Role and member changes add `permissions.changed`; removing a member also takes their sockets out of the event room and tells them `member.removed`.
2. **The worker sends it.** The outbox relay, which already turned rows into email jobs, now publishes `live.signal` rows to Redis using the Socket.io emitter.
3. **The API delivers it.** The `/live` socket server uses the Socket.io Redis adapter, so a message published by the worker reaches the right room on every API instance.
4. **Sockets are members only.** A socket signs in with the session cookie (and must come from the web app's origin) and joins `event:{id}` only if its user is an active member, checked the same way as a REST read.

Signals carry no data, just "sub-event X changed to version 3". The browser re-fetches through the API, so permissions are applied there every time.

Tests: core (which signals each change writes), the worker (what the emitter publishes, and that a Redis failure makes the row retry), the API (refused sockets, joining rooms, a write's signal reaching a member and not an outsider, a removed member leaving the room).

## Key ideas

- **The outbox makes live updates reliable.** The signal is a row committed with the change. If Redis or the worker is down, it waits and goes out later; it can't be lost between "saved" and "sent".
- **The Redis adapter is a message bus between servers.** Each API instance subscribes to Redis channels per room. Whoever publishes (the worker, another instance) doesn't need to know which instance holds which socket.
- **CORS doesn't protect WebSockets.** A browser sends cookies with a WebSocket from any site, so the server checks the Origin header itself.
- **Wait for what you start.** The emitter fires its Redis publishes without waiting. We hand it a small client that keeps each publish's promise and wait for them, so a failure is noticed and retried.

## What testing taught us

- **An event that already happened won't fire again.** A test helper waited for a socket's `connect` event, but the socket had connected while the test was signing in a second user, so the wait never ended. Check the current state (`socket.connected`) before waiting for the event.
- **Two copies of a library can disagree on types.** Nest pinned an older Socket.io patch release, so the server and our code used different copies. A pnpm override made them one.

## Self-check

**Why not emit to the socket straight from the request handler?**
If the server crashed after committing but before emitting, the change would be saved and nobody told. Writing the signal as an outbox row makes it part of the transaction (CLAUDE.md rules 2 and 11).

**A member is removed while watching the event. What stops them seeing more signals?**
The removal writes a "leave" signal: every API instance takes that user's sockets out of the event room, then the user's own room gets `member.removed`. Even before that lands, signals carry no data, and their next REST call gets 404.

**What happens to signals while Redis is down?**
Publishing fails, the relay keeps the row and retries with back-off. Open screens fall back to polling every 30 seconds (step 5c).

## My notes

<!-- Write your own notes here. -->
