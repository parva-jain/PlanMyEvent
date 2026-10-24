# Plan My Event — Motion

Motion explains what happened; it never decorates. Every animation in the product is listed here. If an animation isn't in this file, don't add it without adding it here first.

Companion to [DESIGN.md](DESIGN.md) (visual tokens) and [BRAND.md](../brand/BRAND.md) (logo animation).

## 1. Principles

1. **Purposeful.** Each motion answers a question: what changed, where did it go, what can I do next.
2. **Fast.** Most transitions 150–250 ms. Nothing over 600 ms, except the one-time logo and hero sequences.
3. **Physical.** Things that are dragged or thrown use springs; things that appear use ease-out; things that leave use ease-in.
4. **Calm by default.** Ambient loops only on the marketing site, they stop when off-screen, and none run inside the app.
5. **Celebrate rarely.** Confetti only for real milestones, once each.
6. **Respect the user.** `prefers-reduced-motion` is honored everywhere (section 5). No essential information is conveyed only through motion.
7. **Smooth on cheap phones.** Animate only `transform` and `opacity` (plus `clip-path` and SVG `pathLength` where listed). Never animate width, height, top or left on large elements.

## 2. Tokens

Define once and import everywhere. Never hard-code durations or easings in components.

### Durations

| Token | ms | Use |
| --- | --- | --- |
| `instant` | 100 | Press feedback, checkbox fill |
| `fast` | 150 | Hover, focus, small fades, chip toggles |
| `base` | 200 | Most enters and exits, tab content, tooltips |
| `moderate` | 250 | Panels, dialogs, list reordering |
| `slow` | 400 | Bottom sheets, page-level transitions, count-ups (up to 800 for count-ups) |
| `deliberate` | 600 | Hero entrances, logo pieces |

### Easing

| Token | Curve | Use |
| --- | --- | --- |
| `out` | cubic-bezier(0.22, 1, 0.36, 1) | Enter, expand, reveal (default) |
| `in` | cubic-bezier(0.55, 0, 1, 0.45) | Exit, dismiss |
| `inOut` | cubic-bezier(0.65, 0, 0.35, 1) | Moving between two resting states (crossfades, tab indicator without spring) |
| `overshoot` | cubic-bezier(0.34, 1.56, 0.64, 1) | Pops: sparkle, badges, success check |

### Springs (Motion)

| Token | Settings | Use |
| --- | --- | --- |
| `snappy` | stiffness 500, damping 35, mass 1 | Tab indicators, toggles, chips, layout shifts |
| `gentle` | stiffness 260, damping 30 | Bottom sheets, side panels, cards expanding |
| `bouncy` | stiffness 400, damping 18 | Celebration pops, FAB press-release |
| `drag` | stiffness 600, damping 40 | Kanban and list drag, swipe-to-complete snap back |

### Distances and stagger

| Token | Value | Use |
| --- | --- | --- |
| `rise` | 12px | Fade-up distance for content |
| `riseLarge` | 24px | Hero and section headlines |
| `lift` | −4px | Card hover lift |
| `stagger` | 40 ms | Rows in a list (max 8 rows staggered; the rest appear together) |
| `staggerSection` | 80 ms | Cards and steps in a marketing section |
| `press` | scale 0.97 | Button and card press |

### In code

`apps/web/src/lib/motion.ts` exports the tokens; `apps/web/src/styles/motion.css` exposes the CSS ones as variables for CSS-only transitions:

```ts
export const duration = { instant: 0.1, fast: 0.15, base: 0.2, moderate: 0.25, slow: 0.4, deliberate: 0.6 } as const;
export const ease = {
  out: [0.22, 1, 0.36, 1],
  in: [0.55, 0, 1, 0.45],
  inOut: [0.65, 0, 0.35, 1],
  overshoot: [0.34, 1.56, 0.64, 1],
} as const;
export const spring = {
  snappy: { type: 'spring', stiffness: 500, damping: 35 },
  gentle: { type: 'spring', stiffness: 260, damping: 30 },
  bouncy: { type: 'spring', stiffness: 400, damping: 18 },
  drag: { type: 'spring', stiffness: 600, damping: 40 },
} as const;
export const distance = { rise: 12, riseLarge: 24, lift: -4 } as const;
export const stagger = { list: 0.04, section: 0.08 } as const;
```

```css
:root {
  --dur-fast: 150ms; --dur-base: 200ms; --dur-moderate: 250ms; --dur-slow: 400ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-overshoot: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

## 3. Tools

| Need | Tool | Notes |
| --- | --- | --- |
| Hover, focus, press, color and shadow changes | CSS transitions with the variables above | No JavaScript for simple state changes |
| Enter/exit, layout changes, shared elements, scroll reveals, drag, springs | [Motion](https://motion.dev) (`motion` package, imported from `motion/react`) | Use `LazyMotion` + `m` components with `domAnimation` to keep the bundle small; add `domMax` only where drag or layout animations are needed |
| Celebration confetti | `canvas-confetti` | Always pass `disableForReducedMotion: true`; marigold and the event accent only |
| Logo animation | `brand/logo/mark-animated.svg` (CSS keyframes inside the SVG), or the same timings rebuilt with Motion | Already respects reduced motion |
| Drag and drop (kanban, reordering) | dnd-kit for logic, Motion for the visual lift and settle | Keyboard dragging must work |
| Number count-ups | Motion `animate()` on a motion value, rendered with `Intl.NumberFormat('en-IN')` | Tabular figures so digits don't jitter |

Next.js notes: motion components are client components (`'use client'`). Keep pages as server components and wrap only the animated parts in small client components (for example `<Reveal>`, `<CountUp>`). Wrap the app once in `<MotionConfig reducedMotion="user">`.

## 4. Reusable patterns

Build these once in `apps/web/src/components/motion/` and use them everywhere; screens should rarely write raw animation code.

| Component | Behavior | Default |
| --- | --- | --- |
| `Reveal` | Fade in and rise `rise` px when it enters the viewport, once | `base` duration, `out` ease, triggers at 20% visible |
| `RevealGroup` | Staggers its `Reveal` children | `stagger.section` on marketing, `stagger.list` in app |
| `CountUp` | Counts from 0 (or the previous value) to the target | 800 ms first load, 400 ms on updates, `out` ease, `en-IN` format |
| `ProgressFill` | Bar or ring fills from 0 to value | 600 ms `out`; turns green with a 150 ms color fade at 100% |
| `Pressable` | Scale to `press` while pressed | `instant`, CSS |
| `HoverLift` | Card rises `lift` and gains the raised shadow | `fast`, CSS |
| `Sheet` | Bottom sheet slides up from 100% with backdrop fade; drag down to dismiss past 30% or fast flick | `gentle` spring in, 200 ms `in` out |
| `SidePanel` | Slides in 24 px from the right with fade; list behind dims to 96% | `gentle` spring |
| `Dialog` | Scale 0.96 → 1 with fade; backdrop fade | `moderate`, `out` |
| `Toast` / `UndoSnackbar` | Slides up 16 px with fade; undo countdown bar shrinks over 5 s | `base` in, `fast` out |
| `ListPresence` | Items enter with fade + rise, exit with fade + collapse; siblings reflow with `layout` | `snappy` for layout |
| `LiveHighlight` | Indigo-tint glow behind a row or card changed by someone else, fades out | 1.5 s total: 200 ms in, hold, 600 ms out |
| `CheckDraw` | Checkbox fills, tick path draws (`pathLength` 0 → 1) | 250 ms, `out` |
| `SharedElement` | Same `layoutId` across two views (card → header) | `gentle` spring |
| `Skeleton` | Soft opacity pulse 0.6 ↔ 1 | 1.2 s loop; static at 0.8 with reduced motion |
| `Confetti` | Short marigold burst from a given element | 40 particles, 1 s, once per milestone per user |
| `LogoMark` | Plays the logo sequence once: tile pop, tick draw, sparkle pop | 1.2 s total (BRAND.md) |

## 5. Reduced motion

When the user has `prefers-reduced-motion: reduce`:

| Normal behavior | Reduced behavior |
| --- | --- |
| Fade + rise, slides, scale | Opacity fade only, `fast` duration |
| Springs, overshoot, bounces | Plain `fast` fade |
| Count-ups | Show final number immediately |
| Progress fills | Show final value immediately |
| Scroll-linked effects, parallax | Show the final state, no scroll linkage |
| Marquee, ambient float, rotating content | Static |
| Confetti | None (the success message still shows) |
| Logo sequence | Final logo, no animation |
| Typewriter text | Full text immediately |
| Skeleton pulse | Static placeholder |

Also follow WCAG 2.2.2: anything that moves or auto-updates for more than 5 seconds must pause on hover and focus, stop when off-screen, and never be the only way to get information.

## 6. Catalog by surface

### 6.1 Global (app shell)

| Moment | Motion |
| --- | --- |
| Route change inside an event | Content area crossfade (`base`); sidebar and header stay still |
| Event switcher open | Popover scale 0.98 → 1 + fade (`fast`); current event has a check |
| Bottom nav tab change | Active indicator slides with `snappy` spring; icon swaps without animation |
| Floating + button | Press scale; on open, rotates 45° to become a close icon and opens the quick-add sheet |
| Online teammates | New avatar slides into the stack; leaving avatar fades |
| Notification arrives | Bell does one gentle 8° wiggle (once per batch), badge pops with `overshoot` |
| Saving | Button shows spinner after 300 ms (never flashes for fast saves) |
| Error | Field shakes 4 px left-right twice (200 ms), error text fades in |
| Offline banner | Slides down from the top bar; slides up when back online |
| Full-page loading | `LogoMark` once, then skeletons |

### 6.2 Home page (marketing)

| Section | Motion |
| --- | --- |
| Header | Transparent over the hero; after 8 px of scroll, background and bottom border fade in (`base`). Logo mark plays `LogoMark` once on first visit (session) |
| Hero headline | Words rise in with 60 ms stagger, `riseLarge`, `deliberate`; subheading and buttons follow (+150 ms) |
| Hero event-type pills | Highlight moves pill to pill every 2.2 s for one full loop, then stops on "Conferences"; pause on hover |
| Hero device mockups | Laptop and phone rise in (+300 ms). After 1 s, a scripted "live" sequence plays once: a task row ticks (`CheckDraw`), "+24 registrations today" counts up, a `LiveHighlight` with "Rahul just updated this" appears |
| Hero floating cards | Enter one by one (`staggerSection`), then drift gently (y ±6 px over 6 s, offset per card); ambient loop stops when the hero leaves the viewport |
| Event-type strip | Slow marquee (40 s per loop), pauses on hover and focus; static wrapped row on reduced motion |
| Problem to solution | Scroll-linked over the section's height: chat bubbles, sheet fragments and sticky notes drift toward the center and fade as the dashboard card scales 0.92 → 1. Reduced motion: final state |
| How it works | Three steps reveal with `staggerSection`; the connector line between them draws left to right (`pathLength`, 600 ms) |
| Features (desktop) | Sticky showcase: text blocks scroll on the left; the device on the right crossfades (`inOut`, 300 ms) to the matching screen when each block crosses the middle of the viewport. Phone: plain `Reveal` cards |
| Use cases tabs | Active tab indicator slides (`snappy`); preview crossfades (`base`) and the event accent color transitions (`fast`) |
| Guest experience | When in view: phone rises in, the invitation cover unfolds (scaleY 0.96 → 1 from the top, `gentle`), then greeting and schedule rows stagger in |
| Coming soon (AI teaser) | When in view, once: the sentence types out (35 ms per character, blinking caret), then three result cards pop in with `bouncy`, 120 ms apart |
| Pricing cards | `HoverLift`; "Coming soon" badge static |
| FAQ | Accordion height animates (`moderate`, `out`); chevron rotates 180° |
| Final call to action | `Reveal`; button `Pressable` + `HoverLift` |
| Section headings site-wide | `Reveal` with `riseLarge` |

### 6.3 Sign-in and onboarding

| Moment | Motion |
| --- | --- |
| Sign-in page load | `LogoMark` once; form `Reveal`; desktop brand panel's three cards float in with stagger, then stay still |
| Invite card (sign-in from team invite) | Slides in first (`gentle`) so the event is the first thing seen |
| Code boxes | Each digit pops (scale 1.08 → 1, `instant`); focus ring moves to the next box |
| Wrong code | Boxes shake together, border turns red (`fast`) |
| Success | Green check draws, then the page fades into the app (`slow`) |
| Join confirmation ("You're in!") | Card scales in with `gentle`; small confetti burst in the event accent |

### 6.4 Create-event wizard

| Moment | Motion |
| --- | --- |
| Template card select | Border and check badge pop (`overshoot`, `fast`) |
| Step change | Content slides 24 px horizontally (forward left, back right) with crossfade, `moderate` |
| Live preview card (step 2) | Text updates instantly; days-to-go and "You'll get" counts use `CountUp` (400 ms) |
| Review toggles | Rows collapse and expand with `ListPresence` |
| Create | Button shows progress; success card pops with `bouncy`, sparkle burst + `Confetti`; "Open dashboard" expands the card into the dashboard header via `SharedElement` |

### 6.5 Dashboard

| Moment | Motion |
| --- | --- |
| First load | Cards appear with `RevealGroup` (`stagger.list`); numbers `CountUp`; bars and rings `ProgressFill` |
| Data refresh from socket | Changed numbers count from old to new value (400 ms); no re-stagger |
| Someone else's change | `LiveHighlight` on the affected row with their avatar label |
| "Needs your attention" item resolved | Row collapses out with `ListPresence` |
| Countdown | Static; updates at midnight without animation |

### 6.6 Tasks

| Moment | Motion |
| --- | --- |
| Complete a task | `CheckDraw`, title strikes through left to right (200 ms), then after 600 ms the row slides into Done (`ListPresence`) |
| All tasks of a sub-event done | One `Confetti` burst + toast "All Robo Race tasks done" |
| Quick add | New row enters at its position with `LiveHighlight` (own change, shorter: 800 ms) |
| Kanban drag | Card lifts (scale 1.03, rotate 2°, raised shadow) with `drag` spring; other cards make room with `layout`; drop settles with `snappy` |
| Phone swipe to complete | Row follows finger; green "Done" reveal behind; past 40% it completes, otherwise springs back (`drag`) |
| Bulk-select bar | Slides up from bottom (`gentle`) |
| Detail panel / sheet | `SidePanel` on desktop, `Sheet` on phone |

### 6.7 Schedule and settings

| Moment | Motion |
| --- | --- |
| Timeline ↔ list | Crossfade (`base`) |
| Track filter | Non-matching cards fade to 40% then collapse (`ListPresence`) |
| Sub-event edit | `SidePanel` / `Sheet` |
| Guest-scope switch | Dialog, then progress bar `ProgressFill` driven by job progress; success check |
| Save bar | Slides up when there are unsaved changes, down after saving |

### 6.8 Guest invitation and RSVP page

| Moment | Motion |
| --- | --- |
| Page open | Cover unfolds (scaleY 0.96 → 1 from top, `gentle`), event name rises (`riseLarge`), greeting and schedule rows stagger (`stagger.section`) |
| Yes / No choice | Selected button fills with tint and border (`fast`); stepper appears with height animation if hidden |
| Stepper | Number rolls vertically (old out up, new in from below, `fast`) |
| Send reply | Button spinner; RSVP card crossfades into the confirmation card |
| Confirmed | Green check draws (`CheckDraw`, 400 ms), "See you there!" rises, `Confetti` in the event accent, once per invitation |

### 6.9 Later sections (apply the same patterns)

Team, budget, people, gallery and public pages use the patterns in section 4: `ListPresence` for list changes, `SidePanel`/`Sheet` for details, `CountUp` and `ProgressFill` for totals, `LiveHighlight` for others' changes, `Confetti` only for milestones (budget fully planned, first 100 responses). Add their specific rows to this file when they're designed.

## 7. Quality checks

- Every animated component has a reduced-motion path; Playwright runs with `reducedMotion: 'reduce'` so tests are deterministic, plus one smoke run with motion on.
- Profile on a mid-range Android phone (or Chrome's 4× CPU throttle): no dropped frames on the dashboard load, kanban drag and home page scroll.
- No layout shift (CLS) from entrances: reserve space before content animates in.
- Marketing pages: Lighthouse performance stays ≥ 90 on mobile with all motion enabled.
