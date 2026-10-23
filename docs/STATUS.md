# Project status

Last updated: Oct 23, 2026 · Updated at the end of every working step.

## Current focus

**Milestone 1 — monorepo scaffold**, branch `chore/m1-scaffold` (not pushed yet; first push once CI exists, item 10).

Working style: small steps, each explained and reviewed before moving on; learning notes in [`docs/learning/`](learning/).

**Agreed order for the rest of milestone 1 (backend first):** item 9 (Docker Compose) → 10 (CI) → 11 (backend tests) → 12 (docs) → 8 (web, built from the Stitch screens) → milestone 2 (auth).

**Next step:** item 9, Docker Compose.

**Stitch:** most screens are designed in Stitch. They're used as references for item 8 (CLAUDE.md rule 14: rebuild with our tokens, components and translation keys, never paste the generated code).

## Milestone 1 checklist

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 1 | Root tooling: pnpm workspaces, Turborepo, tsconfig, ESLint, Prettier, Husky + lint-staged, `.nvmrc`, engines | Done | `5bff76e` |
| 2 | `packages/config`: tsconfig presets, ESLint presets, Zod env validation (`defineEnv`, `devDefault`) | Done | `d5d5375` |
| 3 | `packages/contracts`: problem+json schema and error codes, health schemas, value sets | Done | `5b2d109` |
| 4 | `packages/db`: Drizzle + node-postgres, migrate/seed scripts, citext + pg_trgm migration, UUIDv7 helper | Done | `79b0092` |
| 5 | `packages/core`: `ActionContext`, `runAction` with placeholder permission/activity/outbox hooks, tests | Done | `050da31` |
| 6 | `apps/api`: env config, pino + request ids, `/v1` prefix, health live/ready, problem+json filter, Zod validation, OpenAPI 3.1 at `/v1/docs`, CORS, graceful shutdown, optional Sentry, `/live` gateway stub | Done | `5eaf00c` |
| 7 | `apps/worker`: BullMQ connection, sample queue/producer/processor, graceful shutdown | Done | `7e5f995` |
| 8 | `apps/web`: tokens, fonts, shadcn components, Lucide, Motion, next-intl, TanStack Query, favicons, app shell, `/dev/ui`, status widget | Not started; after item 12, from the Stitch screens | |
| 9 | `infra/`: docker-compose (Postgres 17, Redis 7, SeaweedFS + bucket, Mailpit), Dockerfiles, `.env.example` | Not started (`.env.example` done for api and worker) | |
| 10 | CI: GitHub Actions with install cache, lint, typecheck, test, build, Postgres/Redis services, migration check | Not started | |
| 11 | Tests: Vitest in packages, api, worker; Playwright smoke test of the shell at phone and desktop sizes | Partly: core has 3 tests | |
| 12 | Docs: CLAUDE.md Commands section, README "Getting started" | Not started | |

**Milestone 1 is done when**, from a fresh clone: `pnpm install`, `docker compose -f infra/docker-compose.yml up -d`, `pnpm db:migrate` and `pnpm dev` start everything; the web app shows the shell on localhost:3000; `/v1/health/ready` returns ok; the worker logs a processed sample job; lint, typecheck, test and build pass; CI is green.

## What runs today

| Check | Result |
| --- | --- |
| `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` | Pass |
| `pnpm db:migrate` against Postgres 17.11 | Applies `0000_extensions` (citext, pg_trgm); idempotent |
| API `GET /v1/health/live` / `ready` | 200; ready → 503 + `Retry-After` when Postgres or Redis is down, recovers automatically |
| API errors | problem+json for 404, bad JSON (400), >1 MB (413), unknown errors (500); every response has `X-Request-Id` |
| API OpenAPI | 3.1 at `/v1/docs` (not in production) |
| Worker | Enqueues and processes `sample-hello` at boot; exits cleanly on SIGTERM |

Until item 9, run Postgres and Redis by hand:

```
docker run -d --rm --name pg -e POSTGRES_USER=pme -e POSTGRES_PASSWORD=pme -e POSTGRES_DB=pme -p 5432:5432 postgres:17.11-alpine
docker run -d --rm --name redis -p 6379:6379 redis:7.4.11-alpine
```

## Decisions taken in milestone 1

| Decision | Why | Recorded in |
| --- | --- | --- |
| NestJS 11.2.7, not 12 | nestjs-zod 5.5 (named in APIDesign) supports Nest ≤ 11; bump when it catches up | This file |
| TypeScript 6.0.3, not 7 | typescript-eslint and @nestjs/swagger don't support TS 7 yet | This file |
| pnpm 12.14.0 installed via npm, corepack's pnpm shim disabled | Corepack (≤ 0.36) can't launch pnpm 12's new package layout | This file |
| Node 22 in `.nvmrc`, engines `>=22.12.0` | Your choice; vitest and nestjs-pino need ≥ 22.12 | `.nvmrc` |
| SeaweedFS replaces MinIO locally | MinIO community images discontinued (Oct 2025), repo archived | Decision 006, to be written with item 9 |
| Event accents keyed by DB `event_type`; `custom` = #7C3AED; "College fest" is a template using `custom` | DESIGN.md, BRAND.md and DatabaseDesign disagreed | DESIGN.md fix due with item 8 |
| Dark-mode tokens missing from DESIGN.md derived in code only, provisional | To be revisited against your Stitch designs | Item 8 |
| Job ids joined with `-` via `jobId()`, never `:` | BullMQ rejects most ids containing `:` | [Decision 005](decisions/005-job-id-format.md) |
| Custom health checks instead of `@nestjs/terminus` | Response must match the `HealthReady` contract | This file |
| Toast via Sonner | shadcn deprecated its Toast component | Item 8 |

## Open questions

- None blocking. Before item 8: Stitch exports added to the repo, and tokens extracted and compared with DESIGN.md.

## Known warnings (harmless)

- `pnpm peers check` reports an unmet `webpack` peer inside `@nestjs/cli`'s own dependencies; unused because we build with SWC.

## Learning notes

[01 Monorepo basics](learning/01-monorepo-basics.md) · [02 Contracts and database](learning/02-contracts-and-database.md) · [03 Action pattern](learning/03-action-pattern.md) · [04 API request flow](learning/04-api-request-flow.md) · [05 Errors, logging, shutdown](learning/05-errors-logging-shutdown.md) · [06 Queues and BullMQ](learning/06-queues-and-bullmq.md) · [07 Worker app](learning/07-worker-app.md)
