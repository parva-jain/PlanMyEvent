# 04 — One request through the API

Session D1 · milestone 1, item 6 · Oct 23, 2026

## Key ideas

- **Boot order matters.** `main.ts` imports `instrument.ts` first (loads `.env`, starts Sentry), then `NestFactory.create(AppModule)` builds the dependency graph, `configureApp` applies HTTP settings, and the app listens on 4000.
- **`configureApp` is shared** by `main.ts` and the e2e tests, so tests run the real setup.
- **Modules and dependency injection.** Modules declare providers; classes ask for what they need in their constructor and Nest passes in the single shared instance.
- **Tokens.** Library objects (pg `Pool`, ioredis `Redis`) are registered under `Symbol` tokens and injected with `@Inject(TOKEN)`. Our own classes are found by type.
- **Request path:** request-id middleware → body parser (1 MB cap) → pino-http → router → controller → service → `ZodSerializerInterceptor` → response.
- **Liveness vs readiness.** `live` checks nothing (failure means restart). `ready` checks Postgres and Redis and draining state (failure means stop sending traffic).
- **Timeouts everywhere.** `timed()` races each check against a 2-second timer.

## Self-check

**What does dependency injection give us?**
Classes declare what they need instead of building it. Nest creates each dependency once and shares it (one pool for the app), and tests can swap in fakes without changing the class.

**When do you need `@Inject(TOKEN)`, and when is the type enough?**
The type is enough for our own `@Injectable()` classes, because Nest identifies them by class. You need a token for things that aren't our classes or where we want a specific configured instance: a pg `Pool`, an ioredis client, a config object. Interfaces and type-only imports don't exist at runtime, so they can't identify a dependency either.

**Why must `/health/live` not check the database?**
A failing liveness probe makes the orchestrator restart the container. If `live` checked Postgres, a short database blip would restart every API container at once, turning a small hiccup into an outage. Dependency problems belong in readiness, which only stops traffic.

**Why do the checks run in parallel, and why the 2-second cap?**
In parallel, the probe takes as long as the slowest check rather than their sum. The cap means a hung dependency gives a quick "down" instead of hanging the probe, so the orchestrator can act.

**What three things does `@ZodResponse` do?**
It validates the response at runtime (via the serializer interceptor), type-checks the handler's return value at compile time, and documents the response schema in OpenAPI.

## Side questions

**Shared packages, separate deploys: how?**
Shared packages matter only at build time. Each app's build copies in the packages it uses: `turbo prune` and `pnpm deploy` for the API and worker images, Next's bundler for web. So every artifact is self-contained and deploys alone. The run-time risk is version skew between deploys, handled by additive-only changes in `/v1`, deploying the API before the web app, and `/v2` (or expand-then-contract) for breaking changes.

**Where do local Postgres and Redis keep data?**
In containers inside Docker Desktop's Linux VM. Postgres writes files to its data directory, which is a Docker volume at `/var/lib/docker/volumes/<name>/_data` on the VM's disk. Redis keeps data in RAM, with occasional `dump.rdb` snapshots in `/data`. `-p 5432:5432` publishes the port to the Mac's localhost. Containers are disposable and volumes hold the data: `docker rm -f` leaves anonymous volumes behind, `--rm` on a normal stop removes them, and named volumes (used in docker-compose) survive until `docker compose down -v`.

## My notes

<!-- Write your own notes here. -->
