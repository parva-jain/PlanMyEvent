# Project status

Last updated: Oct 30, 2026 · Updated at the end of every working step.

## Current focus

**Milestone 6 — tasks, budget categories and expenses**, branch `feat/m6-tasks-budget`. Milestones 1–5 and the review fixes are merged to `main` (PRs #1 and #2 squashed, #3–#6 rebase-merged).

| Step | What | Status |
| --- | --- | --- |
| 6a | Tasks backend: `tasks` and `task_assignees` (migration 0005); create, update, assign, delete and restore actions with sub-event scope, `tasks.update_own` for assignees, one level of subtasks, fractional positions per status column; starter tasks from each template; `E/tasks`, `E/tasks/{id}/assignees` and `GET /v1/me/tasks`; activity and undo for tasks | Done |
| 6b | Budget backend: categories with planned, committed and paid totals; expenses with amounts that match their payment status, duplicate transaction refs refused, Idempotency-Key required on `POST E/expenses`; starter categories; activity and undo | Done |
| 6c | Tasks web: list grouped by status and a kanban board (dnd-kit, keyboard dragging), filters (mine, sub-event, assignee, status), quick add, tick-to-complete with strike and slide, phone swipe to complete, edit panel with assignees and subtasks, delete with undo, "Deleted sub-event" chip, My tasks on the My events page, live updates (MOTION.md 6.6) | Done |
| 6d | Budget web: overall budget and totals with count-ups, due soon, by category (bars with paid and committed segments, over-plan chip, expanding expense lists) and by sub-event, expense panel with status-driven fields and the duplicate-reference error, category panel, deletes with undo, "every payment is settled" celebration (MOTION.md 6.14) | Done |
| 6d.1 | Feedback: subtasks show under their task in the list (smaller, indented, tick from the row); budget gets an "Add an expense" quick-add bar (title, amount, category, already paid), an All expenses tab, and a + on every category | Done |
| 6e | Milestone review: moving a task to another sub-event now takes its subtasks along (they stayed behind, outside the new scope); a subtask ticked twice quickly from its row no longer sends a stale version; regression test for a Helper undoing their own tick-off. PR #7 ready to merge | Done |

Receipt uploads wait for the media table (gallery, milestone 8).

### Milestone 5 (done)

Activity log with undo, live updates through the outbox and Socket.io, the Activity page and the undo bar. Merged as rebase of PR #6 (`311e4e8`).

### Review fixes (done)

The 7 major findings from the milestone 1–4 reviews, each with a test that failed first; the milestone 4 QA spec in `apps/web/e2e/qa-m4.spec.ts`. Merged as rebase of PR #5 (`9545c75`). Minor findings are under Follow-ups.

### Milestone 4 (done)

Members, roles and permissions with sub-event scopes, the permission guard and cache, the Team page, roles, the role editor and the join page. Merged as rebase of PR #4 (`fb4dff4`).

### Milestone 3 (done)

Events from templates, sub-events, venues, modules; the web app's My events, wizard, Schedule and Settings. Merged as rebase of PR #3 (`b999f80`).

### Milestone 2 (done)

Sign-in with Google and email codes, personal workspaces, the outbox relay with email delivery (decisions 009, 010). Merged as `c70f574`.

### Milestone 1 (done)

Working style: since Oct 26, larger steps (a feature or milestone slice each), short summaries, a pause between steps; one learning note per feature in [`docs/learning/`](learning/README.md), grouped by topic.

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

**Home page track complete.** Items 9 (compose, Dockerfiles) and 10 (CI) done; draft PR [#1](https://github.com/parva-jain/PlanMyEvent/pull/1), CI green in about 1.5 min. Item 11 backend tests done: 11a unit tests, 11b API tests against the real app, Postgres and Redis. Item 12 docs done (CLAUDE.md commands, README getting started); root `db:*` scripts now build `@pme/db`'s dependencies first, since a fresh clone failed without them. Item 8 app shell done (Oct 26). **Milestone 1 is complete**: next, mark PR #1 ready and merge, then milestone 2 (auth).

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
| 8 | `apps/web`: tokens, fonts, shadcn components, Lucide, Motion, next-intl, TanStack Query, favicons, app shell, `/dev/ui`, status widget | Done: foundation (step A, `c9896b5`), home page track above, app shell at `/app` (sidebar, rail, bottom bar, event switcher, quick add, API status widget) | |
| 9 | `infra/`: docker-compose (Postgres 17, Redis 7, SeaweedFS + bucket, Mailpit), Dockerfiles, `.env.example` | Done: compose, `infra/Dockerfile` (targets api, worker, web, migrate), `app` profile; `.env.example` for api and worker | |
| 10 | CI: GitHub Actions with install cache, lint, typecheck, test, build, Postgres/Redis services, migration check | Done: `.github/workflows/ci.yml`, jobs `verify` and `e2e`; runs on pull requests and pushes to `main` | |
| 11 | Tests: Vitest in packages, api, worker; Playwright smoke test of the shell at phone and desktop sizes | Backend done: Vitest unit tests in every package and app; API tests boot the real app against Postgres and Redis (health, 503 when a dependency is down, problem+json 404/400/413, `X-Request-Id`); 46 tests in all. Playwright home-page smoke tests (step G) and shell tests (navigation, event switcher, quick add, status widget states, sheet motion and reduced motion) | |
| 12 | Docs: CLAUDE.md Commands section, README "Getting started" | Done; verified from a fresh clone | |

**Milestone 1 is done when**, from a fresh clone: `pnpm install`, `docker compose -f infra/docker-compose.yml up -d`, `pnpm db:migrate` and `pnpm dev` start everything; the web app shows the shell on localhost:3000; `/v1/health/ready` returns ok; the worker logs a processed sample job; lint, typecheck, test and build pass; CI is green.

## What runs today

| Check | Result |
| --- | --- |
| `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` | Pass |
| `pnpm test:e2e` (Playwright, builds web, API and worker first) | 52 pass, 2 skipped (sheet tests on desktop); sign-in and events tests run the real API and worker (codes from Mailpit) |
| `docker compose -f infra/docker-compose.yml --profile app up -d --build --wait` | migrate exits 0 ("Migrations applied"); API ready with Postgres and Redis up, `/v1/docs` 404 in production; worker processes its sample job; web serves the home page and CSS, `/dev/ui` 404; containers run as `node` |
| `docker compose -f infra/docker-compose.yml up -d --wait` | All four healthy in about 12 s; migrations apply; API ready reports Postgres and Redis up; worker processes its sample job; S3 auth and public/private access verified; Mailpit receives SMTP; data survives restart |
| `pnpm db:migrate` against Postgres 17.11 | Applies `0000_extensions` (citext, pg_trgm); idempotent |
| API `GET /v1/health/live` / `ready` | 200; ready → 503 + `Retry-After` when Postgres or Redis is down, recovers automatically |
| API errors | problem+json for 404, bad JSON (400), >1 MB (413), unknown errors (500); every response has `X-Request-Id` |
| API OpenAPI | 3.1 at `/v1/docs` (not in production) |
| Worker | Enqueues and processes `sample-hello` at boot; exits cleanly on SIGTERM |
| Web `/app` shell | Phone, tablet and desktop layouts; sample events; status widget reads the API's readiness ("All systems normal" with the API running, "Can't reach the server" without) |

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
| App shell lives at `/app` with sample events (`preview-events.ts`) and section placeholders | No events or auth yet; milestone 3 moves it to `/events/[eventId]` and loads real events | `apps/web/src/app/app/`, `src/components/shell/` |
| Phone: bottom bar + More screen; tablet: icon rail; desktop: 248 px sidebar with the event switcher; quick add is a + button (phone, tablet) or "Add" in the top bar (desktop) | DESIGN.md "Layout" and the Stitch dashboard screens | `src/components/shell/` |
| `Sheet` (Radix Dialog + Motion drag) and `Popover` (Radix + CSS keyframes scaled by `--motion`) | MOTION.md section 4 and 6.1; Radix handles focus, Escape and aria | `src/components/motion/sheet.tsx`, `src/components/ui/popover.tsx` |
| TanStack Query 5.104.3 (11 days old; 5.104.4/5 too new); `QueryProvider` only in the `/app` layout | Marketing pages don't need it; release-age rule | `src/components/query-provider.tsx` |
| Event dates always day-month ("Sat, 14 Nov 2026") via `formatEventDate` | DESIGN.md date style; the `en` locale would give US order | `src/lib/format.ts` |
| Milestone 2 gets a minimal outbox relay (outbox table, relay into BullMQ, email queue) so sign-in OTP emails follow rule 2; milestone 5 adds activity log, undo and sockets on top. Configurable through env: relay on/off, poll interval, batch size, email transport (SMTP to Mailpit locally, Resend in production) | Approved Oct 26; avoids a temporary exception for auth emails. A decision record and the CLAUDE.md milestone list change come with the milestone 2 commit | This file |
| Event templates are code in `packages/core` (modules, response mode, starter sub-events in the event's time zone); starter tasks and budget categories wait for their tables (milestone 6) | Templates are data that core uses inside the create transaction | `packages/core/src/events/templates.ts` |
| Core actions reach the database through ports core defines (`CoreTx`: users, workspaces, events, venues, sub-events); `packages/db` implements them, tests use an in-memory fake | Keeps core free of Drizzle and lets action tests run without Postgres | `packages/core/src/ports.ts`, `packages/core/src/testing/memory-tx.ts` |
| API reads go through `eventQueries` in `packages/db` | Every query keeps its `event_id` filter in one place; avoids Drizzle's CJS/ESM type split in the API | `packages/db/src/queries/events.ts` |
| Deleting a venue clears it from its sub-events (bumping their versions) instead of refusing | Matches what people expect; sub-events keep their times | `packages/db/src/stores/events.ts` |
| Idempotency keys: stored per user for 24 h; the route's status is stored (Nest sets it after interceptors); failures release the key | APIDesign "Idempotency-Key" | `apps/api/src/http/idempotency.interceptor.ts` |
| Worker Vitest runs on `src/` only | `nest start --watch` compiles test files into `dist/` | `apps/worker/vitest.config.mts` |
| Better Auth's origin and callback-URL checks are forced on (`disableOriginCheck: false`) | It skips them under `NODE_ENV=test`, so tests would pass for redirects production refuses | `apps/api/src/auth/auth.ts`, `apps/api/test/google.test.ts` |
| Signed-in routes: `/app` is My events, `/events/new` the wizard, `/events/[eventId]/…` the shell; sample events removed | Real events replace the preview data; URLs carry the event so links and reloads work | `apps/web/src/app/(signed-in)/` |
| Time-zone helpers and starter sub-event placement live in `@pme/contracts` | The wizard previews exactly what the API creates; core can't be bundled for the browser (node:crypto) | `packages/contracts/src/time.ts`, `templates.ts` |
| Wizard leaves out Stitch's College fest card, attendee size and per-day toggles | Five PRD templates; the create API has no fields for the rest yet | `components/events/create-event-wizard.tsx` |
| New motion pieces: `Skeleton`, `ListPresence`/`ListItem`, `SidePanel`/`EditPanel` | MOTION.md section 4 patterns, built when first needed | `src/components/motion/` |
| Time-zone pickers always include the current zone | Chrome lists India as Asia/Calcutta, so Asia/Kolkata silently fell back to the first option | `src/lib/format.ts` (`timeZoneOptions`) |
| Unknown event sections render not-found with status 200 | Next streams the dynamic `[eventId]` layout before the page calls `notFound()`; signed-in pages are noindex anyway | `app/(signed-in)/events/[eventId]/[section]/page.tsx` |
| Standard role presets: Admin = all but `event.delete`; Editor = plan content (sub-events, tasks, budget, guests, registrations, check-in, gallery upload) plus `members.view` and `activity.view`; Helper = view, `tasks.update_own`, `checkin.perform`, `gallery.upload`; Viewer = every `.view` permission | PRD gives one-line summaries only | `packages/contracts/src/permissions.ts` |
| Any `event.view` grant, even one scoped to a sub-event, opens the event (GET E, modules, venues, members, roles) | Otherwise a member scoped to Mehendi couldn't open the event at all | `apps/api/src/events/event-access.ts` (scope `'list'`) |
| Changing or removing a member needs at least their permissions; the Owner's roles change only by transfer | Extends PRD rule 3, so a narrow role holding `members.manage` can't demote an Admin | `packages/core/src/team/member-actions.ts` |
| Email invites are single use and need the invited address on accept (403 with a masked hint); shareable links take any signed-in user, up to `maxUses` | An emailed link forwarded to someone else shouldn't let them in | `packages/core/src/team/invite-actions.ts` |
| Accept re-checks the invite: deleted roles or sub-events drop out, the inviter must still hold `members.manage` and cover the grants, otherwise 410 `link_revoked` | DatabaseDesign "re-validated then" | Same file |
| Transfer ownership takes `keepRoleId`, the role the old owner keeps for the whole event (usually Admin) | Standard roles have no fixed key once renamed; the UI defaults to Admin | `TransferOwnershipSchema` |
| Removing a member deletes their role assignments and keeps the member row (status `removed`); re-joining reuses the row | DatabaseDesign "Removed members keep their history" | `packages/db/src/stores/team.ts` |
| Permissions are read inside the action's transaction; only the API guard uses the Redis cache (`perm:{event}:{user}:{roles_version}`, 10 min); non-members aren't cached | SystemDesign 5.5; a just-committed role change must count for writes | `apps/api/src/events/permission-cache.ts` |
| Migration 0003 backfills existing events (five roles, owner as member with Owner), ids from a SQL UUIDv7 function | Owners of earlier events would otherwise get 404 | `packages/db/drizzle/0003_members_and_roles.sql` |
| The shell loads `GET E/me` with the event; nav sections, quick add and edit controls show only what the member can use; a section opened by URL that they can't use says which permission is missing | MOTION.md 6.9 "rows hidden by role are absent"; APIDesign "Permissions the client can read" | `components/shell/current-event.tsx`, `nav.ts`, `no-access.tsx` |
| Sign-in returns to where you came from via `?next=` (email code, Google callback, Welcome, session gate); only same-site paths | Join links must survive sign-in; no open redirect | `src/lib/return-to.ts` |
| Join page lives in the `(auth)` layout and works signed out; email-invite mismatch offers "Use another account" | Stitch "Team invite sign-in" / "Accept team invite" | `app/(auth)/join/[token]/page.tsx`, `components/team/join.tsx` |
| Invite panel offers one role (plus scope) per invite; the member panel edits several | Stitch shows one role per invite; the API takes up to 10 | `components/team/invite-panel.tsx` |
| Revoke invite, remove member, transfer and leave use tap-twice confirmation instead of MOTION.md's UndoSnackbar | Team changes aren't undoable (milestone 5 decision below) | `components/team/` |
| Playwright: 2 workers, 10 s expect timeout | Each worker drives the real API, worker and database; more starved a busy laptop into timeouts | `apps/web/playwright.config.ts` |
| Web session check runs in the browser (`SessionGate` on GET /v1/me), not in Next middleware | The session cookie belongs to the API host, which the web server never sees in production | `src/components/auth/session-gate.tsx` |
| Sign-in uses Better Auth's client; everything else `apiFetch` with problem+json errors | Decision 010 | `src/lib/auth-client.ts`, `src/lib/api.ts` |
| Google button shows only with `NEXT_PUBLIC_GOOGLE_SIGN_IN=true` | The API enables Google only when its credentials are set | `apps/web/.env.example` |
| Code entry is one real input under six boxes (`autocomplete="one-time-code"`), no on-screen keypad; no "end-to-end encrypted" badges | Paste and SMS autofill work; the phone keyboard is better than a keypad; the badge claim isn't true | `src/components/auth/code-input.tsx` |
| Playwright starts the API (port 4100) and worker from their builds; CI's e2e job gets Postgres, Redis and Mailpit services | Sign-in can only be tested end to end with the real stack | `apps/web/playwright.config.ts`, `.github/workflows/ci.yml` |
| Activity entries store `<entityType>.<verb>` (`sub_event.update`); updates keep only changed fields, creates and deletes the whole row, list snapshots (modules) whole | DatabaseDesign "Changed fields only"; one naming rule for every module | `packages/core/src/action.ts` (`changedOnly`) |
| The actor's name is stored as `actor_label` when the entry is written; entity names in the feed come from the snapshot, else the row (deleted rows keep their names) | No schema column for the entity name; the log reads right after renames and deletes | `packages/db/src/queries/activity.ts` |
| Undo runs the reversing action (update with the old values, delete, or a new restore) with its own permission check, sub-event scope included, and version check; the author or `event.settings` may undo | SystemDesign 5.8 "undo is a normal action"; a scoped Editor can't undo outside their scope | `packages/core/src/activity/undo.ts` |
| Undoable now: event details, modules, venues, sub-events. Not undoable: event create, team changes (roles, members, invites), and undo entries themselves | Reversing team changes touches other people's access; redo isn't designed | Same file |
| Undo errors use existing codes: changed since → 409 `version_conflict` with `current`; already undone or not undoable → 409 `conflict` with `reason` | No new codes in APIDesign's list | Same file |
| Feed cursors name the last entry; the next page compares `(created_at, id)` in SQL | A JS Date would round Postgres's microseconds and skip or repeat rows | `packages/db/src/queries/activity.ts` |
| runAction derives the live signals from the activity entries (one `entity.changed` each; `permissions.changed` for role and member changes; leave room + `member.removed` when a member goes) | No action can log a change and forget the signal; CLAUDE.md rule 11 | `packages/core/src/live.ts` |
| Live signals are outbox rows (`live.signal`) the relay publishes with `@socket.io/redis-emitter`; each publish is awaited, so a Redis failure retries the row | The emitter doesn't wait for its own publishes: a lost signal, or an unhandled rejection | `apps/worker/src/live/live-publisher.ts` |
| Sockets authenticate with the session cookie and must come from `WEB_ORIGIN`; refusals are `connect_error` `unauthenticated` / `csrf_failed` / `too_many_sockets`. Bearer tokens wait for the mobile app (no Better Auth bearer plugin yet) | CORS doesn't protect WebSockets, so a cookie-carrying socket from another site must be refused | `apps/api/src/live/live.gateway.ts` |
| `event:join` answers like REST: `not_found` for non-members, `forbidden` without `event.view` anywhere; at most 10 rooms per socket, 10 sockets per user per API instance | APIDesign "Real-time contract"; a cluster-wide socket count would need a Redis round trip on every connect | Same file |
| The web app sends `X-Request-Id: web_<uuid>` on writes only and remembers the last 200; signals carrying one of them are skipped | APIDesign "Skip if requestId is its own"; a custom header on GETs would add a CORS preflight to every read | `apps/web/src/lib/api.ts` |
| One socket per tab, opened by the event shell; each signal invalidates the queries its entity type touches plus the feed (unknown types: the whole event); signals older than a cached version are ignored; after a reconnect everything on screen re-fetches | Signals aren't stored, so a gap is covered by re-fetching, not replaying | `apps/web/src/lib/live.ts`, `lib/activity.ts` |
| The undo bar finds a delete's entry by its request id (`GET E/activity?entityId=…`), then undoes it; offered only with `activity.view` (every role that can delete has it) | No API change: DELETE stays 204 with no body | `components/events/schedule.tsx`, `lib/activity.ts` |
| The undo bar's countdown pauses on hover and focus; with reduced motion it fades only and hides the bar (the 5 s still run) | WCAG 2.2.1; MOTION.md section 5 | `components/motion/undo-snackbar.tsx` |
| Task order uses fractional indexes (`fractional-indexing` 4.0.0, `positionBetween` in contracts); queries sort with `collate "C"`; a status change without a position goes last in the new column | Moving a card writes one row; locale collations would sort `a0V` wrongly | `packages/contracts/src/tasks.ts`, `packages/db/src/stores/tasks.ts` |
| `tasks.update_own` lets an assignee change `status` and `position` (APIDesign says status or checklist items); position so a Helper can drag their card across the board | Checklist items are subtasks, which are tasks with their own assignees | `OWN_TASK_FIELDS` in contracts |
| PATCH E/tasks/{id} has no guard permission (any member); the action decides between `tasks.edit` and `tasks.update_own` from the task and the body. Other task routes check the permission anywhere ('list') and the action checks the task's own sub-event | The right permission depends on the row and the body | `apps/api/src/tasks/tasks.controller.ts` |
| Assignees must be active members who can see the task (`tasks.view` in its sub-event); `GET /v1/me/tasks` also drops tasks my current roles no longer cover | A scoped helper would otherwise be given tasks they can't open | `packages/core/src/tasks/task-actions.ts` |
| Deleting a task deletes its subtasks with the same `deleted_at`; restore brings back exactly those; a subtask whose parent is deleted can't be restored alone | Undo of a delete puts the whole card back, not subtasks deleted earlier | `packages/db/src/stores/tasks.ts` |
| Starter tasks: due `daysBefore` the start date, left without a date when that's already past; linked to a starter sub-event by name | An event planned at short notice shouldn't start with everything overdue | `packages/core/src/events/templates.ts` |
| Task lists are cursor-paginated by id (UUIDv7), 200 per page by default (500 max); the client orders by column and position | One stable cursor key; a board needs most tasks at once | `packages/db/src/queries/tasks.ts` |
| Budget tables: `budget_categories` and `expenses` (migration 0006) with the status–amount rule as a check constraint, unique live category names (ignoring case) and unique live transaction refs per event; `receipt_media_id` waits for the media table | DatabaseDesign "Planning"; the database backs up the action | `packages/db/src/schema/budget.ts` |
| Committed = the sum of all expense amounts (planned lines included), paid = the sum paid so far; category totals count only the expenses the caller can see | DatabaseDesign "Budget vs. actual"; a scoped Editor's totals shouldn't reveal other sub-events' spending | `packages/db/src/queries/budget.ts` |
| An expense takes a status, an amount paid, or both; the missing one is filled in (`settlePayment` in contracts). On edit, "paid" follows a changed amount, and advance or partly paid is kept while it still fits | Clients send what the person chose; the server owns the rule | `packages/contracts/src/budget.ts`, `packages/core/src/budget/budget-actions.ts` |
| `POST E/expenses` without an Idempotency-Key is 400 `bad_request` (`@RequireIdempotencyKey()`) | APIDesign makes the key required but names no code for a missing one | `apps/api/src/http/idempotency.interceptor.ts` |
| Deleting a category with live expenses is 409 `conflict`, reason `category_in_use`; restoring one whose name was taken, or an expense whose category is gone, is 409 `conflict` with a reason | APIDesign "refused while expenses exist"; no new codes | `packages/core/src/budget/budget-actions.ts` |
| Unique violations run in a savepoint and come back as answers (`name_taken`, `duplicate_ref`) | Otherwise the error aborts the whole action's transaction | `packages/db/src/stores/budget.ts` |
| Task and expense lists load whole (pages of 500) into one cached array; screens filter, group and sort locally | Boards and grouped lists need every row; events stay far below 500 tasks | `apps/web/src/lib/tasks.ts`, `apps/web/src/lib/budget.ts` |
| Ticking a task, dropping a card and toggling a subtask update the cache first and roll back if refused | A checkbox or a drop shouldn't wait for the network | `apps/web/src/lib/tasks.ts` |
| The open task lives in the URL (`?task=…`); quick add opens new tasks and expenses with `?add=1` | My tasks links straight to a task; quick add reaches a form | `apps/web/src/components/tasks/tasks.tsx` |
| Board collisions use overlap first, then nearest corners | Columns stretch, so corners alone kept keyboard moves in the same column | `apps/web/src/components/tasks/task-board.tsx` |
| Edit panels send only changed fields; an expense sends status and paid-so-far together whenever any amount changed | An untouched deleted sub-event isn't sent back and refused; the server re-checks the payment rule | `apps/web/src/components/tasks/task-panel.tsx`, `apps/web/src/components/budget/expense-form.tsx` |
| dnd-kit 6.3.1 / sortable 10.0.0 for the board | MOTION.md section 3: dnd-kit for logic, keyboard dragging included | `apps/web/package.json` |
| pnpm override `socket.io: 4.8.4` | `@nestjs/platform-socket.io` pins 4.8.3; two copies made the server's and our types differ | `pnpm-workspace.yaml` |
| Playwright runs against `next build` + `next start` on port 3100, projects `desktop` (1280 × 860) and `phone` (Pixel 7); reduced motion via `test.use({ reducedMotion: 'reduce' })`; expected text read from `messages/en.json` | Production behaviour; own port so a dev server is never tested by mistake | `apps/web/playwright.config.ts` |

## Open questions

None right now.

## Follow-ups

- Deleting an event (202 job) and switching guest scope (job) are designed but not built; both arrive with the jobs they need (guest scope with guests in milestone 7).
- Free-plan event limits (402 plan_limit_reached) once limits are set before launch.
- Idempotency-key cleanup job for expired rows (scheduled queue, milestone 5).
- Rate limits trust the first `X-Forwarded-For` value. In production behind Cloudflare, read `CF-Connecting-IP` instead (make the header configurable), or clients can rotate the header to dodge per-IP limits; the per-email limit still holds.
- Google sign-in before launch: publish the OAuth consent screen (Google verification; until then only test users can sign in) and add the production redirect URI `{API_URL}/v1/auth/callback/google`.
- Google linked to an existing email account doesn't copy the profile photo (Better Auth leaves user info alone on linking). Fill `avatar_url` on link only when it's empty, without overwriting the name.
- Outbox cleanup job for published rows older than 7 days (milestone 5 with the scheduled queue).
- Only home-page messages need to reach the browser; today all namespaces (including `devUi`) are sent. Trim if step G needs the bytes.
- Footer privacy and terms links once those pages exist.
- Rate limits on `GET /v1/member-invites/{token}` and accept (APIDesign lists none for member invites; tokens are 32 random bytes).
- Undo of a sub-event deletion (milestone 5) won't bring back the scoped role assignments it removed.
- Team list search, role filter chips, "online" dots and CSV export from Stitch "Team" (online needs presence in the socket contract).
- Nightly consistency check (owner has an Owner assignment, no scope-less assignments left by deletes) arrives with scheduled jobs.
- `@sentry/nestjs` 11.8 pulls in `@sentry/bundler-plugins`, whose webpack peer brings webpack, SWC, esbuild and lightningcss (~60 MB) into the API image. Revisit with a Sentry update or a pnpm override.
- From the milestone 1–4 reviews (minor):
  - `/v1/health/ready` returns the raw Postgres or Redis error text (internal hosts and ports). Return a fixed reason and log the detail (M1 #4).
  - `/live` sockets accept any client with no auth or connection cap; fix with the gateway's auth in milestone 5 (M1 #5).
  - No general rate limit or per-user event cap outside sign-in; `POST /v1/events` makes a venue and sub-events per call. Add a throttle with a Redis store that fails open, and the free-plan cap above (M1 #6, M3 #8).
  - `formatEventDate` hard-codes `en-IN` and trusts its input; take the locale and validate `YYYY-MM-DD` before Hindi (M1 #8).
  - `PATCH /v1/me` has no `ETag` or `If-Match` (`users` has no `version`). Add them, or record a decision that `/me` is exempt (M2 #4).
  - Plaintext secrets in outbox rows: the sign-in code (and its BullMQ job) and the raw join URL in member-invite emails. Published rows are deleted, but failing rows keep them. Clear the payload of failed or expired sensitive rows and keep it out of `last_error` (M2 #5, M4 #3).
  - Welcome sends `phone: null` when the field is blank, erasing a saved number on a second visit. Prefill it, or send `phone` only when touched (M2 #7).
  - Soft-deleted users keep their sessions and can sign in again; check `users.deleted_at` in the session guard and at sign-in (M2 #8).
  - An idempotency key left `in_progress` (crash or lost release) blocks retries for 24 hours; give in-progress rows a short lease (M3 #2).
  - The idempotency request hash uses `JSON.stringify(body)`, so the same fields in a different order get 422; hash canonical JSON (M3 #3).
  - Changing an event's dates doesn't check its sub-events, and sub-events aren't checked against the event's dates (M3 #5).
  - Saving a sub-event someone else deleted says "Couldn't save"; map `not_found` to "was removed" and refresh (M3 #6).
  - `mapUrl` accepts `javascript:` and `data:` URLs; restrict to `http(s)` before anything renders it (M3 #7).
  - A role manager can trim `roles.manage` from their own role and lock themselves out; warn or refuse (M4 #2).
  - `safeReturnTo` accepts `/` followed by a tab, CR or LF, which browsers may turn into `//host`; parse with `new URL(value, origin)` and require the same origin (M4 #4).
  - Opening a used-up email invite again as the member who used it shows "expired" instead of "you're already in" (M4 #5).
  - A double tap on Leave can write two `leave` activity rows if both pass the member check; stop when `members.remove` returns false (M4 #6).
- Undo of a venue delete brings the venue back but doesn't re-attach the sub-events it was cleared from (that clearing writes no entries of its own).
- Undo for team changes (role edits, removing a member, revoking an invite) and redo of an undo.
- The activity feed's entity filter takes any string; restrict to `ACTIVITY_ENTITY_TYPES` once every module records its type.
- `dashboard.changed` (throttled to once a second per event) arrives with the dashboard in milestone 8; `job.progress` and `notification.new` with jobs and notifications.
- Presence ("Vikram is viewing") from MOTION.md 6.12 isn't in the socket contract yet.
- Receipts on expenses (`receipt_media_id`, uploads) arrive with the media table in milestone 8.
- Budget by sub-event has no endpoint; the web adds it up from the expense list (fine at MVP sizes).
- Expenses, like tasks, keep their `sub_event_id` when that sub-event is deleted.
- Tasks and expenses keep their `sub_event_id` when that sub-event is deleted; the web shows "Deleted sub-event" and the edit panel moves them. A server-side cleanup could move them to the whole event instead.
- Tasks bulk-select bar (MOTION.md 6.6) isn't built.
- Board drop settle uses dnd-kit's own 250 ms ease-out, not the `snappy` spring.
- Playwright and the db package's tests are flaky on an overloaded laptop (load average near 20 during the 6c/6d runs and the 6e review): requests took 5–9 s and a few desktop tests timed out; each passed when run alone.
- The task panel's checklist shares one save for all its subtasks, so ticking two quickly can send a stale version on the second (409, rolled back). The row's subtasks wait for the save in flight.
- Assignees who leave or are removed stay in `task_assignees` (hidden while inactive) and reappear if they rejoin.
- The activity feed shows every task change to anyone with `activity.view`, even ones outside their sub-event scope; filter the feed by scope.
- Task comments, due-date reminders and "task assigned" notifications (milestone 8).
- Undo bar for team changes (revoke invite, remove member) once those are undoable; MOTION.md 6.10 asks for it.
- The polling fallback has no Playwright test (it needs 30 s with the socket blocked); the reconnect re-fetch is untested end to end too.
- MOTION.md 6.12's "Item deleted by someone else" (the open panel fades and offers Restore) and the conflict banner's "Use theirs / Keep mine" aren't built; an edit panel still shows the latest version with a note.
- Activity entries show the actor's initials; their photo needs `avatarUrl` in the feed.
- Published `live.signal` rows pile up in the outbox until the 7-day cleanup job exists (milestone 5 scheduled queue item above).
- Socket bearer-token sign-in (`auth: { token }`) for the mobile app.
- Logo SVG/PNG files and app icons still use the warm ink #1F1B16 and warm white #FAF8F5 (BRAND.md note); regenerate in a brand pass.

## Known warnings (harmless)

- `pnpm peers check` reports an unmet `webpack` peer inside `@nestjs/cli`'s own dependencies; unused because we build with SWC.
- `eslint-config-next`'s React, import and jsx-a11y plugins don't declare ESLint 10 support yet; lint runs correctly.
- `next start` warns that it doesn't work with `output: 'standalone'`; it serves the build correctly for tests and Lighthouse. The standalone server is used in the Docker image (item 9).
- `@parcel/watcher` and `unrs-resolver` install scripts are denied in `allowBuilds`; both use prebuilt binaries.

## Learning notes

Index by topic: [`docs/learning/README.md`](learning/README.md) (backend, frontend, infra). Latest: [33 Budget on the server](learning/backend/33-budget-backend.md).
