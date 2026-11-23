'use client';

import { m } from 'motion/react';
import { useTranslations } from 'next-intl';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { duration, ease, stagger } from '@/lib/motion';

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const fullFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/**
 * People registered per day, one series, so no legend (the card's title names it). Bars rise
 * from the baseline like ProgressFill (600 ms `out`, staggered by `list`); each shows its count
 * on hover or focus, and a visually hidden table gives the same numbers to screen readers.
 */
export function RegistrationsChart({ days }: { days: { date: string; count: number }[] }) {
  const t = useTranslations('dashboard.registrations');
  const reduced = useShouldReduceMotion();
  const max = Math.max(1, ...days.map((day) => day.count));
  const last = days.length - 1;

  return (
    <figure className="flex flex-col gap-2">
      <div aria-hidden className="flex h-32 items-end gap-0.5 border-b border-border">
        {days.map((day, index) => (
          <div
            key={day.date}
            className="group relative flex h-full flex-1 items-end justify-center"
          >
            <m.div
              className={
                index === last
                  ? 'w-full max-w-10 origin-bottom rounded-t bg-accent'
                  : 'w-full max-w-10 origin-bottom rounded-t bg-accent/45'
              }
              style={{ height: `${Math.max((day.count / max) * 100, day.count ? 4 : 0)}%` }}
              initial={{ scaleY: reduced ? 1 : 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: duration.deliberate, ease: ease.out, delay: index * stagger.list }
              }
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-control bg-fg px-2 py-0.5 text-caption whitespace-nowrap text-background opacity-0 transition-opacity group-hover:opacity-100">
              {t('day', { count: day.count })}
            </span>
          </div>
        ))}
      </div>
      <div aria-hidden className="flex gap-0.5">
        {days.map((day, index) => (
          <span
            key={day.date}
            className={
              index === last
                ? 'flex-1 text-center text-caption font-semibold text-fg'
                : 'flex-1 text-center text-caption text-fg-muted'
            }
          >
            {dayFormat.format(new Date(day.date))}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t('tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('date')}</th>
            <th scope="col">{t('people')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{fullFormat.format(new Date(day.date))}</td>
              <td>{day.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
