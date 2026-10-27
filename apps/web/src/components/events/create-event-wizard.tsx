'use client';

import {
  starterSubEvents,
  type CreatedEvent,
  type Event,
  type EventTemplate,
  type TemplateKey,
} from '@pme/contracts';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Heart,
  MapPin,
  PartyPopper,
  Plus,
  Presentation,
  Store,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { useConfetti } from '@/components/motion/confetti';
import { CountUp } from '@/components/motion/count-up';
import { LogoMark } from '@/components/motion/logo-mark';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { Skeleton } from '@/components/motion/skeleton';
import { ACCENT } from '@/components/shell/accents';
import { eventHref, MY_EVENTS_HREF } from '@/components/shell/nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useCreateEvent, useTemplates } from '@/lib/events';
import { daysUntil, formatEventDate, formatEventRange, timeZoneOptions } from '@/lib/format';
import { distance, duration, ease, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

const ICONS: Record<TemplateKey, LucideIcon> = {
  wedding: Heart,
  conference: Presentation,
  fair: Store,
  celebration: PartyPopper,
  custom: Plus,
};

/** Accent hex per type, for the success confetti (DESIGN.md "Event accents"). */
const ACCENT_HEX: Record<Event['type'], string> = {
  wedding: '#E11D74',
  conference: '#2563EB',
  fair: '#0D9488',
  celebration: '#EA580C',
  custom: '#7C3AED',
};

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

type Step = 1 | 2 | 3;

interface Details {
  name: string;
  startsOn: string;
  endsOn: string;
  timeZone: string;
  venue: string;
}

type FieldErrors = Partial<Record<keyof Details, string>>;

/**
 * Create an event in three steps (Stitch "Create Event"): template, details with a live
 * preview, review. One Idempotency-Key per wizard visit makes a double tap or a retried
 * request create one event, not two. MOTION.md 6.4: steps slide 24 px with a crossfade
 * (forward left, back right); the success card pops with confetti.
 */
export function CreateEventWizard() {
  const t = useTranslations('wizard');
  const tErrors = useTranslations('wizard.errors');
  const reduced = useShouldReduceMotion();
  const { data: templates } = useTemplates();
  const create = useCreateEvent();
  const fireConfetti = useConfetti();
  const successRef = useRef<HTMLDivElement>(null);

  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState(1);
  const [templateKey, setTemplateKey] = useState<TemplateKey | null>(null);
  const [details, setDetails] = useState<Details>({
    name: '',
    startsOn: '',
    endsOn: '',
    timeZone: DEFAULT_TIME_ZONE,
    venue: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<CreatedEvent | null>(null);

  const template = templates?.find((item) => item.key === templateKey) ?? null;
  const zones = useMemo(() => timeZoneOptions(details.timeZone), [details.timeZone]);

  const go = (next: Step) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  function validateDetails(): boolean {
    const found: FieldErrors = {};
    if (!details.name.trim()) found.name = tErrors('name');
    if (!details.startsOn) found.startsOn = tErrors('startsOn');
    if (details.endsOn && details.startsOn && details.endsOn < details.startsOn) {
      found.endsOn = tErrors('endsOn');
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  function submit() {
    if (!templateKey) return;
    create.mutate(
      {
        idempotencyKey,
        body: {
          templateKey,
          name: details.name.trim(),
          startsOn: details.startsOn,
          endsOn: details.endsOn || details.startsOn,
          timeZone: details.timeZone,
          ...(details.venue.trim() ? { venue: { name: details.venue.trim() } } : {}),
        },
      },
      {
        onSuccess: (event) => {
          setCreated(event);
          void fireConfetti({ origin: successRef.current, accent: ACCENT_HEX[event.type] });
        },
        onError: (error) => {
          // The API's field errors map back onto step 2.
          if (error instanceof ApiError && error.problem?.fields?.length) {
            setErrors(
              Object.fromEntries(error.problem.fields.map((field) => [field.path, field.message])),
            );
            go(2);
          }
        },
      },
    );
  }

  const slide = {
    initial: { opacity: 0, x: reduced ? 0 : direction * distance.riseLarge },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: reduced ? 0 : -direction * distance.riseLarge },
    transition: { duration: reduced ? duration.fast : duration.moderate, ease: ease.out },
  };

  if (created) {
    return (
      <Shell step={3} hideSteps>
        <m.div
          ref={successRef}
          initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: duration.fast } : spring.bouncy}
          className="mx-auto w-full max-w-lg"
        >
          <Card className="items-center gap-4 py-10 text-center" role="status">
            <span className="flex size-14 items-center justify-center rounded-full bg-success-tint text-success-text">
              <Check aria-hidden className="size-7" />
            </span>
            <h1 className="text-h2">{t('done.title')}</h1>
            <p className="text-body text-fg-secondary">
              {t('done.body', { name: created.name, subEvents: created.counts.subEvents })}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild icon={<ArrowRight aria-hidden />}>
                <Link href={eventHref(created.id)}>{t('done.open')}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={MY_EVENTS_HREF}>{t('done.myEvents')}</Link>
              </Button>
            </div>
          </Card>
        </m.div>
      </Shell>
    );
  }

  return (
    <Shell
      step={step}
      footer={
        <>
          <Button
            variant="ghost"
            icon={<ArrowLeft aria-hidden />}
            disabled={step === 1 || create.isPending}
            onClick={() => go((step - 1) as Step)}
          >
            {t('back')}
          </Button>
          <span className="ml-auto hidden text-small text-fg-muted sm:inline">
            {t('stepOf', { step, total: 3 })}
          </span>
          {step < 3 ? (
            <Button
              disabled={step === 1 && !templateKey}
              onClick={() => {
                if (step === 2 && !validateDetails()) return;
                go((step + 1) as Step);
              }}
            >
              {t('continue')}
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button loading={create.isPending} onClick={submit} icon={<Check aria-hidden />}>
              {t('create')}
            </Button>
          )}
        </>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.section key={step} {...slide} className="flex flex-col gap-8">
          {step === 1 && (
            <TemplateStep templates={templates} selected={templateKey} onSelect={setTemplateKey} />
          )}
          {step === 2 && template && (
            <DetailsStep
              template={template}
              details={details}
              errors={errors}
              zones={zones}
              onChange={(changes) => {
                setDetails((current) => ({ ...current, ...changes }));
                setErrors((current) => {
                  const next = { ...current };
                  for (const key of Object.keys(changes)) delete next[key as keyof Details];
                  return next;
                });
              }}
              onSubmit={() => validateDetails() && go(3)}
            />
          )}
          {step === 3 && template && <ReviewStep template={template} details={details} />}
          {create.isError &&
            !(create.error instanceof ApiError && create.error.problem?.fields?.length) && (
              <p role="alert" className="text-small text-danger-text">
                {t('errors.failed')}
              </p>
            )}
        </m.section>
      </AnimatePresence>
    </Shell>
  );
}

/** Page frame: logo, step indicator, Cancel, and a sticky footer with the actions. */
function Shell({
  step,
  hideSteps = false,
  footer,
  children,
}: {
  step: Step;
  hideSteps?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('wizard');
  const steps = [t('steps.template'), t('steps.details'), t('steps.review')];
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-content items-center gap-3 px-4 lg:px-8">
          <LogoMark size={32} />
          <span className="text-h3 font-bold">{t('title')}</span>
          <Link
            href={MY_EVENTS_HREF}
            className="ml-auto flex items-center gap-1 rounded-control px-2 py-1 text-label text-fg-secondary hover:text-fg"
          >
            <X aria-hidden className="size-4" />
            {t('cancel')}
          </Link>
        </div>
      </header>
      {!hideSteps && (
        <ol className="mx-auto mt-6 flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-small sm:gap-4">
          {steps.map((label, index) => {
            const number = index + 1;
            const state = number < step ? 'done' : number === step ? 'current' : 'todo';
            return (
              <li
                key={label}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2',
                  state === 'current' && 'font-semibold text-primary-text',
                  state === 'done' && 'text-success-text',
                  state === 'todo' && 'text-fg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-caption',
                    state === 'current' && 'bg-primary text-on-primary',
                    state === 'done' && 'bg-success-tint',
                    state === 'todo' && 'bg-surface-muted',
                  )}
                >
                  {state === 'done' ? <Check aria-hidden className="size-3.5" /> : number}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      )}
      <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 py-8 lg:px-8">
        {children}
      </main>
      {footer && (
        <footer className="sticky bottom-0 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          <div className="mx-auto flex h-18 max-w-content items-center gap-3 px-4 lg:px-8">
            {footer}
          </div>
        </footer>
      )}
    </div>
  );
}

function TemplateStep({
  templates,
  selected,
  onSelect,
}: {
  templates: EventTemplate[] | undefined;
  selected: TemplateKey | null;
  onSelect: (key: TemplateKey) => void;
}) {
  const t = useTranslations('wizard.template');
  const tTemplates = useTranslations('wizard.templates');
  const reduced = useShouldReduceMotion();

  return (
    <>
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
        <p className="text-body text-fg-secondary">{t('subtitle')}</p>
      </header>
      <div
        role="radiogroup"
        aria-label={t('title')}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {!templates &&
          Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-40" />)}
        {templates?.map(({ key }) => {
          const Icon = ICONS[key];
          const accent = ACCENT[key];
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(key)}
              data-testid={`template-${key}`}
              className={cn(
                'pressable relative flex flex-col gap-3 overflow-hidden rounded-card border bg-surface p-5 pt-6 text-left shadow-card',
                'transition-[border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) hover:shadow-raised',
                isSelected ? 'border-primary ring-3 ring-primary-tint' : 'border-border',
                key === 'custom' && !isSelected && 'border-dashed',
              )}
            >
              {key !== 'custom' && (
                <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1.5', accent.bg)} />
              )}
              <span
                className={cn(
                  'flex size-12 items-center justify-center rounded-control',
                  accent.tint,
                  accent.text,
                )}
              >
                <Icon aria-hidden className="size-6" />
              </span>
              <span className="text-h3">{tTemplates(`${key}.name`)}</span>
              <span className="text-small text-fg-secondary">
                {tTemplates(`${key}.description`)}
              </span>
              {isSelected && (
                <m.span
                  initial={{ scale: reduced ? 1 : 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: duration.fast, ease: ease.overshoot }}
                  className="absolute top-5 right-5 flex size-6 items-center justify-center rounded-full bg-primary text-on-primary"
                >
                  <Check aria-hidden className="size-4" />
                </m.span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function DetailsStep({
  template,
  details,
  errors,
  zones,
  onChange,
  onSubmit,
}: {
  template: EventTemplate;
  details: Details;
  errors: FieldErrors;
  zones: string[];
  onChange: (changes: Partial<Details>) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('wizard.details');
  const tTemplates = useTranslations('wizard.templates');
  const tTypes = useTranslations('app.eventTypes');
  const accent = ACCENT[template.key];
  const endsOn = details.endsOn || details.startsOn;
  const subEventCount =
    details.startsOn && endsOn >= details.startsOn
      ? starterSubEvents(template, details.startsOn, endsOn).length
      : template.subEvents.length;
  const days = details.startsOn ? daysUntil(details.startsOn) : null;

  /** aria wiring for a field's error text (Field renders it with id `<field>-error`). */
  const invalid = (key: keyof Details) =>
    errors[key] ? { 'aria-invalid': true as const, 'aria-describedby': `${key}-error` } : {};

  return (
    <>
      <header className="flex flex-col gap-2">
        <span
          className={cn('self-start rounded-full px-3 py-1 text-small', accent.tint, accent.text)}
        >
          {tTemplates(`${template.key}.name`)}
        </span>
        <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <form
            className="flex flex-col gap-5"
            noValidate
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <Field id="name" label={t('name')} error={errors.name}>
              <Input
                id="name"
                value={details.name}
                maxLength={120}
                placeholder={t('namePlaceholder')}
                onChange={(event) => onChange({ name: event.target.value })}
                {...invalid('name')}
                autoFocus
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="startsOn" label={t('startsOn')} error={errors.startsOn}>
                <Input
                  id="startsOn"
                  type="date"
                  value={details.startsOn}
                  onChange={(event) => onChange({ startsOn: event.target.value })}
                  {...invalid('startsOn')}
                />
              </Field>
              <Field id="endsOn" label={t('endsOn')} aside={t('optional')} error={errors.endsOn}>
                <Input
                  id="endsOn"
                  type="date"
                  min={details.startsOn || undefined}
                  value={details.endsOn}
                  onChange={(event) => onChange({ endsOn: event.target.value })}
                  {...invalid('endsOn')}
                />
              </Field>
            </div>
            <Field id="venue" label={t('venue')} aside={t('optional')} hint={t('venueHint')}>
              <Input
                id="venue"
                value={details.venue}
                maxLength={120}
                placeholder={t('venuePlaceholder')}
                onChange={(event) => onChange({ venue: event.target.value })}
              />
            </Field>
            <Field
              id="timeZone"
              label={t('timeZone')}
              hint={t('timeZoneHint')}
              error={errors.timeZone}
            >
              <select
                id="timeZone"
                value={details.timeZone}
                onChange={(event) => onChange({ timeZone: event.target.value })}
                className="h-12 w-full rounded-control border border-border-strong bg-surface-muted px-4 text-body text-fg focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary-tint focus-visible:outline-none"
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            {/* Enter submits the step. */}
            <button type="submit" hidden />
          </form>
        </Card>

        <aside aria-label={t('preview')} className="flex flex-col gap-2">
          <p className="text-caption text-fg-muted">{t('preview')}</p>
          <Card className="gap-3 overflow-hidden pt-0 sm:pt-0">
            <span aria-hidden className={cn('-mx-4 h-1.5 sm:-mx-6', accent.bg)} />
            <div className="flex items-center gap-2 pt-2">
              <span className={cn('rounded-full px-3 py-0.5 text-small', accent.tint, accent.text)}>
                {tTypes(template.key)}
              </span>
              {days !== null && days >= 0 && (
                <span className="ml-auto text-small text-fg-muted">
                  <CountUp value={days} /> {t('daysToGo')}
                </span>
              )}
            </div>
            <p className="text-h3 break-words">{details.name.trim() || t('namePlaceholder')}</p>
            {details.startsOn && (
              <p className="flex items-center gap-1.5 text-small text-fg-secondary">
                <CalendarDays aria-hidden className="size-4" />
                {formatEventRange(
                  details.startsOn,
                  endsOn >= details.startsOn ? endsOn : details.startsOn,
                )}
              </p>
            )}
            {details.venue.trim() && (
              <p className="flex items-center gap-1.5 text-small text-fg-secondary">
                <MapPin aria-hidden className="size-4" />
                {details.venue.trim()}
              </p>
            )}
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-label">{t('youGet')}</p>
              <p className="flex items-center gap-2 text-small text-fg-secondary">
                <Check aria-hidden className="size-4 text-success" />
                <span>
                  <CountUp value={subEventCount} /> {t('subEvents')}
                </span>
              </p>
              <p className="flex items-center gap-2 text-small text-fg-secondary">
                <Check aria-hidden className="size-4 text-success" />
                {t('modules', {
                  count: template.modules.filter((item) => item.enabled).length,
                })}
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

function ReviewStep({ template, details }: { template: EventTemplate; details: Details }) {
  const t = useTranslations('wizard.review');
  const tModules = useTranslations('wizard.modules');
  const tModes = useTranslations('wizard.responseModes');
  const endsOn = details.endsOn || details.startsOn;
  const subEvents = starterSubEvents(template, details.startsOn, endsOn);

  return (
    <>
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
        <p className="text-body text-fg-secondary">{t('subtitle')}</p>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Card>
          <h2 className="text-h3">{t('schedule', { count: subEvents.length })}</h2>
          {subEvents.length === 0 ? (
            <p className="text-body text-fg-secondary">{t('noSubEvents')}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="review-sub-events">
              {subEvents.map((item) => (
                <li
                  key={`${item.name}-${item.date}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-control bg-surface-muted px-4 py-3"
                >
                  <span className="text-label">{item.name}</span>
                  <span className="text-small text-fg-secondary tabular-nums">
                    {formatEventDate(item.date, { weekday: true })} · {item.start}–{item.end}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="text-h3">{t('modulesTitle')}</h2>
          <ul className="flex flex-wrap gap-2">
            {template.modules.map(({ module, enabled }) => (
              <li
                key={module}
                className={cn(
                  'rounded-full px-3 py-1 text-small',
                  enabled
                    ? 'bg-primary-tint text-primary-text'
                    : 'bg-surface-muted text-fg-muted line-through',
                )}
              >
                {tModules(module)}
              </li>
            ))}
          </ul>
          <p className="text-small text-fg-secondary">
            {t('responseMode')}{' '}
            <strong className="font-semibold text-fg">{tModes(template.responseMode)}</strong>
          </p>
        </Card>
        <p className="text-center text-small text-fg-muted">{t('changeLater')}</p>
      </div>
    </>
  );
}
