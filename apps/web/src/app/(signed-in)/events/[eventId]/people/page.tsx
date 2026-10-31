import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { People } from '@/components/people/people';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.people')} · ${t('brand')}` };
}

export default function PeoplePage() {
  // useSearchParams (quick add's ?add=1) needs a Suspense boundary.
  return (
    <Suspense>
      <People />
    </Suspense>
  );
}
