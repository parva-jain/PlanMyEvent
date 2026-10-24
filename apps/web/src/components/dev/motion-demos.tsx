'use client';

import { useTranslations } from 'next-intl';

import { Reveal, RevealGroup } from '@/components/motion/reveal';

import { Demo } from './demo';

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
