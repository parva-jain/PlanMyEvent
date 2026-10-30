# 28 — Fixing what the reviews found

Between milestones 4 and 5 · Oct 30, 2026

## What happened

Automated reviews of milestones 1–4 listed 7 major findings and about 20 minor ones. Every major one was still real on `main`, so each got a test that failed first, then a fix:

- **A role manager could strip Admin.** `updateRole` checked the new permission list against the actor's own, but not the role being changed. Shrinking Admin to `event.view` passed, because `event.view` is within anyone's permissions. Now changing or deleting a role needs every permission it already holds, the same rule `assertCovers` applies to members.
- **Sentry could receive invite tokens.** Only the logger used `redactUrl`. Sentry events and traces now go through it too (URL, transaction name, spans, breadcrumbs), and cookie and authorization headers are dropped.
- **`PATCH /v1/me` with `{}` was a 500.** The schema was all-optional and stripped unknown keys, so an empty change reached Drizzle's `.set({})`. Core now refuses it with a 422.
- **Double submits.** Pressing Enter twice sent two sign-in codes; a double click on Create showed an error even though the event was made. Both now use a ref guard, and the wizard retries 409 `request_in_progress`.
- **Focus after closing a sheet.** Our dialogs open from plain buttons, not `Dialog.Trigger`, so Radix had nothing to return focus to. `useReturnFocus` remembers the opener.
- **`runAction` guardrails.** Event actions without `ctx.eventId` are refused, and an action must return `activity` unless it declares `noActivity` with a reason.

Minor findings went under Follow-ups in STATUS.

## Key ideas

- **"Within your own" isn't enough when you change someone else's thing.** Granting needs the permissions you give; changing a role or a member also needs the permissions they already have.
- **State is too slow for a double click.** `busy` or `isPending` disables a button only after React re-renders, and a second event can land first. A ref changes at once.
- **Make forgetting loud.** Leaving out `activity` is now an error, while `activity: []` says "nothing changed" on purpose.

## What testing taught us

- **Slow the network to catch races.** The double-submit tests delay the request in `page.route`, so the second press reliably lands while the first is in flight.
- **Load can look like a bug.** On a loaded laptop (load average 33), the first desktop run failed for timing reasons; a rerun passed. Check what the failure shows before blaming the code.

## Self-check

**Why does editing a role you hold no extra permissions for still need a check?**
The role's members get whatever it says. Without the check, a narrow role manager decides what an Admin can do.

**Why put focus return in `Sheet` instead of each opener?**
Every sheet and side panel has the same gap; one hook fixes the quick-add, event switcher and schedule panels together.

## My notes

<!-- Write your own notes here. -->
