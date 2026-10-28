'use client';

import { Ellipsis, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

import { useCurrentEvent } from './current-event';
import { bottomItems, eventHref, isActive, moreItems, type NavKey } from './nav';

/**
 * Phone bottom bar (DESIGN.md "Layout"): Home, Tasks, People, Budget, More. The active
 * indicator slides between tabs with the `snappy` spring; icons swap without animation
 * (MOTION.md 6.1). More stays active on the sections it lists.
 */
export function BottomNav() {
  const t = useTranslations('app.nav');
  const pathname = usePathname();
  const { eventId, membership } = useCurrentEvent();
  const { permissions } = membership;
  const tabs: { key: NavKey | 'more'; href: string; icon: LucideIcon }[] = [
    ...bottomItems(eventId, permissions),
    { key: 'more', href: eventHref(eventId, 'more'), icon: Ellipsis },
  ];
  const onMoreSection = moreItems(eventId, permissions).some((item) =>
    isActive(item.href, pathname, eventId),
  );

  return (
    <nav
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ key, href, icon: Icon }) => {
          const active =
            key === 'more'
              ? isActive(href, pathname, eventId) || onMoreSection
              : isActive(href, pathname, eventId);
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
