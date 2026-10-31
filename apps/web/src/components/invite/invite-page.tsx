'use client';

import type { InviteScope, PublicInvite } from '@pme/contracts';
import {
  CalendarDays,
  CalendarPlus,
  CircleCheck,
  CircleX,
  MapPin,
  Minus,
  Navigation,
  Pencil,
  Plus,
  Send,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { LogoMark } from '@/components/motion/logo-mark';
import { useConfetti } from '@/components/motion/confetti';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { Reveal, RevealGroup } from '@/components/motion/reveal';
import { RollingNumber } from '@/components/motion/rolling-number';
import { Skeleton } from '@/components/motion/skeleton';
import { ACCENT, ACCENT_HEX } from '@/components/shell/accents';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { formatEventRange } from '@/lib/format';
import { useInvite, useRsvp } from '@/lib/invite';
import { distance, duration, ease, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

import { calendarFile, mapLink, whenIn } from './invite-bits';

const MAX_PARTY = 50;

/** One answer being chosen: attending or not (null: not chosen yet) and how many. */
interface Answer {
  attending: boolean | null;
  partySize: number;
}

const scopeKey = (scope: InviteScope) => scope.subEventId ?? 'event';

function initialAnswers(page: PublicInvite): Record<string, Answer> {
  return Object.fromEntries(
    page.scopes
      .filter((scope) => scope.canRespond)
      .map((scope) => [
        scopeKey(scope),
        {
          attending:
            scope.status === 'confirmed' ? true : scope.status === 'declined' ? false : null,
          partySize: Math.max(1, scope.partySize),
        },
      ]),
  );
}

/** Answered already: every scope that takes a reply has one. */
const answered = (page: PublicInvite) => {
  const open = page.scopes.filter((scope) => scope.canRespond);
  return open.length > 0 && open.every((scope) => scope.respondedAt !== null);
};

/**
 * The guest's invitation (Stitch "Guest invitation and RSVP"), opened from their link with
 * no account. Shows only what the API gives for this one invitation: the event, their name,
 * the parts they're invited to, and their own answers. MOTION.md 6.8.
 */
export function InvitePage({ token }: { token: string }) {
  const t = useTranslations('invite');
  const { data: page, error, isPending, refetch, isFetching } = useInvite(token);

  if (isPending) {
    return (
      <Frame>
        <Skeleton className="h-56" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </Frame>
    );
  }
  if (error || !page) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <Frame>
        <Card
          role="alert"
          className="items-center gap-4 py-10 text-center"
          data-testid="invite-problem"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-surface-muted">
            <CalendarDays aria-hidden className="size-7 text-fg-secondary" />
          </span>
          <h1 className="text-h2">
            {status === 410
              ? t('withdrawnTitle')
              : status === 404
                ? t('inactiveTitle')
                : t('errorTitle')}
          </h1>
          <p className="max-w-sm text-body text-fg-secondary">
            {status === 410
              ? t('withdrawnBody')
              : status === 404
                ? t('inactiveBody')
                : status === 429
                  ? t('busyBody')
                  : t('errorBody')}
          </p>
          {status !== 404 && status !== 410 && (
            <Button variant="secondary" loading={isFetching} onClick={() => void refetch()}>
              {t('retry')}
            </Button>
          )}
        </Card>
      </Frame>
    );
  }
  return <Invitation token={token} page={page} />;
}

/** Centered phone-width column with the "Sent with Plan My Event" footer. */
function Frame({ children }: { children: ReactNode }) {
  const t = useTranslations('invite');
  return (
    <div className="min-h-dvh bg-bg">
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:py-10">
        {children}
        <footer className="flex items-center justify-center gap-2 py-6 text-small text-fg-muted">
          <LogoMark size={20} />
          {t('sentWith')}
        </footer>
      </main>
    </div>
  );
}

function Invitation({ token, page }: { token: string; page: PublicInvite }) {
  const t = useTranslations('invite');
  const reduced = useShouldReduceMotion();
  const accent = ACCENT[page.event.type];
  const [editing, setEditing] = useState(() => !answered(page));
  // Set once a reply goes through on this visit: only then does the confirmation celebrate.
  const [justSent, setJustSent] = useState(false);
  const open = page.scopes.filter((scope) => scope.canRespond);
  // What's on the program: the invitation's own sub-events, or the event's schedule.
  const program =
    page.guestScope === 'per_sub_event'
      ? page.scopes.flatMap((scope) => (scope.subEvent ? [scope.subEvent] : []))
      : page.schedule;

  return (
    <Frame>
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
          {t('youreInvited')}
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
      </m.header>

      <RevealGroup className="flex flex-col gap-4">
        <Reveal>
          <Card className="gap-2" data-testid="invite-greeting">
            <p className="text-h3">{t('dear', { name: page.guestName })}</p>
            <p className="text-body whitespace-pre-line text-fg-secondary">
              {page.event.description ?? t('defaultMessage', { event: page.event.name })}
            </p>
          </Card>
        </Reveal>

        {program.length > 0 && (
          <Reveal>
            <Card className="gap-3">
              <h2 className="text-h3">{t('schedule')}</h2>
              <ul className="flex flex-col gap-2" data-testid="invite-schedule">
                {program.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-control bg-surface-muted p-3"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-label">{item.name}</span>
                      <span className="text-small text-fg-secondary">
                        {whenIn(item.startsAt, page.event.timeZone)}
                      </span>
                      {item.venue && (
                        <span className="truncate text-small text-fg-secondary">
                          {[item.venue.name, item.venue.address].filter(Boolean).join(', ')}
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
                ))}
              </ul>
            </Card>
          </Reveal>
        )}

        <Reveal>
          {open.length === 0 ? (
            <Card className="gap-1" data-testid="invite-only">
              <h2 className="text-h3">{t('noReplyTitle')}</h2>
              <p className="text-body text-fg-secondary">{t('noReplyBody')}</p>
            </Card>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {editing ? (
                <m.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? duration.fast : duration.moderate }}
                >
                  <RsvpForm
                    token={token}
                    page={page}
                    onSent={() => {
                      setJustSent(true);
                      setEditing(false);
                    }}
                  />
                </m.div>
              ) : (
                <m.div
                  key="done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? duration.fast : duration.moderate }}
                >
                  <Confirmation
                    page={page}
                    fresh={justSent}
                    onChange={() => {
                      setJustSent(false);
                      setEditing(true);
                    }}
                  />
                </m.div>
              )}
            </AnimatePresence>
          )}
        </Reveal>

        {program.length > 0 && (
          <Reveal>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                icon={<CalendarPlus aria-hidden />}
                onClick={() => calendarFile(page.event.name, program)}
              >
                {t('addToCalendar')}
              </Button>
              {program[0]?.venue ? (
                <Button asChild variant="secondary" icon={<Navigation aria-hidden />}>
                  <a href={mapLink(program[0].venue)} target="_blank" rel="noreferrer noopener">
                    {t('directions')}
                  </a>
                </Button>
              ) : null}
            </div>
          </Reveal>
        )}
      </RevealGroup>
    </Frame>
  );
}

/**
 * "Will you join us?": yes or no, and how many, for the whole event or each sub-event that
 * takes replies. Choosing yes opens the stepper with a height animation (MOTION.md 6.8).
 */
function RsvpForm({
  token,
  page,
  onSent,
}: {
  token: string;
  page: PublicInvite;
  onSent: () => void;
}) {
  const t = useTranslations('invite');
  const rsvp = useRsvp(token);
  const [answers, setAnswers] = useState(() => initialAnswers(page));
  const [error, setError] = useState<string | null>(null);
  const open = page.scopes.filter((scope) => scope.canRespond);
  const quiet = page.scopes.filter((scope) => !scope.canRespond && scope.subEvent);
  const ready = open.every((scope) => answers[scopeKey(scope)]?.attending !== null);
  const set = (key: string, changes: Partial<Answer>) =>
    setAnswers((current) => ({ ...current, [key]: { ...current[key]!, ...changes } }));

  function send() {
    if (!ready) return setError(t('chooseAll'));
    setError(null);
    rsvp.mutate(
      {
        idempotencyKey: crypto.randomUUID(),
        body: {
          responses: open.map((scope) => {
            const answer = answers[scopeKey(scope)]!;
            return {
              subEventId: scope.subEventId,
              attending: answer.attending!,
              ...(answer.attending && { partySize: answer.partySize }),
            };
          }),
        },
      },
      {
        onSuccess: onSent,
        onError: (failed) =>
          setError(
            failed instanceof ApiError && failed.status === 410
              ? t('withdrawnBody')
              : failed instanceof ApiError && failed.status === 429
                ? t('busyBody')
                : t('sendFailed'),
          ),
      },
    );
  }

  return (
    <Card className="gap-5" data-testid="rsvp-form">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">{t('joinUs')}</h2>
        <p className="text-small text-fg-secondary">{t('changeLater')}</p>
      </div>
      {open.map((scope) => (
        <ScopeAnswer
          key={scopeKey(scope)}
          scope={scope}
          answer={answers[scopeKey(scope)]!}
          onChange={(changes) => set(scopeKey(scope), changes)}
          titled={open.length > 1 || scope.subEvent !== null}
        />
      ))}
      {quiet.length > 0 && (
        <p className="rounded-control bg-surface-muted px-3 py-2 text-small text-fg-secondary">
          {t('noReplyFor', { names: quiet.map((scope) => scope.subEvent!.name).join(', ') })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <Button
        icon={<Send aria-hidden />}
        loading={rsvp.isPending}
        disabled={!ready}
        onClick={send}
        className="w-full"
      >
        {t('send')}
      </Button>
    </Card>
  );
}

function ScopeAnswer({
  scope,
  answer,
  onChange,
  titled,
}: {
  scope: InviteScope;
  answer: Answer;
  onChange: (changes: Partial<Answer>) => void;
  titled: boolean;
}) {
  const t = useTranslations('invite');
  const reduced = useShouldReduceMotion();
  const name = scope.subEvent?.name ?? null;
  const choice = (attending: boolean, label: string, Icon: typeof CircleCheck) => (
    <button
      type="button"
      role="radio"
      aria-checked={answer.attending === attending}
      onClick={() => onChange({ attending })}
      className={cn(
        'pressable flex h-12 flex-1 items-center justify-center gap-2 rounded-control border text-label',
        'transition-[background-color,border-color,color] duration-(--dur-fast) ease-(--ease-out)',
        answer.attending === attending
          ? attending
            ? 'border-primary bg-primary-tint text-primary-text'
            : 'border-border-strong bg-surface-muted text-fg'
          : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted',
      )}
    >
      <Icon aria-hidden className="size-5" />
      {label}
    </button>
  );
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={name ?? t('wholeEvent')}
      data-testid="rsvp-scope"
    >
      {titled && name && <h3 className="text-label">{name}</h3>}
      <div
        role="radiogroup"
        aria-label={name ? t('comingTo', { name }) : t('coming')}
        className="flex gap-2"
      >
        {choice(true, t('yes'), CircleCheck)}
        {choice(false, t('no'), CircleX)}
      </div>
      <AnimatePresence initial={false}>
        {answer.attending && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? duration.fast : duration.moderate, ease: ease.out }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 rounded-control bg-surface-muted p-3">
              <span id={`party-${scope.subEventId ?? 'event'}`} className="text-label">
                {t('howMany')}
              </span>
              <div
                role="group"
                aria-labelledby={`party-${scope.subEventId ?? 'event'}`}
                className="flex items-center gap-3"
              >
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label={t('fewer')}
                  disabled={answer.partySize <= 1}
                  onClick={() => onChange({ partySize: answer.partySize - 1 })}
                >
                  <Minus aria-hidden />
                </Button>
                <RollingNumber
                  value={answer.partySize}
                  testId="party-size"
                  className="h-10 w-8 text-h2"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label={t('more')}
                  disabled={answer.partySize >= MAX_PARTY}
                  onClick={() => onChange({ partySize: answer.partySize + 1 })}
                >
                  <Plus aria-hidden />
                </Button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * After replying: a green check draws, "See you there!" rises and confetti in the event's
 * colour, once per invitation (MOTION.md 6.8). Opening a link already answered shows this
 * without the celebration.
 */
function Confirmation({
  page,
  fresh,
  onChange,
}: {
  page: PublicInvite;
  /** Sent just now, rather than answered on an earlier visit. */
  fresh: boolean;
  onChange: () => void;
}) {
  const t = useTranslations('invite');
  const reduced = useShouldReduceMotion();
  const confetti = useConfetti();
  const ref = useRef<HTMLDivElement>(null);
  const open = page.scopes.filter((scope) => scope.canRespond);
  const coming = open.filter((scope) => scope.status === 'confirmed');
  const party = Math.max(0, ...coming.map((scope) => scope.partySize));
  const celebrate = fresh && coming.length > 0;
  useEffect(() => {
    if (!celebrate) return;
    // Once per invitation; the key names the guest, not the link's secret.
    void confetti({
      origin: ref.current,
      accent: ACCENT_HEX[page.event.type],
      onceKey: `invite:${page.event.name}:${page.guestName}`,
    });
  }, [celebrate, confetti, page.event.type, page.event.name, page.guestName]);

  return (
    <Card className="items-center gap-4 py-8 text-center" role="status" data-testid="rsvp-done">
      <div
        ref={ref}
        className="flex size-16 items-center justify-center rounded-full bg-success-tint"
      >
        {coming.length > 0 ? (
          <svg viewBox="0 0 24 24" className="size-9" fill="none" aria-hidden>
            <m.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="var(--success)"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: fresh && !reduced ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: duration.slow, ease: ease.out }}
            />
          </svg>
        ) : (
          <CircleCheck aria-hidden className="size-8 text-success" />
        )}
      </div>
      <m.div
        className="flex flex-col gap-1"
        initial={{ opacity: fresh ? 0 : 1, y: fresh && !reduced ? distance.rise : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.base, ease: ease.out, delay: fresh ? duration.slow : 0 }}
      >
        <h2 className="text-h2">{coming.length > 0 ? t('seeYou') : t('thanks')}</h2>
        <p className="text-body text-fg-secondary">
          {coming.length > 0
            ? t('comingCount', { count: party, event: page.event.name })
            : t('notComing')}
        </p>
      </m.div>
      {open.length > 1 && (
        <ul className="flex flex-wrap justify-center gap-2" data-testid="rsvp-summary">
          {open.map((scope) => (
            <li
              key={scopeKey(scope)}
              className={cn(
                'rounded-full px-3 py-1 text-small',
                scope.status === 'confirmed'
                  ? 'bg-success-tint text-success-text'
                  : 'bg-surface-muted text-fg-secondary',
              )}
            >
              {scope.subEvent?.name}:{' '}
              {scope.status === 'confirmed'
                ? t('partyShort', { count: scope.partySize })
                : t('notComingShort')}
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" icon={<Pencil aria-hidden />} onClick={onChange}>
        {t('change')}
      </Button>
    </Card>
  );
}
