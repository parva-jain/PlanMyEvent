'use client';

import type { Event } from '@pme/contracts';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Sheet } from '@/components/motion/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMyEvents } from '@/lib/events';
import { formatEventDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useCurrentEvent } from './current-event';
import { ACCENT } from './accents';
import { eventHref, NEW_EVENT_HREF, sectionOf } from './nav';

function EventDot({ type }: { type: Event['type'] }) {
  return <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', ACCENT[type].bg)} />;
}

/**
 * The list inside both the popover and the sheet. Choosing an event keeps the current
 * section (Schedule stays Schedule), and the content crossfades (MOTION.md 6.9).
 */
function EventList({ onChosen }: { onChosen: () => void }) {
  const t = useTranslations('app.switcher');
  const tTypes = useTranslations('app.eventTypes');
  const router = useRouter();
  const pathname = usePathname();
  const { event: current } = useCurrentEvent();
  const { data: events = [current] } = useMyEvents();

  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 pt-1 pb-1 text-caption text-fg-muted">{t('yourEvents')}</p>
      <ul className="flex flex-col gap-1">
        {events.map((event) => {
          const selected = event.id === current.id;
          return (
            <li key={event.id}>
              <button
                type="button"
                aria-current={selected || undefined}
                onClick={() => {
                  onChosen();
                  if (!selected) router.push(eventHref(event.id, sectionOf(pathname)));
                }}
                className={cn(
                  'flex min-h-12 w-full items-center gap-3 rounded-control px-3 py-2 text-left',
                  'transition-colors duration-(--dur-fast) hover:bg-surface-muted',
                  selected && 'bg-primary-tint',
                )}
              >
                <EventDot type={event.type} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-label">{event.name}</span>
                  <span className="truncate text-caption text-fg-muted">
                    {tTypes(event.type)} · {formatEventDate(event.startsOn)}
                  </span>
                </span>
                {selected && <Check aria-hidden className="size-5 text-primary-text" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 border-t border-border pt-1">
        <Link
          href={NEW_EVENT_HREF}
          onClick={onChosen}
          className="flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-label text-primary-text transition-colors duration-(--dur-fast) hover:bg-surface-muted"
        >
          <Plus aria-hidden className="size-5" />
          {t('create')}
        </Link>
      </div>
    </div>
  );
}

function TriggerLabel({ compact }: { compact: boolean }) {
  const t = useTranslations('app.switcher');
  const { event } = useCurrentEvent();
  return (
    <>
      <EventDot type={event.type} />
      <span className={cn('truncate text-label', compact ? 'max-w-48' : 'flex-1 text-left')}>
        {event.name}
      </span>
      <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-fg-muted" />
      <span className="sr-only">{t('change')}</span>
    </>
  );
}

const triggerClasses =
  'pressable flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-3 transition-colors duration-(--dur-fast) hover:bg-surface-muted';

/** Desktop: popover under the sidebar trigger (MOTION.md 6.1). */
export function EventSwitcherPopover() {
  const t = useTranslations('app.switcher');
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(triggerClasses, 'w-full')} data-testid="event-switcher">
        <TriggerLabel compact={false} />
      </PopoverTrigger>
      <PopoverContent aria-label={t('title')} className="w-80">
        <EventList onChosen={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Phone and tablet: bottom sheet from the top-bar trigger (MOTION.md 6.9). */
export function EventSwitcherSheet() {
  const t = useTranslations('app.switcher');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={triggerClasses}
        data-testid="event-switcher"
      >
        <TriggerLabel compact />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={t('title')}>
        <EventList onChosen={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
