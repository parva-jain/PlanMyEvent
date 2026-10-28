import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { RoleEditorPage } from '@/components/team/roles';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t('team.roles.title')} · ${t('app.brand')}` };
}

/** `new` creates a role; otherwise the role's id. */
export default async function RolePage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  return <RoleEditorPage roleId={roleId} />;
}
