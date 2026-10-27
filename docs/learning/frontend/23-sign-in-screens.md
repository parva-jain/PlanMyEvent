# 23 — Sign-in screens

Milestone 2, step 2b · Oct 26, 2026

## What happened

The web side of sign-in, on top of step 2a's API:

| Route | What it does |
| --- | --- |
| `/sign-in` | Email → 6-digit code (Google too, when enabled). Wrong code: boxes shake and turn red. Right code: a check draws, then the page fades into the app |
| `/welcome` | First email sign-in has no name: asks for it, plus an optional +91 mobile (`PATCH /v1/me`) |
| `/app` | Behind `SessionGate`: signed out → `/sign-in`, no name → `/welcome`, API down → retry screen |

Sign-out is in the sidebar (desktop and rail) and on the phone's More screen. `PATCH /v1/me` goes through a new core action, `updateProfile`, with a `UserStore` port.

Tests: API 36 (adds profile updates and CORS); Playwright 40, including three real sign-in flows per device that read the code from Mailpit.

## Key ideas

- **Where can a session be checked?** The cookie is set by the API's host. In production the web app's server (a different host) never receives it, so Next middleware can't see who's signed in. The check runs in the browser: `GET /v1/me` with `credentials: 'include'`.
- **One real input, six fake boxes.** The boxes are drawn from the value of a single transparent input. Paste, the phone's code autofill (`autocomplete="one-time-code"`) and screen readers all work as with any field.
- **Two error shapes, one place each.** `/v1/auth` answers in Better Auth's format (decision 010), handled by `authErrorKey`. Everything else is problem+json, handled by `ApiError` (including `fields` for form errors).
- **Test the real stack where it matters.** Shell tests fake `/v1/me` and run without an API. Sign-in tests start the real API and worker, so they cover CORS, cookies, the outbox, the relay and the email.

## What testing taught us

- **CORS order bit us.** Better Auth was mounted before `enableCors`, so its responses had no CORS headers. The API tests passed because supertest isn't a browser; the browser tests failed. Now CORS goes first, and an API test checks the preflight. It fails without the fix.
- **A cache can lie right after a state change.** The sign-in page had cached "signed out". After a successful code, `fetchQuery` happily returned that cached `null`. `staleTime: 0` forces a fresh `/v1/me`.
- **Wait for gated content.** Once the shell sits behind a session check, tests must wait for it to render before poking at it.
- **`getByRole('alert')` is ambiguous in Next.** Next's route announcer is also an alert, so tests target the error by id.

## Self-check

**Why does `SessionGate` show the logo instead of rendering the shell straight away?**
Until `/v1/me` answers, we don't know whether to show the app, Welcome or sign-in. Rendering the shell first would flash private UI to a signed-out visitor.

**Why does the sign-in test send a random `X-Forwarded-For`?**
The API limits code requests per IP. Every local run comes from 127.0.0.1, so repeated runs would hit the limit. (In production the trusted proxy sets this header; see the follow-up in STATUS.)

**What happens if the API is down when someone opens `/app`?**
`useMe` errors (not a 401), so the gate shows "Can't reach Plan My Event" with a retry. It never wrongly signs them out.

**Why does the Welcome form send `+91` itself?**
The field takes the 10 digits people actually type. The API stores E.164 (`+919876543210`) and validates the Indian mobile format.

## My notes

<!-- Write your own notes here. -->
