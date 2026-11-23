# 50 — Public page and registration in the web app

Milestone 8, step 8e · Nov 23, 2026

Step 8d built the registration API. This step gives it its screens:

- the public event page at `/e/{slug}`;
- the registrant's view of their invitation link, with Cancel;
- the organizer's switch and link in Settings;
- a Registrations tab under People.

## A server-rendered public page

Every signed-in screen in this app renders in the browser: it needs the user's session, and search engines never see it. The public event page is different. People share it on WhatsApp and it should show a proper title and description in the preview. So `/e/[slug]/page.tsx` is a server component:

- It fetches `GET /v1/public/events/{slug}` on the web server, with `next: { revalidate: 60 }`. Next keeps the answer a minute, matching the API's own `Cache-Control`.
- `generateMetadata` uses the same fetch (wrapped in React's `cache`, so it runs once) for the page title and the Open Graph description.
- A missing or private event calls `notFound()`, a real 404.

Only the form is a client component. When a registration comes back `capacity_full`, the form calls `router.refresh()`, which renders the server part again so the places-left numbers update.

## Turnstile without an account in development

Cloudflare Turnstile has two halves:

- **Widget:** a script on the page produces a token.
- **Server check:** the API asks Cloudflare whether that token is real.

Cloudflare publishes test keys that always pass. The web app uses the test site key unless `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. The API skips the network call entirely when it holds the always-pass test secret, so development and Playwright work offline. In Playwright the widget's script is replaced by a three-line stand-in through `page.route`, which "solves" the check at once.

Tokens are single-use, so after any refused send the form resets the widget for a fresh one.

## One rate limit, many test visitors

Registration allows 5 tries a minute per IP. In Playwright every browser comes from 127.0.0.1, so the third test run in a minute started getting 429. Each visitor's browser context now sends its own `X-Forwarded-For` (`extraHTTPHeaders`), the same trick the API tests use. The API reads the client address from that header because it trusts the proxy in front of it.

## Cancel takes two taps

Cancelling frees the place for someone else, and it can't be undone from the invite page (registering again goes through the event page and its capacity check). So the button asks once more ("Keep it" / "Yes, cancel") instead of using the undo snackbar the signed-in app uses for deletes.
