# 41 — The guest's side: public invite and RSVP

Milestone 7, step 7d · Oct 31, 2026

Guests have no accounts. They open the magic link from WhatsApp or email, see their invitation, and reply. Two public endpoints make that work:

- `GET /v1/public/invites/{token}`: the invitation.
- `POST /v1/public/invites/{token}/rsvp`: the reply.

## What a guest sees, and doesn't

The page has the event, the guest's own name ("Sharma family"), what they're invited to with times and venues, and their own answers. It never has other guests, headcounts, phone numbers, organizers or tasks, even when another family is invited to the same sub-event. Every query behind the page starts from the one invitation the link names, so no query in it can reach another guest. The tests check the whole response for other guests' names and phones.

## Key ideas

- **The link is the credential.** The API hashes the token and looks it up. An unknown token is 404. A withdrawn invitation is 410 `link_revoked`, so the page can say "this invitation was withdrawn" instead of "not found". A regenerated link's old token simply matches nothing.
- **The guest is an actor too.** Answers go through a core action like any other write, with actor `guest` and channel `public_link`. The activity log shows "Sharma family (link)", and the organizers' screens update live through the usual `entity.changed`.
- **Last answer wins.** An RSVP updates the guest's attendance row for that scope; there's no version check, because a guest changing their mind should simply win. Party size isn't checked against the household's expected count: organizers see the difference instead.
- **Only what can be answered.** Invite-only parts show on the page but can't be answered. A sub-event that isn't on the invitation can't be answered either.
- **Idempotency without a user.** Retrying an RSVP with the same Idempotency-Key returns the first answer. Members' keys are scoped to their user id; a guest's are scoped to a hash of their link.
- **Rate limits that fail the right way.** Page views are limited per IP and per link, and RSVPs per link. If Redis is down, views still work (failing open) but RSVPs are refused (failing closed), so nobody can flood the database while limits can't be counted.
- **A write on a read.** Opening the link notes `last_opened_at`, at most once an hour and without bumping the version, so an organizer's edit never conflicts with a guest just looking.
