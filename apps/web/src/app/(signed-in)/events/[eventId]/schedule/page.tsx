import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { Schedule } from '@/components/events/schedule';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.schedule')} · ${t('brand')}` };
}

export default function SchedulePage() {
  // useSearchParams (quick add's ?add=1) needs a Suspense boundary.
  return (
    <Suspense>
      <Schedule />
    </Suspense>
  );
}
