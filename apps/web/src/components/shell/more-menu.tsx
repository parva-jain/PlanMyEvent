'use client';

import { ChevronRight } from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { Card } from '@/components/ui/card';
import { distance, duration, ease } from '@/lib/motion';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { MORE_ITEMS } from './nav';
import { StatusWidget } from './status-widget';
import { ThemeToggle } from './theme-toggle';

/**
 * Phone "More" screen (MOTION.md 6.9): slides in 24 px from the right with a fade
 * (`moderate`). Reduced motion: fade only, `fast`.
 */
export function MoreMenu() {
  const t = useTranslations('app');
  const reduced = useShouldReduceMotion();

  return (
    <m.div
      initial={{ opacity: 0, x: reduced ? 0 : distance.riseLarge }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduced ? duration.fast : duration.moderate, ease: ease.out }}
      className="flex flex-col gap-6"
    >
      <h1 className="text-h1-phone sm:text-h1">{t('nav.more')}</h1>

      <Card className="gap-0 p-2 sm:p-2">
        <ul>
          {MORE_ITEMS.map(({ key, href, icon: Icon }) => (
            <li key={key}>
              <Link
                href={href}
                className="flex min-h-14 items-center gap-3 rounded-control px-3 text-body transition-colors duration-(--dur-fast) hover:bg-surface-muted"
              >
                <Icon aria-hidden className="size-5 text-fg-secondary" />
                {t(`nav.${key}`)}
                <ChevronRight aria-hidden className="ml-auto size-5 text-fg-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="gap-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-label">{t('theme.label')}</span>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <span className="text-label">{t('status.label')}</span>
          <StatusWidget />
        </div>
      </Card>

      <Card className="p-2 sm:p-2">
        <SignOutButton className="min-h-14 text-body" />
      </Card>
    </m.div>
  );
}
