# 40 — Invitations, magic links and attendance

Milestone 7, step 7c · Oct 31, 2026

An invitation goes to a household ("Sharma family, 4") or one contact, for the whole event or, when guests are per sub-event, for chosen sub-events. Each one has a magic link the guest opens without an account. Every headcount comes from attendance rows.

## What was built

- **Three tables (migration 0008).**
  - `invitations`: delivery status, distributor and link hash.
  - `invitation_sub_events`: which sub-events an invitation covers.
  - `attendance`: one row per guest per scope.
- **Actions:**
  - Invite one guest, or up to 200 at once.
  - Update the delivery status, the distributor and the sub-events.
  - Withdraw, restore (undo), regenerate the link.
  - Correct an attendance row.
- **Routes** under `E/invitations` and `E/attendance`, including a share endpoint that builds a WhatsApp message.

## Key ideas

- **Derived links, not stored ones.** The token is `base64url(HMAC-SHA256(key, "id:tokenVersion"))`, and the database keeps only its SHA-256. Because the server can derive the token again, an organizer can re-share a link at any time. Because only the hash is stored, a leaked database can't open anyone's invitation. "Regenerate" bumps the token version, so the old link stops matching. The key lives only in the API's env, and the db store uses it to compute the hash, so core never handles a secret.
- **One row per guest per scope.** Attendance is unique on (event, sub-event, household, contact) with `NULLS NOT DISTINCT`: a null sub-event (the whole event) counts as one value, not "unknown". That turns inviting a guest into an upsert, so an invitation withdrawn and sent again reopens the guest's old row instead of adding a second one.
- **No soft delete for attendance.** Withdrawing an invitation marks its rows `cancelled`. The activity entry keeps the statuses they had, so undo can put back "confirmed, 5 coming" instead of starting the guest over.
- **No double counting.** If the Sharma family is invited, Asha Sharma can't also be invited on her own, and the other way round. In bulk, such guests are reported as skipped with a reason instead of failing the whole batch.
- **A narrow permission for distributors.** Uncle Ramesh hands out cards. He can list the invitations assigned to him and mark them delivered, but he can't see the guest list or change anything else. Like `tasks.update_own`, the check depends on the row (is he its distributor?) and on the fields being changed, so it happens inside the action.
- **Who sees what.** Whole-event `guests.view` sees every invitation. Someone scoped to the Mehendi sees the invitations and attendance for the Mehendi. Guests, through their link, will see only their own invitation (7d).
