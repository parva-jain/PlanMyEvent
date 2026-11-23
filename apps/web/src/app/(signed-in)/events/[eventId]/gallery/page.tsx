import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Gallery } from '@/components/gallery/gallery';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: `${t('nav.gallery')} · ${t('brand')}` };
}

export default function GalleryPage() {
  return <Gallery />;
}
