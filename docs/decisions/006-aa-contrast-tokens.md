# 006. Text colours adjusted to meet WCAG AA

- Status: Accepted
- Date: 2026-10-24

## Context

Measuring DESIGN.md's colour pairs (and Lighthouse on the home page) showed four text colours below WCAG AA, which requires 4.5:1 for normal-size text. Almost all of our text is 13-17 px, so the large-text 3:1 allowance doesn't apply.

| Token | Old | Worst pair | Ratio |
| --- | --- | --- | --- |
| accent-text | #B4710C | on accent-tint #FFF7E6 | 3.71 |
| text-muted (light) | #8E857A | on surface-muted #F3EFE9 (inputs) | 3.17 |
| primary (dark, buttons) | #6366F1 | white text on it | 4.47 |
| text-muted (dark, from the Stitch dark kit) | #8E857A | on surface-muted #332D27 | about 3.9 |

## Decision

Keep each hue and change only lightness, stopping at the first value that passes 4.5:1 on every surface the colour is used on:

| Token | New | Ratios |
| --- | --- | --- |
| accent-text | #9F650D | 4.54 on accent-tint |
| text-muted (light) | #736C62 | 4.89 background, 5.18 surface, 4.53 surface-muted |
| primary (dark, buttons) | #6265F0 | 4.53 with white text |
| text-muted (dark) | #9E958A | 5.80 background, 5.14 surface, 4.61 surface-muted |

Rejected: making text bold or large enough to qualify for 3:1 (changes the type scale); exempting struck-through completed tasks (WCAG only exempts disabled controls); a darker dark-mode primary such as #4F46E5 (passes easily but visibly dims the indigo).

## Consequences

- Placeholders, captions, timestamps, completed tasks, "next up" chips and dark-mode buttons are readable for low-vision users and on phone screens in sunlight.
- The changes are near-invisible; the brand palette (BRAND.md) is unchanged. Indigo 500 #6366F1 remains the logo's dark-mode edge and focus-ring colour.
- New colour pairs must be measured before use; DESIGN.md states the AA rule above the neutrals table.
