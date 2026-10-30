'use client';

import { CalendarPlus, ListPlus, Plus, ReceiptIndianRupee, UserPlus } from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Sheet } from '@/components/motion/sheet';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

import { useCurrentEvent } from './current-event';
import { eventHref } from './nav';

/**
 * Sessions, tasks and expenses open their form straight away; guests open their section
 * until its create form exists (milestone 7).
 */
const ACTIONS = [
  {
    key: 'session',
    section: 'schedule',
    query: '?add=1',
    icon: CalendarPlus,
    permission: 'subevents.edit',
  },
  { key: 'task', section: 'tasks', query: '?add=1', icon: ListPlus, permission: 'tasks.edit' },
  {
    key: 'expense',
    section: 'budget',
    query: '?add=1',
    icon: ReceiptIndianRupee,
    permission: 'budget.edit',
  },
  { key: 'guest', section: 'people', query: '', icon: UserPlus, permission: 'guests.edit' },
] as const;

/** The quick-add actions I can use; adding is event-wide, so whole-event grants only. */
export function useQuickAddActions() {
  const { can } = useCurrentEvent();
  return ACTIONS.filter((action) => can(action.permission));
}

function ActionList({ onChosen }: { onChosen: () => void }) {
  const t = useTranslations('app.quickAdd');
  const { eventId } = useCurrentEvent();
  return (
    <ul className="flex flex-col gap-1">
      {useQuickAddActions().map(({ key, section, query, icon: Icon }) => (
        <li key={key}>
          <Link
            href={`${eventHref(eventId, section)}${query}`}
            onClick={onChosen}
            className="flex min-h-12 items-center gap-3 rounded-control px-3 text-label transition-colors duration-(--dur-fast) hover:bg-surface-muted"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary-tint text-primary-text">
              <Icon aria-hidden className="size-5" />
            </span>
            {t(key)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Desktop: "+ Add" in the top bar (DESIGN.md "Quick add"). */
export function QuickAddButton() {
  const t = useTranslations('app.quickAdd');
  const [open, setOpen] = useState(false);
  if (!useQuickAddActions().length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" icon={<Plus aria-hidden />}>
          {t('add')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={t('title')} className="w-64">
        <ActionList onChosen={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Phone and tablet: floating + button, bottom right (MOTION.md 6.1: press scale; rotates 45°
 * as the quick-add sheet opens). MotionConfig turns the rotation off with reduced motion.
 */
export function QuickAddFab({ className }: { className?: string }) {
  const t = useTranslations('app.quickAdd');
  const [open, setOpen] = useState(false);
  if (!useQuickAddActions().length) return null;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t('title')}
        onClick={() => setOpen(true)}
        className={cn(
          'pressable fixed right-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-raised hover:bg-primary-hover',
          className,
        )}
      >
        <m.span animate={{ rotate: open ? 45 : 0 }} transition={spring.snappy} className="flex">
          <Plus aria-hidden className="size-6" />
        </m.span>
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={t('title')}>
        <ActionList onChosen={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
