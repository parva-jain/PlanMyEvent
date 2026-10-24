# 09 — Motion tokens and provider

Home page track, steps B and C · Oct 24, 2026

## Key ideas

- **Tokens in two forms, one source.** `src/lib/motion.ts` holds durations, easings, springs, distances and stagger for Motion (JavaScript, in seconds). `src/styles/motion.css` holds the same values as CSS variables (`--dur-fast`, `--ease-out`…) for CSS-only transitions like hover and press. Components never hard-code a duration.
- **`MotionConfig reducedMotion`** tells every Motion component how to treat reduced motion: `'user'` follows the OS setting; `'always'` and `'never'` override it (only `/dev/ui` uses the overrides).
- **`LazyMotion` + `domAnimation` + `strict`.** Motion's animation features load as one smaller bundle, and `strict` makes it an error to use the heavy `motion.div` instead of the light `m.div`. That keeps the home page's JavaScript small for the Lighthouse target.
- **One switch for JavaScript and CSS.** The override is stored in React context (for Motion and our hooks) and mirrored to `<html data-reduced-motion>` (for CSS-only effects, since CSS can't read React state).
- **Hydration-safe hook.** `useShouldReduceMotion()` returns `false` on the server and during hydration, then the real value.

## What testing taught us

The first version showed "Motion is reduced" on the client but "Full motion" in the server HTML, so React threw a hydration error and re-rendered the tree. The server can't know a visitor's OS settings, so any browser-only value must render the same as the server first, then update. `useHydrated()` in `src/lib/use-hydrated.ts` does that for both the theme switcher and the motion hook.

## Self-check

**Why keep motion tokens in both TypeScript and CSS?**
Motion animations run in JavaScript and take seconds and arrays; simple hover and press effects are cheaper as CSS transitions and need CSS variables. Both read the same documented values, so a "fast" hover and a "fast" Motion fade match.

**What does `strict` on `LazyMotion` protect against?**
Someone importing `motion.div`, which pulls the full feature set into the bundle and undoes the size saving. With `strict`, that's a runtime error in development.

**Why does the reduced-motion override also set a data attribute on `<html>`?**
CSS-only effects (`Pressable`, `HoverLift`) can't read React context. The attribute lets their CSS respond to the `/dev/ui` toggle as well as to the OS media query.

**Why must `useShouldReduceMotion()` be false during hydration?**
The server renders without knowing the setting. If the first client render differed, React would report a mismatch and discard the server HTML. Matching first and updating right after avoids that.

## My notes

<!-- Write your own notes here. -->
