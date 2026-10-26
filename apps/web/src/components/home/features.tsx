import {
  CalendarClock,
  CheckCircle2,
  History,
  ListChecks,
  Users,
  Wallet,
  UsersRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Reveal, RevealGroup } from '@/components/motion/reveal';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { SectionHeading } from './section-heading';

/** Six feature cards, each with a small preview (MOTION.md 6.2: RevealGroup + HoverLift). */
export function Features() {
  const t = useTranslations('home.features');

  const cards: { key: string; Icon: typeof Users; tint: string; preview: ReactNode }[] = [
    {
      key: 'team',
      Icon: UsersRound,
      tint: 'bg-info-tint text-info-text',
      preview: (
        <div className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-primary text-caption text-on-primary">
            PS
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold">{t('team.previewName')}</p>
            <p className="truncate text-caption text-fg-secondary">{t('team.previewRole')}</p>
          </div>
          <Badge tone="info">{t('team.previewBadge')}</Badge>
        </div>
      ),
    },
    {
      key: 'schedule',
      Icon: CalendarClock,
      tint: 'bg-event-custom-tint text-event-custom-text',
      preview: (
        <ul className="space-y-2">
          {(['previewRow1', 'previewRow2'] as const).map((row) => (
            <li
              key={row}
              className="flex justify-between gap-3 rounded-control bg-surface-muted px-3 py-2 text-small"
            >
              <span className="font-semibold">{t(`schedule.${row}`)}</span>
              <span className="text-fg-secondary">{t(`schedule.${row}Place`)}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: 'tasks',
      Icon: ListChecks,
      tint: 'bg-success-tint text-success-text',
      preview: (
        <div className="flex items-center gap-2 rounded-control bg-surface-muted px-3 py-2.5 text-small">
          <CheckCircle2 aria-hidden className="size-4 text-success" />
          <span className="flex-1 font-semibold">{t('tasks.previewTask')}</span>
          <Badge tone="success">{t('tasks.previewBadge')}</Badge>
        </div>
      ),
    },
    {
      key: 'budget',
      Icon: Wallet,
      tint: 'bg-accent-tint text-accent-text',
      preview: (
        <div className="flex justify-between rounded-control bg-surface-muted px-3 py-2.5">
          <div>
            <p className="text-caption text-fg-secondary">{t('budget.previewSpent')}</p>
            <p className="text-label tabular-nums">₹3,45,000</p>
          </div>
          <div className="text-right">
            <p className="text-caption text-fg-secondary">{t('budget.previewLeft')}</p>
            <p className="text-label text-success-text tabular-nums">₹1,55,000</p>
          </div>
        </div>
      ),
    },
    {
      key: 'guests',
      Icon: Users,
      tint: 'bg-event-wedding-tint text-event-wedding-text',
      preview: (
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['420', 'previewAttending', 'text-success-text'],
              ['38', 'previewPending', 'text-warning-text'],
              ['12', 'previewDeclined', 'text-danger-text'],
            ] as const
          ).map(([count, label, tone]) => (
            <div key={label} className="rounded-control bg-surface-muted px-2 py-2">
              <p className={cn('text-label tabular-nums', tone)}>{count}</p>
              <p className="text-caption text-fg-secondary">{t(`guests.${label}`)}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'history',
      Icon: History,
      tint: 'bg-surface-muted text-fg-secondary',
      preview: (
        <p className="flex items-center gap-2 rounded-control bg-surface-muted px-3 py-2.5 text-small text-fg-secondary">
          <History aria-hidden className="size-4 shrink-0 text-primary-text" />
          {t('history.previewEntry')}
        </p>
      ),
    },
  ];

  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="scroll-mt-16 bg-surface-band py-16 lg:py-24"
    >
      <div className="mx-auto max-w-content px-4 lg:px-8">
        <SectionHeading
          id="features-title"
          eyebrow={t('eyebrow')}
          title={t('title')}
          body={t('body')}
        />
        <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-6">
          {cards.map(({ key, Icon, tint, preview }) => (
            <Reveal key={key} className="flex">
              <Card interactive className="flex-1">
                <span className={cn('grid size-10 place-items-center rounded-control', tint)}>
                  <Icon aria-hidden className="size-5" />
                </span>
                <div>
                  <h3 className="text-h3">{t(`${key}.title`)}</h3>
                  <p className="mt-2 text-body text-fg-secondary">{t(`${key}.body`)}</p>
                </div>
                <div className="mt-auto pt-2">{preview}</div>
              </Card>
            </Reveal>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
