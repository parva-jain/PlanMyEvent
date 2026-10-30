import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ActivityLog } from '@/components/activity/activity-log';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.activity')} · ${t('brand')}` };
}

export default function ActivityPage() {
  return <ActivityLog />;
}
