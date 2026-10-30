'use client';

import { utcToZonedParts, zonedTimeToUtc, type SubEvent, type Venue } from '@pme/contracts';
import { CalendarPlus, Clock, MapPin, Plus, Trash2, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { EditPanel } from '@/components/motion/side-panel';
import { Skeleton } from '@/components/motion/skeleton';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { useOfferUndo } from '@/components/shell/use-offer-undo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import {
  useCreateVenue,
  useDeleteSubEvent,
  useDeleteVenue,
  useSaveSubEvent,
  useSubEvents,
  useVenues,
} from '@/lib/events';
import { formatEventDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The server's answer to a stale If-Match: 409 with the row as it is now. */
function conflictCurrent<T>(error: unknown): T | null {
  return error instanceof ApiError && error.problem?.code === 'version_conflict'
    ? ((error.problem as { current?: T }).current ?? null)
    : null;
}

/**
 * Schedule (Stitch "Schedule"): sub-events by day in the event's own time zone, and its
 * venues. Edits open a side panel on desktop and a sheet on phone (MOTION.md 6.7).
 */
export function Schedule() {
  const t = useTranslations('schedule');
  const { eventId, event, can } = useCurrentEvent();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: subEvents } = useSubEvents(eventId);
  const { data: venues = [] } = useVenues(eventId);
  const [chosen, setChosen] = useState<SubEvent | 'new' | null>(null);
  // Quick add's "Session" lands here with ?add=1, which opens a new sub-event.
  const editing = searchParams.get('add') === '1' ? 'new' : chosen;
  const setEditing = (next: SubEvent | 'new' | null) => {
    setChosen(next);
    if (searchParams.has('add')) router.replace(`/events/${eventId}/schedule`, { scroll: false });
  };

  const days = new Map<string, SubEvent[]>();
  for (const subEvent of subEvents ?? []) {
    const { date } = utcToZonedParts(subEvent.startsAt, event.timeZone);
    days.set(date, [...(days.get(date) ?? []), subEvent]);
  }
  const venueName = (id: string | null) => venues.find((venue) => venue.id === id)?.name;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
          <p className="text-body text-fg-secondary">
            {t('summary', { count: subEvents?.length ?? 0, timeZone: event.timeZone })}
          </p>
        </div>
        {can('subevents.edit') && (
          <Button icon={<CalendarPlus aria-hidden />} onClick={() => setEditing('new')}>
            {t('add')}
          </Button>
        )}
      </div>

      {!subEvents && <Skeleton className="h-48" />}

      {subEvents?.length === 0 && (
        <Card className="items-center gap-3 py-12 text-center">
          <h2 className="text-h3">{t('emptyTitle')}</h2>
          <p className="max-w-md text-body text-fg-secondary">{t('emptyBody')}</p>
        </Card>
      )}

      {[...days].map(([date, items]) => (
        <section
          key={date}
          className="flex flex-col gap-3"
          aria-label={formatEventDate(date, { weekday: true })}
        >
          <h2 className="text-label text-fg-secondary">
            {formatEventDate(date, { weekday: true })}
          </h2>
          <ListPresence className="flex flex-col gap-3">
            {items.map((subEvent) => {
              const start = utcToZonedParts(subEvent.startsAt, event.timeZone);
              const end = utcToZonedParts(subEvent.endsAt, event.timeZone);
              const venue = venueName(subEvent.venueId);
              // Only sub-events I can edit open the form; the rest are plain rows.
              const editable = can('subevents.edit', subEvent.id);
              const Row = editable ? 'button' : 'div';
              return (
                <ListItem key={subEvent.id}>
                  <LiveRow entityId={subEvent.id} className="rounded-card">
                    <Row
                      {...(editable ? { type: 'button', onClick: () => setEditing(subEvent) } : {})}
                      data-testid="sub-event"
                      className={cn(
                        'flex w-full flex-col gap-2 rounded-card border border-border bg-surface p-4 text-left shadow-card sm:flex-row sm:items-center sm:gap-6',
                        editable && 'hover-lift',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-label tabular-nums sm:w-36">
                        <Clock aria-hidden className="size-4 text-fg-muted" />
                        {start.time}–{end.time}
                        {end.date !== start.date && (
                          <span className="text-caption text-fg-muted"> +1</span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-h3">{subEvent.name}</span>
                        <span className="flex flex-wrap gap-x-4 gap-y-1 text-small text-fg-secondary">
                          {venue && (
                            <span className="flex items-center gap-1.5">
                              <MapPin aria-hidden className="size-4" />
                              {venue}
                            </span>
                          )}
                          {subEvent.capacity !== null && (
                            <span className="flex items-center gap-1.5">
                              <Users aria-hidden className="size-4" />
                              {t('capacity', { count: subEvent.capacity })}
                            </span>
                          )}
                        </span>
                      </span>
                    </Row>
                  </LiveRow>
                </ListItem>
              );
            })}
          </ListPresence>
        </section>
      ))}

      <Venues venues={venues} editable={can('subevents.edit')} />

      <EditPanel
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? t('newTitle') : t('editTitle')}
      >
        {editing !== null && (
          <SubEventForm
            key={editing === 'new' ? 'new' : `${editing.id}-${editing.version}`}
            subEvent={editing === 'new' ? null : editing}
            venues={venues}
            onDone={() => setEditing(null)}
            onConflict={(current) => setEditing(current)}
          />
        )}
      </EditPanel>
    </div>
  );
}

interface FormState {
  name: string;
  date: string;
  start: string;
  end: string;
  venueId: string;
  capacity: string;
  notes: string;
}

function SubEventForm({
  subEvent,
  venues,
  onDone,
  onConflict,
}: {
  subEvent: SubEvent | null;
  venues: Venue[];
  onDone: () => void;
  onConflict: (current: SubEvent) => void;
}) {
  const t = useTranslations('schedule.form');
  const tSchedule = useTranslations('schedule');
  const { eventId, event } = useCurrentEvent();
  const save = useSaveSubEvent(eventId);
  const remove = useDeleteSubEvent(eventId);
  const offerUndo = useOfferUndo();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = (): FormState => {
    if (!subEvent) {
      return {
        name: '',
        date: event.startsOn,
        start: '10:00',
        end: '12:00',
        venueId: '',
        capacity: '',
        notes: '',
      };
    }
    const start = utcToZonedParts(subEvent.startsAt, event.timeZone);
    const end = utcToZonedParts(subEvent.endsAt, event.timeZone);
    return {
      name: subEvent.name,
      date: start.date,
      start: start.time,
      end: end.time,
      venueId: subEvent.venueId ?? '',
      capacity: subEvent.capacity?.toString() ?? '',
      notes: subEvent.notes ?? '',
    };
  };
  const [form, setForm] = useState<FormState>(initial);
  const set = (changes: Partial<FormState>) => setForm((current) => ({ ...current, ...changes }));

  function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError(t('nameRequired'));
    const startsAt = zonedTimeToUtc(form.date, form.start, event.timeZone);
    // An end earlier than the start means it runs past midnight.
    let endsAt = zonedTimeToUtc(form.date, form.end, event.timeZone);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86_400_000);
    const fields = {
      name: form.name.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      venueId: form.venueId || null,
      capacity: form.capacity ? Number(form.capacity) : null,
      notes: form.notes.trim() || null,
    };
    save.mutate(
      subEvent
        ? { id: subEvent.id, version: subEvent.version, changes: fields }
        : { create: fields },
      {
        onSuccess: onDone,
        onError: (failure) => {
          const current = conflictCurrent<SubEvent>(failure);
          if (current) {
            setConflicted(true);
            onConflict(current);
          } else {
            setError(t('saveFailed'));
          }
        },
      },
    );
  }

  function onDelete() {
    if (!subEvent) return;
    if (!confirmDelete) return setConfirmDelete(true);
    remove.mutate(
      { id: subEvent.id, version: subEvent.version },
      {
        onSuccess: (requestId) => {
          onDone();
          offerUndo(tSchedule('deleted', { name: subEvent.name }), subEvent.id, requestId);
        },
        onError: (failure) => {
          const current = conflictCurrent<SubEvent>(failure);
          if (current) onConflict(current);
          else setError(t('deleteFailed'));
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {conflicted && (
        <p
          role="alert"
          className="rounded-control bg-warning-tint px-4 py-3 text-small text-warning-text"
        >
          {t('conflict')}
        </p>
      )}
      <Field id="sub-event-name" label={t('name')}>
        <Input
          id="sub-event-name"
          value={form.name}
          maxLength={120}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field id="sub-event-date" label={t('date')}>
        <Input
          id="sub-event-date"
          type="date"
          value={form.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="sub-event-start" label={t('start')}>
          <Input
            id="sub-event-start"
            type="time"
            value={form.start}
            onChange={(e) => set({ start: e.target.value })}
          />
        </Field>
        <Field id="sub-event-end" label={t('end')}>
          <Input
            id="sub-event-end"
            type="time"
            value={form.end}
            onChange={(e) => set({ end: e.target.value })}
          />
        </Field>
      </div>
      <p className="-mt-2 text-caption text-fg-muted">
        {t('timeZoneNote', { timeZone: event.timeZone })}
      </p>
      <Field id="sub-event-venue" label={t('venue')}>
        <select
          id="sub-event-venue"
          value={form.venueId}
          onChange={(e) => set({ venueId: e.target.value })}
          className="h-12 w-full rounded-control border border-border-strong bg-surface-muted px-4 text-body text-fg focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary-tint focus-visible:outline-none"
        >
          <option value="">{t('noVenue')}</option>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="sub-event-capacity" label={t('capacity')} aside={t('optional')}>
        <Input
          id="sub-event-capacity"
          type="number"
          inputMode="numeric"
          min={1}
          value={form.capacity}
          onChange={(e) => set({ capacity: e.target.value })}
        />
      </Field>
      <Field id="sub-event-notes" label={t('notes')} aside={t('optional')}>
        <Input
          id="sub-event-notes"
          value={form.notes}
          maxLength={2000}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" loading={save.isPending}>
          {subEvent ? t('save') : t('create')}
        </Button>
        {subEvent && (
          <Button
            type="button"
            variant={confirmDelete ? 'destructive' : 'ghost'}
            icon={<Trash2 aria-hidden />}
            loading={remove.isPending}
            onClick={onDelete}
            className="ml-auto"
          >
            {confirmDelete ? t('confirmDelete') : t('delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

function Venues({ venues, editable }: { venues: Venue[]; editable: boolean }) {
  const t = useTranslations('schedule.venues');
  const tSchedule = useTranslations('schedule');
  const { eventId } = useCurrentEvent();
  const create = useCreateVenue(eventId);
  const remove = useDeleteVenue(eventId);
  const offerUndo = useOfferUndo();
  const [name, setName] = useState('');

  return (
    <Card>
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('title')}</h2>
        <p className="text-small text-fg-secondary">{t('subtitle')}</p>
      </div>
      <ListPresence className="flex flex-col gap-2" data-testid="venues">
        {venues.map((venue) => (
          <ListItem key={venue.id}>
            <LiveRow entityId={venue.id} className="rounded-control">
              <div className="flex items-center gap-3 rounded-control bg-surface-muted px-4 py-2">
                <MapPin aria-hidden className="size-4 text-fg-muted" />
                <span className="flex-1 text-body">{venue.name}</span>
                {editable && (
                  <button
                    type="button"
                    aria-label={t('remove', { name: venue.name })}
                    onClick={() =>
                      remove.mutate(venue.id, {
                        onSuccess: (requestId) =>
                          offerUndo(
                            tSchedule('deleted', { name: venue.name }),
                            venue.id,
                            requestId,
                          ),
                      })
                    }
                    className="flex size-10 items-center justify-center rounded-control text-fg-muted hover:bg-surface hover:text-danger-text"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </div>
            </LiveRow>
          </ListItem>
        ))}
      </ListPresence>
      {editable && (
        <form
          className="flex gap-2"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (!name.trim()) return;
            create.mutate({ name: name.trim() }, { onSuccess: () => setName('') });
          }}
        >
          <Input
            aria-label={t('newVenue')}
            placeholder={t('newVenue')}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            icon={<Plus aria-hidden />}
            loading={create.isPending}
          >
            {t('add')}
          </Button>
        </form>
      )}
    </Card>
  );
}
