import type { ReactNode } from 'react';

import { AppSidebar } from '@/components/shell/app-sidebar';
import { BottomNav } from '@/components/shell/bottom-nav';
import { ContentFade } from '@/components/shell/content-fade';
import { CurrentEventProvider } from '@/components/shell/current-event';
import { QuickAddFab } from '@/components/shell/quick-add';
import { TopBar } from '@/components/shell/top-bar';

/**
 * Event shell (DESIGN.md "Layout"): sidebar or rail, top bar, content up to 1200 px, and on
 * phones a bottom bar; the floating + button on phone and tablet.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return (
    <CurrentEventProvider eventId={eventId.toLowerCase()}>
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
  );
}
