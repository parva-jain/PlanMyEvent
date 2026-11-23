'use client';

import type { Attendance, Contact, SubEvent } from '@pme/contracts';
import { CalendarClock, Search, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type FormEvent } from 'react';

import { CountUp } from '@/components/motion/count-up';
import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { ProgressFill } from '@/components/motion/progress-fill';
import { Reveal, RevealGroup } from '@/components/motion/reveal';
import { EditPanel } from '@/components/motion/side-panel';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { initials } from '@/components/team/member-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, PhoneInput } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useSubEvents } from '@/lib/events';
import { useCreateAttendance } from '@/lib/people';
import { cn } from '@/lib/utils';

import { AttendanceChip, formatPhone } from './people-bits';

/** Places held: people confirmed, registered or checked in. */
const HOLDING = new Set(['confirmed', 'registered', 'checked_in']);
/** "Almost full" from here (DESIGN.md capacity chips; the dashboard uses the same). */
const NEARLY_FULL = 0.9;

const timeFormat = (timeZone: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });

/** One registrant: their rows across sessions, newest activity first. */
interface Registrant {
  key: string;
  name: string;
  contactId: string | null;
  rows: Attendance[];
  at: string | null;
}

/**
 * Registrations (Stitch "DevFest Bhopal 2026 — Registrations"): how many have registered,
 * each session's fill against its capacity, and everyone who registered or walked in, with
 * the sessions they chose. Organizers add a walk-in or a manual registration here.
 */
export function RegistrationsTab({
  attendance,
  contacts,
}: {
  attendance: Attendance[];
  contacts: Contact[];
}) {
  const t = useTranslations('people.registrations');
  const { eventId, event, can } = useCurrentEvent();
  const { data: subEvents = [] } = useSubEvents(eventId);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const perSubEvent = event.guestScope === 'per_sub_event';
  const contactsById = useMemo(() => new Map(contacts.map((item) => [item.id, item])), [contacts]);
  const format = timeFormat(event.timeZone);

  const registered = attendance.filter((row) => row.source === 'registered');
  const registrants = useMemo(() => {
    const groups = new Map<string, Registrant>();
    for (const row of registered) {
      const key = row.contactId ?? row.householdId ?? row.id;
      const group = groups.get(key) ?? {
        key,
        name: row.guestName,
        contactId: row.contactId,
        rows: [],
        at: null,
      };
      group.rows.push(row);
      const at = row.checkedInAt ?? row.respondedAt;
      if (at && (!group.at || at > group.at)) group.at = at;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  }, [registered]);
  const active = registrants.filter((item) => item.rows.some((row) => HOLDING.has(row.status)));
  const checkedIn = registrants.filter((item) =>
    item.rows.some((row) => row.status === 'checked_in'),
  ).length;
  const waitlisted = registered.filter((row) => row.status === 'waitlisted').length;

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? registrants.filter((item) => {
        const contact = item.contactId ? contactsById.get(item.contactId) : undefined;
        return [item.name, contact?.email, contact?.phone]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle));
      })
    : registrants;

  const sessions = perSubEvent
    ? subEvents.filter(
        (item) => item.responseMode === 'open_registration' || item.capacity !== null,
      )
    : [];
  const takenIn = (subEventId: string | null) =>
    attendance
      .filter((row) => row.subEventId === subEventId && HOLDING.has(row.status))
      .reduce((sum, row) => sum + row.partySize, 0);
  const sessionName = (id: string | null) =>
    id ? (subEvents.find((item) => item.id === id)?.name ?? '') : event.name;

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-3 sm:flex-row sm:items-center" data-testid="registrations-summary">
        <div className="flex flex-1 flex-col gap-1">
          <p className="flex items-baseline gap-2">
            <CountUp value={active.length} className="text-h1-phone tabular-nums sm:text-h1" />
            <span className="text-body text-fg-secondary">
              {t('registered', { count: active.length })}
            </span>
          </p>
          <p className="text-small text-fg-secondary">{t('summary', { checkedIn, waitlisted })}</p>
        </div>
        {can('guests.edit') && (
          <Button icon={<UserPlus aria-hidden />} onClick={() => setAdding(true)}>
            {t('add')}
          </Button>
        )}
      </Card>

      {sessions.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="session-fill">
          <h2 id="session-fill" className="text-label text-fg-secondary uppercase">
            {t('sessions')}
          </h2>
          <RevealGroup pace="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((item) => (
              <Reveal key={item.id}>
                <SessionCard
                  item={item}
                  taken={takenIn(item.id)}
                  when={format.format(new Date(item.startsAt))}
                />
              </Reveal>
            ))}
          </RevealGroup>
        </section>
      )}

      <Card className="gap-4 p-0 sm:p-0">
        <div className="flex flex-col gap-3 p-4 sm:p-6 sm:pb-0">
          <label className="relative block">
            <span className="sr-only">{t('search')}</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-fg-muted"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
              className="pl-12"
            />
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="px-6 pb-8 text-body text-fg-secondary" data-testid="registrations-empty">
            {registrants.length ? t('noMatch') : t('empty')}
          </p>
        ) : (
          <ListPresence className="flex flex-col divide-y divide-border">
            {shown.map((item) => {
              const contact = item.contactId ? contactsById.get(item.contactId) : undefined;
              const status = item.rows.some((row) => row.status === 'checked_in')
                ? 'checked_in'
                : item.rows.some((row) => row.status === 'registered')
                  ? 'registered'
                  : (item.rows[0]?.status ?? 'registered');
              return (
                <ListItem key={item.key}>
                  <div data-testid="registrant">
                    <LiveRow
                      entityId={item.rows[0]!.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                          aria-hidden
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-label text-primary-text"
                        >
                          {initials(item.name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-label">{item.name}</span>
                          <span className="truncate text-small text-fg-secondary">
                            {[contact?.email, contact?.phone && formatPhone(contact.phone)]
                              .filter(Boolean)
                              .join(' · ') || t('noContact')}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:w-64">
                        {item.rows
                          .filter((row) => row.status !== 'cancelled')
                          .map((row) => (
                            <Badge key={row.id} tone="info">
                              {sessionName(row.subEventId)}
                              {row.partySize > 1 ? ` ×${row.partySize}` : ''}
                            </Badge>
                          ))}
                      </div>
                      <span className="flex items-center gap-1.5 text-small text-fg-secondary sm:w-36">
                        <CalendarClock aria-hidden className="size-4" />
                        {item.at ? format.format(new Date(item.at)) : t('atTheDoor')}
                      </span>
                      <span className="sm:w-28">
                        <AttendanceChip status={status} />
                      </span>
                    </LiveRow>
                  </div>
                </ListItem>
              );
            })}
          </ListPresence>
        )}
      </Card>

      <EditPanel open={adding} onOpenChange={setAdding} title={t('addTitle')}>
        <AddRegistration subEvents={perSubEvent ? subEvents : []} onDone={() => setAdding(false)} />
      </EditPanel>
    </div>
  );
}

function SessionCard({ item, taken, when }: { item: SubEvent; taken: number; when: string }) {
  const t = useTranslations('people.registrations');
  const fill = item.capacity ? taken / item.capacity : null;
  const state =
    fill === null ? 'open' : fill >= 1 ? 'full' : fill >= NEARLY_FULL ? 'almostFull' : 'open';
  return (
    <Card
      className={cn('h-full gap-3', state === 'almostFull' && 'border-warning')}
      data-testid="session-card"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge
          tone={state === 'full' ? 'danger' : state === 'almostFull' ? 'warning' : 'success'}
          dot
        >
          {t(`state.${state}`)}
        </Badge>
        {fill !== null && (
          <span className="text-small text-fg-secondary tabular-nums">
            {t('filled', { percent: Math.round(fill * 100) })}
          </span>
        )}
      </div>
      <h3 className="text-label font-semibold">{item.name}</h3>
      <p className="flex items-baseline gap-1">
        <CountUp value={taken} className="text-h2 tabular-nums" />
        {item.capacity !== null && (
          <span className="text-small text-fg-secondary tabular-nums">
            {t('ofCapacity', { capacity: item.capacity })}
          </span>
        )}
      </p>
      {fill !== null && (
        <ProgressFill
          value={Math.round(Math.min(fill, 1) * 100)}
          label={t('fillLabel', { name: item.name })}
        />
      )}
      <p className="text-small text-fg-secondary">{when}</p>
    </Card>
  );
}

/** A walk-in (checked in) or a manual registration, by name (POST E/attendance). */
function AddRegistration({ subEvents, onDone }: { subEvents: SubEvent[]; onDone: () => void }) {
  const t = useTranslations('people.registrations.form');
  const { eventId } = useCurrentEvent();
  const create = useCreateAttendance(eventId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [subEventId, setSubEventId] = useState(subEvents[0]?.id ?? '');
  const [partySize, setPartySize] = useState(1);
  const [status, setStatus] = useState<'checked_in' | 'registered'>('checked_in');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError(t('nameRequired'));
    setError(null);
    create.mutate(
      {
        contact: {
          name: name.trim(),
          ...(phone && { phone }),
          ...(email.trim() && { email: email.trim() }),
        },
        subEventId: subEvents.length ? subEventId : null,
        partySize,
        status,
      },
      {
        onSuccess: onDone,
        onError: (failed) =>
          setError(
            failed instanceof ApiError && failed.problem?.fields?.length
              ? failed.problem.fields[0]!.message
              : t('failed'),
          ),
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={submit}
      noValidate
      data-testid="add-registration"
    >
      <Field id="add-reg-name" label={t('name')}>
        <Input id="add-reg-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="add-reg-phone" label={t('phone')} aside={t('optional')}>
        <PhoneInput
          id="add-reg-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
        />
      </Field>
      <Field id="add-reg-email" label={t('email')} aside={t('optional')}>
        <Input
          id="add-reg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      {subEvents.length > 0 && (
        <Field id="add-reg-session" label={t('session')}>
          <Select
            id="add-reg-session"
            value={subEventId}
            onChange={(e) => setSubEventId(e.target.value)}
          >
            {subEvents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id="add-reg-party" label={t('partySize')}>
        <Input
          id="add-reg-party"
          type="number"
          min={1}
          max={50}
          value={partySize}
          onChange={(e) => setPartySize(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
        />
      </Field>
      <div role="radiogroup" aria-label={t('status')} className="grid grid-cols-2 gap-2">
        {(['checked_in', 'registered'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={status === value}
            onClick={() => setStatus(value)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-control border p-3 text-left',
              status === value ? 'border-primary bg-primary-tint' : 'border-border bg-surface',
            )}
          >
            <span className="text-label">{t(`statuses.${value}`)}</span>
            <span className="text-small text-fg-secondary">{t(`statusHelp.${value}`)}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <Button type="submit" loading={create.isPending}>
        {t('save')}
      </Button>
    </form>
  );
}
