# 14 — Home page complete (and a palette change)

Home page track, step F (finish) · Oct 24, 2026

## What happened

1. **Palette.** The warm neutrals felt heavy, so four cool palettes were previewed live on the page with a temporary switcher. "Mist Deep" won: cool greys with a trace of indigo, and a midnight dark mode. Only `globals.css` tokens and DESIGN.md changed (decision 007). The Stitch screens stay warm and are read through a colour map in DESIGN.md.
2. **The rest of the page**, in one commit: how it works, features, use cases, guest experience, AI teaser, pricing, FAQ, final call to action and footer, each with its MOTION.md 6.2 motion.

## Key ideas

- **Tokens pay off.** Because no component contains a hex colour, swapping the whole palette touched one CSS file and the docs. Designs made in the old palette still work as layout references.
- **Preview before deciding.** A throwaway `data-palette` attribute with CSS overrides let you compare options on the real page in your own browser, in both themes, without committing anything.
- **`@property` makes CSS variables animatable.** A normal custom property is just text, so it can't transition. Registering it as `<color>` lets the browser interpolate it. The use-case tabs fade their accent this way, even though the panel content remounts.
- **Server HTML first, motion second.** Every section renders its final content on the server; motion only hides what starts off-screen and plays it in when seen. Reduced motion, no JavaScript and search engines all get the finished page.

## What testing taught us

- **Full-page screenshots don't scroll**, so scroll-triggered sections looked empty. Scroll through first, then capture.
- **An `<svg>` doesn't stretch with `left` and `right`.** It's a replaced element with a default 300 px width. The connector needed a wrapper `div`.
- **`calc(100%-3rem)` is invalid CSS.** The minus needs spaces, and in Tailwind arbitrary values those are written as underscores: `calc(100%_-_3rem)`.
- **A caret that moves counts as layout shift.** Every typed character moved the same element. Giving the caret a new element per character (React `key`) fixed it, because inserted elements don't count.
- **Tools have blind spots.** The contrast checker ignores `clip-path` and reported the inactive tabs as unreadable. The fix was to change the layout so the tool and reality agree (the pill layer only covers the active tab at rest), not to ignore the warning.
- **Two systems updating one picture must update in the same frame.** Resizing the pill box immediately while Motion reset the clip a frame later caused one blank frame. Scheduling the resize with Motion's `frame.render` fixed it.
- **Performance numbers need context.** The same unchanged file took 40% longer from one run to the next as machine load changed. Record the load and the per-script CPU time with every score.

## Self-check

**Why didn't changing the palette require touching any component?**
Components use token names (`bg-surface`, `text-fg-secondary`), and the tokens are defined once in `globals.css`. Change the definitions and every component follows.

**How do we build future screens from warm Stitch designs without copying warm colours?**
Read each Stitch colour through DESIGN.md's "Reading Stitch designs" table and use the token; a Stitch hex value in code is a bug.

**Why register `--case` with `@property` instead of transitioning `color` on the elements?**
Radix mounts a new panel on every tab change, and a newly mounted element has no previous colour to transition from. The registered variable lives on the stable container and animates there; new content inherits the in-between value.

**Why does the pill layer change size at rest instead of staying full width?**
At full width it sits under the inactive tabs, and automated contrast checks (which ignore clip-path) measure grey text on indigo. Sizing it to the active tab removes the false failure without changing what users see.

**Why turn off preloading for Fraunces?**
Preloading tells the browser a file is needed for the first screen. Fraunces only appears further down, so preloading it competed with the hero for bandwidth and delayed LCP.

## My notes

<!-- Write your own notes here. -->
