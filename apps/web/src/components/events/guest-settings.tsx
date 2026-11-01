'use client';

import type { GuestScope, ResponseMode, SubEvent } from '@pme/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, CircleCheck, Users } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Dialog } from '@/components/motion/dialog';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { ProgressFill } from '@/components/motion/progress-fill';
import { useCurrentEvent } from '@/components/shell/current-event';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import {
  eventKeys,
  useSaveSubEvent,
  useSubEvents,
  useSwitchGuestScope,
  useUpdateEvent,
} from '@/lib/events';
import { duration, ease } from '@/lib/motion';
import { useJobStatus } from '@/lib/people';
import { cn } from '@/lib/utils';

/** Open registration arrives with the public registration page (milestone 8). */
const MODES: { mode: ResponseMode; available: boolean }[] = [
  { mode: 'invite_only', available: true },
  { mode: 'invite_rsvp', available: true },
  { mode: 'open_registration', available: false },
];

/**
 * People and responses (Stitch "Event Settings: People & responses"): who's invited to what
 * (one list for the whole event, or one per sub-event) and how guests respond.
 */
export function GuestSettings() {
  const t = useTranslations('settings.guests');
  const { event } = useCurrentEvent();
  const [switching, setSwitching] = useState(false);
  const perSubEvent = event.guestScope === 'per_sub_event';

  return (
    <Card className="gap-5" data-testid="guest-settings">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('title')}</h2>
        <p className="text-small text-fg-secondary">{t('subtitle')}</p>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="guest-scope-heading">
        <h3 id="guest-scope-heading" className="text-label">
          {t('scopeHeading')}
        </h3>
        <div className="flex flex-col gap-3 rounded-control border border-primary bg-primary-tint/40 p-4 sm:flex-row sm:items-center">
          <span className="flex min-w-0 flex-1 gap-3">
            <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <span className="flex flex-col gap-0.5">
              <span className="text-label" data-testid="guest-scope">
                {t(perSubEvent ? 'perSubEvent' : 'wholeEvent')}
              </span>
              <span className="text-small text-fg-secondary">
                {t(perSubEvent ? 'perSubEventHelp' : 'wholeEventHelp')}
              </span>
            </span>
          </span>
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeftRight aria-hidden />}
            onClick={() => setSwitching(true)}
            className="self-start sm:self-center"
          >
            {t(perSubEvent ? 'toWholeEvent' : 'toPerSubEvent')}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="response-mode-heading">
        <h3 id="response-mode-heading" className="text-label">
          {t('modeHeading')}
        </h3>
        {perSubEvent ? <SubEventModes /> : <EventMode />}
      </section>

      <SwitchDialog
        open={switching}
        target={perSubEvent ? 'whole_event' : 'per_sub_event'}
        onClose={() => setSwitching(false)}
      />
    </Card>
  );
}

/** The whole event's response mode, saved as soon as it's chosen. */
function EventMode() {
  const t = useTranslations('settings.guests');
  const { eventId, event } = useCurrentEvent();
  const update = useUpdateEvent(eventId);
  const [error, setError] = useState<string | null>(null);

  function choose(mode: ResponseMode) {
    if (mode === event.responseMode) return;
    setError(null);
    update.mutate(
      { version: event.version, changes: { responseMode: mode } },
      {
        onError: (failed) =>
          setError(
            failed instanceof ApiError && failed.problem?.code === 'version_conflict'
              ? t('conflict')
              : t('failed'),
          ),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={t('modeHeading')} className="grid gap-2 sm:grid-cols-3">
        {MODES.map(({ mode, available }) => {
          const chosen = event.responseMode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={!available || update.isPending}
              onClick={() => choose(mode)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-control border p-3 text-left',
                'transition-[background-color,border-color] duration-(--dur-fast) ease-(--ease-out)',
                chosen
                  ? 'border-primary bg-primary-tint'
                  : 'border-border bg-surface hover:bg-surface-muted',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <span className="text-label">{t(`modes.${mode}`)}</span>
              <span className="text-small text-fg-secondary">
                {available ? t(`modeHelp.${mode}`) : t('comingSoon')}
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** Per sub-event: each one's own response mode. */
function SubEventModes() {
  const t = useTranslations('settings.guests');
  const { eventId } = useCurrentEvent();
  const { data: subEvents = [] } = useSubEvents(eventId);
  const save = useSaveSubEvent(eventId);
  const [failed, setFailed] = useState(false);

  const choose = (subEvent: SubEvent, mode: ResponseMode) => {
    setFailed(false);
    save.mutate(
      { id: subEvent.id, version: subEvent.version, changes: { responseMode: mode } },
      { onError: () => setFailed(true) },
    );
  };

  return (
    <ul className="flex flex-col gap-2" data-testid="sub-event-modes">
      {subEvents.map((subEvent) => (
        <li
          key={subEvent.id}
          className="flex flex-col gap-2 rounded-control bg-surface-muted px-4 py-3 sm:flex-row sm:items-center"
        >
          <span className="flex-1 text-label">{subEvent.name}</span>
          <Select
            size="sm"
            aria-label={t('modeFor', { name: subEvent.name })}
            value={subEvent.responseMode ?? 'invite_only'}
            onChange={(e) => choose(subEvent, e.target.value as ResponseMode)}
            className="sm:w-56"
          >
            {MODES.map(({ mode, available }) => (
              <option key={mode} value={mode} disabled={!available}>
                {t(`modes.${mode}`)}
              </option>
            ))}
          </Select>
        </li>
      ))}
      {failed && (
        <li role="alert" className="text-small text-danger-text">
          {t('failed')}
        </li>
      )}
    </ul>
  );
}

/**
 * Confirm, then follow the job (MOTION.md 6.7: dialog, then a progress bar driven by the
 * job, then a success check). When it's done every screen of the event re-reads.
 */
function SwitchDialog({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: GuestScope;
  onClose: () => void;
}) {
  const t = useTranslations('settings.guests');
  const { eventId } = useCurrentEvent();
  const reduced = useShouldReduceMotion();
  const queryClient = useQueryClient();
  const start = useSwitchGuestScope(eventId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const { data: job } = useJobStatus(eventId, jobId);
  const done = job?.status === 'succeeded';
  const failed = job?.status === 'failed';

  useEffect(() => {
    if (done) void queryClient.invalidateQueries({ queryKey: eventKeys.event(eventId) });
  }, [done, queryClient, eventId]);

  const close = () => {
    onClose();
    // Ready for another switch later, with a fresh key.
    setTimeout(() => {
      setJobId(null);
      setError(null);
      setKey(crypto.randomUUID());
      start.reset();
    }, 300);
  };

  function confirm() {
    setError(null);
    start.mutate(
      { guestScope: target, idempotencyKey: key },
      {
        onSuccess: (accepted) => setJobId(accepted.jobId),
        onError: (problem) => {
          const body = problem instanceof ApiError ? problem.problem : null;
          setError(
            (body as { reason?: string } | null)?.reason === 'job_already_running'
              ? t('alreadyRunning')
              : (body?.fields?.[0]?.message ?? t('startFailed')),
          );
        },
      },
    );
  }

  const percent = done ? 100 : job?.status === 'running' ? 60 : jobId ? 15 : 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t(target === 'per_sub_event' ? 'confirmPerSubEvent' : 'confirmWholeEvent')}
      description={t(target === 'per_sub_event' ? 'explainPerSubEvent' : 'explainWholeEvent')}
    >
      <div className="flex flex-col gap-4" data-testid="guest-scope-dialog">
        {!jobId && (
          <p className="flex items-start gap-2 rounded-control bg-info-tint px-3 py-2 text-small text-info-text">
            <Users aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('canSwitchBack')}
          </p>
        )}
        {jobId && !failed && (
          <div className="flex flex-col gap-2">
            <ProgressFill value={percent} label={t('progressLabel')} />
            <AnimatePresence mode="wait" initial={false}>
              <m.p
                key={done ? 'done' : 'running'}
                role="status"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reduced ? duration.instant : duration.fast,
                  ease: ease.out,
                }}
                className={cn(
                  'flex items-center gap-2 text-small',
                  done ? 'text-success-text' : 'text-fg-secondary',
                )}
              >
                {done && <CircleCheck aria-hidden className="size-4" />}
                {done ? t('done') : t('running')}
              </m.p>
            </AnimatePresence>
          </div>
        )}
        {(error || failed) && (
          <p role="alert" className="text-small text-danger-text">
            {error ?? job?.error ?? t('startFailed')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {done || failed ? (
            <Button onClick={close}>{t('close')}</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close} disabled={jobId !== null}>
                {t('cancel')}
              </Button>
              <Button loading={start.isPending || jobId !== null} onClick={confirm}>
                {t('switch')}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
