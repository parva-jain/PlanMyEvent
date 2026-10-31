import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { InvitePage } from '@/components/invite/invite-page';

interface Props {
  params: Promise<{ token: string }>;
}

// The title stays generic: the page is rendered in the browser from the API, per guest.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t('invite.pageTitle')} · ${t('app.brand')}` };
}

export default async function GuestInvitePage({ params }: Props) {
  const { token } = await params;
  return <InvitePage token={token} />;
}
