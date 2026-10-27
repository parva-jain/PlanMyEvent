'use client';

import { VALUE_SETS, type Event, type EventModule } from '@pme/contracts';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type FormEvent } from 'react';

import { useCurrentEvent } from '@/components/shell/current-event';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useModules, useReplaceModules, useUpdateEvent } from '@/lib/events';
import { timeZoneOptions } from '@/lib/format';

const selectClass =
  'h-12 w-full rounded-control border border-border-strong bg-surface-muted px-4 text-body text-fg focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary-tint focus-visible:outline-none';

const isConflict = (error: unknown) =>
  error instanceof ApiError && error.problem?.code === 'version_conflict';

/** Event settings (Stitch "Event Settings"): details and modules, both version-guarded. */
export function EventSettings() {
  const t = useTranslations('settings');
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
      <DetailsForm />
      <ModulesForm />
    </div>
  );
}

function DetailsForm() {
  const t = useTranslations('settings.details');
  const tStatus = useTranslations('app.eventStatus');
  const { eventId, event } = useCurrentEvent();
  const update = useUpdateEvent(eventId);

  // The form edits a snapshot; `base` is the version it started from (sent as If-Match).
  const [base, setBase] = useState<Event>(event);
  const [form, setForm] = useState(() => pick(event));
  const zones = useMemo(() => timeZoneOptions(form.timeZone), [form.timeZone]);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(
    null,
  );
  const set = (changes: Partial<ReturnType<typeof pick>>) =>
    setForm((current) => ({ ...current, ...changes }));

  function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setMessage(null);
    update.mutate(
      {
        version: base.version,
        changes: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          startsOn: form.startsOn,
          endsOn: form.endsOn,
          timeZone: form.timeZone,
          status: form.status,
        },
      },
      {
        onSuccess: (saved) => {
          setBase(saved);
          setForm(pick(saved));
          setMessage({ tone: 'ok', text: t('saved') });
        },
        onError: (error) => {
          if (isConflict(error)) {
            // Someone else saved first: show their version and let the user re-apply.
            const current = (error as ApiError).problem as unknown as { current: Event };
            setBase(current.current);
            setForm(pick(current.current));
            setMessage({ tone: 'warn', text: t('conflict') });
          } else {
            const fields = error instanceof ApiError ? error.problem?.fields : undefined;
            setMessage({ tone: 'error', text: fields?.[0]?.message ?? t('failed') });
          }
        },
      },
    );
  }

  return (
    <Card>
      <h2 className="text-h3">{t('title')}</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="event-name" label={t('name')}>
          <Input
            id="event-name"
            value={form.name}
            maxLength={120}
            required
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field id="event-description" label={t('description')} aside={t('optional')}>
          <Input
            id="event-description"
            value={form.description}
            maxLength={2000}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="event-starts" label={t('startsOn')}>
            <Input
              id="event-starts"
              type="date"
              value={form.startsOn}
              onChange={(e) => set({ startsOn: e.target.value })}
            />
          </Field>
          <Field id="event-ends" label={t('endsOn')}>
            <Input
              id="event-ends"
              type="date"
              min={form.startsOn}
              value={form.endsOn}
              onChange={(e) => set({ endsOn: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="event-status" label={t('status')}>
            <select
              id="event-status"
              className={selectClass}
              value={form.status}
              onChange={(e) => set({ status: e.target.value as Event['status'] })}
            >
              {VALUE_SETS.eventStatus.map((status) => (
                <option key={status} value={status}>
                  {tStatus(status)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="event-zone" label={t('timeZone')}>
            <select
              id="event-zone"
              className={selectClass}
              value={form.timeZone}
              onChange={(e) => set({ timeZone: e.target.value })}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {message && (
          <p
            role={message.tone === 'ok' ? 'status' : 'alert'}
            className={
              message.tone === 'ok'
                ? 'text-small text-success-text'
                : message.tone === 'warn'
                  ? 'rounded-control bg-warning-tint px-4 py-3 text-small text-warning-text'
                  : 'text-small text-danger-text'
            }
          >
            {message.text}
          </p>
        )}
        <Button type="submit" loading={update.isPending} className="self-start">
          {t('save')}
        </Button>
      </form>
    </Card>
  );
}

function pick(event: Event) {
  return {
    name: event.name,
    description: event.description ?? '',
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    timeZone: event.timeZone,
    status: event.status,
  };
}

function ModulesForm() {
  const t = useTranslations('settings.modules');
  const tModules = useTranslations('wizard.modules');
  const { eventId, event } = useCurrentEvent();
  const { data: modules } = useModules(eventId);
  const replace = useReplaceModules(eventId);
  const [message, setMessage] = useState<string | null>(null);

  const enabled = (module: EventModule['module']) =>
    modules?.find((item) => item.module === module)?.enabled ?? false;

  function toggle(module: EventModule['module']) {
    if (!modules) return;
    setMessage(null);
    const next = VALUE_SETS.module.map((name) => {
      const existing = modules.find((item) => item.module === name);
      return {
        module: name,
        enabled: name === module ? !enabled(name) : (existing?.enabled ?? false),
        config: existing?.config ?? {},
      };
    });
    replace.mutate(
      { version: event.version, modules: next },
      { onError: (error) => setMessage(isConflict(error) ? t('conflict') : t('failed')) },
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('title')}</h2>
        <p className="text-small text-fg-secondary">{t('subtitle')}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {VALUE_SETS.module.map((module) => (
          <li
            key={module}
            className="flex items-center justify-between gap-4 rounded-control bg-surface-muted px-4 py-3"
          >
            <span className="flex flex-col">
              <span className="text-label">{tModules(module)}</span>
              <span className="text-small text-fg-secondary">{t(`help.${module}`)}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled(module)}
              aria-label={tModules(module)}
              disabled={!modules || replace.isPending}
              onClick={() => toggle(module)}
              className="relative h-7 w-12 shrink-0 rounded-full bg-border-strong transition-colors duration-(--dur-fast) aria-checked:bg-primary disabled:opacity-60"
            >
              <span
                aria-hidden
                className="absolute top-1 left-1 size-5 rounded-full bg-surface shadow-card transition-transform duration-(--dur-fast) ease-(--ease-out) [[aria-checked=true]>&]:translate-x-5"
              />
            </button>
          </li>
        ))}
      </ul>
      {message && (
        <p role="alert" className="text-small text-danger-text">
          {message}
        </p>
      )}
    </Card>
  );
}
