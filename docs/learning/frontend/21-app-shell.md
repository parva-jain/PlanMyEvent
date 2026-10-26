# 21 — App shell

Milestone 1, item 8 (last part) · Oct 26, 2026

## What happened

The signed-in frame every event screen will live in, at `/app` for now:

| Size | Navigation | Event switcher | Quick add |
| --- | --- | --- | --- |
| Phone (<640) | Bottom bar: Home, Tasks, People, Budget, More | Top bar → bottom sheet | Floating + button → sheet |
| Tablet (640–1024) | Icon rail | Top bar → bottom sheet | Floating + button → sheet |
| Desktop (>1024) | 248 px sidebar | In the sidebar → popover | "Add" in the top bar → popover |

Also: a status widget (the web app's first live API call, through TanStack Query), a theme toggle, placeholder empty states for every section, a 404 for unknown sections, and 16 new Playwright tests.

## Key ideas

- **One layout, three shapes.** The sidebar component *is* the rail: at tablet width the labels become screen-reader-only and the nav shrinks to icons. Fewer components, and both stay in sync.
- **Radix for behaviour, Motion for movement.** Radix Dialog and Popover handle the hard accessibility parts (focus trap, Escape, `aria-*`, returning focus). We only add animation on top, through `asChild` and `forceMount`.
- **Two ways to animate.** The sheet uses Motion (springs, drag to dismiss). The popover uses CSS keyframes multiplied by `--motion`, which becomes 0 with reduced motion, so the same rule covers both the OS setting and the `/dev/ui` override.
- **`layoutId` for the sliding indicator.** Each bottom-bar tab renders the indicator only when active; Motion sees the same `layoutId` move between tabs and animates it. With reduced motion, `MotionConfig` turns layout animation off.
- **Server state goes through TanStack Query.** The status widget polls `/v1/health/ready` every 30 s. A 503 still has a JSON body, so "degraded" (Redis down) and "offline" (no answer) are different states.
- **Placeholders are honest.** Sample events stand in until milestone 3, but every string is a translation key and every section explains what will live there.

## What testing taught us

- **Mock the network in browser tests.** CI's Playwright job has no API, so the tests answer `/v1/health/ready` themselves with `page.route` and cover all three states, including a refused connection.
- **A motion test must be able to fail.** "The sheet has no transform" is also true at the *end* of a normal slide. The test reads the transform two animation frames after opening; the normal-motion twin expects a transform, the reduced one expects none.
- **Locale decides date order.** `en` formats "Sat, Nov 14, 2026"; DESIGN.md wants "Sat, 14 Nov". `formatEventDate` builds the string from `en-IN` parts, because `en-IN` alone puts a comma before the year.

## Self-check

**Why does the phone show the API status dot in the top bar, but the tablet doesn't?**
On tablet the rail already shows it at the bottom; showing it twice would read out twice to screen readers.

**What would break if `QueryProvider` created the `QueryClient` outside `useState`?**
A new client (and empty cache) on every render, so queries would refetch constantly and lose their data.

**Why is `/app/nope` a 404 and not an empty placeholder?**
`dynamicParams = false` limits the route to `generateStaticParams`, so only real sections exist. Typos shouldn't look like working pages.

**What changes in milestone 3?**
The shell moves to `/events/[eventId]`, the switcher lists the user's real events from the API, and the sample events are deleted.

## My notes

<!-- Write your own notes here. -->
