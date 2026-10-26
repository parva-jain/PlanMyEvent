import type { LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Card } from '@/components/ui/card';

/** Empty state for a section that isn't built yet (DESIGN.md "Empty states"). */
export async function SectionPlaceholder({
  section,
  icon: Icon,
}: {
  section: string;
  icon: LucideIcon;
}) {
  const t = await getTranslations('app.sections');
  return (
    <Card className="items-center gap-3 py-12 text-center sm:py-16">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-tint text-primary-text">
        <Icon aria-hidden className="size-7" />
      </span>
      <h2 className="text-h3">{t(`${section}.headline`)}</h2>
      <p className="max-w-md text-body text-fg-secondary">{t(`${section}.body`)}</p>
    </Card>
  );
}
