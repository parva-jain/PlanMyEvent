# 15 — Smoke tests and Lighthouse

Home page track, step G · Oct 24, 2026

## What happened

1. **Playwright smoke tests** in `apps/web/e2e/home.spec.ts`: eight tests, each run on a desktop (1280 × 860) and a phone (Pixel 7) project, so 16 runs. Five use normal motion and three use emulated reduced motion. Run them with `pnpm test:e2e`, from the root or from `apps/web`.
2. **Lighthouse mobile** on the same production build: performance 92–96 (median 96), and accessibility, best practices and SEO all 100. CLS was 0 in every run.

## What the tests check

| Test | Normal | Reduced motion |
| --- | --- | --- |
| Every section heading renders, the footer shows, total layout shift is 0, there are no console errors | ✓ | ✓ |
| Header gets its background after scrolling | ✓ | |
| Use-case tabs switch with a click and with the arrow keys | ✓ | |
| An FAQ answer opens and closes | ✓ | |
| AI teaser: cards hidden, then the sentence types, then the cards appear | ✓ | |
| The `--motion` CSS switch is 0, and the scroll-linked drift doesn't move | | ✓ |
| AI teaser: the full sentence appears at once, with no caret, and the cards are visible | | ✓ |

## Key ideas

- **Test the production build.** `webServer` in `playwright.config.ts` runs `next build` and then `next start`. Dev mode adds extra JavaScript, and React StrictMode double effects there, so motion and layout shift behave differently.
- **Use a port of its own (3100).** If a test server and a dev server share a port, Playwright's `reuseExistingServer` silently tests the dev server. It happened during this step with Lighthouse, as described below.
- **Reduced motion is a browser setting you can emulate.** `test.use({ reducedMotion: 'reduce' })` makes `prefers-reduced-motion` match. Our CSS `--motion` switch and `MotionConfig` both react to it, just as they would on a real phone with the setting on.
- **Measure layout shift in the page.** A `PerformanceObserver` for `layout-shift` entries, added with `addInitScript` before any page script runs, sums every shift that wasn't caused by user input. The test expects exactly 0.
- **Take expected text from the translation file.** The spec reads `messages/en.json`, so a copy edit doesn't break a test. The test checks behaviour, not wording.
- **Prefer roles over classes.** `getByRole('tab', { name })` and `getByRole('button', { name })` find elements the way a screen reader does, so these tests also confirm the accessible names. Classes appear only where there's no role, such as `.drift-bubble`.
- **Make a test fail once on purpose.** A copy of the reduced-motion test with motion turned on failed (`--motion` was 1, not 0). This shows the test can actually catch the bug it's for.

## What testing taught us

- **Check which server answered.** The first Lighthouse runs scored 42–79. The production server had failed to start because port 3000 was already in use, so Lighthouse measured a dev server. The clue was a `next-devtools` script in the results, which never ships in production. The next round checks the server log for "Ready" and the process name before measuring.
- **Don't kill a port you didn't open.** The cleanup command `kill $(lsof -ti :3000)` stopped the dev server that was holding the port. Keep the process id of the server you started, and kill only that one.
- **Simulated and observed LCP measure different things.** Lighthouse reports about 2.7 s. That's an estimate for a slow phone on a slow network. The browser on this machine actually painted the hero headline in 103–197 ms. The score uses the simulated number.
- **`next start` warns about `output: 'standalone'`.** It still serves the build correctly. The standalone server (`node .next/standalone/…/server.js`) is for the Docker image in item 9.

## Self-check

**Why does the test suite build the app instead of using `pnpm dev`?**
Dev mode ships extra code and double-runs effects, so its layout shift, timing and console output don't match what users get. The smoke test should check what gets deployed.

**What would the CLS test catch?**
Any element that moves after it was painted: a font swap that changes line breaks, an image without a size, a badge that appears and pushes content, or a moving caret, like the one fixed in step F.

**Why does the reduced-motion AI test read the text once, immediately, instead of using `toHaveText`?**
`toHaveText` retries for up to five seconds, so it would also pass if the sentence typed out slowly. Reading the text once, right after scrolling, proves nothing was typing.

**Why didn't the 42–79 scores mean the page had become slower?**
They measured a different server, a dev build with devtools. Before believing a regression, confirm what was measured.

## My notes

<!-- Write your own notes here. -->
