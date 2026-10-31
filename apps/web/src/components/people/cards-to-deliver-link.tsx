'use client';

import { canSomewhere } from '@pme/contracts';
import { ChevronRight, Mails } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useCurrentEvent } from '@/components/shell/current-event';
import { eventHref } from '@/components/shell/nav';
import { useInvitations } from '@/lib/people';

/**
 * On the event's home, for someone who hands over invitation cards but can't see the guest
 * list: the People section isn't in their nav, so this is their way to the cards.
 */
export function CardsToDeliverLink() {
  const { membership } = useCurrentEvent();
  return canSomewhere(membership.permissions, 'guests.view') ? null : <CardsLink />;
}

function CardsLink() {
  const t = useTranslations('people.myCards');
  const { eventId, membership } = useCurrentEvent();
  const { data } = useInvitations(eventId);
  const mine = (data ?? []).filter((item) => item.distributorMemberId === membership.member.id);
  const left = mine.filter((item) => item.deliveryStatus !== 'delivered_in_person').length;
  if (mine.length === 0) return null;
  return (
    <Link
      href={eventHref(eventId, 'people')}
      data-testid="cards-to-deliver-link"
      className="hover-lift flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card sm:p-6"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-tint">
        <Mails aria-hidden className="size-6 text-accent-text" />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-h3">{t('title')}</span>
        <span className="text-small text-fg-secondary">
          {left ? t('remaining', { count: left }) : t('allDone')}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 text-fg-muted" />
    </Link>
  );
}
