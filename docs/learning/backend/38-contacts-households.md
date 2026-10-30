# 38 — Contacts and households on the server

Milestone 7, step 7a · Oct 30, 2026

Milestone 7 starts with the guest list: the people an event knows about, optionally grouped into households ("Sharma family, 4").

## What was built

- **Two tables (migration 0007).** `households` has a name, an expected count (1–50) and a primary contact, whose phone gets the invitation. `contacts` has a name, phone, email, tags and notes, and optionally a household.
- **Actions** to create, edit, delete and restore both, each in one transaction with an activity entry, a live signal and undo.
- **Routes:** `E/households` and `E/contacts`. Search looks in the name, email and phone (`?q=shar`, `?q=43210`); `?tag=VIP` and `?householdId=…` filter.

## Key ideas

- **Normalize on write.** People type "098765 43210", "+91 98765-43210" or "919876543210". All three are stored as `+919876543210` (E.164), so duplicates can be found later and links like `wa.me` work. A bare 10-digit number is assumed Indian; guests abroad keep their `+` prefix. The schema only checks that a number *can* be normalized; core stores the normalized form.
- **Two tables that point at each other.** A contact belongs to a household, and a household names one of its contacts as primary. Postgres handles this by creating both tables first and adding the foreign keys afterwards; drizzle-kit does that on its own. TypeScript needed help: one table's config callback gets an explicit return type, so the two types don't depend on each other in a loop.
- **Deleting a group keeps the people.** Deleting a household doesn't touch its contacts. They read as "not in a household" because the read joins only live households. Undo restores the household, and since nobody's `household_id` changed, everyone is back in it.
- **Keep an invariant where it can break.** The primary contact must be one of the household's own. That can stop being true when the household changes, but also when the contact moves out or is deleted, so those actions clear it too and log it as a household update.
- **Search without a footgun.** `?q=%` would match everything in a `LIKE` pattern, so the user's `%`, `_` and `\` are escaped. The trigram index (`gin_trgm_ops`) speeds up `ILIKE '%…%'`, not just similarity matching.
- **Personal data in the activity log.** Contact entries carry phones and emails. The feed leaves out household and contact entries for anyone without whole-event `guests.view`, so the log doesn't leak what the guest list hides.
