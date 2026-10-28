import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Team } from '@/components/team/team';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.team')} · ${t('brand')}` };
}

export default function TeamPage() {
  return <Team />;
}
