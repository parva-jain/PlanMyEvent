import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { Budget } from '@/components/budget/budget';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.budget')} · ${t('brand')}` };
}

export default function BudgetPage() {
  // useSearchParams (quick add's ?add=1) needs a Suspense boundary.
  return (
    <Suspense>
      <Budget />
    </Suspense>
  );
}
