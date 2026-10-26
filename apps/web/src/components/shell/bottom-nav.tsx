'use client';

import { Ellipsis, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

import { BOTTOM_ITEMS, isActive, MORE_HREF, MORE_ITEMS, type NavKey } from './nav';

const TABS: { key: NavKey | 'more'; href: string; icon: LucideIcon }[] = [
  ...BOTTOM_ITEMS,
  { key: 'more', href: MORE_HREF, icon: Ellipsis },
];

/**
 * Phone bottom bar (DESIGN.md "Layout"): Home, Tasks, People, Budget, More. The active
 * indicator slides between tabs with the `snappy` spring; icons swap without animation
 * (MOTION.md 6.1). More stays active on the sections it lists.
 */
export function BottomNav() {
  const t = useTranslations('app.nav');
  const pathname = usePathname();
  const onMoreSection = MORE_ITEMS.some((item) => isActive(item.href, pathname));

  return (
    <nav
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ key, href, icon: Icon }) => {
          const active =
            key === 'more' ? isActive(href, pathname) || onMoreSection : isActive(href, pathname);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-16 flex-col items-center justify-center gap-1 text-caption text-fg-muted',
                  active && 'text-primary-text',
                )}
              >
                {active && (
                  <m.span
                    layoutId="bottom-nav-indicator"
                    transition={spring.snappy}
                    aria-hidden
                    className="absolute top-0 h-0.5 w-10 rounded-full bg-primary"
                  />
                )}
                <Icon aria-hidden className="size-6" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
