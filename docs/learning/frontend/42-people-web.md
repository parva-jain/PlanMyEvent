# 42 — People in the web app

Milestone 7, step 7e · Oct 31, 2026

The People section lets organizers manage guests, invitations and replies. It also gives the people who hand out invitation cards a short list of just their own cards.

## Who sees what

Guest permissions come at three levels, and the screen follows the API's rules:

| Member | Lands on |
| --- | --- |
| `guests.view` for the whole event | Guests, Invitations and Responses tabs |
| `guests.view` for some sub-events | Invitations and Responses, for those sub-events only (the API filters them) |
| Neither, but hands out cards | "Cards to deliver": their own cards only |

Card distributors can't see the guest list, so People isn't in their nav. Instead, their event home shows a "Cards to deliver" card that links to their list. The API's `GET E/invitations` already returns only a distributor's own cards, so this screen needs no extra filtering for safety. It filters to "mine" only for the count shown.

## One list, joined in the browser

The API returns households, contacts and invitations as separate lists. The screen loads each list in full, in pages of 500 like expenses, and `guestRows()` joins them:

- a household row gets its members (contacts with that `householdId`), the tags from all its members, a phone (the primary contact's, otherwise the first member's), and its invitation;
- people who aren't in a household get rows of their own;
- the Everyone view lists every person, and someone in an invited household shows the household's invitation.

At this size (up to 5,000 guests per event), one join in memory is quicker than a server query for every combination of filters. Search, tag, invitation and distributor filters all run on the joined rows. The list draws 100 rows at a time ("Show more"), so animating rows into place stays smooth.

## Live and in step

One guest write can change all four lists: renaming a contact changes a household's member line, and every invitation includes its attendance rows. So every guest mutation, and every `entity.changed` signal for `household`, `contact`, `invitation` or `attendance`, refreshes all four lists. React Query refetches only the lists that are on screen.

## Mark delivered, then move

MOTION.md asks for the button to turn into a green "Delivered" with a check, and the row to move to the delivered group 600 ms later. Updating the cache straight away would move the row before the check is seen, so `useSettling()` keeps a set of ids that were just delivered:

```ts
const left = cards.filter((c) => !delivered(c) || settling.has(c.id));
```

After 600 ms an id leaves the set and `ListPresence` slides the row across. The undo bar puts the old delivery status back. This is a normal PATCH, which distributors are allowed to make.

## Sharing without loading every link

Each invitation's link comes from `GET …/share`. Fetching it for every row would mean hundreds of requests. `ShareButtons` fetches it on the first tap and keeps it until the link is regenerated. WhatsApp opens in a tab that is created *before* the request is awaited; phones block a `window.open` that runs after an await, because they treat it as a pop-up.

"Send on WhatsApp" works through the unsent invitations one at a time. It opens the chat, and when the tab becomes visible again (`visibilitychange`), it marks that invitation sent and slides in the next guest.

## CSV import in four steps

1. **Upload**: the file is read in the browser with the same `parseCsv` the worker uses, so the counts match what the worker will import. Files over 900 KB or 5,000 rows are refused before anything is sent.
2. **Match columns**: each column header gets a guessed field ("Mobile" becomes phone, "Family" becomes household). The name may come from up to three columns ("First name" + "Last name"); every other field takes one column.
3. **Review**: `importRows` reads each row through the mapping. The screen counts rows without a name and phones it can't read, and previews the first five rows.
4. **Import**: the request returns 202 with a job id. The worker's `job.progress` signal only invalidates the job's query, and the screen then re-reads `GET /v1/jobs/{id}`; the signal itself carries no data. A five-second poll covers a dropped socket.

The worker writes as the member who started the import, so its live signals carry that member's request id and the tab ignores them as its own. The import screen therefore refreshes the guest lists itself when the job finishes.

## Try it

- Add a household, add a member with a phone, and see them become the primary contact.
- Invite the household, open the Invitations tab, and mark the card delivered.
- Import a CSV with a "Family" column and check that the rows group into households.
