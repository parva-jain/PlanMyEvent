'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { Reveal, RevealGroup } from '@/components/motion/reveal';

function Demo({
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

const SAMPLE_ROWS = ['rowOne', 'rowTwo', 'rowThree', 'rowFour'] as const;

/** Entrance and interaction patterns: Reveal, RevealGroup, Pressable, HoverLift. */
export function EntranceDemos() {
  const t = useTranslations('devUi.demos');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Demo title="Reveal" description={t('reveal')} replayable>
        {(key) => (
          <div key={key} className="flex flex-col gap-3">
            <Reveal rise="riseLarge">
              <p className="text-h2">{t('sampleHeading')}</p>
            </Reveal>
            <Reveal delay={0.15}>
              <p className="text-fg-secondary">{t('sampleBody')}</p>
            </Reveal>
          </div>
        )}
      </Demo>

      <Demo title="RevealGroup" description={t('revealGroup')} replayable>
        {(key) => (
          <RevealGroup key={key} className="grid grid-cols-2 gap-2">
            {SAMPLE_ROWS.map((row) => (
              <Reveal key={row}>
                <div className="rounded-control bg-surface-muted px-3 py-2 text-small">
                  {t(row)}
                </div>
              </Reveal>
            ))}
          </RevealGroup>
        )}
      </Demo>

      <Demo title="Pressable" description={t('pressable')}>
        {() => (
          <button
            type="button"
            className="pressable h-12 rounded-control bg-primary px-5 text-label text-on-primary transition-colors hover:bg-primary-hover lg:h-10"
          >
            {t('pressMe')}
          </button>
        )}
      </Demo>

      <Demo title="HoverLift" description={t('hoverLift')}>
        {() => (
          <div className="hover-lift max-w-64 rounded-card border border-border bg-surface p-4 shadow-card">
            <p className="text-label">{t('sampleCardTitle')}</p>
            <p className="text-small text-fg-secondary">{t('sampleCardBody')}</p>
          </div>
        )}
      </Demo>
    </div>
  );
}
