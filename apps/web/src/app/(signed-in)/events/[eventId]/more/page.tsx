import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { MoreMenu } from '@/components/shell/more-menu';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.more')} · ${t('brand')}` };
}

/** Phone "More": the sections that don't fit in the bottom bar, theme and API status. */
export default function MorePage() {
  return <MoreMenu />;
}
