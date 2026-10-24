# 08 — Web foundation

Home page track, step A · Oct 24, 2026

## Key ideas

- **Next.js App Router.** Files under `src/app/` are routes: `page.tsx` is a page, `layout.tsx` wraps every page. Pages are server components by default; only interactive parts are client components (`'use client'`, e.g. the theme switcher).
- **Tokens as CSS variables, exposed to Tailwind.** `globals.css` defines every DESIGN.md colour as a variable on `:root` (light) and `.dark` (dark). `@theme inline` maps them to Tailwind names, so `bg-surface` or `text-fg-muted` switch automatically with the theme.
- **Dark mode via a class.** `next-themes` puts `.dark` on `<html>` (following the OS until the user picks), and `@custom-variant dark` makes Tailwind's `dark:` use that class.
- **Fonts with `next/font`.** Plus Jakarta Sans and Fraunces are downloaded at build time and self-hosted, exposed as CSS variables. No request to Google from the browser, no layout shift from late font swaps.
- **Translations from day one.** `next-intl` loads `messages/en.json`; components call `useTranslations('namespace')`. No locale routing until Hindi arrives.
- **Metadata files.** `favicon.ico`, `icon.svg`, `apple-icon.png` and `manifest.ts` in `src/app/` become the right `<link>` tags automatically.
- **Supply chain again.** pnpm refused Next.js 16.4.3 because it was under a day old, so we pinned 16.4.2 instead of adding exceptions.

## Self-check

**Why define colours as CSS variables instead of directly in Tailwind's theme?**
The variables change value when `.dark` is applied, so one class like `bg-surface` works in both themes. Hard-coded theme colours would need a `dark:` variant on every element.

**Why is the theme switcher a client component but the page a server component?**
Reading and changing the theme needs the browser (localStorage, the OS preference, click handlers). The rest of the page is static markup, which renders faster and ships less JavaScript as a server component.

**Why render the switcher's selection only after hydration?**
The server can't know the user's theme, so its HTML would show the wrong option selected and React would report a mismatch. Waiting until hydrated shows the correct choice.

**Why did `notFound()` at the top of the `/dev/ui` file break the build?**
Top-level code runs when Next.js imports the module while collecting page data, outside a request, so the 404 was thrown at build time. Inside the component it runs per request, as intended.

**Why did the 390 px headless screenshot look broken?**
Desktop headless Chrome has a minimum window width of about 500 px, so the page was laid out at 500 and the screenshot cropped. Phone checks need real device emulation (Playwright), not a narrow window.

## My notes

<!-- Write your own notes here. -->
