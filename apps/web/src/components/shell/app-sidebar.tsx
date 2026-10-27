'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { LogoMark } from '@/components/motion/logo-mark';
import { useMe } from '@/lib/me';
import { cn } from '@/lib/utils';

import { useCurrentEvent } from './current-event';
import { EventSwitcherPopover } from './event-switcher';
import { isActive, MY_EVENTS_HREF, sidebarItems } from './nav';
import { StatusWidget } from './status-widget';
import { ThemeToggle } from './theme-toggle';

/**
 * DESIGN.md "Layout": icon rail on tablet (640–1024), 248 px sidebar with the event
 * switcher on desktop. Hidden on phones, which use the bottom bar.
 */
export function AppSidebar() {
  const t = useTranslations('app');
  const pathname = usePathname();
  const { data: me } = useMe();
  const { eventId } = useCurrentEvent();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-18 flex-col border-r border-border bg-surface sm:flex lg:w-62">
      <Link
        href={MY_EVENTS_HREF}
        title={t('myEvents.title')}
        className="flex h-16 shrink-0 items-center justify-center gap-2 border-b border-border lg:justify-start lg:px-4"
      >
        <LogoMark size={32} />
        <span className="hidden text-h3 font-bold lg:inline">{t('brand')}</span>
        <span className="sr-only lg:hidden">{t('brand')}</span>
      </Link>

      <div className="hidden px-3 pt-3 lg:block">
        <EventSwitcherPopover />
      </div>

      <nav aria-label={t('nav.label')} className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="flex flex-col gap-1">
          {sidebarItems(eventId).map(({ key, href, icon: Icon }) => {
            const active = isActive(href, pathname, eventId);
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  title={t(`nav.${key}`)}
                  className={cn(
                    'flex h-12 items-center justify-center gap-3 rounded-control text-body text-fg-secondary lg:justify-start lg:px-3',
                    'transition-colors duration-(--dur-fast) hover:bg-surface-muted hover:text-fg',
                    active &&
                      'bg-primary-tint font-semibold text-primary-text hover:bg-primary-tint hover:text-primary-text',
                  )}
                >
                  <Icon aria-hidden className="size-6 shrink-0 lg:size-5" />
                  <span className="sr-only lg:not-sr-only">{t(`nav.${key}`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col items-center gap-3 border-t border-border p-3 lg:items-stretch">
        <StatusWidget compact className="lg:hidden" />
        <StatusWidget className="hidden lg:flex" />
        <ThemeToggle className="hidden lg:inline-flex lg:self-start" />
        {me && (
          <div className="hidden min-w-0 flex-col lg:flex" data-testid="signed-in-user">
            <span className="truncate text-label">{me.user.name}</span>
            <span className="truncate text-caption text-fg-muted">{me.user.email}</span>
          </div>
        )}
        <SignOutButton compact className="w-11 lg:hidden" />
        <SignOutButton className="hidden lg:flex" />
      </div>
    </aside>
  );
}
