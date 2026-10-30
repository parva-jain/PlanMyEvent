# 35 — Budget in the web app

Milestone 6, step 6d · Oct 30, 2026

## What happened

The Budget section (`/events/{id}/budget`) shows where the money goes:

- **Totals:** overall budget, committed, paid and still to pay, counting up as they change. Owners can set or change the overall budget right there.
- **Due soon:** unpaid expenses due in the next two weeks, or already late.
- **By category:** each category has a bar with the paid part, then the committed part. Spending past the plan turns red, with an "Over by ₹40,000" chip. Expanding a category lists its expenses.
- **By sub-event:** the same expenses grouped by sub-event, with their totals.
- **Expense panel.** Picking "Advance paid" or "Partly paid" reveals paid so far, paid on, paid by and the UPI reference; "Paid" hides the next due date. A reference already recorded shakes the field and says so.
- **Category panel:** name and planned amount. Deleting one that still has expenses says to move them first.
- **Undo** after deleting an expense or a category, and one confetti burst when the last payment is settled.

Tests: `budget.spec.ts` covers setting the budget, an expense with an advance, the totals, the duplicate reference, the over-plan chip, and delete with undo.

## Key ideas

- **The server adds up; the client displays.** Category totals come from the API, which counts only the expenses you may see. After any change the client re-fetches them instead of doing its own maths.
- **One Idempotency-Key per form.** The key is made when the "New expense" form opens. If the network drops and the save is retried, the server returns the first result instead of recording the payment twice.
- **Money is typed as rupees, stored as paise.** The input shows Indian grouping (25,00,000) as you type and hands the form a whole number of paise.
- **Fields that a status hides are cleared on save.** A paid expense has no next due date, and a planned one has no payment details, so stale values can't linger.
- **Celebrate changes, not states.** "Every payment is settled" fires when outstanding goes from above zero to zero, not every time you open a settled budget, and only once per event.
