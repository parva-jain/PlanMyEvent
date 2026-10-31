'use client';

import type { Invitation } from '@pme/contracts';
import { Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { ProgressFill } from '@/components/motion/progress-fill';
import { Skeleton } from '@/components/motion/skeleton';
import { useSnackbar } from '@/components/motion/undo-snackbar';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInvitations } from '@/lib/people';

import { MarkDelivered, partyOf, useSettling } from './invitation-bits';
import { DeliveryChip, ShareButtons } from './people-bits';

const delivered = (invitation: Invitation) => invitation.deliveryStatus === 'delivered_in_person';

/**
 * Cards to deliver (Stitch "Cards to deliver"): a team member who hands over invitation
 * cards sees only theirs, marks each delivered, or sends it on WhatsApp instead. The API
 * lists only the cards they distribute.
 */
export function MyCards() {
  const t = useTranslations('people.myCards');
  const { eventId, membership } = useCurrentEvent();
  const { data: all, isError, refetch } = useInvitations(eventId);
  const { settling, settle } = useSettling();
  const [query, setQuery] = useState('');
  const cards = (all ?? []).filter((item) => item.distributorMemberId === membership.member.id);
  const done = cards.filter(delivered).length;
  useFinishedToast(all ? cards.length - done : null, cards.length);

  const needle = query.trim().toLowerCase();
  const matching = cards
    .filter((item) => !needle || item.guestName.toLowerCase().includes(needle))
    .sort((a, b) => a.guestName.localeCompare(b.guestName));
  const toDeliver = matching.filter((item) => !delivered(item) || settling.has(item.id));
  const handed = matching.filter((item) => delivered(item) && !settling.has(item.id));

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
        <p className="text-body text-fg-secondary">{t('subtitle')}</p>
      </div>
      {isError && (
        <Card className="items-center gap-3 py-8 text-center">
          <p className="text-body">{t('loadFailed')}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Card>
      )}
      {!all && !isError && <Skeleton className="h-40" />}
      {all && cards.length === 0 && (
        <Card className="items-center gap-2 py-12 text-center" data-testid="no-cards">
          <h2 className="text-h3">{t('emptyTitle')}</h2>
          <p className="max-w-md text-body text-fg-secondary">{t('emptyBody')}</p>
        </Card>
      )}
      {cards.length > 0 && (
        <>
          <Card className="flex-row items-center gap-4" data-testid="my-cards-summary">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-h2 tabular-nums">
                {t('deliveredOf', { done, total: cards.length })}
              </span>
              <span className="text-small text-fg-secondary">
                {t('remaining', { count: cards.length - done })}
              </span>
            </div>
            <ProgressFill
              variant="ring"
              size={64}
              value={(done / cards.length) * 100}
              label={t('ringLabel')}
            />
          </Card>
          <div className="relative">
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
              className="pl-10"
            />
          </div>
          <Tabs defaultValue="todo" className="gap-4">
            <TabsList aria-label={t('viewLabel')}>
              <TabsTrigger value="todo">
                {t('toDeliver')} <span className="tabular-nums">· {toDeliver.length}</span>
              </TabsTrigger>
              <TabsTrigger value="done">
                {t('delivered')} <span className="tabular-nums">· {handed.length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="todo">
              <ListPresence className="flex flex-col gap-3" data-testid="cards-to-deliver">
                {toDeliver.map((invitation) => (
                  <ListItem key={invitation.id}>
                    <CardLine invitation={invitation} onDelivered={settle} />
                  </ListItem>
                ))}
              </ListPresence>
              {toDeliver.length === 0 && (
                <p className="py-6 text-center text-body text-fg-secondary">{t('allDone')}</p>
              )}
            </TabsContent>
            <TabsContent value="done">
              <ListPresence className="flex flex-col gap-3" data-testid="cards-delivered">
                {handed.map((invitation) => (
                  <ListItem key={invitation.id}>
                    <CardLine invitation={invitation} />
                  </ListItem>
                ))}
              </ListPresence>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function CardLine({
  invitation,
  onDelivered,
}: {
  invitation: Invitation;
  onDelivered?: (id: string) => void;
}) {
  const t = useTranslations('people.myCards');
  return (
    <LiveRow entityId={invitation.id} className="rounded-card">
      <div
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
        data-testid="card-row"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-h3">{invitation.guestName}</span>
          <DeliveryChip status={invitation.deliveryStatus} />
        </div>
        <span className="flex items-center gap-1.5 text-small text-fg-secondary">
          <Users aria-hidden className="size-4" />
          {t('people', { count: partyOf(invitation) })}
        </span>
        {!delivered(invitation) || onDelivered ? (
          <MarkDelivered invitation={invitation} onDelivered={onDelivered} size="default" />
        ) : null}
        <ShareButtons invitation={invitation} />
      </div>
    </LiveRow>
  );
}

/** "All 60 of your cards are delivered": a toast, no confetti (MOTION.md 6.15). */
function useFinishedToast(left: number | null, total: number) {
  const t = useTranslations('people.myCards');
  const show = useSnackbar();
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (left === null) return;
    const before = previous.current;
    previous.current = left;
    if (before !== null && before > 0 && left === 0 && total > 0) {
      show({ message: t('finished', { count: total }) });
    }
  }, [left, total, show, t]);
}
