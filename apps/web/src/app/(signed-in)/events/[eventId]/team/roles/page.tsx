import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { RolesList } from '@/components/team/roles';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t('team.roles.title')} · ${t('app.brand')}` };
}

export default function RolesPage() {
  return <RolesList />;
}
