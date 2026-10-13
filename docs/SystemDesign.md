# Plan My Event — System Design

Oct 13, 2026 · @Parv Jain

The workload is small in raw throughput but bursty and dependent on outside providers, so this design optimizes for correctness under spikes and graceful degradation when something fails, not for massive scale.

It follows the PRD (Plan My Event — PRD) and the stack agreed in chat: TypeScript monorepo, Next.js web, NestJS API and worker, PostgreSQL, Redis, BullMQ, Socket.io, Cloudflare R2, Docker.

## Decisions assumed

These defaults were proposed in chat and not yet confirmed; change any of them and the affected sections will be revised.

| # | Question | Assumed decision |
| --- | --- | --- |
| 1 | Environments | Local and production first; staging once there are real users |
| 2 | Domain | One domain bought before launch; subdomains app., api., and public pages at /e/\<slug> |
| 3 | Data location | India region wherever the provider offers it; no strict residency requirement |
| 4 | Guest data retention | Kept until the owner deletes the event; optional auto-delete of guest phone and email 6 months after the event |
| 5 | Undo | Any single activity-log entry can be undone by its author or an admin, if no later change depends on it |
| 6 | Backups | Provider daily backups plus a weekly database export to object storage |
| 7 | API audience | Internal only (web and mobile), versioned under /v1 |
| 8 | Live update style | Server sends "entity changed" signals; clients re-fetch through the API |
| 9 | Spam protection | Rate limiting plus Cloudflare Turnstile on public forms |
| 10 | Images | Worker compresses uploads and generates thumbnails with sharp |
| 11 | Push notifications | V2; in-app and email first |
| 12 | Multi-tenancy | One shared database; every event carries workspace\_id and every query is scoped in the action layer |

## Step 1 — Requirements

The system must let a team plan one event together with live updates, and let thousands of guests respond through links, without losing a single write when a dependency fails.

### Functional requirements

**MVP**

1. Sign in with Google or email OTP; sessions for web now and mobile later.
2. Create events from templates; manage sub-events, venues, modules and guest scope.
3. Manage members, standard and custom roles, multiple roles per member, sub-event scoping.
4. Tasks with subtasks, assignees and views; budget categories and expenses.
5. Contacts, households, CSV import; invitations with delivery tracking.
6. Guest magic links: view invitation, RSVP once per household.
7. Public registration pages for open events.
8. Live dashboard: tasks, budget, headcounts, distribution progress.
9. Activity log with undo; in-app notifications.
10. Basic gallery uploads.

**V2 (designed for now, built later)**

- Bulk email sends, reminders and scheduled jobs.
- QR check-in, waitlists, form builder, event website.
- AI quick updates, voice input, screenshot reading.
- WhatsApp one-to-one bot through webhooks.

**Later:** paid ticketing, team workspaces, WhatsApp group bot.

### Non-functional requirements

| Quality | Target | Why it matters here |
| --- | --- | --- |
| Availability | 99.5% monthly for the API in production; public RSVP pages stay up even if the dashboard is degraded | Guests open links at unpredictable times |
| Latency | p95 under 300 ms for reads, under 500 ms for writes, measured at the API | Phone users on mobile data |
| Real-time freshness | A change appears on other open screens within 2 seconds | Several organizers edit at once |
| Durability | No accepted write is ever lost; every side effect (email, live update, job) happens at least once | Money and headcounts must be trustworthy |
| Consistency | Strong consistency for writes and the writer's own reads; dashboards may lag a few seconds | Counts can be briefly stale, money records cannot |
| Burst handling | Absorb 10x normal traffic for 15 minutes without errors | Invitation blasts and event-day check-ins |
| Isolation | One noisy event or a failing provider cannot slow other events | Shared infrastructure |
| Security | Permission check on every action; hashed magic-link tokens; workspace scoping on every query | Guest PII and payment data |
| Idempotency | Retried requests, jobs and webhooks never create duplicates | Flaky mobile networks, job retries |
| Operability | Graceful shutdown, health checks, structured logs, error tracking, queue and lag metrics | Solo developer must see problems first |
| Cost | Runs on free tiers until real usage; scales by adding containers, not rewriting | Freemium budget |

## Step 2 — Back-of-the-envelope estimation

At a first-year target of 2,000 events, average traffic is about 3 requests per second and peaks stay under 100, so one Postgres instance and two small API containers are enough; the real risks are bursts, email volume and photo storage.

All figures are planning assumptions for year one, not measurements. Revisit them after launch.

### Usage assumptions

| Input | Value | Basis |
| --- | --- | --- |
| Events created per year | 2,000 | Early product target |
| Events active at the same time | 500 | An event is planned over about 3 months |
| Members per event | 8 average, 50 max | Family or fest committee |
| Guests per event | 300 average, 5,000 max | PRD scale limit |
| Daily active members | 4,000 | 500 active events x 8 members |
| API requests per member per day | 50 | Dashboard loads, task updates, lists |

### Traffic

| Measure | Calculation | Result |
| --- | --- | --- |
| Organizer requests per day | 4,000 x 50 | 200,000 |
| Average rate | 200,000 / 86,400 s | about 2.3 req/s |
| Daily peak (evening, 10x average) | 2.3 x 10 | about 25 req/s |
| Read to write ratio | Dashboards and lists dominate | about 10:1 |
| Concurrent WebSocket connections | 10-15% of daily actives online at once | 400-600 |

### Burst scenarios

| Scenario | Calculation | Peak load | Design response |
| --- | --- | --- | --- |
| Invitation link shared in a large WhatsApp group | 1,000 guests open within 10 minutes; 3 API calls each | about 5 req/s on public endpoints | Cache invitation pages; static assets on CDN |
| RSVP surge after a reminder | 2,000 responses in 30 minutes | about 1.1 writes/s, plus fan-out to dashboards | Short write transactions; batched live updates |
| Bulk email send (V2) | 5,000 invitations queued at once | Limited by provider send rate | Queue with rate limiter; API responds instantly |
| Conference check-in | 5,000 attendees in 60 minutes across 10 desks | about 1.4 writes/s; 20 dashboard viewers each = 28 live messages/s | Indexed lookup by QR token; room broadcasts |
| Gallery upload after an event | 10 members upload 50 photos each in 20 minutes | 500 uploads, about 0.4/s | Direct upload to storage; thumbnails in worker |
| Many events on one evening | 50 events doing the above together | under 100 req/s | Two API containers with headroom |

### Storage

| Data | Calculation | Year-one total |
| --- | --- | --- |
| Database rows, average event | about 2,500 rows (contacts, attendance, tasks, expenses, activity) x 1 KB | about 2.5 MB |
| Database rows, 5,000-guest event | about 25,000 rows x 1 KB | about 25 MB |
| Database total | 2,000 events x 2.5 MB, x 2 for indexes | about 10 GB |
| Activity log | 2,000 events x 3,000 entries x 1 KB | about 6 GB, the fastest-growing table |
| Gallery photos | 2,000 events x 100 photos x 0.6 MB (compressed original + thumbnails) | about 120 GB |
| Receipts | 2,000 events x 40 x 0.3 MB | about 24 GB |

### Outbound volume

| Item | Calculation | Result |
| --- | --- | --- |
| Emails if every invite goes by email | 2,000 x 300 guests x 3 emails (invite, reminder, confirmation) | about 1.8 million per year, 150,000 per month |
| Emails for OTP and system mail only | 4,000 members x 10 per month | about 40,000 per month |
| Gallery bandwidth | 300 guests x 50 photos viewed x 0.3 MB per event | about 4.5 GB per event, 9 TB per year |
| AI quick updates (V2) | 4,000 members x 3 per day | about 12,000 calls per day |

### What the numbers decide

- **Throughput is not the problem.** Postgres handles thousands of simple queries per second; 25-100 req/s needs no sharding or read replicas in year one.
- **Bursts and external providers are the problem.** Email, WhatsApp and AI providers have rate limits and outages, so every call to them goes through a queue.
- **Email volume breaks free tiers.** Invitations default to WhatsApp share links; email invitations become a paid-plan feature with quotas.
- **Photo bandwidth dominates cost.** Zero-egress storage (R2) behind a CDN, with free-plan photo limits per event.
- **The activity log grows fastest.** Index it by event and time now; partition by month when it passes about 50 million rows.

## Step 3a — API design

The API is a versioned REST service under /v1 with OpenAPI docs, plus one Socket.io namespace for live signals; every write is idempotent and version-checked so retries and simultaneous edits never corrupt data.

### Conventions

| Concern | Rule |
| --- | --- |
| Base path | /v1, resources nested under /events/{eventId} so every request is event-scoped |
| IDs | UUIDv7: time-ordered (good for indexes), not guessable in URLs |
| Auth | Session cookie for web; bearer token for mobile (Better Auth issues both) |
| Permissions | A NestJS guard resolves the member's effective permissions for the event (cached) and checks the route's @RequirePermission |
| Validation | Zod schemas from the shared contracts package, used by web, API and mobile |
| Idempotency | Every POST accepts an Idempotency-Key header; the response is stored for 24 hours and replayed on retry |
| Concurrent edits | Every row has a version number; PATCH sends If-Match: version and gets 409 Conflict if someone changed it first |
| Pagination | Cursor-based (?cursor=&limit=, max 100), stable under inserts |
| Filtering | Query params per resource, e.g. ?status=open&assignee=me&subEventId= |
| Errors | RFC 7807 problem+json: type, title, status, detail, plus field errors |
| Rate limits | Per user and per IP in Redis; headers report limit and remaining; 429 with Retry-After |
| Async work | Long operations return 202 Accepted with a job id; progress arrives over the socket |

### Core endpoints (MVP)

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET | /v1/me | Current user, workspaces, events | Signed in |
| POST | /v1/events | Create event from a template | Signed in |
| GET / PATCH | /v1/events/{eventId} | Event details and settings, incl. guest scope | event.view / event.settings |
| GET | /v1/events/{eventId}/dashboard | Aggregated counts for the dashboard | event.view |
| GET / POST | /v1/events/{eventId}/sub-events | List and create sub-events | subevents.view / subevents.edit |
| PATCH / DELETE | /v1/events/{eventId}/sub-events/{id} | Update or delete | subevents.edit |
| GET / POST | /v1/events/{eventId}/members | List members; create invite link | members.view / members.manage |
| POST | /v1/member-invites/{token}/accept | Join an event with the invited roles | Signed in |
| GET / POST / PATCH | /v1/events/{eventId}/roles\[/{id}\] | Standard and custom roles | roles.manage |
| PUT | /v1/events/{eventId}/members/{id}/roles | Replace a member's role assignments and scopes | members.manage |
| GET / POST | /v1/events/{eventId}/tasks | List with filters; create | tasks.view / tasks.edit |
| PATCH / DELETE | /v1/events/{eventId}/tasks/{id} | Update status, assignee, fields | tasks.edit |
| GET / POST | /v1/events/{eventId}/budget-categories | Budget lines | budget.view / budget.edit |
| GET / POST / PATCH | /v1/events/{eventId}/expenses\[/{id}\] | Expenses | budget.view / budget.edit |
| GET / POST / PATCH | /v1/events/{eventId}/contacts\[/{id}\] | Contacts | guests.view / guests.edit |
| POST | /v1/events/{eventId}/contacts/import | CSV import, returns 202 + job id | guests.edit |
| GET / POST | /v1/events/{eventId}/households | Households and expected counts | guests.view / guests.edit |
| GET / POST / PATCH | /v1/events/{eventId}/invitations\[/{id}\] | Invitations, delivery status, distributor | guests.invite |
| GET | /v1/events/{eventId}/attendance | Attendance list and headcounts | guests.view |
| GET | /v1/events/{eventId}/activity | Activity log, cursor-paginated | activity.view |
| POST | /v1/events/{eventId}/activity/{id}/undo | Undo one change | Author or admin |
| POST | /v1/events/{eventId}/uploads | Get a presigned upload URL | gallery.upload or budget.edit |
| GET | /v1/notifications | In-app notifications | Signed in |

### Public endpoints (no account)

| Method | Path | Purpose | Protection |
| --- | --- | --- | --- |
| GET | /v1/invites/{token} | Invitation, sub-events, venues | Hashed token lookup; per-IP rate limit; cached |
| POST | /v1/invites/{token}/rsvp | Submit or change response and party size | Rate limit; idempotency key |
| GET | /v1/public/events/{slug} | Public event page data | CDN cached |
| POST | /v1/public/events/{slug}/registrations | Register for open sub-events | Turnstile; rate limit; capacity check |

### Webhooks (V2)

| Method | Path | Source | Handling |
| --- | --- | --- | --- |
| POST | /v1/webhooks/whatsapp | Meta Cloud API | Verify signature, store raw payload, enqueue, return 200 fast |
| POST | /v1/webhooks/email | Email provider | Delivery and bounce updates, same pattern |

### Real-time contract (Socket.io)

| Direction | Event | Payload | Notes |
| --- | --- | --- | --- |
| Client to server | event:join | eventId | Server checks event.view before joining room event:{id} |
| Client to server | event:leave | eventId |  |
| Server to client | entity.changed | type, id, version, subEventId, actorId | Client invalidates its cache for that entity and re-fetches; no data in the payload, so permissions stay enforced by the API |
| Server to client | dashboard.changed | eventId | Throttled to at most one per second per event |
| Server to client | job.progress | jobId, percent, status | CSV imports, bulk sends |
| Server to client | notification.new | notificationId | Delivered to room user:{id} |

## Step 3b — Database design

One PostgreSQL database holds all domain data, keyed so that almost every query starts with event\_id; four infrastructure tables (outbox, idempotency keys, webhook inbox, usage) make writes reliable and side effects safe to retry.

### Rules for every domain table

- **Primary key** id uuid (UUIDv7).
- **Tenant key** event\_id on every event-owned row (workspace\_id only on events and usage).
- **Audit columns** created\_at, updated\_at, created\_by.
- **Optimistic locking** version integer, incremented on every update.
- **Soft delete** deleted\_at on user-facing records, so undo can restore them; partial indexes exclude deleted rows.
- **Money** amount\_paise bigint, never floating point.
- **Flexible data** jsonb only for settings and form answers, never for fields the app filters on.

### Domain tables

| Table | Key columns | Constraints and indexes |
| --- | --- | --- |
| users | email, name, phone, avatar\_url | unique(email) |
| sessions, accounts, verifications | Managed by Better Auth | Indexes per library |
| workspaces | name, plan, is\_personal, owner\_user\_id | index(owner\_user\_id) |
| events | workspace\_id, type, name, slug, starts\_on, ends\_on, time\_zone, status, guest\_scope, response\_mode, settings jsonb | unique(slug); index(workspace\_id, status) |
| event\_modules | event\_id, module, enabled, config jsonb | primary key(event\_id, module) |
| venues | event\_id, name, address, map\_url | index(event\_id) |
| sub\_events | event\_id, name, starts\_at, ends\_at, venue\_id, capacity, visibility, response\_mode, group\_label | index(event\_id, starts\_at) |
| members | event\_id, user\_id, status, phone | unique(event\_id, user\_id); index(user\_id) |
| roles | event\_id, name, is\_standard, is\_owner, permissions text\[\] | unique(event\_id, name) |
| role\_assignments | member\_id, role\_id, scope\_sub\_event\_ids uuid\[\] (empty = whole event) | unique(member\_id, role\_id); index(role\_id) |
| member\_invites | event\_id, token\_hash, role\_ids, expires\_at, max\_uses, used\_count | unique(token\_hash) |
| tasks | event\_id, sub\_event\_id, parent\_task\_id, title, status, priority, category, due\_on, position | index(event\_id, status, due\_on); index(event\_id, sub\_event\_id) |
| task\_assignees | task\_id, member\_id | primary key(task\_id, member\_id); index(member\_id) for "my tasks" |
| budget\_categories | event\_id, name, planned\_paise | unique(event\_id, name) |
| expenses | event\_id, category\_id, sub\_event\_id, vendor\_name, amount\_paise, paid\_by\_member\_id, payment\_status, due\_on, receipt\_media\_id, transaction\_ref | index(event\_id, category\_id); unique(event\_id, transaction\_ref) where not null |
| contacts | event\_id, household\_id, name, phone, email, tags text\[\] | index(event\_id, household\_id); GIN(tags); trigram index on name for search |
| households | event\_id, name, expected\_count | index(event\_id) |
| invitations | event\_id, household\_id, contact\_id, sub\_event\_ids uuid\[\], token\_hash, delivery\_status, distributor\_member\_id | unique(token\_hash); index(event\_id, delivery\_status); check(exactly one of household\_id, contact\_id) |
| attendance | event\_id, sub\_event\_id (null = whole event), household\_id, contact\_id, source, status, party\_size, answers jsonb, qr\_token\_hash, checked\_in\_at | unique(sub\_event\_id, household\_id, contact\_id) nulls not distinct; index(event\_id, sub\_event\_id, status); unique(qr\_token\_hash) |
| media | event\_id, kind, storage\_key, mime, bytes, width, height, album, status, uploaded\_by | index(event\_id, kind, created\_at) |
| activity\_log | event\_id, actor\_member\_id, channel, action, entity\_type, entity\_id, before jsonb, after jsonb, undone\_by | index(event\_id, created\_at desc); index(entity\_type, entity\_id); partition by month later |
| notifications | user\_id, event\_id, type, payload jsonb, read\_at | index(user\_id, read\_at, created\_at desc) |

### Infrastructure tables

| Table | Purpose | Key columns |
| --- | --- | --- |
| outbox | Side effects written in the same transaction as the change, then relayed to Redis and BullMQ | id, event\_id, topic, payload jsonb, created\_at, published\_at; index on unpublished rows |
| idempotency\_keys | Replays the stored response when a client retries a POST | key, user\_id, request\_hash, response jsonb, expires\_at; primary key(user\_id, key) |
| webhook\_inbox | Raw incoming webhooks, processed by workers, de-duplicated by provider message id | provider, external\_id, payload jsonb, status; unique(provider, external\_id) |
| usage\_records | Counts for plan limits | workspace\_id, metric, period, amount; unique(workspace\_id, metric, period) |

### Future tables for payments (not built in MVP)

| Table | Purpose | Key columns |
| --- | --- | --- |
| subscriptions | A workspace's paid plan | workspace\_id, plan, status, gateway\_subscription\_id, current\_period\_end; unique(gateway\_subscription\_id) |
| ticket\_types | What an event sells | event\_id, sub\_event\_id, name, price\_paise, quantity, sale\_starts\_at, sale\_ends\_at |
| orders | One checkout by a buyer | event\_id, buyer\_email, buyer\_phone, total\_paise, status (pending, paid, confirmed, failed, expired, refunded), expires\_at, idempotency\_key |
| order\_items | Tickets inside an order | order\_id, ticket\_type\_id, quantity, attendance\_id |
| payments | Gateway payment attempts | order\_id or subscription\_id, gateway, gateway\_payment\_id, amount\_paise, status; unique(gateway, gateway\_payment\_id) |
| refunds | Full or partial refunds | payment\_id, amount\_paise, reason, status, gateway\_refund\_id |
| invoices | GST invoices for plans and tickets | number (sequential per financial year), payment\_id, tax\_paise, pdf\_media\_id |
| payouts | Money owed to organizers from ticket sales (Later) | event\_id, amount\_paise, status, period |

### Why these choices

- **Arrays for scopes and sub-event lists** keep permission resolution to one query; a join table can replace them if scopes grow complex.
- **Token hashes, not tokens**, so a database leak does not expose working magic links.
- **The unique attendance key** makes RSVP and registration naturally idempotent: a second submit updates the same row.
- **The unique transaction\_ref** blocks duplicate payment screenshots at the database level, not just in code.
- **Headcounts are computed, not stored.** An aggregate over at most 5,000 indexed rows takes milliseconds; it is cached and invalidated on change, which avoids counter drift.

## Step 4 — High-level design

Requests flow top to bottom: clients reach Cloudflare's edge, the Next.js web renders pages, and the NestJS API is the only service that writes data; workers take everything slow or external off the request path.

&#91;embedded content: high-level architecture · clients, edge, web and API, data stores, workers, providers\]

Dashed boxes are later or V2. Browsers also upload files straight to R2 with presigned URLs, and Meta's WhatsApp webhooks (V2) arrive at the API, which stores them and hands them to workers.

### Services

| Service | Runs as | Responsibility | Scales by |
| --- | --- | --- | --- |
| web (Next.js) | Container or Vercel | Organizer UI, public event and RSVP pages, server rendering | Instances behind CDN |
| api (NestJS) | Docker container | REST, auth, permission guard, core actions, Socket.io, webhook intake | Adding containers; stateless except sockets (Redis adapter) |
| worker-relay | Docker container (1) | Outbox relay, scheduled jobs | One active instance, with a lock |
| worker-fast | Docker container | email-critical, email-bulk, notifications, whatsapp | Containers and concurrency |
| worker-slow | Docker container | media, imports, ai | Containers and concurrency |
| PostgreSQL | Managed | Source of truth | Bigger instance, pooler, read replica |
| Redis | Managed | Cache, pub/sub, queues, rate limits | Bigger instance; split cache and queue instances |
| R2 | Managed | Files | Automatic |

### Monorepo layout

| Path | Contents |
| --- | --- |
| apps/web | Next.js app |
| apps/api | NestJS HTTP and socket entry point |
| apps/worker | NestJS standalone app; queue processors and outbox relay |
| apps/mobile | React Native app (later) |
| packages/core | Domain actions, permission logic, outbox writing; framework-free TypeScript |
| packages/db | Drizzle schema, migrations, seed data (wedding and conference demos) |
| packages/contracts | Zod schemas, API types, socket event types |
| packages/config | Shared lint, TypeScript and env validation |
| infra/ | Dockerfiles, docker-compose.yml, deployment configs |

## Step 5 — Deep dives

Three mechanisms keep the system from losing data or stalling: a transactional outbox for every write, separate rate-limited queues for every slow or external task, and caches that can fail without breaking anything.

### 5.1 Write path and the transactional outbox

The problem: a change must update the database, write the activity log, notify open screens and sometimes send emails. If the server crashes between those steps, the database and the side effects disagree.

The fix: everything the change needs is written in **one database transaction**, including outbox rows that describe the side effects. A relay then publishes them.

1. Request reaches a NestJS controller; guard checks the permission; Zod validates input.
2. Controller calls one core action, e.g. completeTask.
3. Core action opens a transaction: checks the version (optimistic lock), updates the row, inserts the activity\_log entry, inserts outbox rows (entity.changed, plus any jobs such as "notify assignee"), and records usage.
4. Transaction commits; API returns 200 with the new version. The user's own screen updates immediately.
5. The outbox relay (in the worker) wakes on Postgres LISTEN/NOTIFY, or polls every 500 ms as backup, and claims rows with SELECT … FOR UPDATE SKIP LOCKED.
6. For each row it publishes to Redis (live updates) or adds a BullMQ job, then marks the row published.
7. If Redis or the worker is down, rows simply wait in the outbox and go out when it recovers. Nothing is lost.

Delivery is at-least-once, so every consumer is idempotent: jobs use deterministic job ids, and clients treat a repeated entity.changed as a harmless re-fetch. Published outbox rows are deleted after 7 days.

### 5.2 Caching

Redis is a speed layer only. Every cache read falls back to Postgres if Redis is unavailable, so a Redis outage makes the app slower, never wrong.

| What is cached | Key | TTL | Invalidation |
| --- | --- | --- | --- |
| Effective permissions per member | perm:{eventId}:{userId}:{rolesVersion} | 10 min | events.roles\_version increments on any role or assignment change, so old keys are never read again |
| Session lookup | sess:{sessionId} | 5 min | Deleted on sign-out or revoke |
| Dashboard aggregates | dash:{eventId} | 30 s | Deleted by the outbox relay on relevant changes; recomputed on next read |
| Invitation page data | inv:{tokenHash} | 5 min | Includes the event's content version, bumped when event or sub-event details change |
| Public event page | CDN and Next.js page cache | 60 s | On-demand revalidation when the event page is edited |
| Rate-limit counters | rl:{scope}:{id}:{window} | Window length | Expire naturally |
| Idempotency responses | Postgres table, not Redis | 24 h | Expire naturally |

Two safeguards:

- **Stampede protection.** When a hot key expires (a dashboard 50 people are watching), only one request recomputes it, using a short Redis lock; the others wait briefly or get the stale value.
- **No caching of money or permissions decisions without a version in the key.** Stale counts are acceptable; stale permissions or amounts are not.

### 5.3 Queues and workers

Every slow or external task runs in BullMQ, in queues separated by urgency, so a large invitation blast or a slow AI provider cannot delay an OTP email.

| Queue | Jobs | Concurrency | Rate limit | Retries |
| --- | --- | --- | --- | --- |
| email-critical | Sign-in OTP, member invites | 10 | Provider limit, highest priority | 5, exponential from 5 s |
| email-bulk (V2) | Invitations, reminders, announcements | 5 | Below provider limit, shared with critical | 8, exponential from 30 s |
| notifications | In-app notifications, live signals for assignees | 20 | None | 3 |
| imports | CSV contact import, in chunks of 500 rows | 2 | None | 3, then marked failed with row errors |
| media | Validate, compress, thumbnails | 3 | None | 3 |
| scheduled | RSVP reminders, digests, retention cleanup, outbox cleanup | 2 | None | 3 |
| ai (V2) | Quick updates, screenshot reading | 5 | Per-workspace quota | 2, then user sees "try again" |
| whatsapp (V2) | Inbound processing, outbound replies | 5 | Provider limit | 5 |

Rules every job follows:

1. **Deterministic job ids**, e.g. invite-email:{invitationId}:{templateVersion}, so a repeated outbox row cannot send twice.
2. **Fairness by chunking.** A 5,000-guest blast becomes 50 jobs of 100, queued with a small delay between them, so other events' jobs interleave.
3. **Dead-letter handling.** Jobs that exhaust retries stay in the failed set, raise a Sentry alert and appear on the organizer's screen when they affect them (e.g. 12 emails failed).
4. **Graceful shutdown.** On deploy, workers stop taking jobs, finish the current ones within 30 seconds, then exit; unfinished jobs return to the queue.
5. **Separate processes by class.** Fast queues (email, notifications) and slow queues (media, AI) run in different worker containers, so one cannot starve the other.

### 5.4 Real-time updates

- Socket.io runs inside the API containers with the **Redis adapter**, so a message published by any instance reaches clients connected to every instance.
- Clients authenticate on connect (session cookie or token) and join room event:{id} after an event.view check; personal notifications go to room user:{id}.
- The outbox relay publishes entity.changed; the client uses TanStack Query to invalidate that entity and re-fetch through the API, which re-applies permissions and sub-event scope.
- dashboard.changed is throttled to one per second per event, so a check-in rush sends one refresh signal per second instead of hundreds.
- On reconnect (phones drop connections often), the client re-fetches everything on screen, so missed messages do not matter.
- WebSocket-only transport avoids sticky sessions behind the load balancer; clients fall back to polling every 30 s if sockets fail entirely.

### 5.5 Permission resolution

1. Guard reads perm:{eventId}:{userId}:{rolesVersion} from Redis.
2. On a miss, one query joins members, role\_assignments and roles for that user and event, producing permission sets per scope (whole event, plus each scoped sub-event).
3. Result is cached; the guard checks the route's permission against the whole-event set or the sub-event set for the target row.
4. List queries in core services apply scope as a filter, e.g. a helper scoped to Mehendi only sees Mehendi tasks.
5. Role edits increment events.roles\_version in the same transaction, so every member's next request uses fresh permissions.

### 5.6 Magic links and public pages

- Tokens are 32 random bytes, base64url-encoded; only their SHA-256 hash is stored and looked up.
- GET /v1/invites/{token} is rate-limited per IP and cached; guessing tokens is infeasible and throttled.
- RSVP is an upsert on the unique attendance key: submitting twice updates the same row.
- Open registration with capacity locks the sub-event row (SELECT … FOR UPDATE) while counting, so two people cannot take the last seat.
- Public routes have their own rate-limit buckets and stay served from cache if the database is slow; later they can move to a separate API deployment.

### 5.7 Media pipeline

1. Client asks POST /uploads for a presigned PUT URL with size (max 15 MB) and type limits.
2. Client uploads straight to R2; the API never handles the file bytes.
3. Client confirms; the media row is created with status pending and an outbox job is queued.
4. Worker checks the real file type, strips location metadata, writes WebP versions (320 px thumbnail, 1600 px display), marks the row ready, and the gallery updates live.
5. Gallery images are served from a public R2 bucket behind Cloudflare's CDN; receipts sit in a private bucket and are shown through signed URLs valid for 5 minutes.

### 5.8 Undo

Undo is a normal action, so it is permission-checked, logged and broadcast like any other change. It reads the activity entry's before and after values, checks that the entity's current version still matches the after state, and writes the before values back. If someone changed the entity since, it returns 409 and shows what changed instead.

### 5.9 AI quick updates (V2)

1. POST /v1/events/{id}/ai/quick-updates returns 202 with a job id.
2. The AI worker builds a compact snapshot of the event: open tasks, vendors, budget categories, sub-events, members.
3. The model is called through the Vercel AI SDK with the core actions offered as tools, defined by the same Zod schemas, limited to the member's permissions.
4. Tool calls are stored as a proposal, never executed; the user sees the preview over the socket.
5. On confirm, the API applies all proposed actions in one transaction with outbox rows, so the update is all or nothing.
6. Timeouts (20 s), per-workspace quotas and a fallback message keep a slow or failing AI provider from blocking anything else.

### 5.10 WhatsApp bot (V2)

1. Webhook arrives; the API verifies Meta's signature, inserts into webhook\_inbox (unique on the message id, so repeats are ignored) and returns 200 in milliseconds.
2. A worker processes it: maps the phone number to a member (asks which event if there are several), downloads any media to R2 right away, then runs the same AI proposal flow.
3. The reply carries Confirm and Edit buttons; the button reply arrives as another webhook and applies the proposal.
4. Outbound replies go through the whatsapp queue with the provider's rate limits.

## Step 6 — Bottlenecks, failure handling and scaling

The first limits to hit are database connections, outbound provider rate limits and photo storage, long before CPU; each has a planned fix, and every dependency has a defined degraded mode so the app slows down instead of stopping.

### Likely bottlenecks

| Component | First symptom | Metric to watch | Fix |
| --- | --- | --- | --- |
| Postgres connections | "too many connections" as API and worker containers grow | Active connections vs. limit | PgBouncer (or the provider's pooler) in transaction mode; small pool per container |
| Slow queries on large events | Dashboard p95 rises on 5,000-guest events | Slow query log, p95 per endpoint | Composite indexes from Step 3b; dashboard cache; EXPLAIN in CI for key queries |
| Activity log growth | Activity pages and undo lookups slow down | Table size, index size | Monthly partitions; archive partitions older than 12 months to R2 |
| Email provider limits | Bulk queue backlog grows | Queue depth, send rate, bounce rate | Rate limiter below provider cap; WhatsApp share links by default; paid plans for email blasts |
| WebSocket fan-out | CPU spikes on check-in days | Messages per second per instance | Throttled dashboard signals; add API instances (Redis adapter spreads load) |
| Redis memory | Evictions, cache hit rate drops | Memory use, evicted keys | Short TTLs, no large values, separate Redis for queues and cache when needed |
| Worker backlog | Imports and thumbnails take minutes | Waiting jobs, oldest job age | Scale worker containers per queue class; raise concurrency |
| Photo storage and bandwidth | Storage bill grows | Bytes stored per workspace | Compression, free-plan photo limits, CDN caching |
| AI cost (V2) | Spend grows faster than paid users | Calls and tokens per workspace | Quotas in usage\_records, smaller model for simple updates, compact context snapshots |

### Failure modes and degraded behavior

| Failure | What users notice | What the system does |
| --- | --- | --- |
| Redis down | Slightly slower pages; live updates pause | Caches fall back to Postgres; outbox rows wait; clients poll every 30 s; rate limiting fails open for signed-in users, closed for public writes |
| Worker down | Emails, imports, thumbnails delayed | Outbox and queues hold work; resumes on restart with no loss |
| Email provider outage | OTP emails delayed | Retries with back-off; Google sign-in still works; alert after 5 minutes |
| WhatsApp or AI provider outage (V2) | Quick updates unavailable | Circuit breaker opens after repeated failures; app shows manual forms; inbox webhooks still stored for later processing |
| One API instance crashes | A few failed requests, then normal | Load balancer health check removes it; clients retry with idempotency keys; sockets reconnect to another instance |
| Database failover or restart | 10-60 seconds of errors | Short connection and query timeouts; retries for idempotent reads; writes return a clear error and the client retries safely |
| Bad deploy | Errors spike | Health checks block the rollout; previous container image kept for one-click rollback; migrations are backward-compatible (expand, then contract) |
| Traffic spike on one event | Other events unaffected | Per-event and per-IP rate limits; chunked jobs; cached public pages |

### Resilience practices across all services

- **Timeouts on every outbound call:** database 5 s, providers 10-20 s, never unbounded.
- **Circuit breakers** around email, WhatsApp and AI clients.
- **Health endpoints:** /health/live (process up) and /health/ready (database and Redis reachable) for the orchestrator.
- **Graceful shutdown:** API stops accepting requests and drains sockets; workers finish current jobs.
- **Observability:** Sentry for errors in web, API and worker; structured JSON logs (pino) with request ids; metrics for queue depth, oldest job age, outbox lag, cache hit rate and p95 latency; uptime checks on the API and a public RSVP page.

### Scaling stages

| Stage | Trigger | Setup |
| --- | --- | --- |
| 0. Build | Development, demos | Docker Compose locally (Postgres, Redis, MinIO, Mailpit, API, worker, web); free tiers for a hosted demo |
| 1. Launch | First real events | One API container and one worker container; managed Postgres with daily backups; managed Redis; R2; web on Vercel or as a container; Sentry |
| 2. Growth | p95 over targets, or more than about 200 active events | Two or more API containers behind a load balancer; workers split into fast and slow pools; PgBouncer; separate Redis for queues and cache; staging environment |
| 3. Scale | Postgres CPU above 60% sustained, or reporting slows writes | Read replica for dashboards and exports; activity log partitions; public pages on a separate API deployment; consider a managed real-time service if socket load dominates |

Nothing in stages 1-3 requires rewriting code: services scale by adding containers, and the core package, queues and outbox stay the same.

## Designed for later: payments

Nothing about payments is built in the MVP, but the design reserves room for it; plan billing (organizers paying us) is likely to come first, ticketing (guests paying organizers) later, and both reuse the outbox, webhook inbox, idempotency keys and queues already described.

### What already supports payments

- attendance.source includes ticket, so a paid ticket is just another way to attend.
- Money is stored as integer paise everywhere.
- The webhook inbox verifies, stores and de-duplicates gateway webhooks.
- Idempotency keys stop a double-tapped Pay button from creating two orders.
- Sub-event row locking for capacity is the basis for not overselling.
- The outbox and queues send confirmations, QR tickets and live updates after payment.

### Plan billing (organizers pay us)

1. Organizer chooses a plan; the API creates a subscription or one-time order with the gateway and returns its hosted checkout.
2. The gateway's signed webhook (payment captured, subscription renewed, payment failed) lands in the webhook inbox.
3. A worker updates subscriptions and workspaces.plan in one transaction with outbox rows (invoice, confirmation email).
4. Plan limits read workspaces.plan, so features unlock without code changes.
5. Failed renewals get a grace period before the workspace drops to the free plan; data is never deleted for non-payment.

### Ticketing (guests pay organizers)

1. Buyer selects tickets; the API creates an order with status pending and reserves the seats for 10 minutes, under the sub-event lock.
2. Buyer pays on the gateway's hosted checkout, so card and UPI details never reach our servers and most card-security compliance stays with the gateway.
3. Only the signed webhook marks the order paid; the browser's redirect just shows "confirming payment".
4. A worker then creates attendance rows, QR tickets, the invoice and the confirmation email in one transaction plus outbox.
5. A scheduled job expires unpaid orders and releases their seats.
6. Refunds are requested through the API, executed by a worker, and confirmed by the gateway's refund webhook.

### Safety rules

- **Webhook is the source of truth**, never the browser redirect.
- **Daily reconciliation job** compares orders and payments with the gateway's records and flags mismatches, catching missed webhooks.
- **Amounts are recalculated on the server** from ticket\_types; the client's total is never trusted.
- **Payment and refund actions are logged** in the activity log and restricted to a new permission, payments.manage.
- **Payouts to organizers** (marketplace-style money flow) are a separate, later decision with its own legal and tax review.

### Gateway choice

Razorpay is the common choice in India for UPI, cards, subscriptions and hosted checkout; the final pick is an open question, made when plan billing is scheduled.

## Open questions

- [ ] Confirm or change the twelve assumed decisions at the top.
- [ ] Choose specific hosting providers for containers, Postgres and Redis after checking current free-tier limits.
- [ ] Choose the email provider's plan and confirm its sending rate limit for the email queues.
- [ ] Decide free-plan limits (photos per event, AI calls, members) so usage checks have numbers.
- [ ] Decide whether the web app is hosted on Vercel or as a container alongside the API.
- [ ] Pick the AI model and provider for V2, and measure cost per quick update.
