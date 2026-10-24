import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { EntranceDemos } from '@/components/dev/motion-demos';
import { MotionPreferenceSwitcher } from '@/components/dev/motion-preference-switcher';
import { StateDemos } from '@/components/dev/state-demos';
import { ThemeSwitcher } from '@/components/dev/theme-switcher';
import { distance, duration, ease, scale, spring, stagger } from '@/lib/motion';

const CORE = [
  'primary',
  'primary-hover',
  'primary-tint',
  'primary-text',
  'accent',
  'accent-tint',
  'accent-text',
];
const NEUTRALS = [
  'background',
  'surface',
  'surface-muted',
  'border',
  'border-strong',
  'fg',
  'fg-secondary',
  'fg-muted',
];
const STATUS = ['success', 'warning', 'danger', 'info'];
const EVENTS = ['wedding', 'conference', 'fair', 'celebration', 'custom'];
const TYPE_SCALE = [
  'text-display',
  'text-display-phone',
  'text-h1',
  'text-h1-phone',
  'text-h2',
  'text-h3',
  'text-body-lg',
  'text-body',
  'text-label',
  'text-small',
  'text-caption',
];
const RADII = [
  'rounded-control',
  'rounded-card',
  'rounded-dialog',
  'rounded-sheet',
  'rounded-full',
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h2">{title}</h2>
      {children}
    </section>
  );
}

function TokenTable({ title, rows }: { title: string; rows: (readonly [string, string])[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-label text-fg-secondary">{title}</h3>
      <dl className="divide-y divide-border rounded-card border border-border bg-surface">
        {rows.map(([name, value]) => (
          <div key={name} className="flex justify-between gap-4 px-4 py-2">
            <dt>
              <code className="text-small">{name}</code>
            </dt>
            <dd className="text-small text-fg-secondary tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-14 rounded-control border border-border"
        style={{ background: `var(--${token})` }}
      />
      <code className="text-caption text-fg-secondary">{token}</code>
    </div>
  );
}

/** Internal showcase of tokens and components; never served in production. */
export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  const t = useTranslations('devUi');

  return (
    <main className="mx-auto flex max-w-content flex-col gap-12 px-4 py-8 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
          <p className="text-fg-secondary">{t('intro')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ThemeSwitcher />
          <MotionPreferenceSwitcher />
        </div>
      </header>

      <Section title={t('colors')}>
        {(
          [
            [t('core'), CORE],
            [t('neutrals'), NEUTRALS],
          ] as const
        ).map(([label, tokens]) => (
          <div key={label} className="flex flex-col gap-2">
            <h3 className="text-label text-fg-secondary">{label}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {tokens.map((token) => (
                <Swatch key={token} token={token} />
              ))}
            </div>
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <h3 className="text-label text-fg-secondary">{t('status')}</h3>
          <div className="flex flex-wrap gap-3">
            {STATUS.map((status) => (
              <span
                key={status}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-small"
                style={{ background: `var(--${status}-tint)`, color: `var(--${status}-text)` }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: `var(--${status})` }}
                />
                {status}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-label text-fg-secondary">{t('events')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {EVENTS.map((event) => (
              <div
                key={event}
                className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
              >
                <div className="h-1.5" style={{ background: `var(--event-${event})` }} />
                <div className="p-3" style={{ background: `var(--event-${event}-tint)` }}>
                  <code className="text-caption">{event}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title={t('typography')}>
        <div className="flex flex-col gap-3">
          {TYPE_SCALE.map((style) => (
            <div key={style} className="flex flex-col gap-0.5 border-b border-border pb-3">
              <code className="text-caption text-fg-muted">{style}</code>
              <p className={`${style} tabular-nums`}>{t('typeSample')}</p>
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <code className="text-caption text-fg-muted">font-display text-display</code>
            <p className="font-display text-display">{t('typeSample')}</p>
          </div>
        </div>
      </Section>

      <Section title={t('radius')}>
        <div className="flex flex-wrap gap-4">
          {RADII.map((radius) => (
            <div key={radius} className="flex flex-col items-center gap-2">
              <div className={`size-20 border border-border-strong bg-surface-muted ${radius}`} />
              <code className="text-caption text-fg-secondary">{radius}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('shadows')}>
        <div className="flex flex-wrap gap-6">
          <div className="flex h-24 w-48 items-center justify-center rounded-card border border-border bg-surface shadow-card">
            {t('shadowCard')}
          </div>
          <div className="flex h-24 w-48 items-center justify-center rounded-card bg-surface shadow-raised">
            {t('shadowRaised')}
          </div>
        </div>
      </Section>
      <Section title={t('motionComponents')}>
        <EntranceDemos />
        <StateDemos />
      </Section>

      <Section title={t('motion')}>
        <p className="text-fg-secondary">{t('motionIntro')}</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <TokenTable
            title={t('durations')}
            rows={Object.entries(duration).map(([name, value]) => [name, `${value * 1000} ms`])}
          />
          <TokenTable
            title={t('easings')}
            rows={Object.entries(ease).map(([name, value]) => [
              name,
              `cubic-bezier(${value.join(', ')})`,
            ])}
          />
          <TokenTable
            title={t('springs')}
            rows={Object.entries(spring).map(([name, value]) => [
              name,
              `stiffness ${value.stiffness}, damping ${value.damping}`,
            ])}
          />
          <TokenTable
            title={t('distances')}
            rows={[
              ...Object.entries(distance).map(([name, value]) => [name, `${value}px`] as const),
              ...Object.entries(stagger).map(
                ([name, value]) => [`stagger.${name}`, `${value * 1000} ms`] as const,
              ),
              ['scale.press', String(scale.press)] as const,
            ]}
          />
        </div>
      </Section>
    </main>
  );
}
