# 33 — Budget on the server

Milestone 6, step 6b · Oct 30, 2026

## What happened

Events now have a budget:

- **Two tables** (migration 0006): `budget_categories` and `expenses`. An expense belongs to a category, can belong to a sub-event and can name the member who paid. Composite foreign keys keep all of these inside the event.
- **Eight actions** in `packages/core/src/budget/`: create, update, delete and restore, for both categories and expenses. Undo works for all of them.
- **Starter categories.** A wedding starts with 12 (Venue, Catering, Decor…), a conference with 8.
- **Routes:**
  - `GET/POST E/budget-categories` (the list comes with planned, committed and paid totals) and `PATCH/DELETE E/budget-categories/{id}`;
  - `GET/POST E/expenses` and `GET/PATCH/DELETE E/expenses/{id}`.
  - `POST E/expenses` must carry an Idempotency-Key.

Tests: 8 in core, 2 for the payment rule in contracts, 4 in db, 3 API flows.

## Key ideas

- **One rule, three layers.** "Planned means nothing paid, paid means all of it, advance or partly paid means something in between" is enforced in three places:
  - `settlePayment` in contracts, which the web form can use too;
  - the core action, which turns a broken rule into a clear 422;
  - a database check constraint, which catches anything that slips past.
- **Fill in what the person didn't say.** Someone can tick "Paid" without typing the amount, or type ₹20,000 paid without picking a status, and the server works out the other. On an edit, a paid line whose amount goes up stays paid, and the new amount counts as paid too.
- **A required Idempotency-Key for money.** A double-tapped "Save" or a retry on a flaky connection must not record a payment twice. The key makes the retry return the first response instead. A transaction reference already in the event is also refused (409 `duplicate_transaction_ref`), so the same UPI screenshot can't be entered twice either.
- **Savepoints turn constraint errors into answers.** In Postgres, a unique violation aborts the whole transaction. Running that one insert inside a nested transaction (a savepoint) lets the store return "duplicate" while the action's transaction stays usable.
- **Totals respect scope.** A Mehendi-only editor's category totals add up Mehendi expenses only, so the numbers don't leak what the rest of the wedding costs.
- **`sum(bigint)` comes back as a string.** In Postgres, summing `bigint` gives `numeric`, which the driver returns as text to avoid losing precision. Paise totals fit safely in a JS number, so the query converts them.
