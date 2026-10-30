import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { Tasks } from '@/components/tasks/tasks';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.tasks')} · ${t('brand')}` };
}

export default function TasksPage() {
  // useSearchParams (?task=…, quick add's ?add=1) needs a Suspense boundary.
  return (
    <Suspense>
      <Tasks />
    </Suspense>
  );
}
