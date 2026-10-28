import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Join } from '@/components/team/join';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('join');
  return { title: t('metaTitle') };
}

/** A team invite link (APIDesign: GET /v1/member-invites/{token}, then accept). */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Join token={token} />;
}
