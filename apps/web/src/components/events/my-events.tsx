'use client';

import type { MyEvent } from '@pme/contracts';
import { ArrowRight, CalendarDays, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { LogoMark } from '@/components/motion/logo-mark';
import { Reveal, RevealGroup } from '@/components/motion/reveal';
import { Skeleton } from '@/components/motion/skeleton';
import { ACCENT } from '@/components/shell/accents';
import { eventHref, NEW_EVENT_HREF } from '@/components/shell/nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useMyEvents } from '@/lib/events';
import { daysUntil, formatEventRange } from '@/lib/format';
import { cn } from '@/lib/utils';

function EventCard({ event }: { event: MyEvent }) {
  const t = useTranslations('app');
  const accent = ACCENT[event.type];
  const days = daysUntil(event.startsOn);
  return (
    <Link href={eventHref(event.id)} className="block h-full rounded-card" data-testid="event-card">
      <Card interactive className="h-full gap-3 overflow-hidden pt-0 sm:pt-0">
        <span aria-hidden className={cn('-mx-4 h-1.5 sm:-mx-6', accent.bg)} />
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className={cn('rounded-full px-3 py-0.5 text-small', accent.tint, accent.text)}>
            {t(`eventTypes.${event.type}`)}
          </span>
          <span className="rounded-full bg-surface-muted px-3 py-0.5 text-small text-fg-secondary">
            {t(`eventStatus.${event.status}`)}
          </span>
          {days >= 0 && (
            <span className="ml-auto text-small text-fg-muted">
              {days === 0 ? t('myEvents.today') : t('myEvents.daysToGo', { days })}
            </span>
          )}
        </div>
        <h2 className="text-h3">{event.name}</h2>
        <p className="flex items-center gap-1.5 text-small text-fg-secondary">
          <CalendarDays aria-hidden className="size-4" />
          {formatEventRange(event.startsOn, event.endsOn)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2">
          {event.roles.length > 0 && (
            <span className="text-small text-fg-secondary" data-testid="event-roles">
              {t('myEvents.yourRoles', { roles: event.roles.join(', ') })}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-label text-primary-text">
            {t('myEvents.open')}
            <ArrowRight aria-hidden className="size-4" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

/** Signed-in landing page (Stitch "My Events"): cards with accent strips, or an empty state. */
export function MyEvents() {
  const t = useTranslations('app');
  const { data: events, isPending, isError, refetch } = useMyEvents();

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-content items-center gap-3 px-4 lg:px-8">
          <LogoMark size={32} />
          <span className="text-h3 font-bold">{t('brand')}</span>
          <SignOutButton className="ml-auto" />
        </div>
      </header>
      <main id="main" className="mx-auto flex max-w-content flex-col gap-8 px-4 py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-h1-phone sm:text-h1">{t('myEvents.title')}</h1>
            <p className="text-body text-fg-secondary">{t('myEvents.subtitle')}</p>
          </div>
          {events && events.length > 0 && (
            <Button asChild icon={<Plus aria-hidden />}>
              <Link href={NEW_EVENT_HREF}>{t('myEvents.newEvent')}</Link>
            </Button>
          )}
        </div>

        {isPending && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-44" />
            ))}
          </div>
        )}

        {isError && (
          <Card role="alert" className="items-start">
            <p className="text-body">{t('myEvents.loadFailed')}</p>
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('event.retry')}
            </Button>
          </Card>
        )}

        {events && events.length === 0 && (
          <Reveal>
            <Card className="items-center gap-3 py-12 text-center sm:py-16">
              <span className="flex size-14 items-center justify-center rounded-full bg-primary-tint text-primary-text">
                <CalendarDays aria-hidden className="size-7" />
              </span>
              <h2 className="text-h3">{t('myEvents.emptyTitle')}</h2>
              <p className="max-w-md text-body text-fg-secondary">{t('myEvents.emptyBody')}</p>
              <Button asChild icon={<Plus aria-hidden />}>
                <Link href={NEW_EVENT_HREF}>{t('myEvents.createFirst')}</Link>
              </Button>
            </Card>
          </Reveal>
        )}

        {events && events.length > 0 && (
          <RevealGroup pace="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <Reveal key={event.id}>
                <EventCard event={event} />
              </Reveal>
            ))}
          </RevealGroup>
        )}
      </main>
    </div>
  );
}
