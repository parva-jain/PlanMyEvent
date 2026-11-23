# 53 — Reviewing milestone 8

Milestone 8, step 8h · Nov 23, 2026

Milestone 8 added the most public surface so far: a registration form anyone can submit, a page anyone can read, and files anyone can open by URL. The review went through who can reach what. It found two problems, both now fixed with tests.

## Receipts are the budget's, all the way down

The receipt *file* was protected from the start: it sits in the private bucket, and `GET E/media/{id}/url` checks `budget.view` in the receipt's sub-event before signing a link. But two neighbouring routes were looser:

- `GET E/media/{id}` returned any media row to any member, receipts included. That leaks the amount of detail a receipt row has: who uploaded it and when, the file size and type.
- `GET E/media?kind=receipt` let someone with `budget.view` on one sub-event list every receipt in the event.

Now a receipt answers 404 to anyone without `budget.view` where it belongs. That's the same "doesn't exist for you" rule as other event data. Listing receipts needs `budget.view` for the whole event; a scoped budget viewer reaches each receipt through its expense.

**Lesson:** check the permission on every route that touches a resource, not only the one that hands out the file.

## Deleted should mean gone

DatabaseDesign said deleted files are removed from storage "30 days later", which is how soft-deleted rows work everywhere else. For a public photo that's wrong. The thumbnail URL is on the CDN, so someone who deleted an embarrassing photo would find it still loading for a month.

Deleting a photo now writes a `media.purge` outbox row, and the worker deletes the files at once. The row stays soft-deleted for the activity log and is cleaned up after 30 days as before. The gallery Playwright test takes the thumbnail's URL, deletes the photo and waits for that URL to answer 404.

**Lesson:** "soft delete" is about rows. For anything public, ask what a person who deletes it expects.

## Things that turned out fine

- **Registration privacy.** Someone already on the list gets the same response as a new registrant, and the link only ever goes to the email on file. A phone match never takes a typed email.
- **Capacity.** Two registrations for the last place: the Postgres test confirms exactly one succeeds, thanks to the `for update` lock taken in id order.
- **Dashboard cache.** Every member gets their own filtered view of one cached aggregate. Nobody's view is cached, so a scope change can't serve stale permissions.
- **Uploads.** The API never sees the bytes, checks the object arrived before confirming, and the worker trusts only the file's real type.

## Left for later

- A per-invitation cooldown on resending the registration link. Today Turnstile and the per-IP limit are what stop someone flooding a known address.
- The Next.js security advisory: upgrade before deploying.
- CORS rules on the R2 buckets, and real Turnstile keys, when production is set up.
