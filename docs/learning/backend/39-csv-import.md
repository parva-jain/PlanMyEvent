# 39 — CSV import as a background job

Milestone 7, step 7b · Oct 31, 2026

Organizers keep guest lists in spreadsheets, so the app can import them as CSV. A wedding list can run to thousands of rows, too many to import inside one request, so the import runs as a background job.

## How it flows

1. **The browser** reads the file to show its headers, and the organizer says which column is the name, phone, family and so on (the mapping).
2. **`POST E/contacts/import`** checks the file and the mapping straight away: a missing column, an empty file or more than 5,000 rows comes back as 422 naming the problem. A file that passes becomes an outbox row, written in the same transaction as the permission check. The response is `202 Accepted` with a job id.
3. **The outbox relay** turns that row into a BullMQ job on the `imports` queue.
4. **The worker** imports 500 rows per transaction, each time through core's `importContacts`, as the member who started the import. After each chunk it saves the progress and sends `job.progress` to that member's sockets.
5. **The browser** follows the progress live, or asks `GET /v1/jobs/{id}` if the socket is down.

## Key ideas

- **Fail early, before queueing.** Anything that can be checked from the request alone is checked in the request. A job that fails five seconds later is a worse experience than a 422.
- **Chunks of 500.** One transaction per chunk keeps locks short and lets other events' jobs take turns. A crash loses at most the chunk in progress, and a retry resumes after the last finished one.
- **Merge, don't duplicate.** A row matches a guest already in the event by phone (normalized to E.164) or email (ignoring case). A match only fills fields the guest doesn't have yet and adds new tags; it never overwrites what someone typed. Importing a corrected file twice is safe.
- **Fix what you can, report the rest.** A row with a bad phone number is still imported, without the phone, and the job notes "line 14: phone isn't a number we recognise". Only rows with no name are skipped. The first 100 problems are kept with their line numbers.
- **Households from a column.** Rows with the same family name join one household, found by name (ignoring case) or created. A new household's expected count is the file's count column, or else how many rows name it in the whole file, not just one chunk.
- **Permissions are checked per chunk.** The worker acts as the member who started the import. If they lose `guests.edit` halfway through, the next chunk is refused and the job ends as failed, keeping what it already saved.
- **Where progress lives.** Job status sits in Redis for a day, and only the member who started the job can read it. It's progress information only: if Redis loses it, the contacts and the activity entries are still in Postgres.
- **Personal data in transit.** The CSV holds phones and emails, so its outbox row is marked sensitive. The relay deletes the row as soon as the job is queued, and BullMQ removes the job when it finishes.
- **One CSV parser for both sides.** `parseCsv` in `@pme/contracts` handles quoted commas, newlines inside quotes, a UTF-8 BOM, and Excel's semicolon or tab separators. The web's mapping preview and the worker read the file the same way.
