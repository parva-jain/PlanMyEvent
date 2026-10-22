# Plan My Event — Brand

Last updated: Oct 21, 2026

## Name and taglines

| Use | Text |
| --- | --- |
| Product name | Plan My Event (three words, title case) |
| Home page hero headline | Your whole event team, on the same page. |
| Brand line (under logo, footer, link previews, store listings) | One plan for everyone behind your event. |

## Logo

The mark is a calendar tile whose tick breaks out of the frame and lands on a sparkle: the plan, getting done, the event happening.

| File | Use |
| --- | --- |
| `logo/mark.svg` | Primary mark on light backgrounds |
| `logo/mark-dark.svg` | Mark on dark backgrounds (deep indigo tile with a hairline edge) |
| `logo/lockup-horizontal.svg` / `-dark.svg` | Header, navigation, documents |
| `logo/lockup-stacked.svg` / `-dark.svg` | Splash screens, social posts, centered layouts; includes the brand line |
| `logo/mark-one-color.svg` | Single-color print, stamps, tickets |
| `logo/mark-reversed-white.svg` | On an indigo background |
| `logo/mark-animated.svg` | App splash, home page hero, full-page loading (plays once, ~1.2 s, respects reduced motion) |
| `logo/favicon.svg` | Browser favicon; switches to the dark version automatically |
| `logo/favicon.ico` | Legacy favicon (16, 32, 48 px) |
| `logo/favicon-16-simplified.svg` | Below 24 px: drops the sparkle, thicker tick |
| `logo/app-icon.svg`, `app-icon-maskable.svg` | Source for PWA and mobile icons |
| `logo/png/` | Ready-made PNGs: favicons, apple-touch-icon-180, icon-192, icon-512, icon-512-maskable, app-icon-1024, mark-512, lockups |

Wordmark is Plus Jakarta Sans ExtraBold (800), tracking −1.7%, converted to outlines in the SVGs, so no font is needed to display them.

### Rules

- **Clear space:** keep at least the width of the sparkle empty on every side.
- **Minimum size:** 24 px for the full mark; below that use `favicon-16-simplified.svg`.
- **Colors are fixed:** never recolor the tick or tile with event accent colors.
- **Don't** stretch, rotate, add shadows or outlines, or place the mark on busy photos without a solid backing.
- **Motion** only in the three places listed above; everywhere else the mark is still.

## Colors

| Role | Name | Hex | Use |
| --- | --- | --- | --- |
| Primary | Indigo | #4338CA | Buttons, links, logo tile |
| Primary dark | Deep indigo | #312E81 | Dark-mode logo tile, pressed states |
| Primary light | Indigo 500 | #6366F1 | Dark-mode edges and focus rings |
| Celebration accent | Marigold | #F5A524 | Logo tick and sparkle, progress, milestones; never body text |
| Background | Warm white | #FAF8F5 | App and page background |
| Surface | White | #FFFFFF | Cards |
| Text | Ink | #1F1B16 | Primary text, dark-mode background |
| Text secondary | Stone | #6B635A | Supporting text |
| Success | Green | #16A34A | Done, paid |
| Warning | Amber | #D97706 | Pending, due soon |
| Danger | Red | #DC2626 | Overdue, destructive actions |

### Event accent colors

Set per event by its template; used in the event header, cover and guest-facing pages, never in the logo.

| Event type | Hex |
| --- | --- |
| Wedding | #E11D74 |
| Conference | #2563EB |
| Fair / exhibition | #0D9488 |
| Celebration | #EA580C |
| Custom | #7C3AED |

## Typography

| Use | Font |
| --- | --- |
| UI and body | Plus Jakarta Sans (400, 500, 600, 700) |
| Logo wordmark | Plus Jakarta Sans 800 |
| Display (event names on invitations and public pages only) | Fraunces |
| Hindi (later) | Noto Sans Devanagari |

## Web head snippet

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
<meta name="theme-color" content="#4338CA">
```
