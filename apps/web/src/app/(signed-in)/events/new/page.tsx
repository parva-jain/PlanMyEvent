import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CreateEventWizard } from '@/components/events/create-event-wizard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('wizard');
  return { title: `${t('title')} · ${t('brand')}` };
}

export default function NewEventPage() {
  return <CreateEventWizard />;
}
