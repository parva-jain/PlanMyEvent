import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SignInFlow } from '@/components/auth/sign-in-flow';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn');
  return { title: t('metaTitle') };
}

export default function SignInPage() {
  return <SignInFlow />;
}
