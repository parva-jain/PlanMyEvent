# 51 — Media uploads

Milestone 8, step 8f · Nov 23, 2026

Photos and receipts arrive. The design goal is that the API never touches the file bytes: a 12 MB phone photo goes from the browser straight to storage (Cloudflare R2, or SeaweedFS locally), and a worker turns it into small, safe versions.

## Three requests and a job

1. `POST E/uploads { kind, mime, bytes }`: the API checks permission and size, makes a `media` row with status `pending`, and returns a **presigned PUT URL**. That's a storage URL with a signature in its query string, valid 10 minutes, that lets exactly one PUT of that key with that `Content-Type`.
2. The browser PUTs the file to that URL. The API isn't involved.
3. `POST E/media/{id}/complete`: the API asks storage whether the object is really there (`HEAD`, which also gives its size), then the core action records the upload and writes an outbox row. The relay turns that row into a `media` queue job.
4. The worker processes it and reports back through a core action, which sends `entity.changed` so the gallery updates live.

Why not create the row at step 3 instead? Because the storage key contains the media id (`events/<eventId>/gallery/<id>.jpg`). Making the row first gives the browser one id to use from start to finish. Rows whose upload is never confirmed are cleaned up after a day.

## Never trust the declared type

The browser says `image/jpeg`, but that's just a label. The worker reads the bytes:

- `%PDF-` at the start: a PDF, allowed only for receipts.
- Otherwise sharp's `metadata()` names the real format: jpeg, png, webp or heif are photos.
- Anything else, including a script renamed to `.jpg`, is marked `failed` and deleted.

## Location data

Phone photos carry EXIF metadata, often with the GPS position where they were taken. A wedding gallery is public, so that would publish where the family lives. sharp drops all metadata when it re-encodes unless you ask it to keep it. The worker makes two WebP versions, 320 px for the grid and 1600 px for the viewer, and then **deletes the original**. `.rotate()` with no argument turns the image upright from the EXIF orientation first, so dropping the metadata doesn't leave photos sideways. A test builds a JPEG with a GPS tag and checks the outputs have no EXIF.

## A bug from a well-meaning default

The first presigned PUT failed with `BadDigest: The Content-Md5 you specified did not match`. Recent AWS SDK versions add a checksum to every request by default, and for a presigned URL that means a checksum of the *empty* body, signed into the URL. The real file then never matches. R2 has the same problem. The fix is one client option, `requestChecksumCalculation: 'WHEN_REQUIRED'`, in both the API and the worker.

## Deleting later

Deleting a photo soft-deletes the row, so the activity log and other people's screens behave like everything else. The files are a different matter: a public URL keeps working until the file is gone. So deleting also queues a `media.purge` job that removes the files at once (found in the 8h review). A daily job removes the rows of photos deleted over 30 days ago, and the files of uploads that were never confirmed. For the cleanup the order matters: files first, rows second. If the job crashes in between, the rows are still there and the next run tries again. The other order could leave files that nothing points to.
