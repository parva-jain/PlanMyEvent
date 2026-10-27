import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { EventSettings } from '@/components/events/event-settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.settings')} · ${t('brand')}` };
}

export default function SettingsPage() {
  return <EventSettings />;
}
