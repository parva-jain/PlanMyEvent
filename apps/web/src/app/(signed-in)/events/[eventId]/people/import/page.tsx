import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ImportWizard } from '@/components/people/import-wizard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t('people.import.title')} · ${t('app.brand')}` };
}

export default function ImportGuestsPage() {
  return <ImportWizard />;
}
