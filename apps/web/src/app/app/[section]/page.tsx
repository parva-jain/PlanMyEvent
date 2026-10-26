import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SECTIONS, SIDEBAR_ITEMS, type Section } from '@/components/shell/nav';
import { SectionPlaceholder } from '@/components/shell/section-placeholder';

interface Props {
  params: Promise<{ section: string }>;
}

function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}

// Only the listed sections exist; anything else is a 404.
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const t = await getTranslations('app');
  return isSection(section) ? { title: `${t(`nav.${section}`)} · ${t('brand')}` } : {};
}

/** One placeholder page per event section until each is built (milestones 3–8). */
export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  if (!isSection(section)) {
    notFound();
  }
  const t = await getTranslations('app.nav');
  const item = SIDEBAR_ITEMS.find((candidate) => candidate.key === section);
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="text-h1-phone sm:text-h1">{t(section)}</h1>
      {item && <SectionPlaceholder section={section} icon={item.icon} />}
    </div>
  );
}
