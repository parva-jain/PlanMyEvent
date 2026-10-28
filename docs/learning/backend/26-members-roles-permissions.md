# 26 — Members, roles and permissions

Milestone 4, step 4a · Oct 28, 2026

## What happened

Events now have teams. Every event gets five standard roles (Owner, Admin, Editor, Helper, Viewer) and its creator as the first member holding Owner. Others join through invite links, by email or shared on WhatsApp. Every request and every write is checked against the caller's **effective permissions**, including roles limited to particular sub-events.

| Layer | New |
| --- | --- |
| contracts | `PermissionSchema`, `STANDARD_ROLES`, `EffectivePermissions` with `can` / `canSomewhere` / `subEventsWith`; team schemas (roles, grants, members, invites); `roles` on My events; the member-invite email job |
| core | `resolvePermissions`, the "nothing beyond your own" checks; actions for roles, members (replace roles, remove, leave, transfer ownership) and invites (create, revoke, accept); `subEventOf` on actions; `createEvent` adds roles and the Owner |
| db | `members`, `roles`, `role_assignments`, `role_assignment_scopes`, `member_invites` (migration 0003, with a backfill for existing events); stores; `teamQueries`; the permission check in the runtime |
| api | `/v1/events/{id}/members`, `/roles`, `/member-invites`, `/me`, `/leave`, `/transfer-ownership`; `/v1/member-invites/{token}` (preview, accept); `/v1/permissions`; the guard with a Redis cache |
| worker | The member-invite email |

Tests: contracts 7, core 39, db 21, API 60, worker 13.

## Key ideas

- **Roles are bundles; assignments are scoped.** A role is a named list of permissions. A member holds roles through assignments. An assignment with no scope rows covers the whole event; each scope row limits it to one sub-event. "Decor team, Mehendi only" is one assignment with one scope row.
- **Effective permissions have two parts:** what you can do everywhere, and what you can do only inside certain sub-events. `can(perms, 'subevents.edit', mehendiId)` is true if either part says so. A row with no sub-event (an event-wide task, say) needs the whole-event part.
- **Lists filter, single rows refuse.** A member scoped to Mehendi who asks for the sub-event list gets only Mehendi. Asking for Haldi directly gets 403.
- **404 or 403 tells you something.** Non-members get 404, so they can't learn an event exists. Members get 403 with the missing permission named, so the UI can say what to ask for.
- **Nobody grants beyond their own.** Creating a role, assigning one, or offering one in an invite checks every permission against the actor's own, scope by scope. Changing or removing someone also needs at least their permissions, so a small "People" role holding `members.manage` can't demote an Admin.
- **The cache key carries a version.** The guard caches permissions at `perm:{event}:{user}:{roles_version}`. Every role or assignment change bumps `events.roles_version` in the same transaction, so old keys are simply never read again. There's nothing to delete and no stale window. If Redis fails, the guard reads Postgres.
- **Writes don't trust the cache.** Core's permission check runs inside the action's transaction against the tables, so a role removed a millisecond ago already counts.
- **Invite tokens are shown once.** The link carries 32 random bytes; the table keeps only their SHA-256. Accepting locks the invite row (`select … for update`), so two people racing a single-use link can't both get in.

## What testing taught us

- **Drizzle leaves single-table column names unqualified.** Inside a hand-written subquery (`… where ra.role_id = ${roles.id}`) that became a bare `"id"`, which Postgres called ambiguous. The fix was to qualify it by hand. Every db test failed until then, which made it easy to find.
- **A deleted sub-event could quietly widen a grant.** "No scope rows" means "whole event", so removing the last scope row would turn "Mehendi only" into "everything". Deleting a sub-event now removes assignments left with no scope, and a test proves the member ends up with nothing.
- **A real race, tested for real.** Two accepts of a single-use link run at once against Postgres. Exactly one joins; the other gets `link_expired`.
- **Existing data needs a migration too.** Events created before this step had no roles or members, so their owners would have been locked out. Migration 0003 backfills them, with UUIDv7 ids generated in SQL.

## Self-check

**A Helper is scoped to Haldi. Can they open the event? See Mehendi? Edit Haldi's time?**
They can open the event, because any `event.view` grant opens it. Mehendi doesn't appear in their list. Editing Haldi's time gets 403: Helper has no `subevents.edit`.

**Why bump `roles_version` instead of deleting cache keys?**
Deleting means finding every member's key, and a request in flight could write an old value back afterwards. A new version makes every old key unreachable in one cheap update, inside the same transaction as the change.

**Why does accept re-check the invite's roles?**
Things change in seven days: a role may have been deleted or narrowed, a sub-event removed, or the inviter removed. The invite grants what is valid now, never more than the inviter could grant today.

**Why can't anyone assign the Owner role?**
Owner is the one role with `event.delete` and the right to transfer. It moves only through a transfer, which the Owner alone can do, so there is always exactly one.

## My notes

<!-- Write your own notes here. -->
