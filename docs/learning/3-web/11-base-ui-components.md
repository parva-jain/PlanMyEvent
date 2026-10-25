# 11 — Base UI components

Home page track, step E · Oct 24, 2026

## Key ideas

- **shadcn/ui is "copy the source", not a dependency.** Its CLI writes component code into the repo for us to own. We used `shadcn add <name> --view` to read the Radix-based sources without writing anything, then wrote our own versions styled with our tokens (`components.json` records the setup for future `add` runs).
- **Radix does the hard parts.** Keyboard navigation, focus, ARIA roles and states for tabs and accordion come from `radix-ui` primitives; we only style and animate.
- **`cva` variants.** `class-variance-authority` maps props like `variant="secondary"` or `tone="success"` to class lists, so components stay consistent.
- **`cn()` must know our theme.** `tailwind-merge` resolves conflicting classes, but it didn't know `text-h1` is a size, so it would have dropped it next to `text-fg`. We registered our type scale, radii and shadows.
- **Tabs pill without layout animations.** One indigo layer sits under the tabs; an animated `clip-path` reveals only the part under the active tab, with two `snappy` springs for its edges. It slides, keeps rounded ends, and needs no extra Motion bundle. Before hydration the active tab paints its own background so it never looks blank.
- **`reduce-motion:` variant.** A custom Tailwind variant that applies when motion is reduced by the OS setting or the `/dev/ui` override, for CSS animations that can't scale by `--motion` (keyframes, rotations).
- **Delayed spinner.** Buttons show a spinner only after 300 ms, so fast saves don't flash one.

## What testing taught us

- **CSS specificity beat the reduced-motion override.** `data-[state=open]:animate-…` has an attribute selector, so it outranked `reduce-motion:animate-none`; the accordion kept animating under reduced motion until the override got `!important`.
- **Sample per frame for fast animations.** A 40 ms timer after a Playwright click looked like "no animation", because the click itself took a few frames. Recording the height on every `requestAnimationFrame` inside the page showed the real curve.
- **Tailwind 4's `rotate-180` sets the CSS `rotate` property,** not `transform`, so measurements must read `rotate`.
- **Measure contrast, don't eyeball it.** Event colours as badge text failed WCAG AA (3.1–4.8:1 light, 2.3–3.3:1 dark). Derived `--event-*-text` tokens fix that (5.0–7.0:1). The same check found three DESIGN.md pairs below AA, now an open question.

## Self-check

**Why write our own components instead of keeping shadcn's generated files?**
Almost every class would change (our tokens, sizes, radii, motion), and shadcn's colour variables (`--primary-foreground` and so on) aren't ours. Reading the source and writing our own keeps Radix's behaviour without a second, conflicting theme.

**Why animate the tabs pill with clip-path instead of Motion's `layoutId`?**
`layoutId` needs Motion's `domMax` features, a bigger bundle on the home page where Lighthouse must stay ≥ 90. Clip-path is allowed by MOTION.md principle 7 and needs only the features we already load.

**Why does the accordion animate height when MOTION.md says not to animate height?**
The FAQ row in MOTION.md 6.2 explicitly asks for it; the content is small, and the rule exists to protect large elements and cheap phones.

**Why do event badges need their own text colour?**
The event accents are designed for strips, covers and dots. As small text on their own tint they're too low-contrast to read comfortably, especially in dark mode.

## My notes

<!-- Write your own notes here. -->
