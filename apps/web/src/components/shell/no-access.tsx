import type { Permission } from '@pme/contracts';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card } from '@/components/ui/card';

/**
 * A section opened by URL that my roles don't cover (the nav doesn't show it). Says what to
 * ask for, like the API's 403 (APIDesign "404 or 403").
 */
export function NoAccess({ permission }: { permission: Permission }) {
  const t = useTranslations('app.noAccess');
  const tPermission = useTranslations('team.permissions');
  return (
    <Card role="alert" className="items-center gap-3 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted">
        <Lock aria-hidden className="size-6 text-fg-secondary" />
      </span>
      <h1 className="text-h3">{t('title')}</h1>
      <p className="max-w-md text-body text-fg-secondary">
        {t('body', { permission: tPermission(`${permission}.label`) })}
      </p>
    </Card>
  );
}
