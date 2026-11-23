import type { PublicEvent } from '@pme/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';

import { PublicEventPage } from '@/components/public-event/public-event-page';
import { QueryProvider } from '@/components/query-provider';
import { apiUrl } from '@/lib/api';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * GET /v1/public/events/{slug}, on the server: kept 60 s like the API's own cache header
 * (APIDesign "CDN cached 60 s"); after a registration is refused for capacity the form asks for
 * a fresh render. Null for 404 (draft, archived, unknown, or nothing public).
 */
const loadEvent = cache(async (slug: string): Promise<PublicEvent | null> => {
  const res = await fetch(apiUrl(`/v1/public/events/${encodeURIComponent(slug)}`), {
    headers: { Accept: 'application/json' },
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Public event page failed with ${res.status}`);
  return (await res.json()) as PublicEvent;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations('app');
  const page = await loadEvent(slug.toLowerCase());
  if (!page) return { title: t('brand'), robots: { index: false } };
  return {
    title: `${page.event.name} · ${t('brand')}`,
    description: page.event.description ?? undefined,
    openGraph: { title: page.event.name, description: page.event.description ?? undefined },
  };
}

/** An event's public page and registration form (APIDesign "Public endpoints"). */
export default async function EventPublicPage({ params }: Props) {
  const { slug } = await params;
  const page = await loadEvent(slug.toLowerCase());
  if (!page) notFound();
  return (
    <QueryProvider>
      <PublicEventPage page={page} />
    </QueryProvider>
  );
}
