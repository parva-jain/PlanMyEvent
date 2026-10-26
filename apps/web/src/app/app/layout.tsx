import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { QueryProvider } from '@/components/query-provider';
import { AppSidebar } from '@/components/shell/app-sidebar';
import { BottomNav } from '@/components/shell/bottom-nav';
import { ContentFade } from '@/components/shell/content-fade';
import { CurrentEventProvider } from '@/components/shell/current-event';
import { QuickAddFab } from '@/components/shell/quick-add';
import { TopBar } from '@/components/shell/top-bar';

// Signed-in area: never indexed. Milestone 2 puts it behind sign-in.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * App shell (DESIGN.md "Layout"): sidebar or rail, top bar, content up to 1200 px, and on
 * phones a bottom bar; the floating + button on phone and tablet.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <CurrentEventProvider>
        <AppSidebar />
        <div className="min-h-dvh sm:pl-18 lg:pl-62">
          <TopBar />
          <main
            id="main"
            className="mx-auto max-w-content px-4 pt-6 pb-36 sm:pb-28 lg:px-8 lg:pt-8 lg:pb-12"
          >
            <ContentFade>{children}</ContentFade>
          </main>
        </div>
        <BottomNav />
        <QuickAddFab className="bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-6 lg:hidden" />
      </CurrentEventProvider>
    </QueryProvider>
  );
}
