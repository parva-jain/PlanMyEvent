'use client';

import type { DeliveryStatus, Invitation } from '@pme/contracts';
import { ChevronDown, MessageCircle, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useConfetti } from '@/components/motion/confetti';
import { CountUp } from '@/components/motion/count-up';
import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { ProgressFill } from '@/components/motion/progress-fill';
import { useSnackbar } from '@/components/motion/undo-snackbar';
import { ACCENT_HEX } from '@/components/shell/accents';
import { useCurrentEvent } from '@/components/shell/current-event';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { DeliveryBar, InvitationLine, isOut, useSettling } from './invitation-bits';
import { useMemberNames } from './people-bits';

/**
 * Invitations (Stitch "Invitations by distributor"): how many cards are out, each
 * distributor's progress, and every invitation with what's left to do.
 */
export function InvitationsTab({
  invitations,
  onOpen,
  onSendAll,
}: {
  invitations: Invitation[];
  /** Opens the guest's panel; absent without whole-event guests.view. */
  onOpen?: (invitation: Invitation) => void;
  onSendAll: (invitations: Invitation[]) => void;
}) {
  const t = useTranslations('people.invitations');
  const { can, membership } = useCurrentEvent();
  const memberNames = useMemberNames();
  const { settling, settle } = useSettling();
  const out = invitations.filter(isOut).length;
  const notSent = invitations.filter((item) => item.deliveryStatus === 'not_sent');
  useAllOutCelebration(invitations.length ? out === invitations.length : null);

  const canMark = (invitation: Invitation) =>
    can('guests.invite') || invitation.distributorMemberId === membership.member.id;

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-4" data-testid="invitations-summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3">
              <CountUp value={out} className="tabular-nums" />{' '}
              {t('outOf', { total: invitations.length })}
            </h2>
            <p className="text-small text-fg-secondary">{t('outHint')}</p>
          </div>
          {can('guests.invite') && notSent.length > 0 && (
            <Button icon={<MessageCircle aria-hidden />} onClick={() => onSendAll(notSent)}>
              {t('sendWhatsapp', { count: notSent.length })}
            </Button>
          )}
        </div>
        <DeliveryBar invitations={invitations} />
      </Card>

      <Tabs defaultValue="distributor" className="gap-4">
        <TabsList aria-label={t('viewLabel')}>
          <TabsTrigger value="distributor">{t('byDistributor')}</TabsTrigger>
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
        </TabsList>
        <TabsContent value="distributor" className="flex flex-col gap-3">
          {groups(invitations).map(([memberId, items]) => (
            <DistributorGroup
              key={memberId ?? 'none'}
              name={
                memberId
                  ? (memberNames.get(memberId) ??
                    (memberId === membership.member.id ? membership.member.name : t('teamMember')))
                  : t('noDistributor')
              }
              unassigned={memberId === null}
              invitations={items}
              settling={settling}
              renderLine={(invitation) => (
                <InvitationLine
                  invitation={invitation}
                  canMark={canMark(invitation)}
                  onOpen={onOpen && (() => onOpen(invitation))}
                  onDelivered={settle}
                />
              )}
            />
          ))}
        </TabsContent>
        <TabsContent value="all">
          <AllInvitations
            invitations={invitations}
            renderLine={(invitation) => (
              <InvitationLine
                invitation={invitation}
                canMark={canMark(invitation)}
                onOpen={onOpen && (() => onOpen(invitation))}
                distributorName={
                  invitation.distributorMemberId
                    ? (memberNames.get(invitation.distributorMemberId) ?? null)
                    : null
                }
              />
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Invitations by distributor, named ones first by size, then the unassigned. */
function groups(invitations: readonly Invitation[]): [string | null, Invitation[]][] {
  const byMember = new Map<string | null, Invitation[]>();
  for (const invitation of invitations) {
    const key = invitation.distributorMemberId;
    byMember.set(key, [...(byMember.get(key) ?? []), invitation]);
  }
  return [...byMember].sort(([a, left], [b, right]) =>
    a === null ? 1 : b === null ? -1 : right.length - left.length,
  );
}

function DistributorGroup({
  name,
  unassigned,
  invitations,
  settling,
  renderLine,
}: {
  name: string;
  unassigned: boolean;
  invitations: Invitation[];
  settling: Set<string>;
  renderLine: (invitation: Invitation) => ReactNode;
}) {
  const t = useTranslations('people.invitations');
  const [open, setOpen] = useState(invitations.length <= 30);
  const delivered = invitations.filter(isOut).length;
  const percent = Math.round((delivered / invitations.length) * 100);
  const left = invitations.filter((item) => !isOut(item) || settling.has(item.id));
  const done = invitations.filter((item) => isOut(item) && !settling.has(item.id));
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card',
        unassigned && 'border-dashed',
      )}
      aria-label={name}
      data-testid="distributor-group"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 text-left"
      >
        {!unassigned && (
          <ProgressFill
            variant="ring"
            size={44}
            value={percent}
            label={t('ringLabel', { name, percent })}
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-label">{name}</span>
          <span className="text-small text-fg-secondary">
            {unassigned
              ? t('unassignedCount', { count: invitations.length })
              : t('deliveredOf', { done: delivered, total: invitations.length })}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('size-5 text-fg-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-4">
          <ListPresence className="flex flex-col gap-2">
            {left.map((invitation) => (
              <ListItem key={invitation.id}>{renderLine(invitation)}</ListItem>
            ))}
          </ListPresence>
          {done.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-label text-fg-secondary">
                {t('doneGroup')} <span className="tabular-nums text-fg-muted">· {done.length}</span>
              </h3>
              <ListPresence className="flex flex-col gap-2">
                {done.map((invitation) => (
                  <ListItem key={invitation.id}>{renderLine(invitation)}</ListItem>
                ))}
              </ListPresence>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AllInvitations({
  invitations,
  renderLine,
}: {
  invitations: Invitation[];
  renderLine: (invitation: Invitation) => ReactNode;
}) {
  const t = useTranslations('people.invitations');
  const tDelivery = useTranslations('people.delivery');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | DeliveryStatus>('');
  const [shown, setShown] = useState(100);
  const needle = query.trim().toLowerCase();
  const filtered = invitations
    .filter((item) => !needle || item.guestName.toLowerCase().includes(needle))
    .filter((item) => !status || item.deliveryStatus === status)
    .sort((a, b) => a.guestName.localeCompare(b.guestName));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            type="search"
            aria-label={t('search')}
            placeholder={t('search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 lg:h-10"
          />
        </div>
        <Select
          size="sm"
          aria-label={t('status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="sm:w-auto"
        >
          <option value="">{t('anyStatus')}</option>
          {(['not_sent', 'sent_digitally', 'delivered_in_person'] as const).map((item) => (
            <option key={item} value={item}>
              {tDelivery(item)}
            </option>
          ))}
        </Select>
      </div>
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-body text-fg-secondary">{t('noMatches')}</p>
      ) : (
        <ListPresence className="flex flex-col gap-2">
          {filtered.slice(0, shown).map((invitation) => (
            <ListItem key={invitation.id}>{renderLine(invitation)}</ListItem>
          ))}
        </ListPresence>
      )}
      {filtered.length > shown && (
        <Button variant="secondary" className="self-center" onClick={() => setShown(shown + 100)}>
          {t('showMore', { count: filtered.length - shown })}
        </Button>
      )}
    </div>
  );
}

/**
 * "Every invitation is out": one Confetti burst and a toast when the last card is
 * delivered or sent, once per event (MOTION.md 6.15). Only a change counts.
 */
function useAllOutCelebration(allOut: boolean | null) {
  const t = useTranslations('people.invitations');
  const { eventId, event } = useCurrentEvent();
  const confetti = useConfetti();
  const show = useSnackbar();
  const previous = useRef<boolean | null>(null);
  useEffect(() => {
    if (allOut === null) return;
    const before = previous.current;
    previous.current = allOut;
    if (before === false && allOut) {
      void confetti({ accent: ACCENT_HEX[event.type], onceKey: `invitations-out:${eventId}` });
      show({ message: t('allOut') });
    }
  }, [allOut, confetti, show, t, eventId, event.type]);
}
