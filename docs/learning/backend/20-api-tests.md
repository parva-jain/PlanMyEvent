# 20 — API tests

Milestone 1, item 11b · Oct 26, 2026

## What happened

`apps/api/test/` now holds tests that boot the whole API: the real `AppModule`, the same `configureApp` setup as `main.ts`, and the real Postgres and Redis from Docker Compose (in CI, the job's service containers). Requests go through supertest, which calls the app's HTTP server without opening a port. That adds 12 tests, for 46 across the repo.

| File | What's tested |
| --- | --- |
| `test/create-app.ts` | Helper: builds the app with `@nestjs/testing`, replaces the `API_ENV` provider so a test can change one variable, silences logs, waits for the first Redis outcome |
| `test/health.test.ts` | `live` is 200 and touches nothing; `ready` is 200 with both up; 503 with `Retry-After: 5` when Redis is down, and when Postgres is down, naming which one |
| `test/errors.test.ts` | problem+json for an unknown route (404), malformed JSON (400) and a body over 1 MB (413); no stack traces or `X-Powered-By`; `X-Request-Id` on every response, equal to the `requestId` in the error body, echoed when the client sends a safe one, present even on body-parser errors |

New dev dependencies: `@nestjs/testing` (11.2.7, matching `@nestjs/core`), `supertest`, `@types/supertest`, `unplugin-swc`.

## Key ideas

- **Unit tests check the parts; API tests check the wiring.** `genRequestId` has unit tests, but only an API test can tell you that the middleware runs *before* the body parser, so a malformed-JSON error still gets a request id. Same for "the problem filter is registered" and "the body limit is 1 MB".
- **Use real dependencies when they're cheap.** Postgres and Redis already run in compose and in CI. Mocking them would test our mocks; the real ones catch connection settings, timeouts and driver behaviour.
- **Simulate an outage by pointing at nothing.** `redis://127.0.0.1:1` has nobody listening, so the connection is refused instantly. No need to stop containers, and other tests keep running against the healthy ones.
- **Override configuration through dependency injection.** The app reads its settings from the `API_ENV` provider, so a test swaps that one provider instead of editing `process.env`, which would leak into other tests.
- **Why `unplugin-swc`:** Vitest compiles TypeScript with esbuild, which doesn't emit decorator metadata. Nest reads that metadata to know what to inject into constructors, so without SWC the services get `undefined`.

## What testing taught us

- **The first run found a real race.** The API connects to Redis in the background at boot. A readiness check in the first few milliseconds sees Redis still connecting and correctly reports "down". In production that's right (the load balancer just tries again a few seconds later), so the code stays; the test helper waits for Redis to connect or fail before testing.
- **Problem `type` URIs are kebab-case** (`/errors/not-found`) while `code` is snake_case (`not_found`). The test now pins both.
- **Each test can fail.** Removing the problem filter failed five tests; raising the body limit to 10 MB failed exactly the 413 test. Both files were restored.

## Self-check

**Why does `createApp` pass `bodyParser: false` and then rely on `configureApp`?**
`main.ts` does the same: Nest's built-in parser would run before our request-id middleware. Tests must build the app exactly like production, or they test a different app.

**Why is the 503 test's `Retry-After` header important?**
It tells a load balancer or client when to try again, instead of hammering a struggling instance. APIDesign makes it part of the readiness contract.

**What would go wrong if tests changed `process.env.REDIS_URL` instead of overriding `API_ENV`?**
Every test file in the same worker would see the change, so a test's result could depend on which other tests ran before it.

**Why does the 413 test matter for security?**
Without a limit, one client can send a huge body and make the server hold it all in memory. The test makes sure nobody raises the limit by accident.

## My notes

<!-- Write your own notes here. -->
