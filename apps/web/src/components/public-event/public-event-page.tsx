'use client';

import type { PublicEvent, PublicSubEvent, RegistrationState } from '@pme/contracts';
import { CalendarDays, CheckCircle2, MapPin, Minus, Plus, Send, Users } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';

import { mapLink, whenIn } from '@/components/invite/invite-bits';
import { LogoMark } from '@/components/motion/logo-mark';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { Reveal, RevealGroup } from '@/components/motion/reveal';
import { RollingNumber } from '@/components/motion/rolling-number';
import { ACCENT } from '@/components/shell/accents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, PhoneInput } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { formatEventRange } from '@/lib/format';
import { distance, duration, ease, spring } from '@/lib/motion';
import { useRegister } from '@/lib/registration';
import { cn } from '@/lib/utils';

import { Turnstile, type TurnstileHandle } from './turnstile';

const MAX_PARTY = 10;

/**
 * An event's public page (/e/{slug}; built from DESIGN.md, no Stitch screen): the event, its
 * public schedule with places left, and the registration form when registration is open. The
 * server renders the page (shareable, indexable); the form is the only client part that writes.
 */
export function PublicEventPage({ page }: { page: PublicEvent }) {
  const t = useTranslations('publicEvent');
  const reduced = useShouldReduceMotion();
  const accent = ACCENT[page.event.type];
  const perSubEvent = page.guestScope === 'per_sub_event';
  const openSubEvents = page.subEvents.filter((item) => item.registration === 'open');
  const state: RegistrationState = perSubEvent
    ? openSubEvents.length
      ? 'open'
      : page.subEvents.some((item) => item.registration === 'full')
        ? 'full'
        : page.subEvents.some((item) => item.registration === 'closed')
          ? 'closed'
          : 'not_open'
    : (page.wholeEvent?.registration ?? 'not_open');

  return (
    <div className="min-h-dvh bg-bg">
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:py-10">
        <m.header
          className={cn(
            'flex origin-top flex-col items-center gap-3 rounded-dialog px-6 py-10 text-center',
            accent.tint,
          )}
          initial={{ opacity: 0, scaleY: reduced ? 1 : 0.96 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={reduced ? { duration: duration.fast } : spring.gentle}
        >
          <span
            className={cn(
              'rounded-full bg-surface px-3 py-1 text-caption font-semibold tracking-wide uppercase',
              accent.text,
            )}
          >
            {t(`state.${state}`)}
          </span>
          <m.h1
            className="font-display text-display-phone sm:text-display"
            initial={{ opacity: 0, y: reduced ? 0 : distance.riseLarge }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduced ? duration.fast : duration.moderate,
              ease: ease.out,
              delay: reduced ? 0 : duration.base,
            }}
          >
            {page.event.name}
          </m.h1>
          <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-small">
            <CalendarDays aria-hidden className={cn('size-4', accent.text)} />
            {formatEventRange(page.event.startsOn, page.event.endsOn)}
          </span>
          {!perSubEvent && page.wholeEvent?.spotsLeft != null && state === 'open' && (
            <span className="text-small text-fg-secondary" data-testid="spots-left">
              {t('spotsLeft', { count: page.wholeEvent.spotsLeft })}
            </span>
          )}
        </m.header>

        <RevealGroup className="flex flex-col gap-4">
          {page.event.description && (
            <Reveal>
              <Card>
                <p className="text-body whitespace-pre-line">{page.event.description}</p>
              </Card>
            </Reveal>
          )}

          {page.subEvents.length > 0 && (
            <Reveal>
              <Card className="gap-3">
                <h2 className="text-h3">{t('schedule')}</h2>
                <ul className="flex flex-col gap-2" data-testid="public-schedule">
                  {page.subEvents.map((item) => (
                    <ScheduleRow
                      key={item.id}
                      item={item}
                      timeZone={page.event.timeZone}
                      perSubEvent={perSubEvent}
                    />
                  ))}
                </ul>
              </Card>
            </Reveal>
          )}

          <Reveal>
            {state === 'open' ? (
              <RegisterForm page={page} openSubEvents={openSubEvents} />
            ) : (
              <Card className="gap-1" data-testid="registration-unavailable">
                <h2 className="text-h3">{t(`unavailable.${state}`)}</h2>
                <p className="text-body text-fg-secondary">{t(`unavailableBody.${state}`)}</p>
              </Card>
            )}
          </Reveal>
        </RevealGroup>

        <footer className="flex items-center justify-center gap-2 py-6 text-small text-fg-muted">
          <LogoMark size={20} />
          {t('madeWith')}
        </footer>
      </main>
    </div>
  );
}

const STATE_TONE: Record<RegistrationState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  open: 'success',
  full: 'danger',
  closed: 'neutral',
  not_open: 'neutral',
};

function ScheduleRow({
  item,
  timeZone,
  perSubEvent,
}: {
  item: PublicSubEvent;
  timeZone: string;
  perSubEvent: boolean;
}) {
  const t = useTranslations('publicEvent');
  const almostFull =
    item.registration === 'open' &&
    item.capacity !== null &&
    item.spotsLeft !== null &&
    item.spotsLeft <= Math.max(1, Math.floor(item.capacity * 0.1));
  return (
    <li className="flex items-start gap-3 rounded-control bg-surface-muted p-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {item.groupLabel && (
          <span className="text-caption font-semibold text-primary-text uppercase">
            {item.groupLabel}
          </span>
        )}
        <span className="text-label">{item.name}</span>
        <span className="text-small text-fg-secondary">{whenIn(item.startsAt, timeZone)}</span>
        {item.venue && (
          <span className="truncate text-small text-fg-secondary">
            {[item.venue.name, item.venue.address].filter(Boolean).join(', ')}
          </span>
        )}
        {item.notes && <span className="text-small text-fg-secondary">{item.notes}</span>}
        {perSubEvent && item.registration !== 'not_open' && (
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={almostFull ? 'warning' : STATE_TONE[item.registration]} dot>
              {almostFull ? t('almostFull') : t(`subEventState.${item.registration}`)}
            </Badge>
            {item.spotsLeft !== null && item.registration === 'open' && (
              <span className="text-small text-fg-secondary tabular-nums">
                {t('spotsLeft', { count: item.spotsLeft })}
              </span>
            )}
          </span>
        )}
      </span>
      {item.venue && (
        <Button asChild size="sm" variant="secondary" icon={<MapPin aria-hidden />}>
          <a
            href={mapLink(item.venue)}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t('mapFor', { name: item.name })}
          >
            {t('map')}
          </a>
        </Button>
      )}
    </li>
  );
}

type Errors = Partial<Record<'name' | 'email' | 'phone' | 'subEventIds' | 'form', string>>;

function RegisterForm({
  page,
  openSubEvents,
}: {
  page: PublicEvent;
  openSubEvents: PublicSubEvent[];
}) {
  const t = useTranslations('publicEvent.form');
  const router = useRouter();
  const reduced = useShouldReduceMotion();
  const register = useRegister(page.event.slug);
  const perSubEvent = page.guestScope === 'per_sub_event';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [chosen, setChosen] = useState<string[]>(() =>
    openSubEvents.length === 1 ? [openSubEvents[0]!.id] : [],
  );
  const [partySize, setPartySize] = useState(1);
  const [token, setToken] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<{ email: boolean } | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!name.trim()) next.name = t('nameRequired');
    if (!email.trim() && !phone.trim()) next.email = t('contactRequired');
    if (perSubEvent && chosen.length === 0) next.subEventIds = t('chooseOne');
    setErrors(next);
    if (Object.keys(next).length) return;
    // The check may still be running: register as soon as it has finished.
    if (!token) return setWaiting(true);
    send(token);
  }

  /** Turnstile finished (or expired): a register click waiting for it goes ahead now. */
  function onToken(next: string | null) {
    setToken(next);
    if (next && waiting) {
      setWaiting(false);
      send(next);
    }
  }

  function send(turnstileToken: string) {
    register.mutate(
      {
        idempotencyKey: crypto.randomUUID(),
        body: {
          name: name.trim(),
          ...(email.trim() && { email: email.trim() }),
          ...(phone.trim() && { phone: phone.trim() }),
          subEventIds: perSubEvent ? chosen : [],
          partySize,
          turnstileToken,
        },
      },
      {
        onSuccess: (result) => setDone({ email: result.confirmationEmail }),
        onError: (failed) => {
          // Tokens work once: a refused send needs a new check.
          turnstile.current?.reset();
          const problem = failed instanceof ApiError ? failed.problem : null;
          const fields = Object.fromEntries(
            (problem?.fields ?? []).map((field) => [field.path.split('.')[0], field.message]),
          ) as Errors;
          if (problem?.code === 'capacity_full' || problem?.code === 'registration_closed') {
            router.refresh();
          }
          setErrors({
            ...fields,
            form:
              problem?.code === 'capacity_full'
                ? t('full')
                : problem?.code === 'registration_closed'
                  ? t('closed')
                  : problem?.code === 'captcha_failed'
                    ? t('captcha')
                    : problem?.code === 'rate_limited'
                      ? t('busy')
                      : problem?.fields?.length
                        ? undefined
                        : t('failed'),
          });
        },
      },
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {done ? (
        <m.div
          key="done"
          initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: duration.fast } : spring.gentle}
        >
          <Card className="items-center gap-3 py-8 text-center" data-testid="registered">
            <span className="flex size-14 items-center justify-center rounded-full bg-success-tint">
              <CheckCircle2 aria-hidden className="size-7 text-success-text" />
            </span>
            <h2 className="text-h2">{t('doneTitle')}</h2>
            <p className="max-w-sm text-body text-fg-secondary">
              {done.email ? t('doneEmail') : t('doneNoEmail')}
            </p>
          </Card>
        </m.div>
      ) : (
        <m.form
          key="form"
          exit={{ opacity: 0 }}
          transition={{ duration: duration.fast }}
          onSubmit={submit}
          noValidate
        >
          <Card className="gap-5" data-testid="register-form">
            <div className="flex flex-col gap-1">
              <h2 className="text-h2">{t('title')}</h2>
              <p className="text-small text-fg-secondary">{t('subtitle')}</p>
            </div>

            <Field id="reg-name" label={t('name')} error={errors.name}>
              <Input
                id="reg-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
                maxLength={120}
              />
            </Field>
            <Field id="reg-email" label={t('email')} error={errors.email} hint={t('emailHint')}>
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email}
              />
            </Field>
            <Field id="reg-phone" label={t('phone')} error={errors.phone} aside={t('optional')}>
              <PhoneInput
                id="reg-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                aria-invalid={!!errors.phone}
              />
            </Field>

            {perSubEvent && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-label">{t('sessions')}</legend>
                {openSubEvents.map((item) => {
                  const checked = chosen.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-control border p-3',
                        'transition-[background-color,border-color] duration-(--dur-fast) ease-(--ease-out)',
                        checked ? 'border-primary bg-primary-tint' : 'border-border bg-surface',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-5 accent-(--primary)"
                        checked={checked}
                        onChange={() => toggle(item.id)}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-label">{item.name}</span>
                        <span className="text-small text-fg-secondary">
                          {whenIn(item.startsAt, page.event.timeZone)}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {errors.subEventIds && (
                  <p role="alert" className="text-small text-danger-text">
                    {errors.subEventIds}
                  </p>
                )}
              </fieldset>
            )}

            <PartySize value={partySize} onChange={setPartySize} />

            <Turnstile ref={turnstile} onToken={onToken} />
            {waiting && (
              <p role="status" className="text-small text-fg-secondary">
                {t('waitForCheck')}
              </p>
            )}

            {errors.form && (
              <p role="alert" className="text-small text-danger-text">
                {errors.form}
              </p>
            )}
            <Button
              type="submit"
              icon={<Send aria-hidden />}
              loading={register.isPending || waiting}
              className="w-full"
            >
              {t('submit')}
            </Button>
            <p className="text-caption text-fg-muted">{t('privacy')}</p>
          </Card>
        </m.form>
      )}
    </AnimatePresence>
  );
}

/** How many are coming, 1 to 10 (DESIGN.md stepper, as on the invite page). */
function PartySize({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const t = useTranslations('publicEvent.form');
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-label">
        <Users aria-hidden className="size-5 text-fg-secondary" />
        {t('partySize')}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label={t('fewer')}
          disabled={value <= 1}
          onClick={() => onChange(value - 1)}
        >
          <Minus aria-hidden />
        </Button>
        <span className="w-8 text-center text-h3 tabular-nums" aria-live="polite">
          <RollingNumber value={value} />
        </span>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label={t('more')}
          disabled={value >= MAX_PARTY}
          onClick={() => onChange(value + 1)}
        >
          <Plus aria-hidden />
        </Button>
      </div>
    </div>
  );
}
