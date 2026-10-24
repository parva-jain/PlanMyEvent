'use client';

import { useInView } from 'motion/react';
import { UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { CheckDraw } from '@/components/motion/check-draw';
import { CountUp } from '@/components/motion/count-up';
import { LiveHighlight } from '@/components/motion/live-highlight';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { ProgressFill } from '@/components/motion/progress-fill';
import { Badge } from '@/components/ui/badge';
import { duration } from '@/lib/motion';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';

/** MOTION.md 6.2: the scripted "live" sequence starts 1 s after the card is in view. */
const SEQUENCE_START_MS = 1000;
/** Gap before the registrations count, so the two changes read as separate events. */
const COUNT_GAP_MS = duration.deliberate * 1000;

/** The demo's "before" and "after" values: a teammate ticks a task, registrations arrive. */
const REGISTRATIONS = { before: 18, after: 24 };

type Phase = 'idle' | 'ticked' | 'counted';

/**
 * Hero illustration: the DevFest Bhopal plan. Once in view, a short scripted sequence plays
 * once: Rahul ticks "Confirm badge print run" (CheckDraw + LiveHighlight), then today's
 * registrations count up. The server renders the "before" state; reduced motion jumps to
 * the "after" state. Decorative: screen readers get one summary label.
 */
export function LivePlanCard({ className }: { className?: string }) {
  const t = useTranslations('home.hero.plan');
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useShouldReduceMotion();
  const hydrated = useHydrated();
  const [phase, setPhase] = useState<Phase>('idle');
  const shownPhase: Phase = reduced ? 'counted' : phase;

  useEffect(() => {
    if (!hydrated || reduced || !inView) return;
    const tick = window.setTimeout(() => setPhase('ticked'), SEQUENCE_START_MS);
    const count = window.setTimeout(() => setPhase('counted'), SEQUENCE_START_MS + COUNT_GAP_MS);
    return () => {
      window.clearTimeout(tick);
      window.clearTimeout(count);
    };
  }, [hydrated, reduced, inView]);

  const ticked = shownPhase !== 'idle';
  const registrations = shownPhase === 'counted' ? REGISTRATIONS.after : REGISTRATIONS.before;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={t('summary')}
      className={cn(
        'rounded-dialog border border-border bg-surface p-5 shadow-raised sm:p-6',
        className,
      )}
    >
      <div aria-hidden>
        <div className="mb-5 h-1.5 rounded-full bg-event-conference" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-caption font-semibold tracking-wide text-event-conference-text uppercase">
              <span className="size-2 rounded-full bg-success" />
              {t('live')}
            </p>
            <p className="mt-1 text-h3 font-bold sm:text-h2">{t('event')}</p>
          </div>
          <Badge tone="conference">{t('dates')}</Badge>
        </div>

        <div className="mt-5 rounded-card bg-accent-tint p-4">
          <div className="mb-2 flex items-center justify-between text-small">
            <span className="text-fg-secondary">{t('milestone')}</span>
            <span className="font-semibold text-primary-text">{t('ready', { percent: 78 })}</span>
          </div>
          <ProgressFill value={78} label={t('milestone')} className="bg-surface" />
        </div>

        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-3 rounded-card border border-border px-4 py-3">
            <CheckDraw checked />
            <span className="flex-1 text-body text-fg-muted line-through">{t('taskDone')}</span>
            <span className="grid size-7 place-items-center rounded-full bg-primary-tint text-caption text-primary-text">
              {t('taskDoneBy')}
            </span>
          </li>
          <li className="rounded-card">
            <LiveHighlight
              // Reduced motion shows the end state, without replaying the change.
              highlightKey={ticked && !reduced ? 'ticked' : null}
              label={t('rahulUpdated')}
              className="rounded-card"
            >
              <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3">
                <CheckDraw checked={ticked} />
                <span
                  className={cn(
                    'flex-1 text-body transition-colors duration-(--dur-base)',
                    ticked && 'text-fg-muted line-through',
                  )}
                >
                  {t('taskDue')}
                </span>
                {/* Both badges share one grid cell, so the swap never shifts the row. */}
                <span className="grid justify-items-end">
                  <Badge
                    tone="warning"
                    className={cn('col-start-1 row-start-1', ticked && 'invisible')}
                  >
                    {t('dueToday')}
                  </Badge>
                  <Badge
                    tone="success"
                    className={cn('col-start-1 row-start-1', !ticked && 'invisible')}
                  >
                    {t('done')}
                  </Badge>
                </span>
              </div>
            </LiveHighlight>
          </li>
        </ul>

        <div className="mt-3 flex items-center gap-3 rounded-card bg-primary px-4 py-3 text-on-primary">
          <UserCheck className="size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-label">
              {t.rich('registrations', {
                count: () => <CountUp value={registrations} from={REGISTRATIONS.before} />,
              })}
            </p>
            <p className="truncate text-caption text-on-primary/80">{t('attendees')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
