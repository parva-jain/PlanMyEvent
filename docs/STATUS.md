# Project status

Last updated: Oct 24, 2026 · Updated at the end of every working step.

## Current focus

**Milestone 1 — monorepo scaffold**, branch `chore/m1-scaffold` (pushed Oct 26 with CI, item 10).

Working style: small steps, each explained and reviewed before moving on; learning notes in [`docs/learning/`](learning/README.md), grouped by topic.

**Current track: home page with motion** (changed Oct 24 from the backend-first order). Steps, each reviewed before the next:

| Step | What | Status |
| --- | --- | --- |
| A | Web foundation: Next.js, Tailwind tokens (light + dark), fonts, next-intl, icons, `/dev/ui` | Done |
| B | Motion tokens (`src/lib/motion.ts`, `src/styles/motion.css`) | Done |
| C | `MotionConfig reducedMotion="user"` + `LazyMotion`, reduced-motion override on `/dev/ui` | Done |
| D | Motion components (MOTION.md §4) on `/dev/ui` with a reduced-motion toggle | Done |
| E | Base UI components: Button, Badge, Card, Tabs, Accordion | Done |
| F | Home page with its MOTION.md §6.2 motion (header + hero `4a638d3`, problem `34f4b71`, palette `e8a4c27`, remaining sections in one commit at your request) | Done |
| G | Playwright (normal + reduced motion), Lighthouse mobile ≥ 90, no layout shift | Done |

After the home page: item 9 (Docker Compose) → 10 (CI) → 11 (backend tests) → 12 (docs) → rest of item 8 (app shell) → milestone 2 (auth).

**Home page track complete.** Items 9 (compose, Dockerfiles) and 10 (CI) done; draft PR [#1](https://github.com/parva-jain/PlanMyEvent/pull/1), CI green in about 1.5 min. Item 11 backend tests done: 11a unit tests, 11b API tests against the real app, Postgres and Redis. Item 12 docs done (CLAUDE.md commands, README getting started); root `db:*` scripts now build `@pme/db`'s dependencies first, since a fresh clone failed without them. Next: rest of item 8 (app shell).

Step G (Oct 24): `pnpm test:e2e` runs 8 Playwright smoke tests on desktop and phone (16 runs, all pass) against a production build on port 3100: every section renders, CLS 0 and no console errors in normal and reduced motion, header scroll state, use-case tabs (mouse and keyboard), FAQ, AI teaser typing, and reduced motion leaving drift and typing off. Lighthouse mobile over five runs at load average ~5: performance 92–96 (median 96), accessibility, best practices and SEO 100, CLS 0, TBT 50–150 ms, simulated LCP 2.7–3.3 s, observed LCP 103–197 ms.

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
| 9 | `infra/`: docker-compose (Postgres 17, Redis 7, SeaweedFS + bucket, Mailpit), Dockerfiles, `.env.example` | Done: compose, `infra/Dockerfile` (targets api, worker, web, migrate), `app` profile; `.env.example` for api and worker | |
| 10 | CI: GitHub Actions with install cache, lint, typecheck, test, build, Postgres/Redis services, migration check | Done: `.github/workflows/ci.yml`, jobs `verify` and `e2e`; runs on pull requests and pushes to `main` | |
| 11 | Tests: Vitest in packages, api, worker; Playwright smoke test of the shell at phone and desktop sizes | Backend done: Vitest unit tests in every package and app; API tests boot the real app against Postgres and Redis (health, 503 when a dependency is down, problem+json 404/400/413, `X-Request-Id`); 46 tests in all. Playwright home-page smoke tests (step G); shell test with item 8 | |
| 12 | Docs: CLAUDE.md Commands section, README "Getting started" | Done; verified from a fresh clone | |

**Milestone 1 is done when**, from a fresh clone: `pnpm install`, `docker compose -f infra/docker-compose.yml up -d`, `pnpm db:migrate` and `pnpm dev` start everything; the web app shows the shell on localhost:3000; `/v1/health/ready` returns ok; the worker logs a processed sample job; lint, typecheck, test and build pass; CI is green.

## What runs today

| Check | Result |
| --- | --- |
| `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` | Pass |
| `pnpm test:e2e` (Playwright, builds first) | 16/16 pass |
| `docker compose -f infra/docker-compose.yml --profile app up -d --build --wait` | migrate exits 0 ("Migrations applied"); API ready with Postgres and Redis up, `/v1/docs` 404 in production; worker processes its sample job; web serves the home page and CSS, `/dev/ui` 404; containers run as `node` |
| `docker compose -f infra/docker-compose.yml up -d --wait` | All four healthy in about 12 s; migrations apply; API ready reports Postgres and Redis up; worker processes its sample job; S3 auth and public/private access verified; Mailpit receives SMTP; data survives restart |
| `pnpm db:migrate` against Postgres 17.11 | Applies `0000_extensions` (citext, pg_trgm); idempotent |
| API `GET /v1/health/live` / `ready` | 200; ready → 503 + `Retry-After` when Postgres or Redis is down, recovers automatically |
| API errors | problem+json for 404, bad JSON (400), >1 MB (413), unknown errors (500); every response has `X-Request-Id` |
| API OpenAPI | 3.1 at `/v1/docs` (not in production) |
| Worker | Enqueues and processes `sample-hello` at boot; exits cleanly on SIGTERM |

Local services: `docker compose -f infra/docker-compose.yml up -d --wait` (Postgres, Redis, SeaweedFS, Mailpit; see [`infra/README.md`](../infra/README.md)).

## Decisions taken in milestone 1

| Decision | Why | Recorded in |
| --- | --- | --- |
| NestJS 11.2.7, not 12 | nestjs-zod 5.5 (named in APIDesign) supports Nest ≤ 11; bump when it catches up | This file |
| TypeScript 6.0.3, not 7 | typescript-eslint and @nestjs/swagger don't support TS 7 yet | This file |
| pnpm 12.14.0 installed via npm, corepack's pnpm shim disabled | Corepack (≤ 0.36) can't launch pnpm 12's new package layout | This file |
| Node 22 in `.nvmrc`, engines `>=22.12.0` | Your choice; vitest and nestjs-pino need ≥ 22.12 | `.nvmrc` |
| SeaweedFS replaces MinIO locally (`weed mini`, buckets `pme-public` and `pme-private` created on startup, anonymous read on public only) | MinIO community images discontinued (Oct 2025), repo archived | [Decision 008](decisions/008-seaweedfs-local-storage.md) |
| Event accents keyed by DB `event_type`; `custom` = #7C3AED; "College fest" is a template using `custom` | DESIGN.md, BRAND.md and DatabaseDesign disagreed | DESIGN.md fix due with item 8 |
| Dark-mode tokens missing from DESIGN.md derived in code only, provisional | To be revisited against your Stitch designs | Item 8 |
| Job ids joined with `-` via `jobId()`, never `:` | BullMQ rejects most ids containing `:` | [Decision 005](decisions/005-job-id-format.md) |
| Custom health checks instead of `@nestjs/terminus` | Response must match the `HealthReady` contract | This file |
| Toast via Sonner | shadcn deprecated its Toast component | Item 8 |
| Next.js 16.4.2, not 16.4.3 | 16.4.3 was under a day old and failed pnpm's `minimumReleaseAge`; bump once it ages | This file |
| ~~Dark tokens from the Stitch dark UI kit~~ superseded by decision 007; status, accent and event tints in dark are derived and marked provisional in `globals.css` | Neither DESIGN.md nor Stitch defines them | `apps/web/src/styles/globals.css` |
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
| UI components written by hand on `radix-ui` 1.8.1, styled with our tokens; shadcn CLI used only to read sources (`add --view`); `components.json` kept for future `add` runs | shadcn's generated classes and colour variables don't match DESIGN.md | `src/components/ui/` |
| `cn()` extends tailwind-merge with our type scale, radii and shadows | Otherwise `text-h1` is dropped next to `text-fg` | `src/lib/utils.ts` |
| Tabs pill animated with clip-path and two `snappy` springs, not `layoutId` | No `domMax` bundle on the home page; keeps rounded ends | `src/components/ui/tabs.tsx` |
| `reduce-motion:` Tailwind variant; overrides use `!` | Attribute-scoped animation classes outrank a plain variant | `src/styles/globals.css`, `accordion.tsx` |
| Derived `--event-*-text` tokens (accent + 30% ink in light, + 45% white in dark) for event badges | Raw accents as text fail WCAG AA on their tints | `globals.css` (marked provisional) |
| Playwright 1.64.1 added to apps/web now | Used to verify motion behaviour (computed styles mid-animation) before step G's smoke tests | `apps/web/package.json` |
| Home page: softened feature claims, placeholder pricing, "© 2026 Plan My Event", flat indigo banner, `surface-muted` instead of peach, served at `/` | Stitch copy and styling conflicted with PRD and DESIGN.md | Step F |
| Cool "Mist Deep" neutrals replace the warm palette (light #F2F3FB / #E7E9F7 / #12142B, dark #090B1C / #11142B); Stitch screens stay warm and are read through DESIGN.md's colour map; large amber backgrounds become neutral | Warm palette felt heavier than intended; repainting Stitch adds nothing tokens don't give | [Decision 007](decisions/007-cool-mist-deep-palette.md), DESIGN.md |
| Four text colours adjusted for WCAG AA: accent-text #9F650D, text-muted #736C62 (light) and #9E958A (dark), dark primary #6265F0 | Below 4.5:1 on their surfaces | [Decision 006](decisions/006-aa-contrast-tokens.md), DESIGN.md |
| MOTION.md §6.2 adapted to the Stitch layout; `AmbientFloat` and `Typewriter` added to §4 | Stitch has no device mockups, marquee strip or sticky showcase | `docs/MOTION.md` |
| Hero entrance in CSS (`.rise-in` in `motion.css`, token durations, `--motion` switch), not the JS `Reveal` | The headline is the LCP element; a JS entrance keeps it invisible until hydration. Below-the-fold sections keep `Reveal` | `src/styles/motion.css` |
| Header on phone: logo + "Start free" only (no menu); nav links from `lg` | One-page site; Stitch's phone header overflowed. Revisit if more pages arrive | `src/components/home/site-header.tsx` |
| "See how it works" uses an arrow-down icon, not Stitch's play icon | It scrolls to the section; there is no video | `hero.tsx` |
| `/sign-in` links use `prefetch={false}` | The route arrives in milestone 2; prefetching it logged a 404 | Header, hero |
| Pill highlight starts and ends on Conferences; live card goes from a "before" state (task due, +18) to "after" (ticked, +24) | Server HTML and reduced motion show a sensible state with no jump | `event-type-pills.tsx`, `live-plan-card.tsx` |
| Scroll-linked effects write progress to a CSS variable and let CSS apply it, scaled by `--motion` | One code path for reduced motion and the `/dev/ui` override; Motion doesn't remove styles it already wrote, so a JS `reduced` switch left the section frozen mid-drift | `problem-solution.tsx`, `motion.css` |
| Problem section: the dietary row ("12 Jain meals, auto-tallied") became "Guest list · 412 guests, updated live" | Dietary tracking isn't in the PRD | `messages/en.json` |
| `surface-band` token for alternate sections (light #D7DBEF, dark #1E2244), separate from `surface-muted` | Bands needed more separation (1.24:1 vs 1.09:1) without darkening inputs and in-card fills; chosen from four previewed steps | DESIGN.md, `globals.css` |
| Remaining home sections built in one commit: how it works, features, use cases, guest experience, AI teaser, pricing, FAQ, final call to action, footer | Your request after the palette change | `src/components/home/` |
| Feature copy limited to the PRD MVP (no vendor logins, QR check-in, photo proof, task dependencies, `.ics` invites, custom branding, CSV export); AI and WhatsApp marked as coming | Marketing must not promise features that aren't planned for launch | `messages/en.json` |
| Pricing: Free ₹0 and Pro ₹1,499 placeholders with a "may change" note; Pro button is "Start free, upgrade later" (no waitlist exists) | PRD leaves prices open | `pricing.tsx` |
| How it works: numbered step markers above the cards on desktop, connector drawn between them | A line behind the cards would only show in the 24 px gaps | `how-it-works.tsx`, `step-connector.tsx` |
| Use-case accent fades via `@property`-registered colour variables | Tab panels remount, so element transitions never run | `motion.css` (`.case-accent`) |
| Tabs pill layer matches the active tab at rest, widens only while sliding | Contrast checkers ignore clip-path and flagged inactive tabs (false positive) | `src/components/ui/tabs.tsx` |
| Typewriter gained `onDone`; its caret is a new element per character | Result cards follow the typing; a moving caret counted as layout shift | `typewriter.tsx` |
| Fraunces not preloaded | Only used below the fold; preloading competed with the hero (LCP) | `src/app/layout.tsx` |
| Footer has product and use-case links only | Privacy, terms and company pages don't exist yet | `site-footer.tsx` |
| Compose: images pinned (postgres 17.11-alpine, redis 7.4.11-alpine, seaweedfs 4.48, mailpit v1.31.6), each released at least 10 days earlier; ports bound to 127.0.0.1; named volumes; health checks so `up --wait` returns when ready | Same release-age caution as npm packages; nothing exposed on the network | `infra/docker-compose.yml` |
| CI actions pinned to commit SHAs (checkout v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.0, upload-artifact v7.0.2); `permissions: contents: read`; newer pushes cancel older runs | A moved tag can't change what runs; least privilege | `.github/workflows/ci.yml` |
| Unit tests sit next to the code (`src/**/*.test.ts`); Vitest 5.0.5 in every package and app | Same pattern as core; tests read as documentation of the file beside them | `package.json` `test` scripts |
| API tests in `apps/api/test/` boot `AppModule` through `@nestjs/testing` and `configureApp`, with supertest and the real compose (or CI) Postgres and Redis; env overridden through the `API_ENV` provider; `unplugin-swc` keeps decorator metadata in Vitest | Tests the wiring unit tests can't (middleware order, filters, body limits); a dependency is "down" by pointing it at port 1 | `apps/api/test/create-app.ts`, `apps/api/vitest.config.mts` |
| `@nestjs/testing` 11.2.7, not 12.2 | Must match `@nestjs/core` | `apps/api/package.json` |
| Nest SWC builds ignore `**/*.test.ts` (`nest-cli.json` builder options) | Nest's SWC builder doesn't read `tsconfig.build.json` excludes, so tests were compiled into `dist` and Vitest 5 ran them | `apps/api/nest-cli.json`, `apps/worker/nest-cli.json` |
| CI Playwright job runs in `mcr.microsoft.com/playwright:v1.64.1-noble` (tag must match `@playwright/test`) | Installing browsers and apt dependencies on the runner took over 9 minutes | `.github/workflows/ci.yml` |
| CI migration check: migrate twice, `drizzle-kit check`, and `db:generate` must produce no new files | Catches schema edits without a migration and non-idempotent migrations | `.github/workflows/ci.yml` |
| CI smoke step starts the built API and worker against Postgres and Redis services | Proves the builds boot and connect, not just compile; first real use of the Redis service | `.github/workflows/ci.yml` |
| One `infra/Dockerfile` with targets `api`, `worker`, `web`, `migrate`; Node apps packaged with `pnpm deploy --prod --legacy`, web from Next's standalone output; run as `node` user | One shared build stage; production images carry no dev dependencies or pnpm | `infra/Dockerfile` |
| Node 22.23.4 in images although only 4 days old | Security release (seven CVEs); exception to the release-age wait | `infra/Dockerfile` |
| Migrations in compose run from the full build stage (`migrate` target) | `migrate.ts` runs through tsx and isn't compiled; a production migration step is decided with deployment | `infra/Dockerfile` |
| `@pme/config`'s ESLint presets moved to devDependencies; apps list `"files": ["dist"]` | Lint tooling was shipping in production images (API image 407 → 343 MB); without `files`, deploy skipped the git-ignored `dist` | `packages/config/package.json` |
| Redis with `noeviction` and append-only file | BullMQ requirement; queued jobs are never evicted | `infra/docker-compose.yml` |
| Floating hero cards on desktop only | No room around the card on phones | `hero.tsx` |
| Playwright runs against `next build` + `next start` on port 3100, projects `desktop` (1280 × 860) and `phone` (Pixel 7); reduced motion via `test.use({ reducedMotion: 'reduce' })`; expected text read from `messages/en.json` | Production behaviour; own port so a dev server is never tested by mistake | `apps/web/playwright.config.ts` |

## Open questions

None right now.

## Follow-ups

- Only home-page messages need to reach the browser; today all namespaces (including `devUi`) are sent. Trim if step G needs the bytes.
- Footer privacy and terms links once those pages exist.
- `@sentry/nestjs` 11.8 pulls in `@sentry/bundler-plugins`, whose webpack peer brings webpack, SWC, esbuild and lightningcss (~60 MB) into the API image. Revisit with a Sentry update or a pnpm override.
- Logo SVG/PNG files and app icons still use the warm ink #1F1B16 and warm white #FAF8F5 (BRAND.md note); regenerate in a brand pass.

## Known warnings (harmless)

- `pnpm peers check` reports an unmet `webpack` peer inside `@nestjs/cli`'s own dependencies; unused because we build with SWC.
- `eslint-config-next`'s React, import and jsx-a11y plugins don't declare ESLint 10 support yet; lint runs correctly.
- `next start` warns that it doesn't work with `output: 'standalone'`; it serves the build correctly for tests and Lighthouse. The standalone server is used in the Docker image (item 9).
- `@parcel/watcher` and `unrs-resolver` install scripts are denied in `allowBuilds`; both use prebuilt binaries.

## Learning notes

Index by topic: [`docs/learning/README.md`](learning/README.md) (backend, frontend, infra). Latest: [19 Unit tests](learning/backend/19-unit-tests.md).
