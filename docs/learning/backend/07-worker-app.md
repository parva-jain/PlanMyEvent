# 07 — The worker app

Item 7, step 2 · Oct 23, 2026

## Key ideas

- **Standalone Nest app.** `NestFactory.createApplicationContext` gives DI and lifecycle hooks with no HTTP server. BullMQ's Redis connection keeps the process alive.
- **Connection settings differ by role.** The API's Redis client fails fast (`maxRetriesPerRequest: 1`, no offline queue) because Redis is optional there. The worker sets `maxRetriesPerRequest: null`, which BullMQ requires, because workers block on Redis and must retry forever.
- **Producer and processor.** `SampleProducer` adds one job at boot (3 attempts, exponential back-off, removed on completion). `SampleProcessor` (`@Processor('sample', { concurrency: 2 })`) consumes it.
- **Deterministic ids through one helper.** `jobId('sample', 'hello')` → `sample-hello`. Adding the same id twice leaves one job, and the first data wins.
- **Shutdown.** `@nestjs/bullmq` closes workers on SIGTERM (stop taking jobs, finish active ones); our lifecycle service only adds the 30-second cap.
- **Install scripts.** `msgpackr-extract` (an optional native speed-up) is denied in `allowBuilds`; BullMQ falls back to pure JS.

## What testing taught us

- **Verify library rules in the source.** BullMQ 6 rejects custom ids containing `:` unless they have exactly three parts, a legacy exception marked for removal. The design docs' `invite-email:<id>:<version>` format worked by coincidence. Decision 005 switches every job id to `-` separators via `jobId()` in `@pme/contracts`.
- **Correct yourself out loud.** I first said "any `:` is rejected". A quick experiment showed the three-part exception, and reading the code explained it.

## Self-check

**Why does the worker set `maxRetriesPerRequest: null` while the API sets 1?**
The API treats Redis as an optional speed layer and must answer users quickly, so commands fail fast. The worker can't do anything without Redis: its blocking "wait for the next job" commands must keep retrying through outages rather than error out.

**Why remove completed sample jobs?**
A completed job with a fixed id would still exist on the next boot, so the add would be ignored as a duplicate and no new job would run. Removing it on completion frees the id. Real jobs keep a short history for debugging instead.

**Why put `jobId()` in `@pme/contracts` rather than in the worker?**
Both the outbox writer (core) and the worker build job ids. One shared helper means the rule (`-` separators, no integer ids) is enforced in one place and can't drift between them.

## My notes

<!-- Write your own notes here. -->
