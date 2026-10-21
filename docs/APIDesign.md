# Plan My Event — API Design

Oct 20, 2026 · @Parv Jain

The API is a versioned JSON REST service under /v1, nested by event, with every write idempotent and version-checked; one Socket.io namespace pushes "something changed" signals, and the web app, mobile app, AI assistant and WhatsApp bot all use the same endpoints and core actions.

This doc expands Step 3a of the system design (Plan My Event — System Design) and builds on the schema in Plan My Event — Database Design.

## Overview and principles

| Item | Value |
| --- | --- |
| Base URL | https://api.\<domain>/v1 (local: http://localhost:4000/v1) |
| Real-time | wss://api.\<domain>/socket.io, namespace /live |
| Format | JSON, UTF-8; requests over 1 MB rejected except uploads, which go straight to R2 |
| Docs | OpenAPI 3.1 generated from the Zod contracts, served at /v1/docs outside production |
| Audience | Internal: our web and mobile clients; not a public developer API |

**Principles**

1. **Resources nest under the event.** /v1/events/{eventId}/tasks, /v1/events/{eventId}/expenses. The event id in the path is the tenant boundary and the permission context for every call.
2. **One endpoint, one core action.** Controllers stay thin: authenticate, check permission, validate, call the action, map the result.
3. **Plain REST verbs.** GET reads, POST creates or triggers an action, PATCH partially updates, PUT replaces a whole set (role assignments, task assignees, modules), DELETE soft-deletes.
4. **Commands get a verb sub-resource**, such as /undo, /accept, /regenerate-link and /transfer-ownership. Ordinary state changes, like completing a task, are a PATCH of the field.
5. **Responses return the saved resource** with its new version, so the client never needs a second read after a write.
6. **Slow work returns 202 Accepted** with a job id; the client follows progress over the socket.
7. **Public endpoints live under /v1/public** with their own rate limits, caching and no session.

**Request lifecycle**

1. Rate limiter checks the bucket for the route.
2. Auth resolves the session cookie or bearer token (public routes resolve the link token instead).
3. Event access check: is the caller an active member of {eventId}? If not, 404.
4. Permission guard checks the route's required permission against the member's effective permissions and sub-event scope.
5. Zod validates path, query and body.
6. Idempotency check replays a stored response for a repeated Idempotency-Key.
7. The core action runs in one transaction (version check, change, activity log, outbox).
8. Response is serialized through the contract schema, with ETag set to the new version.

## Authentication

Organizers authenticate with Better Auth sessions (cookie on web, bearer token on mobile); guests never authenticate, they present a magic-link token that grants access to exactly one invitation.

| Caller | Credential | How it is sent | Lifetime |
| --- | --- | --- | --- |
| Web organizer | Session cookie | HttpOnly, Secure, SameSite=Lax cookie on the api domain | 30 days, sliding; revocable |
| Mobile organizer (later) | Session token | Authorization: Bearer \<token> | 30 days, sliding; revocable |
| Guest | Invitation token | In the URL path of /v1/public/invites/{token} | Until revoked or the event is archived |
| New team member | Member invite token | In the URL path of /v1/member-invites/{token} | 7 days, limited uses |
| Socket client | Same cookie or bearer token | Handshake headers or auth payload | Checked on connect and on every room join |

### Sign-in endpoints

Mounted from Better Auth under /v1/auth; exact sub-paths follow the library.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /v1/auth/email-otp/send-verification-otp | Email a 6-digit code (rate-limited) |
| POST | /v1/auth/sign-in/email-otp | Exchange email and code for a session |
| POST | /v1/auth/sign-in/social | Start Google sign-in; returns the redirect URL |
| GET | /v1/auth/callback/google | OAuth callback; sets the session |
| GET | /v1/auth/get-session | Current session, or null |
| POST | /v1/auth/sign-out | Revoke the current session |

A user's personal workspace is created in the same transaction as the user row, through a Better Auth hook that calls the core createUserWorkspace action.

### CSRF and CORS

- Cookies are SameSite=Lax, so cross-site POSTs carry no session.
- Every state-changing request with a cookie must also send Origin matching the web app's origin; others get 403 csrf\_failed. Bearer-token requests are exempt.
- CORS allows only the web app's origin, with credentials.

### Link tokens

- Invitation links are derived, not stored: token = base64url(HMAC-SHA256(server key, invitationId + ":" + tokenVersion)). The database stores only SHA-256(token) for lookup, plus token\_version. Organizers can re-share a link any time because the server can re-derive it; a database leak alone cannot produce working links. Regenerating a link increments token\_version, which kills the old one.
- Member invite links are random 32-byte tokens shown once at creation; a lost link is revoked and a new one created.
- Tokens never appear in logs: the request logger replaces path segments after /invites/ and /member-invites/ with a hash prefix.

## Authorization

Every event route declares one required permission; a NestJS guard resolves the caller's effective permissions (cached by roles\_version) and checks them against the whole event or against the sub-event the target row belongs to.

### How a route declares access

```ts
@Controller('events/:eventId/tasks')
export class TasksController {
  @Patch(':taskId')
  @RequirePermission('tasks.edit', { scopeFrom: 'task' })
  update(@EventCtx() ctx: EventContext, @Param('taskId') id: string, @Body() body: UpdateTaskBody) {
    return this.tasks.update(ctx, id, body);
  }
}
```

- **scopeFrom** tells the guard how to find the sub-event: from the target row (task, expense, attendance), from the request body (subEventId on create), or none (event-wide routes).
- A permission granted for the whole event satisfies every sub-event. A permission granted only for Mehendi satisfies rows linked to Mehendi and nothing else.
- Rows with no sub-event (event-wide tasks, expenses) require a whole-event grant.
- **List endpoints filter instead of refusing.** A helper scoped to Mehendi who calls GET /tasks gets only Mehendi tasks, not a 403.
- **Helpers updating their own tasks.** The Helper preset has tasks.view plus tasks.update\_own; the guard allows PATCH on a task when the caller is one of its assignees and the body only changes status or checklist items.

### 404 or 403

| Situation | Response | Why |
| --- | --- | --- |
| Caller is not an active member of the event | 404 not\_found | Don't reveal that the event exists |
| Member lacks the permission | 403 forbidden, naming the missing permission | Lets the UI explain what to ask for |
| Row exists but belongs to another event | 404 not\_found | Composite keys make this impossible in data; the API treats it as missing |
| Row is soft-deleted | 404, except GET with ?includeDeleted=true for members with activity.view | Supports undo screens |
| Workspace plan limit reached | 402 plan\_limit\_reached | Distinct from permission problems |

### Permissions the client can read

GET /v1/events/{eventId}/me returns the caller's member record and effective permissions, grouped by scope, so the UI can hide buttons the caller can't use. It is re-fetched when the socket sends permissions.changed. The UI hiding a button is a convenience only; the guard is the enforcement.

**Catalog addition:** tasks.update\_own joins the permission catalog from the PRD.

## Conventions

JSON is camelCase, ids are UUIDv7 strings, money is integer paise, timestamps are UTC ISO 8601, and every list is cursor-paginated with the same envelope.

| Topic | Rule | Example |
| --- | --- | --- |
| Field names | camelCase in JSON; snake\_case only in the database | dueOn, paymentStatus |
| Value sets | Same snake\_case strings as the database check constraints | "advance\_paid" |
| IDs | UUIDv7 strings; never sequential numbers | "0192f6c1-..." |
| Timestamps | ISO 8601 in UTC with Z | "2026-12-12T13:30:00Z" |
| Date-only values | YYYY-MM-DD, interpreted in the event's time zone | "2026-12-12" |
| Event time zone | Returned on the event; clients format times with it, never with the device zone | "Asia/Kolkata" |
| Money | Integer paise in a field ending in Paise; INR implied | amountPaise: 2000000 (₹20,000) |
| Phone | E.164; the API normalizes Indian 10-digit input | "+919876543210" |
| Nulls | Absent optional fields are returned as null, not omitted | "subEventId": null |
| Versions | Every versioned resource includes version; ETag header mirrors it | version: 4, ETag: "4" |
| Booleans in queries | true or false | ?includeDeleted=true |

### Single resources and lists

A single resource is returned as the object itself. Lists share one envelope:

```json
{
  "data": [ { "id": "...", "title": "Book caterer", "version": 3 } ],
  "nextCursor": "eyJkIjoiMjAyNi0xMS0wMSIsImkiOiIwMTkyLi4uIn0",
  "hasMore": true
}
```

### Pagination, filtering and sorting

- **Cursor pagination:** ?limit= (default 50, max 100) and ?cursor= from the previous page. Cursors are opaque base64 strings encoding the sort key and id, so pages stay stable while rows are added.
- **Filters** are plain query parameters named after fields: ?status=todo&subEventId=...&assignee=me&dueBefore=2026-12-01. Repeated parameters mean OR: ?status=todo&status=in\_progress.
- **Search:** ?q= on contacts, households and attendance (trigram name match).
- **Sorting:** ?sort=dueOn or ?sort=-createdAt, limited to fields each endpoint lists in its docs; the default is stated per endpoint.
- **Small lists are unpaginated:** sub-events, venues, roles, budget categories and modules return the full list in the same envelope with hasMore: false.

### Headers

| Header | Direction | Use |
| --- | --- | --- |
| Idempotency-Key | Request | Safe retries of POST (see below) |
| If-Match | Request | Version guard on PATCH, PUT and DELETE |
| ETag | Response | Current version of the returned resource |
| X-Request-Id | Both | Sent by the client or generated; echoed back and logged |
| X-Client-Version | Request | Web or mobile build version, for compatibility checks |
| RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset | Response | Current bucket state |
| Retry-After | Response | On 429 and 503 |

## Concurrency and idempotency

Two headers make writes safe: If-Match stops one organizer silently overwriting another's change, and Idempotency-Key stops a retried request on a flaky phone network from creating a duplicate.

### Version guard (If-Match)

- Every versioned resource returns version in the body and ETag: "\<version>".
- PATCH, PUT and DELETE on a versioned resource must send If-Match: "\<version>". Missing header returns 428 precondition\_required.
- If the row has changed, the API returns 409 version\_conflict with the current resource in the body, so the client can show "Priya changed this a moment ago" and let the user re-apply.
- PUT on sets (role assignments, task assignees, modules) uses the parent's version: the member's, the task's or the event's.
- Guest RSVPs and registrations are exempt: they are upserts where the last answer wins.

### Idempotency-Key

| Rule | Detail |
| --- | --- |
| Where | Accepted on every POST; required on public POSTs, POST /expenses, POST /invitations/bulk and every V2 AI or payment call |
| Value | A UUID the client generates once per user action and reuses on retries |
| Scope | Per user (or per link token on public routes); the same key from two users is two keys |
| Window | 24 hours |
| Same key, same body | The stored status and body are replayed; nothing runs twice |
| Same key, different body | 422 idempotency\_key\_reused |
| Same key while the first is still running | 409 request\_in\_progress with Retry-After: 1 |

PATCH and PUT are naturally idempotent with If-Match, and DELETE of an already deleted row returns 204, so they need no key.

## Errors

Every error is an RFC 9457 problem+json body with a stable code the clients switch on; the human-readable title and detail may change, the code never does.

```json
{
  "type": "https://api.<domain>/errors/version-conflict",
  "title": "This task was changed by someone else",
  "status": 409,
  "code": "version_conflict",
  "detail": "Expected version 3, current version is 4.",
  "requestId": "req_01JB...",
  "current": { "id": "...", "status": "done", "version": 4 }
}
```

Validation errors add a fields array: \[{ "path": "amountPaise", "message": "Must be greater than 0" }\].

### Error codes

| Status | code | When |
| --- | --- | --- |
| 400 | bad\_request | Malformed JSON or an unknown query parameter |
| 401 | unauthenticated | No session, or an expired one |
| 402 | plan\_limit\_reached | Workspace hit a free-plan limit; body names the limit |
| 403 | forbidden | Member lacks a permission; body names it |
| 403 | csrf\_failed | Cookie request without a matching Origin |
| 404 | not\_found | Missing, deleted, or not visible to the caller |
| 409 | version\_conflict | If-Match did not match; body has current |
| 409 | request\_in\_progress | Same Idempotency-Key still running |
| 409 | capacity\_full | Sub-event is full; registration may be waitlisted instead |
| 409 | conflict | Business rule clash; the code is more specific where clients act on it: role\_in\_use, duplicate\_transaction\_ref, rsvp\_closed |
| 410 | link\_expired | Member invite expired or used up |
| 410 | link\_revoked | Invitation or member invite revoked |
| 413 | payload\_too\_large | Body over 1 MB, or upload declared over 15 MB |
| 415 | unsupported\_media\_type | Upload type not allowed |
| 422 | validation\_failed | Body or query failed the Zod schema |
| 422 | idempotency\_key\_reused | Same key, different request |
| 426 | client\_upgrade\_required | Mobile build older than the minimum supported |
| 428 | precondition\_required | If-Match missing on a versioned write |
| 429 | rate\_limited | Bucket exhausted; Retry-After set |
| 500 | internal\_error | Unexpected; reported to Sentry with requestId |
| 503 | service\_unavailable | Database unreachable or shutting down; Retry-After set |

The web and mobile clients retry automatically only on 409 request\_in\_progress, 429 and 503, always with the same Idempotency-Key.

## Rate limits

Limits are sliding windows in Redis, keyed per bucket; they are generous for organizers and tight on public and auth routes, where abuse would come from.

| Bucket | Key | Limit | Notes |
| --- | --- | --- | --- |
| OTP send | email, and IP | 5 per 15 min per email; 20 per hour per IP | Protects the email budget |
| OTP verify | email | 10 attempts per 15 min | Then the code is invalidated |
| Organizer reads | user | 600 per min |  |
| Organizer writes | user | 120 per min |  |
| Bulk and import calls | event | 10 per hour | CSV import, bulk invitations, guest-scope switch |
| Upload URLs | member | 120 per hour |  |
| Public invite page | IP, and token | 60 per min per IP; 30 per min per token | Cached responses still count |
| RSVP submit | token | 10 per min |  |
| Public registration | IP | 5 per min, plus Turnstile |  |
| Public event page | IP | 120 per min | Mostly served by the CDN |
| Socket connections | user | 10 concurrent | Several tabs and devices |

If Redis is unavailable, limits fail open for signed-in routes and fail closed (503) for public writes, as set in the system design.

## Endpoint reference

The MVP has about 75 operations across 20 resources. In the tables, E stands for /v1/events/{eventId}; every E route first requires active membership of that event.

### Account

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| GET | /v1/me | Profile and personal workspace | Signed in |
| PATCH | /v1/me | Update name, phone, avatar, locale | Signed in |
| DELETE | /v1/me | Delete account; 202, runs as a job | Signed in; refused while owning events |
| GET | /v1/me/events | Events I belong to, with my role names | Signed in |
| GET | /v1/me/tasks | My open tasks across all events | Signed in |
| GET | /v1/event-templates | Templates with default modules, sub-events, tasks, categories | Signed in |
| GET | /v1/permissions | Permission catalog with labels, for the role editor | Signed in |

### Events and program

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| POST | /v1/events | Create from a template; creator becomes Owner | Signed in, plan limit |
| GET | E | Event details, guest scope, response mode | event.view |
| PATCH | E | Name, dates, time zone, status, budgetPaise, description, cover | event.settings |
| DELETE | E | Delete event and all data; 202 job | event.delete |
| GET | E/me | My member record and effective permissions by scope | Member |
| GET | E/dashboard | Countdown, task progress, budget totals, headcounts, delivery progress | event.view |
| POST | E/guest-scope | Switch whole\_event and per\_sub\_event; 202 job | event.settings |
| POST | E/transfer-ownership | Make another member the Owner | Owner only |
| GET / PUT | E/modules | Read or replace enabled modules and their config | event.view / event.settings |
| GET / POST | E/venues | List, create | event.view / subevents.edit |
| PATCH / DELETE | E/venues/{venueId} | Update, delete | subevents.edit |
| GET / POST | E/sub-events | List (unpaginated, by start time), create | subevents.view / subevents.edit |
| GET / PATCH / DELETE | E/sub-events/{subEventId} | Read, update, delete | subevents.view / subevents.edit |

### Team and roles

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET | E/members | Members with roles and scopes | members.view |
| GET | E/members/{memberId} | One member | members.view |
| DELETE | E/members/{memberId} | Remove a member (cannot remove the Owner) | members.manage |
| POST | E/leave | Leave the event (not allowed for the Owner) | Member |
| PUT | E/members/{memberId}/roles | Replace role assignments and scopes | members.manage |
| GET / POST | E/member-invites | List open invites; create an email or link invite | members.manage |
| DELETE | E/member-invites/{inviteId} | Revoke | members.manage |
| GET | /v1/member-invites/{token} | Preview: event name, inviter, roles offered | Anyone with the link |
| POST | /v1/member-invites/{token}/accept | Join with the invited roles | Signed in |
| GET / POST | E/roles | List roles; create a custom role | members.view / roles.manage |
| PATCH / DELETE | E/roles/{roleId} | Edit or delete (Owner role refused) | roles.manage |

### Planning

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET / POST | E/tasks | List with filters (status, subEventId, assignee, dueBefore, parentTaskId); create | tasks.view / tasks.edit |
| GET / PATCH / DELETE | E/tasks/{taskId} | Read; update fields, status or position; delete | tasks.view / tasks.edit or tasks.update\_own |
| PUT | E/tasks/{taskId}/assignees | Replace assignees | tasks.assign |
| GET / POST | E/budget-categories | List with planned, committed and paid totals; create | budget.view / budget.edit |
| PATCH / DELETE | E/budget-categories/{categoryId} | Update, delete (refused while expenses exist) | budget.edit |
| GET / POST | E/expenses | List with filters (categoryId, subEventId, paymentStatus, dueBefore); create | budget.view / budget.edit |
| GET / PATCH / DELETE | E/expenses/{expenseId} | Read; update amounts, status, receipt; delete | budget.view / budget.edit |

### Guests and attendance

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET / POST | E/households | List with ?q search; create | guests.view / guests.edit |
| PATCH / DELETE | E/households/{householdId} | Update name, expected count; delete | guests.edit |
| GET / POST | E/contacts | List with ?q and ?tag; create | guests.view / guests.edit |
| GET / PATCH / DELETE | E/contacts/{contactId} | Read, update, delete | guests.view / guests.edit |
| POST | E/contacts/import | CSV import with column mapping; 202 job | guests.edit |
| GET / POST | E/invitations | List with filters (deliveryStatus, distributor); create one | guests.view / guests.invite |
| POST | E/invitations/bulk | Create invitations for many households or contacts; 202 job above 200 | guests.invite |
| PATCH | E/invitations/{invitationId} | Delivery status, distributor, sub-events | guests.invite |
| PATCH | E/invitations/bulk | Set delivery status or distributor on many at once | guests.invite |
| DELETE | E/invitations/{invitationId} | Withdraw (link stops working) | guests.invite |
| GET | E/invitations/{invitationId}/share | Magic link plus a ready WhatsApp message and wa.me URL | guests.invite |
| POST | E/invitations/{invitationId}/regenerate-link | New token; the old link stops working | guests.invite |
| GET | E/attendance | Rows with filters (subEventId, status, source) and ?q | guests.view |
| POST | E/attendance | Organizer adds a walk-in or manual registration | guests.edit |
| PATCH | E/attendance/{attendanceId} | Correct status or party size on a guest's behalf | guests.edit |

### Platform

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| GET | E/activity | Activity feed; filters entityType, entityId, actor | activity.view |
| POST | E/activity/{entryId}/undo | Undo one change; 409 if the entity changed since | Author of the change, or event.settings |
| POST | E/uploads | Presigned upload URL for gallery, receipt or cover | gallery.upload, budget.edit or event.settings by kind |
| POST | E/media/{mediaId}/complete | Confirm upload; starts processing | Uploader |
| GET | E/media | Gallery list, filter subEventId | event.view |
| GET | E/media/{mediaId}/url | Short-lived signed URL for a private file | budget.view for receipts |
| PATCH / DELETE | E/media/{mediaId} | Caption, album; delete | gallery.manage |
| GET | /v1/notifications | My notifications, newest first | Signed in |
| POST | /v1/notifications/read | Mark ids, or all, as read | Signed in |
| GET | /v1/jobs/{jobId} | Status of a job I started | Starter of the job |
| GET | /v1/health/live, /v1/health/ready | Liveness and readiness | Internal |

## Public endpoints

Guests and visitors use four endpoints with no account; each is cached or rate-limited on its own bucket, and each only ever exposes what the link or the public page is meant to show.

| Method | Path | Purpose | Protection |
| --- | --- | --- | --- |
| GET | /v1/public/invites/{token} | The invitation: event, household name, sub-events with times and venues, current response | Token hash lookup; cached 5 min by content\_version; per-IP and per-token limits |
| POST | /v1/public/invites/{token}/rsvp | Submit or change attendance and party size | Idempotency-Key; per-token limit; only for invite\_rsvp sub-events |
| GET | /v1/public/events/{slug} | Public page data: details, public sub-events, venues, registration status | CDN cached 60 s; draft and archived events return 404 |
| POST | /v1/public/events/{slug}/registrations | Register for open sub-events | Turnstile token; per-IP limit; Idempotency-Key; capacity check under row lock |

**What a guest can see.** The invite response contains the event name, cover, dates, the household or contact name, the sub-events on the invitation with times and venues, and the guest's own response. It never contains other guests, headcounts, organizers' contact details or tasks.

**RSVP rules.**

- One response per household per scope: an upsert on the attendance key, last answer wins, and responded\_at is updated.
- partySize must be 1 to 50 and is not checked against expected\_count; organizers see the difference on the dashboard.
- When the RSVP deadline (V2) passes, the endpoint returns 409 conflict with code rsvp\_closed.
- Invite-only sub-events show on the invite but cannot be answered.

**Registration rules.**

- The request carries name, phone and/or email, chosen sub-events and party size (default 1).
- A contact is matched by email or phone within the event, or created.
- Each sub-event is checked against capacity; a full one returns capacity\_full, or registers as waitlisted when the waitlist module (V2) is on.
- Registration also creates an invitation row with delivery status sent\_digitally, so the confirmation email carries a magic link and the registrant uses the same invite page to view or cancel.

**Example RSVP request**

```http
POST /v1/public/invites/k3Jx...Qw/rsvp
Idempotency-Key: 6f1c2e0a-8f4b-4b1e-9b8e-2b8d1f0a7c11
Content-Type: application/json

{
  "responses": [
    { "subEventId": null, "attending": true, "partySize": 3 }
  ]
}
```

With guest\_scope = per\_sub\_event, responses has one entry per answerable sub-event instead of one with subEventId null.

## Worked examples

Five calls cover the shapes every other endpoint follows: create, update with a version guard, money, upload and the dashboard.

### Create an event from a template

```http
POST /v1/events
Idempotency-Key: 0b6f...

{
  "templateKey": "wedding",
  "name": "Sharma Wedding",
  "startsOn": "2026-12-10",
  "endsOn": "2026-12-12",
  "timeZone": "Asia/Kolkata",
  "venue": { "name": "Radisson Lawn", "address": "Indore" }
}
```

```json
201 Created
ETag: "1"

{
  "id": "0192f6c1-...",
  "slug": "sharma-wedding-x7k2",
  "type": "wedding",
  "status": "planning",
  "guestScope": "whole_event",
  "responseMode": "invite_only",
  "budgetPaise": null,
  "counts": { "subEvents": 5, "tasks": 42, "budgetCategories": 12 },
  "version": 1
}
```

### Complete a task with a version guard

```http
PATCH /v1/events/0192f6c1-.../tasks/0192f6d0-...
If-Match: "3"

{ "status": "done" }
```

```json
200 OK
ETag: "4"

{
  "id": "0192f6d0-...",
  "title": "Book caterer",
  "status": "done",
  "completedAt": "2026-10-20T08:12:44Z",
  "assignees": [ { "memberId": "...", "name": "Rahul" } ],
  "subEventId": null,
  "version": 4
}
```

If someone else saved first, the same call returns 409 version\_conflict with the current task (see Errors).

### Record a caterer advance

```http
POST /v1/events/0192f6c1-.../expenses
Idempotency-Key: 9a2d...

{
  "categoryId": "...",
  "title": "Caterer advance",
  "vendorName": "Shree Caterers",
  "amountPaise": 18000000,
  "paidPaise": 2000000,
  "paymentStatus": "advance_paid",
  "paidOn": "2026-10-20",
  "paidByMemberId": "...",
  "transactionRef": "429817365012"
}
```

The server re-checks that amounts match the status and that transactionRef is unused in this event (409 conflict with code duplicate\_transaction\_ref otherwise).

### Upload a receipt

1. POST E/uploads with { "kind": "receipt", "mime": "image/jpeg", "bytes": 412000 } returns { "mediaId", "uploadUrl", "headers", "expiresAt" } (URL valid 10 minutes).
2. The client PUTs the file to uploadUrl directly; the API never sees the bytes.
3. POST E/media/{mediaId}/complete returns the media row with status pending and starts processing.
4. PATCH the expense with receiptMediaId. When processing finishes, the socket sends entity.changed for the media row.

### Dashboard

```json
GET /v1/events/0192f6c1-.../dashboard

{
  "countdown": { "eventStartsOn": "2026-12-10", "nextSubEvent": { "id": "...", "name": "Haldi", "startsAt": "2026-12-10T04:30:00Z" } },
  "tasks": { "total": 42, "done": 17, "overdue": 3 },
  "budget": { "budgetPaise": 250000000, "plannedPaise": 238000000, "committedPaise": 121000000, "paidPaise": 43000000 },
  "headcounts": [ { "subEventId": null, "expected": 412, "confirmed": 0, "checkedIn": 0 } ],
  "invitations": { "total": 340, "notSent": 60, "sentDigitally": 68, "deliveredInPerson": 212 },
  "generatedAt": "2026-10-20T08:13:02Z"
}
```

The dashboard is served from the 30-second cache; generatedAt tells the client how fresh it is, and dashboard.changed prompts a re-fetch.

## Async jobs

Anything that can touch thousands of rows or call a slow provider returns 202 Accepted immediately with a job id; the client follows progress over the socket and can poll as a fallback.

| Operation | Endpoint | Typical duration |
| --- | --- | --- |
| CSV contact import | POST E/contacts/import | Seconds to a minute for 5,000 rows |
| Bulk invitations (over 200) | POST E/invitations/bulk | Seconds |
| Guest scope switch | POST E/guest-scope | Seconds |
| Delete event | DELETE E | Minutes (rows and files in batches) |
| Delete account | DELETE /v1/me | Minutes |
| AI quick update (V2) | POST E/ai/quick-updates | 3-15 seconds |

**Response**

```json
202 Accepted
Location: /v1/jobs/0192f7aa-...

{ "jobId": "0192f7aa-...", "status": "queued", "statusUrl": "/v1/jobs/0192f7aa-..." }
```

**Job status** from GET /v1/jobs/{jobId} or the job.progress socket event:

```json
{
  "jobId": "0192f7aa-...",
  "kind": "contacts.import",
  "status": "running",
  "progress": { "done": 1500, "total": 4820 },
  "result": null,
  "error": null
}
```

- status moves through queued, running, then succeeded or failed.
- An import's result reports created, updated and skipped counts, plus up to 100 row errors with line numbers; the full error list is downloadable as CSV from a signed URL.
- Job status is kept for 24 hours. It is progress information only: the real outcome (contacts, invitations) is in Postgres and visible through the normal endpoints, so a lost status never loses data.
- Only one guest-scope switch or event deletion can run per event at a time; a second request returns 409 conflict with code job\_already\_running.

## Real-time contract

The socket only says what changed, never the data itself; clients re-fetch through the REST API, so permissions and sub-event scope are always applied by the same guard.

**Connection.** Socket.io v4 at /socket.io, namespace /live, WebSocket transport only. Authentication uses the session cookie (web) or auth: { token } (mobile) in the handshake; a missing or invalid session is refused with connect\_error unauthenticated. Every user joins room user:{userId} automatically.

### Client to server

| Event | Payload | Ack | Notes |
| --- | --- | --- | --- |
| event:join | { eventId } | { ok: true } or { ok: false, code } | Server checks active membership and event.view; joins room event:{eventId} |
| event:leave | { eventId } | { ok: true } |  |

Clients join the event they are viewing and leave when they navigate away; a client may be in at most 10 event rooms.

### Server to client

| Event | Room | Payload | Client reaction |
| --- | --- | --- | --- |
| entity.changed | event:{id} | { eventId, entityType, entityId, op: created / updated / deleted, version, subEventId, actorUserId, requestId } | Invalidate that entity and its lists; re-fetch if on screen. Skip if requestId is its own |
| dashboard.changed | event:{id} | { eventId } | Re-fetch the dashboard; sent at most once per second per event |
| permissions.changed | event:{id} | { eventId, memberId } | If memberId is me (or null), re-fetch E/me |
| member.removed | user:{id} | { eventId } | Leave the room, show "You no longer have access" |
| job.progress | user:{id} | Job status object | Update the progress UI |
| notification.new | user:{id} | { notificationId, type } | Update the bell badge |

**Delivery guarantees.** At least once, in no guaranteed order across entities. version lets a client ignore a signal older than what it already holds. Signals are not stored: after a reconnect the client re-fetches everything on screen instead of replaying missed events.

**Access changes.** When a member is removed, the server also drops that user's sockets from the event room at once. Role changes need no room change: signals carry no data, and the next REST call applies the new permissions.

**Fallback.** If the socket cannot connect for 30 seconds, the web client polls the dashboard and the visible list every 30 seconds until the socket recovers.

## V2 endpoints and webhooks

V2 adds endpoints but changes none of the MVP ones; the AI and WhatsApp features reuse the same core actions behind a propose-then-confirm pair of calls.

### AI quick updates

| Method | Path | Purpose | Permission |
| --- | --- | --- | --- |
| POST | E/ai/quick-updates | Text, voice-note media id or screenshot media id in; 202 job that produces a proposal | Member; plan quota |
| GET | E/ai/proposals/{proposalId} | Proposed actions with a human-readable summary | Proposal owner |
| POST | E/ai/proposals/{proposalId}/confirm | Apply all actions in one transaction; optional edits to individual actions | Proposal owner, with each action's own permission |
| POST | E/ai/proposals/{proposalId}/discard | Throw the proposal away | Proposal owner |
| POST | E/ai/ask | Question about the event; streamed answer, read-only | event.view; plan quota |

A proposal is a list of typed actions using the same Zod schemas as the REST bodies, for example { "action": "tasks.update", "taskId": "...", "patch": { "status": "done" } }. Confirm re-checks every permission and version at apply time; a stale action makes the whole confirm return 409 with the conflicting item, so nothing is half-applied. Proposals expire after 24 hours.

### Other V2 resources

| Area | Endpoints |
| --- | --- |
| Check-in | POST E/check-ins with { qrToken } or { attendanceId }; GET E/check-ins/stats |
| Form builder | GET, POST, PATCH, DELETE E/form-fields |
| Vendors | GET, POST, PATCH, DELETE E/vendors |
| Task comments | GET, POST E/tasks/{taskId}/comments |
| Announcements | POST E/announcements (email to a filtered guest list; 202 job) |
| RSVP reminders | PUT E/rsvp-settings (deadline, reminder schedule) |
| Event website | GET, PUT E/website (theme, sections, FAQ) |
| WhatsApp linking | POST /v1/me/whatsapp/link (sends a code); POST /v1/me/whatsapp/verify |

### Webhooks in

| Method | Path | Source | Handling |
| --- | --- | --- | --- |
| GET | /v1/webhooks/whatsapp | Meta | Verification challenge on setup |
| POST | /v1/webhooks/whatsapp | Meta Cloud API | Verify X-Hub-Signature-256, insert into webhook\_inbox, return 200 within 1 s |
| POST | /v1/webhooks/email | Resend | Verify signature; delivery, bounce and complaint events update invitation and email status |
| POST | /v1/webhooks/payments (Later) | Payment gateway | Same pattern; the only source of truth for payment status |

Webhook routes have no session or CSRF check, only signature verification, and are excluded from the organizer rate limits.

## Versioning, OpenAPI and contract testing

The Zod schemas in packages/contracts are the single definition of every request, response and socket payload; OpenAPI, the web client's types and the server's validation are all generated from them, so they cannot drift apart.

### Versioning rules

- **Additive changes stay in /v1:** new endpoints, new optional request fields, new response fields, new values in a value set. Clients must ignore unknown fields and treat unknown values as "other".
- **Breaking changes need /v2:** removing or renaming a field, changing a type, making an optional field required, or changing an endpoint's meaning. /v1 then stays up until no supported client uses it.
- **Mobile builds (later)** send X-Client-Version. The API keeps a minimum supported version per platform and answers older builds with 426 client\_upgrade\_required, so old installs fail clearly instead of oddly.
- Deprecated endpoints return a Deprecation header and a Sunset date for at least 3 months before removal.

### From contracts to clients

1. Each endpoint's params, query, body and response are Zod schemas in packages/contracts, grouped by resource.
2. NestJS validates with those schemas (via nestjs-zod) and registers them for OpenAPI generation.
3. The OpenAPI document is generated in CI and committed, so API changes show up as a reviewable diff.
4. The web app imports the same schemas and types directly from the monorepo; the future mobile app does the same.
5. Socket event names and payloads are typed in the same package and used by both the gateway and the client.

### Testing the API

| Test | Tool | What it proves |
| --- | --- | --- |
| Contract snapshot | CI diff of the generated OpenAPI file | No unreviewed breaking change ships |
| Permission matrix | Vitest + Supertest, generated from route metadata | Every route rejects a member without its permission and accepts one with it, including sub-event scope |
| Version and idempotency | Vitest integration tests against a real Postgres | Stale If-Match gets 409; a repeated Idempotency-Key never creates twice |
| Public flows | Playwright | Magic link, RSVP and registration work on a phone-sized screen |
| Socket signals | Vitest with a socket client | A write produces entity.changed for members in the room and nothing for others |
| Rate limits | Integration tests | Each bucket returns 429 with Retry-After at its limit |

## Changes to earlier docs

Designing the endpoints settled five details the earlier docs left open; the system design and database design docs have been updated to match.

| Change | Why | Docs updated |
| --- | --- | --- |
| Public routes moved under /v1/public (was /v1/invites/{token}) | One prefix for public caching, rate limits and logging rules | System design |
| Invitation links derived with HMAC from invitation id and a token\_version | Organizers can re-share a link any time without storing raw tokens | Database design (invitations.token\_version) |
| New permission tasks.update\_own, included in the Helper preset | Helpers can tick off their own tasks without editing others | PRD (permission catalog and Helper role) |
| Open registrations also create an invitation row | Registrants get the same magic-link page to view or cancel | Database design (attendance note) |
| Errors follow RFC 9457 (the successor of RFC 7807, same shape) | Current standard | System design |

## Open questions

- [ ] Final domain, which fixes the api., app. and public page URLs.
- [ ] Whether /v1/docs is available in production behind a login, or only in development.
- [ ] Whether the Helper preset can see budget totals by default (currently no: budget.view is not in Helper).

RSVP changes after the deadline (V2): blocked, or allowed with organizer notification.
