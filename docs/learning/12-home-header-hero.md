# 12 — Home page: header and hero

Home page track, step F (first section) · Oct 24, 2026

## What was built

`apps/web/src/components/home/`: `site-header.tsx`, `hero.tsx`, `event-type-pills.tsx`, `live-plan-card.tsx`; the page itself is `src/app/page.tsx`.

| Piece | Motion (MOTION.md 6.2) | Reduced motion |
| --- | --- | --- |
| Header | Transparent at the top; background and border fade in after 8 px of scroll (`base`); logo intro once per session | Same (colour only); finished logo |
| Headline | Words rise 24 px and fade in, 60 ms apart (`deliberate`); subheading and buttons follow 150 ms later | Fade only, `fast`, no stagger |
| Event-type pills | A ring moves pill to pill every 2.2 s for one loop, ending on Conferences; pauses on hover and focus and off-screen | Fixed on Conferences |
| Plan card | Rises in at +300 ms. 1 s after it's in view: Rahul ticks a task (CheckDraw + LiveHighlight), then registrations count 18 → 24 | Final state, no glow |
| Floating cards (desktop) | Enter 80 ms apart, then drift ±6 px (AmbientFloat), pausing on hover and focus and off-screen | Static |

## Key ideas

- **Largest Contentful Paint (LCP)** is when the biggest piece of content in view first paints; here it's the headline. Lighthouse weighs it heavily. An element at opacity 0 doesn't count as painted.
- **CSS entrance for content visible at load.** `Reveal` uses Motion in JavaScript, so it only starts after React hydrates, which takes 1–2 s on a throttled phone. The hero uses a CSS keyframe class (`.rise-in`) instead, with the same tokens: it starts at first paint, works without JavaScript, and respects reduced motion through the `--motion` switch. Sections further down keep `Reveal`, because nobody sees them at load.
- **Scripted demos start from a real "before" state.** The server HTML shows the card before the change (task due, +18). The animation then plays the change, and reduced motion jumps to "after". Nothing renders blank or flashes back.
- **Reserve space for swaps.** The "Due today" and "Done" badges have different widths. Both sit in one grid cell, with the inactive one invisible, so the swap can't shift anything.
- **Decorative illustrations get one label.** The plan card is `role="img"` with a summary `aria-label`, and its inner text is hidden from screen readers. That way the "Rahul just updated this" status doesn't get announced as if it were real.

## What testing taught us

- **The page couldn't scroll yet.** The hero alone fits the window, so the header and off-screen checks "passed" without testing anything. The test now adds temporary padding.
- **Lighthouse's LCP is simulated.** The browser's observed LCP was 100–190 ms, but Lighthouse reported 2–3 s. It replays the page on a modelled slow phone and assumes every script requested before LCP must download first. Smaller JavaScript is what moves that number.
- **Measure on a fresh server.** One batch of runs hit an old `next start` process that was still serving a deleted build (chunk 500s), so those scores were meaningless.
- **Prefetch of missing routes.** `<Link>` prefetches its target, so linking to `/sign-in` before it exists logs a 404 and costs Best Practices points.

## Self-check

**Why doesn't the hero use the `Reveal` component like the rest of the page will?**
`Reveal` waits for hydration, so the headline (the LCP element) would stay invisible for a second or more on slow phones. The CSS entrance starts at first paint.

**Why does the pill highlight start on Conferences rather than Weddings?**
Conferences is the final state required by MOTION.md, and it's what the server and reduced-motion users see. Starting the loop there means no jump when the animation begins after hydration.

**Why does the live card skip LiveHighlight under reduced motion, when LiveHighlight is normally kept?**
In the app it marks a real change someone should notice. Here it's a demo replay, and reduced motion means "show the final state".

**Why do the floating cards stop when off-screen?**
WCAG 2.2.2 (nothing should move for more than 5 s without a way to pause it, and it shouldn't keep running unseen), plus battery and CPU.

**Why did Lighthouse score 90 on one run and 98 on another?**
Background CPU load on the machine changes Total Blocking Time between runs. Take several runs and look at the median.

## My notes

<!-- Write your own notes here. -->
