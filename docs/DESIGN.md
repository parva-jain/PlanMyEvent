# Plan My Event — Design System

A shared event-planning app for teams: weddings, conferences, college fests, fairs and celebrations. The interface is calm, warm and simple enough for a first-time organizer; celebration shows up in small accent moments, never as clutter. Every screen works equally well on phone and desktop.

## Brand

- Product name: Plan My Event
- Logo: indigo rounded-square calendar tile with a marigold tick that breaks out of the top-right corner and ends at a small marigold four-point sparkle. Use the supplied logo image; never redraw or recolor it.
- Headline tagline: "Your whole event team, on the same page."
- Brand line: "One plan for everyone behind your event."

## Color

### Core

| Token | Hex | Use |
| --- | --- | --- |
| primary | #4338CA | Primary buttons, links, active nav, focus |
| primary-hover | #3730A3 | Hover and pressed |
| primary-tint | #EEF2FF | Selected rows, active chips, info backgrounds |
| accent (marigold) | #F5A524 | Progress fills, milestone highlights, logo; never for text or body backgrounds |
| accent-tint | #FFF7E6 | Celebration banners, "next up" highlight |
| accent-text | #B4710C | Text on accent-tint |

### Neutrals (warm)

| Token | Hex | Use |
| --- | --- | --- |
| background | #FAF8F5 | App and page background |
| surface | #FFFFFF | Cards, sheets, tables |
| surface-muted | #F3EFE9 | Input fills, table headers, hover |
| border | #ECE7E0 | Card and divider lines |
| border-strong | #D6CEC3 | Input borders |
| text | #1F1B16 | Primary text |
| text-secondary | #6B635A | Supporting text |
| text-muted | #8E857A | Placeholders, captions |

### Status

| Status | Solid | Tint | Text on tint |
| --- | --- | --- | --- |
| success (done, paid) | #16A34A | #DCFCE7 | #166534 |
| warning (pending, due soon) | #D97706 | #FEF3C7 | #92400E |
| danger (overdue, delete) | #DC2626 | #FEE2E2 | #991B1B |
| info | #4338CA | #EEF2FF | #3730A3 |

### Event accents

Each event has one accent set by its type. Used only in the event header strip, cover, event cards, calendar dots and guest-facing pages. Never on buttons.

| Event type | Accent | Tint |
| --- | --- | --- |
| Wedding | #E11D74 | #FCE7F3 |
| Conference | #2563EB | #DBEAFE |
| College fest | #7C3AED | #EDE9FE |
| Fair / exhibition | #0D9488 | #CCFBF1 |
| Celebration | #EA580C | #FFEDD5 |

### Dark mode

| Token | Hex |
| --- | --- |
| background | #1F1B16 |
| surface | #2A2520 |
| surface-muted | #332D27 |
| border | #3A342D |
| text | #F5F1EA |
| text-secondary | #B8AFA4 |
| primary (buttons) | #6366F1 |
| primary (links, text) | #A5B4FC |
| accent | #F5A524 |

## Typography

- UI font: Plus Jakarta Sans. Display font (event names on invitations and public pages only): Fraunces.
- Numbers use tabular figures in tables, budgets and counters.
- Money in Indian format with the rupee sign: ₹1,50,000. Dates like "Sat, 12 Dec". Times like "6:30 PM".

| Style | Size / line height | Weight |
| --- | --- | --- |
| Display | 40 / 48 (phone 32 / 40) | 700 |
| H1 | 30 / 38 (phone 26 / 34) | 700 |
| H2 | 22 / 30 | 700 |
| H3 | 18 / 26 | 600 |
| Body large | 17 / 26 | 400 |
| Body | 15 / 24 | 400 |
| Label | 14 / 20 | 600 |
| Small | 13 / 20 | 500 |
| Caption | 12 / 16 | 500 |

Sentence case everywhere. Plain, friendly words: "Who's coming", "Card delivered", "Add task".

## Space, shape, depth

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64. Page padding 16 on phone, 32 on desktop.
- Radius: chips and avatars fully round; buttons and inputs 12; cards 16; bottom sheets 24 on top corners; dialogs 20.
- Card: white, 1px border #ECE7E0, shadow 0 1px 2px rgba(31,27,22,0.05).
- Raised (sheets, popovers, dragged cards): shadow 0 12px 32px rgba(31,27,22,0.12).
- No gradients except the event cover image area.
- Icons: Lucide, 1.75px stroke, rounded; 20px in UI, 24px in nav.
- Illustrations: simple flat line drawings with indigo and marigold, only in empty states and onboarding.

## Layout

| | Phone (<640) | Tablet (640–1024) | Desktop (>1024) |
| --- | --- | --- | --- |
| Navigation | Bottom bar: Home, Tasks, People, Budget, More | Icon rail | Left sidebar 248px with event switcher |
| Quick add | Floating + button, bottom right | Floating + button | + button in top bar |
| Quick edit | Bottom sheet | Side panel | Side panel 420px next to the list |
| Lists | Cards | Cards or compact table | Tables with sort, filters, bulk select |
| Content width | Full | Full | Max 1200px |

Tap targets at least 48px. Primary action reachable by thumb on phone.

## Components

- **Buttons:** primary (indigo fill, white text), secondary (white, border), ghost (text only), destructive (red). Heights 48 phone, 40 desktop. Loading state shows a small spinner in place of the icon.
- **Inputs:** 48px, surface-muted fill, border-strong on focus to primary with a 3px primary-tint ring. Label above, helper text below. Special inputs: phone with +91 prefix, amount with ₹ prefix, date, time, search.
- **Chips:** status chips (tint background, darker text, small dot), filter chips (outlined, primary-tint when on), tag chips.
- **Avatars:** initials on tinted circles; avatar stacks show up to 3 then "+5".
- **Cards:** event card (cover strip in event accent, name, dates, countdown, progress), stat card (label, big number, small trend or sublabel), task row (checkbox, title, due date, assignee avatars, sub-event chip), expense row (title, vendor, amount, paid-of-total bar, status chip), household row (name, count, delivery status, response).
- **Progress:** thin bars and rings in marigold on a neutral track; green when complete.
- **Feedback:** snackbar at bottom with Undo; inline banner for "Priya changed this a moment ago"; live-updated items briefly glow with primary-tint.
- **Empty states:** small illustration, one-line headline, one sentence, one button.
- **Loading:** skeleton blocks, never full-page spinners.

## Motion

All motion (tokens, tools, reusable patterns, reduced-motion rules and every animation per screen) is specified in [MOTION.md](MOTION.md). Summary: fast and purposeful, 150–250 ms, springs for drag, nothing over 600 ms except one-time hero and logo sequences, always respects reduced motion.

## Voice

Warm, short, clear. Verb-first buttons ("Send invitations"). No jargon, no exclamation marks in system messages, celebrate real milestones only ("All Haldi tasks done").

## Example content

Use a mix of event types so no screen looks wedding-only: "DevFest Bhopal 2026" (conference, 1,200 registrations), "Sharma Wedding" (wedding, 5 functions, 412 guests), "Techno Fest 2026" (college fest, 18 competitions), "Indore Craft Fair" (fair, 3 days, 60 stalls). Indian names: Rahul, Priya, Ananya, Arjun, Neha, Vikram.
