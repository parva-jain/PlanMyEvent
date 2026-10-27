import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { MyEvents } from '@/components/events/my-events';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('myEvents.title')} · ${t('brand')}` };
}

export default function MyEventsPage() {
  return <MyEvents />;
}
