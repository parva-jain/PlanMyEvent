'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { LogoMark } from '@/components/motion/logo-mark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** MOTION.md 6.2: the header gains its background after 8 px of scroll. */
const SCROLL_THRESHOLD = 8;

// /sign-in arrives in milestone 2; `prefetch={false}` on its links avoids a 404 prefetch until then.

const NAV = [
  { key: 'features', href: '#features' },
  { key: 'useCases', href: '#use-cases' },
  { key: 'howItWorks', href: '#how-it-works' },
  { key: 'pricing', href: '#pricing' },
] as const;

/**
 * Marketing header: transparent over the hero, then background and bottom border fade in
 * (`base`) once the page scrolls. Colour only, so it stays the same under reduced motion.
 * The logo plays its intro once per session.
 */
export function SiteHeader() {
  const t = useTranslations('home.header');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    // The page may load already scrolled (reload, anchor link).
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        'sticky top-0 z-40 border-b border-transparent',
        'transition-[background-color,border-color] duration-(--dur-base) ease-(--ease-out)',
        'data-scrolled:border-border data-scrolled:bg-background/90 data-scrolled:backdrop-blur-md',
      )}
    >
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-4 py-2 text-label focus:not-sr-only focus:absolute focus:top-3 focus:left-4"
      >
        {t('skipToContent')}
      </a>
      <div className="mx-auto flex h-16 max-w-content items-center gap-6 px-4 lg:px-8">
        <Link href="/" className="flex items-center gap-2 rounded-control">
          <LogoMark size={32} />
          <span className="text-h3 font-bold">{t('brand')}</span>
        </Link>

        <nav aria-label={t('navLabel')} className="mx-auto hidden lg:block">
          <ul className="flex items-center gap-8">
            {NAV.map((item) => (
              <li key={item.key}>
                <a
                  href={item.href}
                  className="rounded-sm text-label font-medium text-fg-secondary transition-colors duration-(--dur-fast) hover:text-fg"
                >
                  {t(item.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-fg-secondary sm:inline-flex"
          >
            <Link href="/sign-in" prefetch={false}>
              {t('signIn')}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-in" prefetch={false}>
              <span className="sm:hidden">{t('startFree')}</span>
              <span className="hidden sm:inline">{t('startPlanning')}</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
