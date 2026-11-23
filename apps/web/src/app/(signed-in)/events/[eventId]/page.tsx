import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Dashboard } from '@/components/dashboard/dashboard';
import { CardsToDeliverLink } from '@/components/people/cards-to-deliver-link';
import { EventHeader } from '@/components/shell/event-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.home')} · ${t('brand')}` };
}

/** Event home: the dashboard (MOTION.md 6.5). */
export default function EventHomePage() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <EventHeader />
      <CardsToDeliverLink />
      <Dashboard />
    </div>
  );
}
