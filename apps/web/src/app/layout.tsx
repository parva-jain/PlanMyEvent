import type { Metadata, Viewport } from 'next';
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { MotionProvider } from '@/components/motion/motion-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { LOGO_INTRO_SCRIPT } from '@/lib/logo-intro';

import '@/styles/globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

// Display font: event names on invitations and public pages only (DESIGN.md). Not preloaded:
// it never appears in the first screen, so it shouldn't compete with the hero for bandwidth.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), description: t('description') };
}

export const viewport: Viewport = {
  themeColor: '#4338CA',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${jakarta.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Must run before first paint so the logo intro never flashes (see LogoMark). */}
        <script dangerouslySetInnerHTML={{ __html: LOGO_INTRO_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <ThemeProvider>
            <MotionProvider>{children}</MotionProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
