# 05 — Errors, logging, shutdown

Session D2 · milestone 1, item 6 · Oct 23, 2026

## Key ideas

- **One exit door for errors.** `ProblemFilter` (`@Catch()` with no arguments) turns everything into `application/problem+json`. `toProblem()` is a pure mapping: Zod validation → 422 with `fields`, `ActionError` → its code, `HttpException` → mapped code, body-parser errors → 400/413, anything else → 500 with no details.
- **Expected vs unexpected.** 4xx are client mistakes: not logged as errors, not sent to Sentry. Only real bugs page you.
- **Structured logs.** pino writes one JSON object per line. Every line carries the request id, which also goes in the `X-Request-Id` header and in error bodies.
- **Redaction.** Auth headers, cookies and magic-link tokens never reach logs.
- **Graceful shutdown order:** mark draining (ready → 503) → close HTTP and sockets (in-flight requests finish) → close Postgres and Redis. A 30-second timer forces exit if something hangs.
- **Sockets and Sentry are stubs.** `/live` is WebSocket-only; Sentry is off unless `SENTRY_DSN` is set.

## The Redis fix: what happened and why

1. **Symptom:** `[ioredis] Unhandled error event` spam when Redis stopped. ioredis is an EventEmitter, and nobody listened to `'error'`.
2. **First fix:** a listener that warns once when Redis goes down and logs once when it's back (`'ready'`), using the error `code` because Node's `AggregateError` had an empty message.
3. **Found while testing:** the warning carried the id of an unrelated old request. nestjs-pino uses AsyncLocalStorage, and because of `lazyConnect` the socket was opened inside that request, so it inherited its context. Fixed by connecting in `onModuleInit`, outside any request.
4. **Found while testing:** sometimes no warning at all. Docker Desktop's port forwarder briefly accepted the TCP connection after Redis stopped and never answered, so ioredis never errored and just hung. Fixed by also listening to `'reconnecting'`, which fires whenever an established connection drops. Not `'close'`, because our own shutdown emits it. Readiness was already correct thanks to the 2-second cap.

Lesson: test the failure path for real, more than once. Each run surfaced something the code review alone wouldn't have.

## Self-check

**Why does `toProblem` live apart from the filter?**
It's a pure function (error in, problem out) with no HTTP objects, so every mapping can be unit-tested directly. The filter only does the HTTP work: status, content type, request id.

**Why are 4xx errors not sent to Sentry?**
They're expected outcomes caused by the client (bad input, missing permission). Reporting them would bury real bugs in noise until people stop reading the alerts.

**Why does a 500 response hide the error message?**
Internal messages and stack traces can leak SQL, file paths or library versions to an attacker. The client gets the `requestId`, and developers find the full error in the logs with it.

**Why must the request-id middleware run before the body parser?**
The body parser can reject a request (bad JSON, over 1 MB) before later middleware runs. If the id were assigned afterwards, those errors would have no id to report or search by.

**Why does the database pool close after the HTTP server, not before?**
Closing HTTP waits for in-flight requests to finish, and those requests may still query the database. Closing the pool first would make them fail mid-flight.

**What does Node do with an `'error'` event that has no listener?**
`EventEmitter` throws it, which crashes the process unless something catches it. ioredis guards against that and prints "Unhandled error event" instead, so you must attach a listener to handle it properly.

## My notes

<!-- Write your own notes here. -->
