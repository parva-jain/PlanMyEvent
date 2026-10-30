'use client';

import {
  ACTIVITY_ENTITY_TYPES,
  utcToZonedParts,
  type ActivityItem,
  type EventModule,
} from '@pme/contracts';
import { ArrowUp, Undo2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Dialog, DialogClose } from '@/components/motion/dialog';
import { LiveHighlight } from '@/components/motion/live-highlight';
import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { Skeleton } from '@/components/motion/skeleton';
import { useCurrentEvent } from '@/components/shell/current-event';
import { canSeeSection } from '@/components/shell/nav';
import { NoAccess } from '@/components/shell/no-access';
import { Avatar } from '@/components/team/member-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useActivity, useUndo, type ActivityFilters } from '@/lib/activity';
import { ApiError } from '@/lib/api';
import { useVenues } from '@/lib/events';
import { formatEventDate } from '@/lib/format';
import { distance, duration, ease, maxStaggeredRows, stagger } from '@/lib/motion';

/** Scrolled less than this counts as "at the top": new entries slide in there. */
const TOP_PX = 80;

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * Activity (MOTION.md 6.11): every change, newest first, by day in the event's time zone,
 * with undo where it's safe. New entries from the socket slide in at the top; if the reader
 * has scrolled down nothing moves, and a "3 new changes" pill offers to go up.
 */
export function ActivityLog() {
  const t = useTranslations('activity');
  const { eventId, event, membership } = useCurrentEvent();
  const reduced = useShouldReduceMotion();
  // "Today" and "Yesterday" as of opening the page.
  const [now] = useState(() => new Date());
  const [entityType, setEntityType] = useState('');
  const [mine, setMine] = useState(false);
  const filters: ActivityFilters = {
    ...(entityType && { entityType }),
    ...(mine && { actor: membership.member.userId }),
  };
  const feed = useActivity(eventId, filters);
  const entries = feed.data?.pages.flatMap((page) => page.data) ?? [];

  // Entries newer than the first load's newest are live arrivals: they glow.
  const filterKey = JSON.stringify(filters);
  const [baseline, setBaseline] = useState<{ key: string; newestAt: string } | null>(null);
  if (feed.data && !feed.isPlaceholderData && baseline?.key !== filterKey) {
    setBaseline({ key: filterKey, newestAt: entries[0]?.createdAt ?? '' });
  }
  const isNew = (entry: ActivityItem) =>
    baseline?.key === filterKey && entry.createdAt > baseline.newestAt;

  // Scrolled down: hold the list still from the entry that was on top, and count the rest.
  const [heldFrom, setHeldFrom] = useState<string | null>(null);
  const newest = useRef<string | null>(null);
  const newestId = entries[0]?.id ?? null;
  useEffect(() => {
    newest.current = newestId;
  }, [newestId]);
  useEffect(() => {
    const onScroll = () => {
      const away = window.scrollY > TOP_PX;
      setHeldFrom((held) => (away ? (held ?? newest.current) : null));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const heldIndex = heldFrom ? entries.findIndex((entry) => entry.id === heldFrom) : -1;
  const waiting = Math.max(heldIndex, 0);
  const shown = waiting ? entries.slice(waiting) : entries;

  if (!canSeeSection('activity', membership.permissions)) {
    return <NoAccess permission="activity.view" />;
  }

  const today = utcToZonedParts(now.toISOString(), event.timeZone).date;
  const yesterday = utcToZonedParts(
    new Date(now.getTime() - 86_400_000).toISOString(),
    event.timeZone,
  ).date;
  const dayLabel = (date: string) =>
    date === today
      ? t('today')
      : date === yesterday
        ? t('yesterday')
        : formatEventDate(date, { weekday: true });

  // One flat list of day headers and entries, so both reflow together on filter changes.
  const rows: ({ kind: 'day'; date: string } | { kind: 'entry'; entry: ActivityItem })[] = [];
  let lastDate = '';
  for (const entry of shown) {
    const { date } = utcToZonedParts(entry.createdAt, event.timeZone);
    if (date !== lastDate) rows.push({ kind: 'day', date });
    lastDate = date;
    rows.push({ kind: 'entry', entry });
  }
  let entryIndex = 0;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
          <p className="text-body text-fg-secondary">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="activity-type" className="sr-only">
            {t('filters.label')}
          </label>
          <select
            id="activity-type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="h-12 rounded-control border border-border-strong bg-surface px-4 text-body text-fg focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary-tint focus-visible:outline-none lg:h-10"
          >
            <option value="">{t('filters.all')}</option>
            {ACTIVITY_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
          <Button variant="secondary" aria-pressed={mine} onClick={() => setMine(!mine)}>
            {t('filters.mine')}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {waiting > 0 && (
          <m.div
            key="new-changes"
            className="sticky top-20 z-10 -mb-4 flex justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.base, ease: ease.out }}
          >
            <Button
              size="sm"
              icon={<ArrowUp aria-hidden />}
              className="rounded-full shadow-raised"
              onClick={() => {
                setHeldFrom(null);
                window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
              }}
            >
              {t('newChanges', { count: waiting })}
            </Button>
          </m.div>
        )}
      </AnimatePresence>

      {feed.isPending && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      )}

      {feed.isError && !feed.data && (
        <Card role="alert" className="items-center gap-3 py-12 text-center">
          <p className="text-h3">{t('loadFailed')}</p>
          <Button variant="secondary" onClick={() => void feed.refetch()}>
            {t('retry')}
          </Button>
        </Card>
      )}

      {feed.data && entries.length === 0 && (
        <Card className="items-center gap-3 py-12 text-center">
          <h2 className="text-h3">{t('emptyTitle')}</h2>
          <p className="max-w-md text-body text-fg-secondary">
            {entityType || mine ? t('emptyFiltered') : t('emptyBody')}
          </p>
        </Card>
      )}

      <ListPresence className="flex flex-col gap-3" data-testid="activity">
        {rows.map((row) =>
          row.kind === 'day' ? (
            <ListItem key={`day-${row.date}`} className="pt-2 first:pt-0">
              <h2 className="text-label text-fg-secondary">{dayLabel(row.date)}</h2>
            </ListItem>
          ) : (
            <ListItem key={row.entry.id}>
              <Entry entry={row.entry} arrived={isNew(row.entry)} revealIndex={entryIndex++} />
            </ListItem>
          ),
        )}
      </ListPresence>

      {feed.hasNextPage && (
        <Button
          variant="secondary"
          className="self-center"
          loading={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
        >
          {t('loadMore')}
        </Button>
      )}
    </div>
  );
}

/** "14:05" in the event's time zone. */
function useTimeOf() {
  const { event } = useCurrentEvent();
  return (iso: string) => utcToZonedParts(iso, event.timeZone).time;
}

/** One entry: who did what, the fields it changed, and undo. */
function Entry({
  entry,
  arrived,
  revealIndex,
}: {
  entry: ActivityItem;
  /** Came in live after the page loaded: glows, and ListPresence slides it in. */
  arrived: boolean;
  /** Position on first load, for the RevealGroup-style stagger (first 8 rows). */
  revealIndex: number;
}) {
  const t = useTranslations('activity');
  const { eventId, membership } = useCurrentEvent();
  const reduced = useShouldReduceMotion();
  const timeOf = useTimeOf();
  const undo = useUndo(eventId);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Record<string, unknown> | null>(null);
  // Undone while on screen: play the strikethrough; already undone on load: show it still.
  const [undoneOnLoad] = useState(entry.undone !== null);
  const justUndone = entry.undone !== null && !undoneOnLoad;
  const changes = useChanges(entry);

  const [entityType, verb] = [entry.entityType, entry.action.split('.').at(-1) ?? ''];
  const key = t.has(`actions.${entityType}.${verb}`)
    ? (`actions.${entityType}.${verb}` as const)
    : ('actions.fallback' as const);
  const sentence = t.rich(key as 'actions.fallback', {
    actor: entry.actor.label,
    name: entry.entityLabel ?? t('something'),
    b: (chunks: ReactNode) => <strong className="font-semibold">{chunks}</strong>,
  });

  function onUndo() {
    setError(null);
    undo.mutate(entry, {
      onError: (failure) => {
        const problem = failure instanceof ApiError ? failure.problem : null;
        const reason = (problem as { reason?: string } | null)?.reason;
        if (problem?.code === 'version_conflict') {
          setBlocked((problem as { current?: Record<string, unknown> }).current ?? {});
        } else if (reason === 'already_undone') {
          setError(t('alreadyUndone'));
        } else if (reason === 'not_undoable') {
          setError(t('notUndoable'));
        } else {
          setError(t('undoFailed'));
        }
      },
    });
  }

  const delay = Math.min(revealIndex, maxStaggeredRows - 1) * stagger.list;
  const own = entry.actor.userId === membership.member.userId;
  return (
    <LiveHighlight highlightKey={arrived ? entry.id : null} source={own ? 'own' : 'others'}>
      <m.div
        data-testid="activity-entry"
        className="flex gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
        initial={arrived ? false : { opacity: 0, y: reduced ? 0 : distance.rise }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? duration.fast : duration.base, ease: ease.out, delay }}
      >
        <Avatar name={entry.actor.label} url={null} className="size-9" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <m.div
            className="flex flex-col gap-1"
            animate={{ opacity: entry.undone ? 0.6 : 1 }}
            transition={{ duration: duration.fast }}
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body">
              {entry.undoOfId && <Badge tone="info">{t('undoBadge')}</Badge>}
              <span className="relative">
                {sentence}
                {entry.undone && (
                  <m.span
                    aria-hidden
                    className="absolute inset-x-0 top-1/2 h-px origin-left bg-current"
                    initial={justUndone ? (reduced ? { opacity: 0 } : { scaleX: 0 }) : false}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{
                      duration: reduced ? duration.fast : duration.base,
                      ease: ease.out,
                    }}
                  />
                )}
              </span>
            </p>
            <p className="text-small text-fg-muted">
              <time dateTime={entry.createdAt}>{timeOf(entry.createdAt)}</time>
              {entry.channel !== 'app' && ` · ${t(`channels.${entry.channel}`)}`}
            </p>
            {changes.length > 0 && (
              <ul className="flex flex-col gap-0.5 text-small text-fg-secondary">
                {changes.map((change) => (
                  <li key={change.field}>
                    {t('change', {
                      field: change.label,
                      before: change.before,
                      after: change.after,
                    })}
                  </li>
                ))}
              </ul>
            )}
          </m.div>
          {entry.undone && (
            <m.p
              className="text-small text-fg-secondary"
              initial={justUndone ? { opacity: 0, y: reduced ? 0 : distance.rise } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? duration.fast : duration.base, ease: ease.out }}
            >
              {t('undoneBy', { name: entry.undone.byLabel, time: timeOf(entry.undone.at) })}
            </m.p>
          )}
          {error && (
            <p role="alert" className="text-small text-danger-text">
              {error}
            </p>
          )}
        </div>
        {entry.canUndo && !entry.undone && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Undo2 aria-hidden />}
            loading={undo.isPending}
            onClick={onUndo}
            aria-label={`${t('undo')}: ${entry.entityLabel ?? t(`types.${entityType}` as 'types.event')}`}
            className="self-start"
          >
            {t('undo')}
          </Button>
        )}
      </m.div>
      <UndoBlocked entry={entry} current={blocked} onClose={() => setBlocked(null)} />
    </LiveHighlight>
  );
}

/** 409 on undo: what undo would put back next to what's there now (MOTION.md 6.11: static). */
function UndoBlocked({
  entry,
  current,
  onClose,
}: {
  entry: ActivityItem;
  current: Record<string, unknown> | null;
  onClose: () => void;
}) {
  const t = useTranslations('activity');
  const format = useFormatField();
  const fields = Object.keys(entry.before ?? {}).filter((field) => t.has(`fields.${field}`));
  return (
    <Dialog
      open={current !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('blocked.title')}
      description={t('blocked.body')}
    >
      <table className="w-full text-left text-small">
        <thead className="text-fg-secondary">
          <tr>
            <th className="py-2 pr-3 font-medium">{t('blocked.field')}</th>
            <th className="py-2 pr-3 font-medium">{t('blocked.wouldRestore')}</th>
            <th className="py-2 font-medium">{t('blocked.now')}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field} className="border-t border-border">
              <th scope="row" className="py-2 pr-3 font-medium">
                {t(`fields.${field}` as 'fields.name')}
              </th>
              <td className="py-2 pr-3">{format(field, entry.before?.[field])}</td>
              <td className="py-2">{format(field, current?.[field])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <DialogClose asChild>
        <Button variant="secondary" className="self-end">
          {t('blocked.close')}
        </Button>
      </DialogClose>
    </Dialog>
  );
}

/** A stored field value as people read it: dates in the event's zone, venues by name, ₹. */
function useFormatField() {
  const t = useTranslations('activity');
  const tStatus = useTranslations('app.eventStatus');
  const { eventId, event } = useCurrentEvent();
  const { data: venues = [] } = useVenues(eventId);
  return (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return t('none');
    if (field === 'venueId') {
      return venues.find((venue) => venue.id === value)?.name ?? t('removedVenue');
    }
    if (field.endsWith('Paise')) return inr.format(Number(value) / 100);
    if ((field === 'startsAt' || field === 'endsAt') && typeof value === 'string') {
      const { date, time } = utcToZonedParts(value, event.timeZone);
      return `${formatEventDate(date)}, ${time}`;
    }
    if (
      (field === 'startsOn' || field === 'endsOn' || field === 'dueOn' || field === 'paidOn') &&
      typeof value === 'string'
    ) {
      return formatEventDate(value);
    }
    if (typeof value === 'string' && ['status', 'priority', 'paymentStatus'].includes(field)) {
      // Event statuses and task or payment values share these fields' names.
      if (t.has(`values.${value}`)) return t(`values.${value}` as 'values.todo');
      if (tStatus.has(value)) return tStatus(value as 'draft');
    }
    if (typeof value === 'boolean') return value ? t('on') : t('off');
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  };
}

interface Change {
  field: string;
  label: string;
  before: string;
  after: string;
}

/** The readable field changes of an update; creates and deletes show just the sentence. */
function useChanges(entry: ActivityItem): Change[] {
  const t = useTranslations('activity');
  const tModules = useTranslations('wizard.modules');
  const format = useFormatField();
  const { before, after } = entry;
  if (!before || !after) return [];
  // Modules are stored as the whole list: show the ones switched on or off.
  if (entry.entityType === 'event_modules') {
    const enabled = (list: unknown, module: string) =>
      Array.isArray(list) &&
      (list as EventModule[]).some((item) => item.module === module && item.enabled);
    return (Array.isArray(after) ? (after as EventModule[]) : [])
      .filter(({ module }) => enabled(before, module) !== enabled(after, module))
      .map(({ module }) => ({
        field: module,
        label: tModules.has(module) ? tModules(module as 'guests') : module,
        before: enabled(before, module) ? t('on') : t('off'),
        after: enabled(after, module) ? t('on') : t('off'),
      }));
  }
  return Object.keys(after)
    .filter((field) => t.has(`fields.${field}`))
    .map((field) => ({
      field,
      label: t(`fields.${field}` as 'fields.name'),
      before: format(field, before[field]),
      after: format(field, after[field]),
    }));
}
