'use client';

import { CalendarDays, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { formatEventDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useCurrentEvent } from './current-event';
import { ACCENT } from './preview-events';

/** Event name, type and date under an accent bar (DESIGN.md: accents only in the event header). */
export function EventHeader() {
  const t = useTranslations('app');
  const { event } = useCurrentEvent();
  const accent = ACCENT[event.type];

  return (
    <header className="flex gap-4">
      <span aria-hidden className={cn('w-1.5 shrink-0 rounded-full', accent.bg)} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h1-phone sm:text-h1">{event.name}</h1>
          <span className={cn('rounded-full px-3 py-0.5 text-small', accent.tint, accent.text)}>
            {t(`eventTypes.${event.type}`)}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-secondary">
          <span className="flex items-center gap-1.5">
            <CalendarDays aria-hidden className="size-4" />
            {formatEventDate(event.startsOn, { weekday: true })}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin aria-hidden className="size-4" />
            {event.city}
          </span>
        </p>
      </div>
    </header>
  );
}
