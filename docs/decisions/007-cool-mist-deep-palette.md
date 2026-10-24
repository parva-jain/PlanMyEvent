# 007. Cool "Mist Deep" neutrals replace the warm palette

- Status: Accepted
- Date: 2026-10-24

## Context

DESIGN.md specified warm neutrals (cream backgrounds, brown-grey text, a warm brown dark mode), and every Stitch screen was designed with them. Once the home page was built, the result felt warmer than intended; the goal is a cool, elegant look. Four cool palettes were previewed on the home page (Slate, Zinc, Mist and variations of Mist) in both themes.

## Decision

Adopt "Mist Deep": cool greys with a trace of the brand indigo in light mode (#F2F3FB page, #E7E9F7 fills, #12142B text) and a midnight indigo dark mode (#090B1C page, #11142B surfaces). Brand indigo, marigold, status and event colours are unchanged.

Stitch screens stay warm. They remain the reference for layout, structure and content; colours are translated through the "Reading Stitch designs" table in DESIGN.md. Repainting every Stitch screen would cost hours and add nothing the token system doesn't already give.

Warm amber surfaces sit badly on cool neutrals, so marigold is kept for fills such as progress bars, the logo and celebration moments, and large amber backgrounds (like the hero's milestone box) become neutral.

## Consequences

- Only `globals.css` tokens and DESIGN.md changed; components already used token names, so every screen follows automatically.
- Every text pair was re-measured: all meet WCAG AA in both themes (lowest 4.84:1, text-muted on surface-muted in light mode).
- Dark-mode tints derived in code (indigo, accent, status, event) were retuned for the midnight surfaces.
- Anyone reading a Stitch screen must use the colour map; copying a Stitch hex value is a bug.
- Supersedes the dark tokens taken from the Stitch dark UI kit (recorded in STATUS).
