'use client';

import type { Attendance, AttendanceStatus } from '@pme/contracts';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useConfetti } from '@/components/motion/confetti';
import { CountUp } from '@/components/motion/count-up';
import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { useSnackbar } from '@/components/motion/undo-snackbar';
import { ACCENT_HEX } from '@/components/shell/accents';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { subEventName, useSubEvents } from '@/lib/events';

import { AttendanceChip } from './people-bits';

const FIRST_RESPONSES = 100;

/** Confirmed people, declined and still-waiting guests, and everyone expected. */
export function headcount(rows: readonly Attendance[]) {
  const live = rows.filter((row) => row.status !== 'cancelled');
  const sum = (items: Attendance[]) => items.reduce((total, row) => total + row.partySize, 0);
  return {
    confirmed: sum(live.filter((row) => row.status === 'confirmed' || row.status === 'checked_in')),
    declined: live.filter((row) => row.status === 'declined').length,
    waiting: live.filter((row) => row.status === 'invited').length,
    expected: sum(live.filter((row) => row.status !== 'declined')),
  };
}

/**
 * Responses (Stitch "Responses"): headcounts and every guest's answer. Per sub-event, one
 * sub-event at a time. Counts roll from old to new when answers arrive (MOTION.md 6.15).
 */
export function ResponsesTab({
  attendance,
  onOpen,
}: {
  attendance: Attendance[];
  onOpen?: (row: Attendance) => void;
}) {
  const t = useTranslations('people.responses');
  const tStatus = useTranslations('people.attendance');
  const { eventId, event } = useCurrentEvent();
  const { data: subEvents = [] } = useSubEvents(eventId);
  const perSubEvent = event.guestScope === 'per_sub_event';
  const places = subEvents.filter((item) => attendance.some((row) => row.subEventId === item.id));
  const [place, setPlace] = useState<string>('');
  const [status, setStatus] = useState<'' | AttendanceStatus>('');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(100);
  const current = perSubEvent ? place || places[0]?.id || '' : '';
  useFirstResponsesCelebration(attendance.filter((row) => row.respondedAt !== null).length);

  const inPlace = attendance.filter((row) => (perSubEvent ? row.subEventId === current : true));
  const counts = headcount(inPlace);
  const needle = query.trim().toLowerCase();
  const rows = inPlace
    .filter((row) => !status || row.status === status)
    .filter((row) => !needle || row.guestName.toLowerCase().includes(needle))
    .sort((a, b) => a.guestName.localeCompare(b.guestName));

  return (
    <div className="flex flex-col gap-4">
      {perSubEvent && places.length > 0 && (
        <Select
          aria-label={t('subEvent')}
          value={current}
          onChange={(e) => setPlace(e.target.value)}
          className="sm:w-72"
        >
          {places.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-testid="headcount">
        <Stat label={t('confirmed')} value={counts.confirmed} hint={t('people')} />
        <Stat label={t('waiting')} value={counts.waiting} hint={t('guests')} />
        <Stat label={t('declined')} value={counts.declined} hint={t('guests')} />
        <Stat label={t('expected')} value={counts.expected} hint={t('people')} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            type="search"
            aria-label={t('search')}
            placeholder={t('search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 lg:h-10"
          />
        </div>
        <Select
          size="sm"
          aria-label={t('status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="sm:w-auto"
        >
          <option value="">{t('anyStatus')}</option>
          {(['invited', 'confirmed', 'declined', 'cancelled'] as const).map((item) => (
            <option key={item} value={item}>
              {tStatus(item)}
            </option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-body text-fg-secondary">
          {inPlace.length === 0 ? t('empty') : t('noMatches')}
        </p>
      ) : (
        <ListPresence className="flex flex-col gap-2" data-testid="responses">
          {rows.slice(0, shown).map((row) => (
            <ListItem key={row.id}>
              <ResponseLine row={row} onOpen={onOpen && (() => onOpen(row))} />
            </ListItem>
          ))}
        </ListPresence>
      )}
      {rows.length > shown && (
        <Button variant="secondary" className="self-center" onClick={() => setShown(shown + 100)}>
          {t('showMore', { count: rows.length - shown })}
        </Button>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="gap-1">
      <span className="text-small text-fg-secondary">{label}</span>
      <CountUp value={value} className="text-h2 tabular-nums" />
      <span className="text-small text-fg-muted">{hint}</span>
    </Card>
  );
}

function ResponseLine({ row, onOpen }: { row: Attendance; onOpen?: () => void }) {
  const t = useTranslations('people.responses');
  const { eventId } = useCurrentEvent();
  const { data: subEvents } = useSubEvents(eventId);
  const name = <span className="truncate text-label">{row.guestName}</span>;
  const where = row.subEventId ? subEventName(subEvents, row.subEventId).name : null;
  return (
    <LiveRow entityId={row.id} className="rounded-card">
      <div
        className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
        data-testid="response-row"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {onOpen ? (
            <button type="button" onClick={onOpen} className="text-left hover:text-primary-text">
              {name}
            </button>
          ) : (
            name
          )}
          <span className="text-small text-fg-secondary">
            {[
              where,
              row.respondedAt ? t('answered', { when: new Date(row.respondedAt) }) : t('noAnswer'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <span className="text-small tabular-nums text-fg-secondary">
          {t('party', { count: row.partySize })}
        </span>
        <AttendanceChip status={row.status} />
      </div>
    </LiveRow>
  );
}

/** The 100th answer: one Confetti burst and a toast, once per event (MOTION.md 6.15). */
function useFirstResponsesCelebration(responded: number) {
  const t = useTranslations('people.responses');
  const { eventId, event } = useCurrentEvent();
  const confetti = useConfetti();
  const show = useSnackbar();
  const previous = useRef<number | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = responded;
    if (before !== null && before < FIRST_RESPONSES && responded >= FIRST_RESPONSES) {
      void confetti({ accent: ACCENT_HEX[event.type], onceKey: `responses-100:${eventId}` });
      show({ message: t('hundred') });
    }
  }, [responded, confetti, show, t, eventId, event.type]);
}
