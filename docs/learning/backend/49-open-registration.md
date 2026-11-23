# 49 — Open registration

Milestone 8, step 8d · Nov 23, 2026

A college fest or a conference doesn't send invitations: it shares one public page and anyone registers. This step builds that backend. There's a public page for each event, a registration endpoint strangers can call, and a way for organizers to add walk-ins at the door.

## A new kind of actor

Every write goes through a core action with an actor. Until now there were three:

| Actor | Who |
| --- | --- |
| `user` | A signed-in member |
| `guest` | Someone holding an invitation link |
| `system` | The worker |

A visitor registering on the public page is none of these. They have no account and no link yet. So there's a fourth, `{ kind: 'visitor', name }`, and the activity log labels it "Anil (registration)". Adding a case to the union made TypeScript point at every place that branched on the actor kind, which is how the runtime's label code got updated.

## The endpoint is a stranger's front door

`POST /v1/public/events/{slug}/registrations` is the only write anyone on the internet can call without a link. Its protections run cheapest first:

1. **Idempotency-Key.** A retry on a flaky phone network gets the stored answer and doesn't register twice. Keys are scoped to the event page, since there's no user or link to scope them by.
2. **Per-IP limit**, 5 a minute. If Redis is down this fails *closed*, as public writes do.
3. **Cloudflare Turnstile.** The form gets a token from Cloudflare's widget, and the API asks Cloudflare's `siteverify` whether a person solved it. Failure is `captcha_failed`. Tests swap in a fake verifier, so they never call Cloudflare.
4. **The core action**, with all the rules.

## Not leaking who is registered

A registration form can leak data in a quiet way. Type someone's email; if the answer says "you're already registered", you've learned they're going. So:

- Someone already invited or registered gets **the same response** as a new registration. The link is emailed again, but only to the email *on file*.
- The contact is matched by email when one is given, else by phone. A phone match never takes a typed email. Otherwise anyone could type a friend's phone number plus their own email and receive the friend's magic link.

## Capacity under a row lock

Two people click Register for the last workshop seat at the same moment. Each transaction counts the places taken, sees one left, and inserts: now the workshop has 51 people for 50 seats. That's the classic "check then act" race.

The fix is `select … for update` on the sub-event rows before counting. The second transaction waits at the lock until the first commits, then counts again and gets `capacity_full`. Locks are always taken in id order. If two registrations for the same two sessions locked them in opposite orders, each would wait for the other forever, a deadlock. The Postgres test starts two registrations for the last place at once and checks exactly one succeeds.

## Registering is the RSVP

A registration makes the same rows an invitation does: a contact, an invitation (delivery `sent_digitally`, since the email *is* the delivery) and attendance rows with status `registered`. Because of that, the confirmation email can carry an ordinary magic link. The registrant opens the same invite page guests use and can cancel there. Cancelling frees the place, and registering again on the event page reopens the same rows if there is still room. Changing the party size isn't allowed on the invite page, because only the event page checks capacity.

## Walk-ins

At the door an organizer can add someone through `POST E/attendance`. If the person (or their household) is already on the list for that scope, their own row is checked in, so an invited guest doesn't become a duplicate. Capacity isn't enforced there: the person at the door decides.
