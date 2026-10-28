# 27 — The team in the web app

Milestone 4, step 4b · Oct 28, 2026

## What happened

The web app now shows the team and respects permissions:

- **Team** (`/events/{id}/team`): members with their role chips ("Helper · Mehendi"), open invites with revoke, an invite panel (by email, or a shareable link with a join limit and expiry), and a member panel to change roles and their scope, remove someone, transfer ownership or leave.
- **Roles** (`…/team/roles`) and the **role editor** (`…/roles/{id}`, `…/roles/new`): one switch per permission, grouped by area, with a live "People with this role can" summary. The Owner role is read-only.
- **Join page** (`/join/{token}`): what the invite offers, even signed out; "Sign in to join" goes through sign-in and comes back; "You're in" with confetti; clear cards for expired, cancelled or broken links.
- **Permission-aware shell:** the event loads together with `GET E/me`. Nav sections, quick-add actions, Schedule's edit controls and Settings show only what the member can use; a URL they can't use explains what to ask for.
- **My events** shows your roles on each card.

Tests: Playwright adds `team.spec.ts` (invite by link and join, signed-out join, dead links, change a role with scope, role editor), on desktop and phone.

## Key ideas

- **The UI uses the same `can()` as the API.** `can`, `canSomewhere` and `subEventsWith` live in `@pme/contracts`, so the browser and the guard agree. Hiding a button is a convenience only; the API still refuses.
- **"Absent, not refused."** A Viewer doesn't see Settings at all (MOTION.md 6.9). Opening it by URL shows "You don't have access to this", naming the missing permission.
- **Return-to through sign-in.** `?next=/join/…` survives sign-in by email code, Google (as its callback URL) and Welcome. Only same-site paths are accepted, so a crafted link can't send someone to another site after they sign in.
- **A token shown once.** The invite link appears right after creating it, with Copy and WhatsApp buttons. After that it can only be revoked and replaced, because the server keeps only its hash.
- **The picker mirrors the server's rule.** Roles you can't grant are disabled with "(beyond your own permissions)". Switches for permissions you don't hold are locked with the reason.

## What testing taught us

- **A remount silently drops a mutation's `onSuccess`.** The roles editor was keyed by the member's version. Saving refetched the member at a new version, the editor remounted, and React Query skips the per-call callbacks of an unmounted caller, so "close the panel" never ran. Keying by member id fixed it.
- **Keys decide what animates.** Rows keyed by role id played an exit and an enter animation whenever the role changed, so two pickers briefly existed. A test caught it as a "strict mode violation". Rows now keep their own key.
- **Formatters can make an edit miss.** A replacement I scripted silently didn't apply, because Prettier had already split that line. Probing the DOM over time showed the old behaviour still there.

## Self-check

**Why load `GET E/me` with the event instead of on each page?**
Every page and the shell need it (nav, quick add, buttons). Loading it once with the event means no flicker of buttons appearing and disappearing.

**Why does the join page work signed out?**
The person needs to see what they're joining before they sign in, and maybe create an account. Joining itself needs a session.

**What stops `?next=https://evil.example` after sign-in?**
`safeReturnTo` accepts only paths starting with a single `/`, so `//evil.example` and full URLs are dropped.

## My notes

<!-- Write your own notes here. -->
