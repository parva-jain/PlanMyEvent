import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { WelcomeForm } from '@/components/auth/welcome-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.welcome');
  return { title: t('metaTitle') };
}

export default function WelcomePage() {
  return <WelcomeForm />;
}
