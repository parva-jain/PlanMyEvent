# 10 — Motion components

Home page track, step D · Oct 24, 2026

All in `apps/web/src/components/motion/`, each demonstrated on `/dev/ui` with the reduced-motion toggle.

## The components

| Component | Behaviour | Reduced motion |
| --- | --- | --- |
| `Reveal` / `RevealGroup` | Fade and rise once at 20% visible; groups stagger 80 ms (40 ms in lists, max 8 rows) | Opacity only, `fast` |
| `pressable` / `hover-lift` | CSS utilities: scale 0.97 while pressed; rise 4 px with raised shadow on hover (pointer devices only) | No movement; shadow and colour still change |
| `CountUp` | Final number in server HTML; counts from 0 if it starts off-screen (800 ms), from the old value on updates (400 ms); width reserved | Final number at once |
| `ProgressFill` | Bar (`scaleX`) or ring (`pathLength`) fills in 600 ms; green with a 150 ms fade at 100% | Final value at once (handled explicitly) |
| `CheckDraw` | Box fills (100 ms), tick draws (250 ms) | Tick fades in |
| `LiveHighlight` | Indigo-tint glow: 1.5 s for others' changes, 800 ms for your own, optional label | Kept (opacity only, carries meaning) |
| `LogoMark` | Brand intro (tile pop, tick draw, sparkle pop, 1.2 s), once per session; a `<head>` script prevents a flash | Finished logo |
| `useConfetti` | 40 marigold particles, ~1 s, optional event accent and once-per-milestone key; library loaded on first use | Nothing fires |
| `AmbientFloat` | ±6 px over 6 s; pauses on hover and focus; stops off-screen | Static |
| `Typewriter` | 35 ms per character when half visible; caret removed 2 s after finishing; height reserved; screen readers get the full text | Full text at once |

## Patterns that repeat

- **Content in the server HTML.** Numbers and text render final on the server, so search engines, no-JS visitors and reduced-motion users see the real content. Only content that starts off-screen resets before animating.
- **Reserve space.** CountUp and Typewriter overlay the animated text on an invisible copy of the final text, so nothing around them moves (no layout shift).
- **One CSS switch.** CSS effects multiply their distances by `--motion`, which is 0 when motion is reduced.
- **Wait for hydration before starting animations in effects.** The reduced-motion hook reports `false` during hydration (to match the server). An effect that starts an animation in that window and is stopped a moment later freezes mid-way.

## What testing taught us

Every component was checked in a real browser by reading computed styles mid-animation, in normal and reduced mode. That caught bugs that looked fine on screen in one mode:

- CountUp displayed `985.348` mid-count (Intl's default 3 decimals).
- Motion's automatic reduced-motion handling skips transforms but not `pathLength`, so the ring kept animating.
- The session logo froze invisible under reduced motion (the hydration trap above).
- The floating cards never pass Playwright's "element is stable" check, so home page tests must scroll and hover without it or run with reduced motion.

## Self-check

**Why render CountUp's final number on the server instead of 0?**
The HTML is what search engines, no-JS visitors and the first paint show. A 0 would be wrong content; a final number is right, and only numbers below the fold (which nobody sees yet) reset to count up.

**Why does `LogoMark` need a script in `<head>`?**
Without it, the finished logo paints first, then disappears when the animation starts after hydration. The script marks the page "intro pending" before first paint, so CSS can hide the parts until the animation begins.

**Why does confetti check our override when canvas-confetti already has `disableForReducedMotion`?**
The library only reads the OS setting. Our `/dev/ui` override (and any future in-app setting) must also stop it.

**Why must `AmbientFloat` pause on hover and focus and stop off-screen?**
WCAG 2.2.2: anything that moves for more than 5 seconds must be pausable and must not keep running unseen. Stopping off-screen also saves battery and CPU.

**Why couldn't Motion's `MotionConfig` handle reduced motion for every component?**
It only disables transform and layout animations. Opacity, `pathLength`, counting and typing need their own reduced-motion paths.

## My notes

<!-- Write your own notes here. -->
