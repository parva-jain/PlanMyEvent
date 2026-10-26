<p align="center"><img src="brand/logo/lockup-horizontal.svg" alt="Plan My Event" width="360"></p>

# Plan My Event

**Your whole event team, on the same page.** Sub-events, tasks, budget, guests, invitations and RSVPs, with live updates for everyone involved.

Most events in India are organized through WhatsApp groups, spreadsheets and phone calls. Nobody knows the real headcount, who paid the caterer, or which tasks are still open. Plan My Event replaces that with one shared event space that a whole family, committee or team can work in at once.

> Status: milestone 1 (scaffold) nearly complete: monorepo, local infrastructure, CI, design system and marketing home page. Progress is tracked in [docs/STATUS.md](docs/STATUS.md).

## What it does

- **Events with sub-events.** A wedding's haldi, mehendi and reception; a conference's sessions; an exhibition's days. Each has its own time, venue and capacity.
- **Templates.** Wedding, Conference, Fair/Exhibition, Celebration or Custom. Each sets up the right modules, starter tasks and budget categories.
- **Team roles and permissions.** Standard roles (Owner, Admin, Editor, Helper, Viewer), custom roles, several roles per person, and roles limited to specific sub-events.
- **Tasks.** Assignees, due dates, subtasks, list and kanban views, "my tasks" for helpers.
- **Budget and expenses.** Planned vs. actual by category and sub-event, who paid, advances and pending payments.
- **Guests and households.** Invite the "Sharma family (4)" rather than four separate people; import from CSV.
- **Invitations without guest accounts.** Each invitation gets a magic link; track physical card delivery too.
- **Three ways to count attendance.** Invite-only (headcount from expected counts), invite + RSVP, or open public registration.
- **Live dashboard.** Countdown, task progress, budget status, headcounts and delivery progress, updating in real time.
- **Activity log with undo.** See who changed what, and roll back mistakes.

**Planned for V2:** AI quick updates ("finalized the caterer, paid 20k advance" becomes task and expense changes, after a preview), payment-screenshot reading, a WhatsApp bot, QR check-in, custom RSVP questions, and an auto-generated event website.

## Tech stack

| Layer                  | Technology                                              |
| ---------------------- | ------------------------------------------------------- |
| Web                    | Next.js, Tailwind CSS, shadcn/ui, TanStack Query        |
| API                    | NestJS (REST `/v1`, OpenAPI, Socket.io)                 |
| Background jobs        | NestJS worker with BullMQ                               |
| Database               | PostgreSQL with Drizzle ORM                             |
| Cache, queues, pub/sub | Redis                                                   |
| File storage           | Cloudflare R2 (S3-compatible)                           |
| Auth                   | Better Auth (Google, email OTP); magic links for guests |
| Email                  | Resend                                                  |
| Observability          | Sentry, pino structured logs                            |
| Testing and CI         | Vitest, Playwright, GitHub Actions                      |
| Infrastructure         | Docker and Docker Compose                               |
| Mobile (later)         | React Native (Expo)                                     |

## Architecture highlights

The interesting engineering is in making a small, bursty, provider-dependent system that never loses a write:

- **Shared action layer.** Web, API, workers, and later the AI assistant and WhatsApp bot all call the same domain actions in `packages/core`, which check permissions and write the activity log.
- **Transactional outbox.** Each change, its activity log entry and its side effects (live updates, emails, jobs) are saved in one database transaction, then relayed to Redis and BullMQ. A crash or Redis outage delays side effects but never loses them.
- **Idempotency everywhere.** Idempotency keys on requests, deterministic job ids, de-duplicated webhooks, and unique constraints that make RSVPs safe to resubmit.
- **Optimistic locking.** Row versions stop simultaneous edits from overwriting each other.
- **Separate queues by urgency.** A 5,000-guest invitation blast can't delay a sign-in OTP.
- **Permission-safe real-time.** Sockets send only "entity changed" signals; clients re-fetch through the API, which re-applies permissions.
- **Graceful degradation.** Caches fall back to Postgres, providers sit behind circuit breakers, and every failure has a defined degraded mode.

```
Clients ─▶ Cloudflare edge ─▶ Next.js web ─▶ NestJS API ─▶ PostgreSQL (data + outbox)
                                                │                │
                                                ▼                ▼
                                             Redis ◀──── Outbox relay
                                                │
                                                ▼
                                   Workers (email, media, imports, AI)
                                                │
                                                ▼
                               Resend · R2 · WhatsApp (V2) · AI (V2)
```

Full details: [docs/SystemDesign.md](docs/SystemDesign.md).

## Getting started

You need Node 22 (see `.nvmrc`), pnpm 12.14.0 (`npm install -g pnpm@12.14.0`) and Docker.

```sh
git clone https://github.com/parva-jain/PlanMyEvent.git
cd PlanMyEvent
pnpm install
docker compose -f infra/docker-compose.yml up -d --wait   # Postgres, Redis, S3 storage, mail catcher
pnpm db:migrate
pnpm dev
```

| What | Where |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:4000/v1, interactive docs at http://localhost:4000/v1/docs |
| Health | http://localhost:4000/v1/health/ready |
| Email inbox (Mailpit) | http://localhost:8025 |

No `.env` files are needed locally: every app's defaults point at the compose services. Each app has a `.env.example` listing what production needs.

Checks, the same ones CI runs:

```sh
pnpm lint && pnpm typecheck && pnpm test   # Vitest; API tests use the compose Postgres and Redis
pnpm test:e2e                              # Playwright (first time: pnpm --filter @pme/web exec playwright install chromium)
```

More: [infra/README.md](infra/README.md) for the local services and running the apps as containers.

## Documentation

- [Product requirements](docs/PRD.md)
- [System design](docs/SystemDesign.md)
- [Database design](docs/DatabaseDesign.md)
- [API design](docs/APIDesign.md)
- [Design system](docs/DESIGN.md)
- [Brand and logo](brand/BRAND.md)
- [Architecture decision records](docs/decisions/)

## Author

Parv Jain
