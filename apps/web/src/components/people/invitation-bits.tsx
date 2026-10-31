'use client';

import type { DeliveryStatus, Invitation } from '@pme/contracts';
import { CircleCheck } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { CheckDraw } from '@/components/motion/check-draw';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { useSnackbar } from '@/components/motion/undo-snackbar';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { Button } from '@/components/ui/button';
import { subEventName, useSubEvents } from '@/lib/events';
import { duration, ease } from '@/lib/motion';
import { useUpdateInvitation } from '@/lib/people';
import { cn } from '@/lib/utils';

import { DeliveryChip, ShareButtons } from './people-bits';

/** How long a delivered card stays in "to deliver" before moving (MOTION.md 6.15). */
export const SETTLE_MS = 600;

/** People on the card: the largest party across its answers. */
export const partyOf = (invitation: Invitation) =>
  Math.max(1, ...invitation.attendance.map((row) => row.partySize));

export const isOut = (invitation: Invitation) => invitation.deliveryStatus !== 'not_sent';

/**
 * Ids marked delivered in the last 600 ms: lists keep them in place while the button
 * morphs, then let them move with ListPresence.
 */
export function useSettling() {
  const [settling, setSettling] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);
  const settle = (id: string) => {
    setSettling((current) => new Set(current).add(id));
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setSettling((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, SETTLE_MS),
    );
  };
  return { settling, settle };
}

/**
 * "Mark delivered" morphs to a green "Delivered" with CheckDraw (MOTION.md 6.15), then the
 * undo bar offers to put it back. Distributors may change only this on their own cards.
 */
export function MarkDelivered({
  invitation,
  onDelivered,
  size = 'sm',
  className,
}: {
  invitation: Invitation;
  onDelivered?: (id: string) => void;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const t = useTranslations('people.invitations');
  const { eventId } = useCurrentEvent();
  const reduced = useShouldReduceMotion();
  const update = useUpdateInvitation(eventId);
  const show = useSnackbar();
  const delivered = invitation.deliveryStatus === 'delivered_in_person';
  const [failed, setFailed] = useState(false);

  function mark() {
    const before: DeliveryStatus = invitation.deliveryStatus;
    setFailed(false);
    update.mutate(
      { invitation, changes: { deliveryStatus: 'delivered_in_person' } },
      {
        onSuccess: (updated) => {
          onDelivered?.(updated.id);
          show({
            message: t('deliveredTo', { name: updated.guestName }),
            onUndo: () =>
              update.mutateAsync({ invitation: updated, changes: { deliveryStatus: before } }),
          });
        },
        onError: () => setFailed(true),
      },
    );
  }

  return (
    <span className={cn('flex flex-col items-stretch gap-1', className)}>
      <Button
        type="button"
        size={size}
        variant={delivered ? 'secondary' : 'primary'}
        disabled={delivered}
        loading={update.isPending}
        onClick={mark}
        aria-label={delivered ? undefined : t('markDeliveredFor', { name: invitation.guestName })}
        className={cn(
          'transition-colors',
          delivered && 'border-success bg-success-tint text-success-text disabled:opacity-100',
        )}
        icon={delivered ? <CheckDraw checked size={18} /> : <CircleCheck aria-hidden />}
      >
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={delivered ? 'done' : 'mark'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? duration.instant : duration.fast, ease: ease.out }}
          >
            {delivered ? t('delivered') : t('markDelivered')}
          </m.span>
        </AnimatePresence>
      </Button>
      {failed && (
        <span role="alert" className="text-small text-danger-text">
          {t('failed')}
        </span>
      )}
    </span>
  );
}

/** One invitation in a list: guest, party, sub-events, delivery, and what I can do with it. */
export function InvitationLine({
  invitation,
  canMark,
  onOpen,
  onDelivered,
  distributorName,
}: {
  invitation: Invitation;
  canMark: boolean;
  onOpen?: () => void;
  onDelivered?: (id: string) => void;
  distributorName?: string | null;
}) {
  const t = useTranslations('people.invitations');
  const { eventId, event } = useCurrentEvent();
  const { data: subEvents } = useSubEvents(eventId);
  const names =
    event.guestScope === 'per_sub_event'
      ? invitation.subEventIds
          .map((id) => subEventName(subEvents, id).name)
          .filter(Boolean)
          .join(', ')
      : '';
  const title = <span className="truncate text-label">{invitation.guestName}</span>;
  return (
    <LiveRow entityId={invitation.id} className="rounded-card">
      <div
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center"
        data-testid="invitation-row"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {onOpen ? (
            <button type="button" onClick={onOpen} className="text-left hover:text-primary-text">
              {title}
            </button>
          ) : (
            title
          )}
          <span className="text-small text-fg-secondary">
            {[t('people', { count: partyOf(invitation) }), names, distributorName]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DeliveryChip status={invitation.deliveryStatus} />
          {canMark && invitation.deliveryStatus !== 'delivered_in_person' && (
            <MarkDelivered invitation={invitation} onDelivered={onDelivered} />
          )}
          {canMark && <ShareButtons invitation={invitation} />}
        </div>
      </div>
    </LiveRow>
  );
}

/**
 * Delivered in person, sent digitally and not sent as one bar; segments grow to new values
 * (MOTION.md 6.15, `slow`). Reduced motion: they jump.
 */
export function DeliveryBar({ invitations }: { invitations: readonly Invitation[] }) {
  const t = useTranslations('people.delivery');
  const reduced = useShouldReduceMotion();
  const total = invitations.length || 1;
  const count = (status: DeliveryStatus) =>
    invitations.filter((item) => item.deliveryStatus === status).length;
  const segments = [
    { status: 'delivered_in_person', className: 'bg-success' },
    { status: 'sent_digitally', className: 'bg-primary' },
    { status: 'not_sent', className: 'bg-border-strong' },
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted"
        role="img"
        aria-label={segments.map((s) => `${t(s.status)}: ${count(s.status)}`).join(', ')}
      >
        {segments.map((segment) => (
          <m.span
            key={segment.status}
            className={segment.className}
            initial={false}
            animate={{ width: `${(count(segment.status) / total) * 100}%` }}
            transition={{ duration: reduced ? 0 : duration.slow, ease: ease.out }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-fg-secondary">
        {segments.map((segment) => (
          <li key={segment.status} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2 rounded-full', segment.className)} />
            {t(segment.status)} <span className="tabular-nums">({count(segment.status)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
