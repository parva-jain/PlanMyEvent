import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { sectionIcon, type Section } from '@/components/shell/nav';
import { SectionPlaceholder } from '@/components/shell/section-placeholder';

interface Props {
  params: Promise<{ section: string }>;
}

/** Sections without their own page yet (the others have theirs). */
const PLACEHOLDERS = ['people', 'gallery'] as const;

function isPlaceholder(value: string): value is (typeof PLACEHOLDERS)[number] & Section {
  return (PLACEHOLDERS as readonly string[]).includes(value);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const t = await getTranslations('app');
  return isPlaceholder(section) ? { title: `${t(`nav.${section}`)} · ${t('brand')}` } : {};
}

/** One placeholder page per section until each is built (milestones 4–8). */
export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  if (!isPlaceholder(section)) {
    notFound();
  }
  const t = await getTranslations('app.nav');
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="text-h1-phone sm:text-h1">{t(section)}</h1>
      <SectionPlaceholder section={section} icon={sectionIcon(section)} />
    </div>
  );
}
