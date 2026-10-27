import { LayoutGrid } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { EventHeader } from '@/components/shell/event-header';
import { SectionPlaceholder } from '@/components/shell/section-placeholder';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.home')} · ${t('brand')}` };
}

/** Event home; the dashboard (MOTION.md 6.5) arrives in milestone 8. */
export default function EventHomePage() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <EventHeader />
      <SectionPlaceholder section="home" icon={LayoutGrid} />
    </div>
  );
}
