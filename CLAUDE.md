# CLAUDE.md

Context for AI coding sessions. Read this first. Before designing or changing anything, read the relevant doc in `docs/`.

## Project

Plan My Event: a web app where a team plans and runs one event together (sub-events, tasks, budget, guests, invitations, attendance) with live updates. Generic across weddings, conferences, college fests, fairs and celebrations. Portfolio project intended to launch as a freemium product. Solo developer, India-first (INR, Indian phone numbers, Hindi later).

Status: design complete; implementation starting with milestone 1 (scaffolding).

## Source of truth

| Topic | File |
| --- | --- |
| Features, phases (MVP / V2 / Later), roles, user flows | `docs/PRD.md` |
| Architecture, estimates, caching, queues, scaling, failure modes | `docs/SystemDesign.md` |
| Tables, columns, constraints, indexes, key queries, migrations | `docs/DatabaseDesign.md` |
| Endpoints, auth, errors, pagination, idempotency, sockets | `docs/APIDesign.md` |
| Visual design tokens, components, layout, voice | `docs/DESIGN.md` |
| Animation tokens, patterns, reduced motion, every animation per screen | `docs/MOTION.md` |
| Logo files and brand rules | `brand/` (`brand/BRAND.md`) |
| Why key choices were made | `docs/decisions/` |
| Current progress, milestone checklist, decisions in flight | `docs/STATUS.md` (update at the end of every step) |

Precedence when docs disagree: APIDesign and DatabaseDesign win over SystemDesign; ask before changing any doc. When a decision changes, update the doc in the same commit and add a decision record.

## Stack

TypeScript everywhere. pnpm workspaces + Turborepo.

- `apps/web`: Next.js (App Router), Tailwind CSS, shadcn/ui, TanStack Query, Motion. UI only; calls the API.
- `apps/api`: NestJS. REST under `/v1`, OpenAPI from Zod, Socket.io gateway (namespace `/live`), webhooks, Better Auth.
- `apps/worker`: NestJS standalone app. BullMQ processors and the outbox relay.
- `packages/core`: domain actions and permission logic. Framework-free TypeScript, no NestJS imports.
- `packages/db`: Drizzle schema, migrations, seeds.
- `packages/contracts`: Zod schemas and types shared by API, sockets, web and (later) mobile.
- `packages/config`: shared TypeScript, lint and env-validation config.
- Infra: PostgreSQL 17+, Redis, Cloudflare R2 (SeaweedFS locally), Resend (Mailpit locally), Sentry. Docker Compose in `infra/`.

## Non-negotiable rules

1. **Every write goes through a `packages/core` action.** Controllers, workers, AI and webhooks never write to the database directly.
2. **One transaction per action:** permission check, version check (optimistic lock), the change, an `activity_log` row, `outbox` rows for side effects. Never send email, emit socket events or enqueue jobs directly from a request.
3. **Permissions** are checked against the acting member's effective permissions including sub-event scope. Owner role is immutable; nobody grants permissions beyond their own. Helpers update their own tasks via `tasks.update_own`.
4. **Tenancy:** every event-owned row has `event_id`; every query filters by it. Composite foreign keys `(event_id, parent_id)` keep references inside one event.
5. **Money is integer paise** (`bigint`), INR only. **IDs are UUIDv7.** Times stored in UTC; each event has one time zone.
6. **Tokens:** store only SHA-256 hashes. Invitation links are derived with HMAC from invitation id + `token_version`.
7. **Idempotency:** POST accepts `Idempotency-Key`; job ids are deterministic; webhooks de-duplicated in `webhook_inbox`.
8. **Concurrency:** versioned resources return `ETag`; PATCH/PUT/DELETE require `If-Match` (428 if missing, 409 on mismatch).
9. **Errors** are RFC 9457 problem+json with a stable `code`.
10. **Public routes** live under `/v1/public`; non-members of an event get 404, members without permission get 403.
11. **Sockets carry no data**, only `entity.changed`-style signals; clients re-fetch through the API.
12. **Redis is never the source of truth**; every cache read falls back to Postgres.
13. **Slow or external work goes to BullMQ queues**, never inline in a request.
14. **UI:** tokens and components follow `docs/DESIGN.md` and animations follow `docs/MOTION.md` (use its tokens and shared motion components, never ad-hoc durations; always handle reduced motion); phone and desktop are both first-class; all UI strings go through translation keys; Stitch designs are references, not code to paste.

## Conventions

- JSON camelCase; DB snake_case; value sets are text + check constraints generated from shared constants.
- Soft delete with `deleted_at` on user-facing tables.
- Conventional commits (`feat:`, `fix:`, `chore:`…); one branch and PR per milestone or feature.
- Tests: Vitest for `core`, `api` and `worker`; Playwright for key flows. Every core action gets tests for its permission check and its outbox rows.
- Keep dependencies on current stable versions; pin exact versions in lockfiles.

## Commands

Filled in by milestone 1. Expected: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm db:migrate`, `pnpm db:seed`, `docker compose -f infra/docker-compose.yml up -d`.

## MVP milestones

1. Monorepo scaffold, Docker Compose, CI, env validation, design tokens and base UI components, app shell.
2. Auth (Google, email OTP), users, hidden personal workspace.
3. Events from templates, sub-events, venues, modules, guest scope.
4. Members, roles, permissions, sub-event scoping, permission guard and cache.
5. Outbox relay, activity log, undo, Socket.io live updates.
6. Tasks; budget categories and expenses.
7. Contacts, households, CSV import; invitations, magic links, RSVP.
8. Open registration; dashboard aggregates; notifications; basic gallery.
9. Seed data: "Sharma Wedding" and "DevFest Bhopal 2026" demo events.

V2 (AI quick updates, WhatsApp bot, QR check-in, form builder, event website) comes after the MVP; don't build it early, but don't design anything that blocks it.

## Out of scope for now

Recurring events, events above ~5,000 attendees, native apps, multiple currencies, vendor logins, own live streaming, offline check-in, paid ticketing (designed, not built).
