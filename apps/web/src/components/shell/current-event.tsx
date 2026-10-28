'use client';

import { can, type Event, type MyMembership, type Permission } from '@pme/contracts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createContext, use, type ReactNode } from 'react';

import { FullPageLoading } from '@/components/auth/full-page-loading';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useEvent } from '@/lib/events';
import { useMyMembership } from '@/lib/team';

import { MY_EVENTS_HREF } from './nav';

interface CurrentEventContext {
  eventId: string;
  event: Event;
  membership: MyMembership;
  /**
   * Whether I hold `permission`, for the whole event or inside `subEventId`. Only hides
   * what I can't do; the API enforces it either way (APIDesign "Permissions the client can read").
   */
  can: (permission: Permission, subEventId?: string | null) => boolean;
}

const Context = createContext<CurrentEventContext | null>(null);

/**
 * Loads the event in the URL, and my membership in it, for the whole shell. A 404 (missing,
 * deleted, or not a member, which the API answers the same way) shows a way back to My events.
 */
export function CurrentEventProvider({
  eventId,
  children,
}: {
  eventId: string;
  children: ReactNode;
}) {
  const t = useTranslations('app.event');
  const eventQuery = useEvent(eventId);
  const membershipQuery = useMyMembership(eventId);
  const event = eventQuery.data;
  const membership = membershipQuery.data;
  const error = eventQuery.error ?? membershipQuery.error;
  const isFetching = eventQuery.isFetching || membershipQuery.isFetching;
  const refetch = () => Promise.all([eventQuery.refetch(), membershipQuery.refetch()]);

  if (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
      >
        <p className="text-h3">{missing ? t('notFound') : t('loadFailed')}</p>
        {missing ? (
          <Button asChild variant="secondary" icon={<ArrowLeft aria-hidden />}>
            <Link href={MY_EVENTS_HREF}>{t('backToEvents')}</Link>
          </Button>
        ) : (
          <Button variant="secondary" loading={isFetching} onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        )}
      </div>
    );
  }
  if (!event || !membership) {
    return (
      <div className="flex min-h-dvh">
        <FullPageLoading />
      </div>
    );
  }
  return (
    <Context
      value={{
        eventId,
        event,
        membership,
        can: (permission, subEventId) => can(membership.permissions, permission, subEventId),
      }}
    >
      {children}
    </Context>
  );
}

export function useCurrentEvent(): CurrentEventContext {
  const value = use(Context);
  if (!value) {
    throw new Error('useCurrentEvent must be used inside CurrentEventProvider');
  }
  return value;
}
