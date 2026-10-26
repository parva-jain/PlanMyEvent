# 010. Sign-in with Better Auth: what follows the library and what we add

- Status: Accepted
- Date: 2026-10-26

## Context

APIDesign mounts Better Auth under `/v1/auth` for Google and email OTP. Wiring it up (Better Auth 1.7.10) showed three places where the library's behaviour differs from what the docs assume.

## Decision

1. **The personal workspace is created right after the user, not in the same transaction.**
   - Better Auth runs `databaseHooks.user.create.after` only after its own transaction commits, and our core actions can't join that transaction.
   - So the hook calls core's `ensurePersonalWorkspace` immediately after the commit. `GET /v1/me` calls the same action whenever the workspace is missing.
   - The unique index `(owner_user_id) where is_personal` makes it idempotent and safe under concurrency.
   - Replaces "in the same transaction as the user row" in APIDesign and DatabaseDesign.
2. **`/v1/auth/*` errors use Better Auth's JSON format** (`{ code, message }`), not problem+json. Every other route keeps RFC 9457 (CLAUDE.md rule 9). The web app will call these routes through Better Auth's client, which understands that format.
3. **Sign-in limits:**
   - Per IP, through Better Auth's rate limiter stored in Redis: 20 code requests per hour and 10 sign-in attempts per 15 minutes.
   - Per email address, in a `before` hook: 5 codes per 15 minutes.
   - Both fail closed when Redis is down (public writes, SystemDesign). Google sign-in keeps working.
   - Each code allows 3 wrong attempts, then it's invalid (the library's default; APIDesign said 10 attempts per 15 minutes per email).

Also:
- Codes are stored hashed.
- Sessions live in Postgres, not Redis (rule 12): 30 days, sliding.
- Ids are UUIDv7.
- Google sign-in is on only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
- Cookie-authenticated writes outside `/v1/auth` must send the web app's `Origin` (403 `csrf_failed` otherwise). Better Auth checks origins on its own routes.

## Consequences

- If the hook fails after the user commits, the user exists for a moment without a workspace. The next `/v1/me` repairs it, and actions that need the workspace (event creation, milestone 3) should ensure it the same way.
- The web app handles two error shapes: Better Auth's for sign-in, problem+json for everything else.
- Sign-up through email OTP creates a user with an empty name. The Welcome screen asks for it (`PATCH /v1/me`, milestone 2 web step).
