'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

/** Frame for one /dev/ui demo; `replayable` remounts the content to replay entrances. */
export function Demo({
  title,
  description,
  replayable = false,
  children,
}: {
  title: string;
  description: string;
  replayable?: boolean;
  children: (replayKey: number) => ReactNode;
}) {
  const t = useTranslations('devUi');
  const [replayKey, setReplayKey] = useState(0);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-h3">{title}</h3>
          <p className="text-small text-fg-secondary">{description}</p>
        </div>
        {replayable && (
          <button
            type="button"
            onClick={() => setReplayKey((key) => key + 1)}
            className="pressable shrink-0 rounded-control border border-border px-3 py-1.5 text-small hover:bg-surface-muted"
          >
            {t('replay')}
          </button>
        )}
      </div>
      <div className="min-h-24">{children(replayKey)}</div>
    </div>
  );
}
