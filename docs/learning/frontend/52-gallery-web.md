# 52 — Gallery and receipts in the web app

Milestone 8, step 8g · Nov 23, 2026

The last empty section of the event is filled: a gallery of photos from the event, by album, and receipts attached to expenses.

## Upload progress needs XMLHttpRequest

The upload is a `PUT` of the file to the presigned URL from step 8f, straight to storage. `fetch` can't report upload progress yet, so `lib/media.ts` uses `XMLHttpRequest`, whose `upload.onprogress` fires as bytes leave. The headers from the upload ticket (`Content-Type`) must be sent exactly as given, because they're part of the signature.

The browser talking to storage directly is cross-origin, so storage must allow it (CORS). SeaweedFS does by default. In production the R2 buckets need a CORS rule for the web origin, or every upload fails with an opaque network error.

## Three at a time

After an event someone picks 60 photos on their phone. Starting 60 uploads at once on mobile data makes them all slow and some time out. The gallery runs a small queue with three workers pulling from one list. Each file shows its own progress bar, and a failed file stays in the list with its reason until dismissed.

## Processing, then live

A confirmed upload is `pending` until the worker has made its WebP versions. The API lists my own pending uploads as well as everyone's ready ones, so the uploader sees a "Processing…" tile at once. Two things move it on:

- The worker's `entity.changed` for `media`, which the live hook maps to the media queries.
- A 5-second poll, only while some tile is still processing, in case the socket is down.

Everyone else's gallery gets the photo through the same `entity.changed`.

## Receipts are links that expire

Receipts sit in the private bucket. "View" asks the API for a link valid five minutes, then opens it. Browsers block a `window.open` that happens after an `await`, because it's no longer directly caused by the click. So the tab is opened first, empty and synchronously, and its location is set once the link arrives.

## Deleting a whole route

The Gallery page was the last user of the `[section]` placeholder route. It and its `SectionPlaceholder` component are gone; unknown sections are a plain 404. Next kept generated types for the deleted route in `.next/dev/types`, which broke `tsc` until that folder was cleared. That's a stale cache, not a code problem.
