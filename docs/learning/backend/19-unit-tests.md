# 19 — Unit tests

Milestone 1, item 11a · Oct 26, 2026

## What happened

Every package and app now has Vitest and a `test` script, and `pnpm test` runs them all through Turborepo: 34 tests in seven packages. CI already ran `pnpm test`, so it picks them up with no change.

| Where | What's tested |
| --- | --- |
| `packages/config` | `defineEnv`: coerces values, treats `FOO=` as unset, lists every bad variable at once. `devDefault`: defaults locally, required in production. URL schemas accept only Postgres and Redis URLs |
| `packages/contracts` | `jobId`: deterministic; rejects `:` and plain integers (decision 005) |
| `packages/db` | `newId` makes time-ordered UUIDv7s; `isUuidV7` rejects other versions |
| `apps/api` | `redactUrl`: invitation tokens never reach logs. `genRequestId`: keeps safe client ids and replaces unsafe ones. `loadApiEnv`: runs with no env locally, demands real values in production |
| `apps/worker` | `redisConnection`: parses credentials (including URL-encoded passwords), database number and TLS from managed-Redis URLs; `maxRetriesPerRequest: null` |
| `packages/core` | (existing) `runAction` order, rollback, outbox rows |

## Key ideas

- **Start with pure functions.** They take input and return output, with no database, network or clock, so tests are fast (milliseconds) and never flaky. Most of our safety rules live in small functions like these: token redaction, id formats, env rules.
- **Test the rule, not the implementation.** "A token never appears in the log line" and "the same token always gives the same hash" are rules. A test that checked the exact regex would break on every refactor without catching anything.
- **Test names are documentation.** `it('requires database, Redis and web origin in production')` explains a design decision to the next reader, and it fails loudly if someone weakens it.
- **Cover the edges that bite in production.** A URL-encoded `@` in a Redis password, a repeated `X-Request-Id` header, an `X-Request-Id` 129 characters long. These are the inputs that break things later.
- **Make each test fail once.** Breaking `redactUrl` on purpose (member-invite tokens no longer redacted) made exactly the matching test fail. A test that can't fail protects nothing.

## What testing taught us

- **Builders don't always read your tsconfig.** Nest's SWC builder compiles everything under `src/` and ignores `tsconfig.build.json`'s `exclude`, so test files landed in `dist/` and would have shipped in the Docker images. `"builder": { "type": "swc", "options": { "ignore": ["**/*.test.ts"] } }` in `nest-cli.json` fixed it. Always look at what a build actually outputs.
- **Vitest 5 no longer skips `dist/` by default.** It found the compiled test copies and failed on them. With tests no longer in `dist/`, the problem is gone at its source.
- **Union types need `toMatchObject`.** BullMQ's `ConnectionOptions` is a union of single-node and cluster options, so `options.port` doesn't type-check. `expect(options).toMatchObject({ port: 6379 })` checks the value without narrowing the type.

## Self-check

**Why do unit tests for `loadApiEnv` pass a plain object instead of setting `process.env`?**
`loadApiEnv(source)` takes its input as a parameter. Tests stay independent of each other and of the machine's real environment, so nothing leaks between tests.

**What could go wrong if test files shipped inside `dist/`?**
They import `vitest`, a dev dependency missing from production images, so anything that loads them crashes. They also bloat the image and expose test fixtures.

**Why test that two different tokens give different hashes?**
A redaction that replaced every token with the same string would pass "the token isn't in the log". Different inputs giving different hashes proves the hash still tells requests apart for debugging.

**Which kind of bug can unit tests not catch here, and what will?**
Wiring: the request id middleware not being registered, or the problem+json filter not applied. Step 11b's API tests start the real app and check that.

## My notes

<!-- Write your own notes here. -->
