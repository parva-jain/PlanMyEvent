# 43 — The guest's invitation page

Milestone 7, step 7f · Oct 31, 2026

A guest taps the link in WhatsApp and lands on `/i/{token}`. They have no account and nothing to sign in to: the token in the URL is the only credential. This page is what they see.

## What it shows

Everything comes from one call, `GET /v1/public/invites/{token}`, and the page shows only what that call returns:

- a cover in the event's accent colour, with the event name in the display font (Fraunces) and the dates;
- "Dear Gupta family," and the event's description;
- "What's on": the guest's own sub-events when guests are per sub-event, otherwise the event's schedule. Times are shown in the **event's** time zone, so a guest in Dubai still sees 11:00 am for an 11:00 am ceremony in Indore;
- the reply form, or a confirmation once they've answered;
- Add to calendar and Directions.

Other guests, headcounts and organizers never appear, because the API never sends them (step 7d). The e2e test checks the page text for another guest's name and both guests' phone numbers.

## Keeping the token private

The token works like a password, so it shouldn't leak out of the page:

- `referrer: 'no-referrer'` on the layout: tapping Map or Directions doesn't send `/i/<token>` to Google in the Referer header;
- `robots: noindex`, so search engines don't index the page;
- the calendar file is built in the browser, not by a "add to Google Calendar" URL that would put details in someone else's logs;
- the confetti "once per invitation" key uses the event and guest name, not the token, so the token isn't written to local storage.

## The reply

The answer form holds one answer per scope that takes replies (the whole event, or each sub-event set to invite + RSVP). Each answer is a yes/no choice, plus how many when it's yes. Invite-only sub-events are listed as "No reply needed for Haldi."

- **Send** stays disabled until every scope has a yes or no.
- **Idempotency:** each send makes a new `Idempotency-Key`. React Query's retries of that one send reuse it, so a dropped connection can't record the answer twice, while changing your mind later is a new request.
- **The response is the page:** the POST returns the updated invitation, which goes straight into the query cache. There's no second fetch.

## Motion (MOTION.md 6.8)

| Moment | How |
| --- | --- |
| Open | The cover unfolds from the top (`scaleY` 0.96 → 1, `gentle` spring), the name rises, and the cards stagger in with `RevealGroup` |
| Yes / no | The chosen button fills with tint and border (`fast` CSS transition) |
| Stepper | Appears with a height animation; the number rolls: up from below when it grows, down when it shrinks (`RollingNumber`, now shared with the guest panel) |
| Send | Spinner, then the form crossfades into the confirmation |
| Confirmed | The tick draws over 400 ms, "See you there!" rises, confetti in the event's colour |

The celebration fires only when a reply was sent on this visit (`justSent`). Opening an already-answered link shows the confirmation without confetti. Reduced motion turns the movement into fades, and confetti doesn't fire.

## A bug found on the way

`Button` with `asChild` (a button-styled link) silently dropped its `icon` prop, so ten links across the app had no icon. The fix uses Radix's `Slot.Slottable`: the icon goes inside the child link, before its own text:

```tsx
<Slot.Root className={classes} {...props}>
  {icon}
  <Slot.Slottable>{children}</Slot.Slottable>
</Slot.Root>
```

## Testing a page the API can't be set up for yet

A test can't yet switch an event to "invite + RSVP"; that comes with Settings in step 7c.1. So the e2e test does two things:

- with the real API: an invite-only invitation (and that no other guest shows), a withdrawn link, and an unknown link;
- with `page.route` stubbing the two public endpoints: the reply flow, both for the whole event and per sub-event. The stub records each POST, so the test checks the exact body and that a changed answer gets a new key. It also has to answer the browser's CORS preflight, because the POST carries custom headers.

The API's own tests (step 7d) already cover the real RSVP endpoint, so the stubbed web test and the API tests between them cover the whole flow.
