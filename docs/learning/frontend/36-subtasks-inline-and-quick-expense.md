# 36. Subtasks in the list and adding expenses quickly

Two changes after using the Tasks and Budget screens.

## Subtasks under their task

Subtasks used to show only in the side panel, so the list showed "1/3" without saying what the three were. Now each task row lists its subtasks underneath:

- They are smaller (a 16 px box and small text) and indented behind a thin line, so they read as part of the task above.
- Ticking one saves at once and it stays where it is. Only top-level tasks slide into Done.
- Tapping a subtask opens its parent, where the checklist can be edited.

The list already loads every task, subtasks included, in one array. Each row picks out its own subtasks with `subtasksOf(allTasks, task.id)`, so this costs no extra request.

The tap target stays 44 px even though the box is smaller. Only the visible box shrinks; the button around it is the same size and uses a slightly bigger negative margin.

## Adding an expense

The only ways in were the header button and a button hidden inside each expanded category, and both were easy to miss. Now the Budget page has:

- **An "Add an expense" bar** above the tabs, with what it's for, the amount, the category and "Already paid". Add saves it as planned (or paid, with today's date), clears the bar and says "Mehendi cones added to Decor". Vendor, advances, due dates and references are still in the full form.
- **A + on every category**, which opens the full form with that category chosen.
- **An All expenses tab:** every expense, newest first, with its category.

The bar keeps its own Idempotency-Key and makes a new one after each save. A retry of the same save reuses the key, so it can't record the expense twice; the next expense gets a fresh one.

The bar shows only to people who can add whole-event expenses. Someone limited to some sub-events uses the full form, which already chooses one of their sub-events.
