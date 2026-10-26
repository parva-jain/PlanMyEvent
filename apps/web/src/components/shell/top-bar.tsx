'use client';

import { useTranslations } from 'next-intl';

import { EventSwitcherSheet } from './event-switcher';
import { QuickAddButton } from './quick-add';
import { StatusWidget } from './status-widget';

/**
 * Phone and tablet: event switcher (the sidebar holds it on desktop); phone also shows the API
 * status dot (the rail shows it on tablet).
 * Desktop: status and the "+ Add" button (DESIGN.md "Quick add").
 */
export function TopBar() {
  const t = useTranslations('app');
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md lg:px-8">
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-4 py-2 text-label focus:not-sr-only focus:absolute focus:top-3 focus:left-4"
      >
        {t('skipToContent')}
      </a>
      <div className="min-w-0 lg:hidden">
        <EventSwitcherSheet />
      </div>
      <div className="ml-auto flex items-center gap-4">
        <StatusWidget compact className="sm:hidden" />
        <div className="hidden lg:block">
          <QuickAddButton />
        </div>
      </div>
    </header>
  );
}
