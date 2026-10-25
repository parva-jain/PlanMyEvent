# 13 — Scroll-linked motion

Home page track, step F (problem-to-solution section) · Oct 24, 2026

## What was built

`apps/web/src/components/home/problem-solution.tsx`: "From 12 WhatsApp groups and 5 spreadsheets to one shared plan." On the left is a chaotic chat card; on the right is the synced plan card. As the section scrolls from the bottom of the screen up to the middle:

- the chat bubbles drift up to 24 px toward the plan card (right on desktop, down on phones, where the cards stack) and dim to 70%, the last bubble moving most;
- the plan card grows from 92% to full size.

With reduced motion, nothing moves: the bubbles stay at rest and the card is at full size.

## Key ideas

- **Scroll-linked vs scroll-triggered.** `Reveal` is *triggered*: it plays once when the element enters the screen. Here the animation is *linked*: its progress follows the scroll position, and scrolling back reverses it.
- **`useScroll({ target, offset })`** gives a motion value from 0 to 1. `offset: ['start end', 'center center']` means 0 when the section's top meets the bottom of the screen and 1 when its centre reaches the centre of the screen.
- **One number, many effects.** The progress goes into a single CSS variable, `--drift`, on the section. CSS turns it into each element's `translate`, `opacity` and `scale`. Media queries pick the direction (right on desktop, down on phones), and `--k` gives each bubble its share. JavaScript doesn't need to know the layout.
- **Reduced motion in CSS.** Every effect multiplies by `--motion` (0 when reduced), the same switch `pressable` and `hover-lift` use. It covers the OS setting and the `/dev/ui` override with no JavaScript.
- **Only transform, opacity and scale change.** Layout never moves, so there's no layout shift and the browser can composite the frames cheaply.

## What testing taught us

- **Motion doesn't clean up after itself.** The first version stopped binding `--drift` once reduced motion was detected. Motion had already written a value during hydration and left it there, so reduced-motion users saw the section frozen at 15% drift. Moving the decision to CSS removed that whole class of bug.
- **Reserve room for movement.** At full drift the last bubble poked out of its card, so the bubble list now has 24 px of right padding on desktop, exactly the drift distance.
- **Dimmed text must still pass contrast.** The bubbles use full-strength text colour, so even at 70% opacity they stay above 4.5:1.
- **Lighthouse is sensitive to machine load.** With a load average near 20, the same unchanged React file took 2.7× longer to run, and the score fell from about 96 to about 76. Check the system load and compare per-script CPU time before blaming new code.

## Self-check

**Why put the scroll progress in a CSS variable instead of animating each element with `useTransform`?**
One value drives everything. Direction per breakpoint and reduced motion are plain CSS, so there's no JavaScript resize logic and no separate reduced-motion code path to get wrong.

**What do the two `offset` values mean?**
Each is "a point on the target, then a point on the viewport". Progress is 0 when the section's start meets the viewport's end (just entering at the bottom) and 1 when the section's centre meets the viewport's centre.

**Why does the plan card default to full size when `--drift` is unset?**
Server HTML and the first paint have no scroll progress yet. Defaulting to the final state means no-JS visitors and early paints see the finished design, not a shrunken card.

**Why did the bubbles get full-strength text colour, unlike the grey in Stitch?**
They dim to 70% opacity. Grey text at 70% would fall below 4.5:1; dark text stays readable.

## My notes

<!-- Write your own notes here. -->
