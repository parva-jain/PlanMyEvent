# Project status

Last updated: Oct 24, 2026 · Updated at the end of every working step.

## Current focus

**Milestone 1 — monorepo scaffold**, branch `chore/m1-scaffold` (not pushed yet; first push once CI exists, item 10).

Working style: small steps, each explained and reviewed before moving on; learning notes in [`docs/learning/`](learning/).

**Current track: home page with motion** (changed Oct 24 from the backend-first order). Steps, each reviewed before the next:

| Step | What | Status |
| --- | --- | --- |
| A | Web foundation: Next.js, Tailwind tokens (light + dark), fonts, next-intl, icons, `/dev/ui` | Done |
| B | Motion tokens (`src/lib/motion.ts`, `src/styles/motion.css`) | Done |
| C | `MotionConfig reducedMotion="user"` + `LazyMotion`, reduced-motion override on `/dev/ui` | Done |
| D | Motion components (MOTION.md §4) on `/dev/ui` with a reduced-motion toggle | Done |
| E | Base UI components: Button, Badge, Card, Tabs, Accordion | Next |
| F | Home page, one section per commit, with its MOTION.md §6.2 motion | |
| G | Playwright (normal + reduced motion), Lighthouse mobile ≥ 90, no layout shift | |

After the home page: item 9 (Docker Compose) → 10 (CI) → 11 (backend tests) → 12 (docs) → rest of item 8 (app shell) → milestone 2 (auth).

**Next step:** E, base UI components.

**Stitch:** read directly through the Stitch MCP server (project "Plan My Event Design System"). Screens are references, rebuilt with our tokens, components and translation keys (CLAUDE.md rule 14).

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
| 8 | `apps/web`: tokens, fonts, shadcn components, Lucide, Motion, next-intl, TanStack Query, favicons, app shell, `/dev/ui`, status widget | In progress: foundation done (step A, `c9896b5`); home page track above | |
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
| Next.js 16.4.2, not 16.4.3 | 16.4.3 was under a day old and failed pnpm's `minimumReleaseAge`; bump once it ages | This file |
| Dark tokens from the Stitch dark UI kit (primary-tint #2D2A45, border-strong #4D453C, text-muted #8E857A, primary-hover #4F46E5); status, accent and event tints in dark are derived and marked provisional in `globals.css` | Neither DESIGN.md nor Stitch defines them | `apps/web/src/styles/globals.css` |
| DESIGN.md `text` tokens are `fg`, `fg-secondary`, `fg-muted` in code | Avoids classes like `text-text-secondary` | `globals.css` comment |
| next-intl without locale routing (English only) | Routing arrives with Hindi | `src/i18n/request.ts` |
| `/dev/ui` returns 404 in production | Internal showcase only | `src/app/dev/ui/page.tsx` |
| motion 14.6.0 | Current stable, past pnpm's release-age window | `apps/web/package.json` |
| `motion.css` also defines `--dur-instant`, `--dur-deliberate`, `--press-scale`, `--lift` | Listed in MOTION.md's token tables but missing from its CSS sample; `Pressable` needs `instant` | `src/styles/motion.css` |
| Reduced-motion override (`user` / `always` / `never`) in React context, mirrored to `<html data-reduced-motion>` | Lets `/dev/ui` compare both modes for Motion and CSS effects | `src/components/motion/motion-provider.tsx` |
| CSS-only effects share one `--motion` variable (1 normal, 0 reduced) that scales their distances | One switch for the OS setting and the override; reduced keeps colour and shadow changes | `src/styles/motion.css` |
| Pressable and HoverLift are Tailwind utilities (`pressable`, `hover-lift`); HoverLift only on hover-capable devices | MOTION.md says CSS; avoids sticky hover on touch | `src/styles/globals.css` |
| CountUp renders the final number in server HTML; resets to 0 only if it starts off-screen, and reserves the final width | Correct for SEO, no-JS and reduced motion; no flash for numbers visible at load; no layout shift | `src/components/motion/count-up.tsx` |
| ProgressFill handles reduced motion explicitly | MotionConfig only skips transform animations, not the ring's `pathLength` | `src/components/motion/progress-fill.tsx` |
| LogoMark rebuilt with Motion from `mark-animated.svg`'s shapes and timings; a `<head>` script marks "intro pending" so it never flashes | The SVG's CSS ignores the `/dev/ui` override and can't play once per session | `src/components/motion/logo-mark.tsx`, `src/lib/logo-intro.ts` |
| canvas-confetti 1.9.4 loaded on first use; once-per-milestone keys in localStorage | Keeps it out of the initial bundle; MOTION.md principle 5 | `src/components/motion/confetti.tsx` |
| Typewriter caret blinks every 1 s and is removed 2 s after typing ends | Nothing blinks indefinitely (WCAG 2.2.2); added to MOTION.md §4 | `docs/MOTION.md` |
| Effects that start animations wait for hydration | Otherwise they start with `reduced = false` and freeze mid-way when the real value arrives | LogoMark, AmbientFloat |
| Playwright 1.64.1 added to apps/web now | Used to verify motion behaviour (computed styles mid-animation) before step G's smoke tests | `apps/web/package.json` |
| Home page: softened feature claims, placeholder pricing, "© 2026 Plan My Event", flat indigo banner, `surface-muted` instead of peach, served at `/` | Stitch copy and styling conflicted with PRD and DESIGN.md | Step F |
| MOTION.md §6.2 adapted to the Stitch layout; `AmbientFloat` and `Typewriter` added to §4 | Stitch has no device mockups, marquee strip or sticky showcase | `docs/MOTION.md` |

## Open questions

- None blocking. Before item 8: Stitch exports added to the repo, and tokens extracted and compared with DESIGN.md.

## Known warnings (harmless)

- `pnpm peers check` reports an unmet `webpack` peer inside `@nestjs/cli`'s own dependencies; unused because we build with SWC.
- `eslint-config-next`'s React, import and jsx-a11y plugins don't declare ESLint 10 support yet; lint runs correctly.
- `@parcel/watcher` and `unrs-resolver` install scripts are denied in `allowBuilds`; both use prebuilt binaries.

## Learning notes

[01 Monorepo basics](learning/01-monorepo-basics.md) · [02 Contracts and database](learning/02-contracts-and-database.md) · [03 Action pattern](learning/03-action-pattern.md) · [04 API request flow](learning/04-api-request-flow.md) · [05 Errors, logging, shutdown](learning/05-errors-logging-shutdown.md) · [06 Queues and BullMQ](learning/06-queues-and-bullmq.md) · [07 Worker app](learning/07-worker-app.md) · [08 Web foundation](learning/08-web-foundation.md) · [09 Motion tokens and provider](learning/09-motion-tokens-and-provider.md) · [10 Motion components](learning/10-motion-components.md)
