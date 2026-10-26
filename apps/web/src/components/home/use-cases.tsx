'use client';

import { Check, GraduationCap, Heart, Mic, Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type CSSProperties } from 'react';

import { Reveal } from '@/components/motion/reveal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CASES = [
  { key: 'weddings', accent: 'wedding', Icon: Heart, progress: 84 },
  { key: 'conferences', accent: 'conference', Icon: Mic, progress: 79 },
  { key: 'collegeFests', accent: 'custom', Icon: GraduationCap, progress: 80 },
  { key: 'fairs', accent: 'fair', Icon: Store, progress: 65 },
] as const;

type CaseKey = (typeof CASES)[number]['key'];

/**
 * "Made for your kind of event" (MOTION.md 6.2): the tab pill slides (`snappy`), the preview
 * crossfades (`base`) and the event accent colour transitions (`fast`). The accent lives in
 * registered CSS variables on the panel (`.case-accent` in motion.css), so the variables
 * themselves animate and freshly mounted tab content inherits the in-between colour.
 */
export function UseCases() {
  const t = useTranslations('home.useCases');
  const [active, setActive] = useState<CaseKey>('conferences');
  const current = CASES.find((c) => c.key === active) ?? CASES[1];

  const accentStyle = {
    '--case': `var(--event-${current.accent})`,
    '--case-tint': `var(--event-${current.accent}-tint)`,
    '--case-text': `var(--event-${current.accent}-text)`,
  } as CSSProperties;

  return (
    <section
      id="use-cases"
      aria-labelledby="use-cases-title"
      className="scroll-mt-16 py-16 lg:py-24"
    >
      <div className="mx-auto max-w-content px-4 lg:px-8">
        <Tabs
          value={active}
          onValueChange={(value) => setActive(value as CaseKey)}
          className="gap-8"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <Reveal rise="riseLarge">
              <p className="text-caption font-semibold tracking-wide text-primary-text uppercase">
                {t('eyebrow')}
              </p>
              <h2 id="use-cases-title" className="mt-3 text-h1-phone sm:text-h1">
                {t('title')}
              </h2>
            </Reveal>
            <TabsList aria-label={t('tabsLabel')}>
              {CASES.map(({ key }) => (
                <TabsTrigger key={key} value={key}>
                  {t(`${key}.tab`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div
            style={accentStyle}
            className="case-accent rounded-dialog border border-border bg-surface p-5 shadow-card sm:p-8"
          >
            {CASES.map(({ key, Icon, progress }) => (
              <TabsContent key={key} value={key}>
                <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
                  <div>
                    <div className="flex items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-control bg-(--case-tint) text-(--case-text)">
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <div>
                        <h3 className="text-h2">{t(`${key}.title`)}</h3>
                        <p className="text-small text-fg-secondary">{t(`${key}.subtitle`)}</p>
                      </div>
                    </div>
                    <p className="mt-5 text-body text-fg-secondary">{t(`${key}.body`)}</p>
                    <ul className="mt-5 space-y-3">
                      {(['point1', 'point2', 'point3'] as const).map((point) => (
                        <li key={point} className="flex items-center gap-3 text-body">
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success-tint text-success-text">
                            <Check aria-hidden className="size-3.5" />
                          </span>
                          {t(`${key}.${point}`)}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div
                    aria-hidden
                    className="rounded-card border border-border bg-surface-muted p-4 sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-caption font-semibold tracking-wide text-fg-secondary uppercase">
                          {t(`${key}.metricLabel`)}
                        </p>
                        <p className="mt-1 text-h3 tabular-nums">{t(`${key}.metric`)}</p>
                      </div>
                      <span className="rounded-full bg-(--case-tint) px-2.5 py-0.5 text-small text-(--case-text)">
                        {t(`${key}.status`)}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-(--case)"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {(['card1', 'card2'] as const).map((card) => (
                        <div key={card} className="rounded-control bg-surface p-3">
                          <p className="text-caption text-fg-secondary uppercase">
                            {t(`${key}.${card}Label`)}
                          </p>
                          <p className="mt-1 text-small font-semibold">
                            {t(`${key}.${card}Title`)}
                          </p>
                          <p className="mt-1 text-caption text-(--case-text)">
                            {t(`${key}.${card}Detail`)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 flex items-center justify-between gap-3 rounded-control bg-surface p-3 text-small">
                      <span>{t(`${key}.activity`)}</span>
                      <span className="shrink-0 text-caption text-fg-muted">
                        {t(`${key}.activityTime`)}
                      </span>
                    </p>
                  </div>
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </section>
  );
}
