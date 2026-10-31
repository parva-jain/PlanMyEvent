'use client';

import { canSomewhere, type Invitation } from '@pme/contracts';
import { Upload, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { CountUp } from '@/components/motion/count-up';
import { EditPanel } from '@/components/motion/side-panel';
import { Skeleton } from '@/components/motion/skeleton';
import { useCurrentEvent } from '@/components/shell/current-event';
import { eventHref } from '@/components/shell/nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAttendance, useContacts, useHouseholds, useInvitations } from '@/lib/people';

import { GuestList } from './guest-list';
import { GuestPanelBody } from './guest-panel';
import { InvitationsTab } from './invitations-tab';
import { MyCards } from './my-cards';
import { guestRows } from './people-bits';
import { ResponsesTab } from './responses-tab';
import { SendSequence } from './send-sequence';

/** What the panel shows: a new guest, or a household or contact by id. */
type Panel = { kind: 'new' } | { kind: 'household' | 'contact'; id: string };

/**
 * People: guests, invitations and responses. Whole-event guests.view sees everything;
 * guests.view for some sub-events sees their invitations and answers; anyone else lands on
 * the cards they hand over.
 */
export function People() {
  const { membership } = useCurrentEvent();
  return canSomewhere(membership.permissions, 'guests.view') ? <PeopleScreen /> : <MyCards />;
}

function PeopleScreen() {
  const t = useTranslations('people');
  const { eventId, can } = useCurrentEvent();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seesAll = can('guests.view');
  const households = useHouseholds(eventId, seesAll);
  const contacts = useContacts(eventId, seesAll);
  const invitations = useInvitations(eventId);
  const attendance = useAttendance(eventId);
  const [chosen, setChosen] = useState<Panel | null>(null);
  const [sending, setSending] = useState<Invitation[] | null>(null);
  // Quick add's "Guest" lands here with ?add=1.
  const panel: Panel | null = searchParams.get('add') === '1' ? { kind: 'new' } : chosen;
  const setPanel = (next: Panel | null) => {
    setChosen(next);
    if (searchParams.has('add')) router.replace(pathname, { scroll: false });
  };

  const rows = useMemo(
    () => guestRows(households.data ?? [], contacts.data ?? [], invitations.data ?? []),
    [households.data, contacts.data, invitations.data],
  );
  const loading =
    (seesAll && (!households.data || !contacts.data)) || !invitations.data || !attendance.data;
  const failed =
    households.isError || contacts.isError || invitations.isError || attendance.isError;
  const retry = () =>
    void Promise.all([
      households.refetch(),
      contacts.refetch(),
      invitations.refetch(),
      attendance.refetch(),
    ]);
  const expected = rows.households.reduce((sum, row) => sum + row.expected, 0);

  const current =
    panel && panel.kind !== 'new'
      ? (panel.kind === 'household' ? rows.households : rows.everyone).find(
          (row) => row.kind === panel.kind && row.id === panel.id,
        )
      : undefined;
  const openGuest = (guest: { householdId: string | null; contactId: string | null }) =>
    seesAll &&
    setPanel(
      guest.householdId
        ? { kind: 'household', id: guest.householdId }
        : { kind: 'contact', id: guest.contactId! },
    );
  const empty = seesAll && !loading && rows.everyone.length === 0 && rows.households.length === 0;

  return (
    <div className="flex flex-col gap-6 pb-24 lg:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
          {!loading && (
            <p className="text-body text-fg-secondary" data-testid="people-summary">
              {seesAll ? (
                <>
                  <CountUp value={rows.households.length} className="tabular-nums" />{' '}
                  {t('guestsCount', { count: rows.households.length })} ·{' '}
                  <CountUp value={expected} className="tabular-nums" />{' '}
                  {t('peopleExpected', { count: expected })}
                </>
              ) : (
                t('invitationsCount', { count: invitations.data?.length ?? 0 })
              )}
            </p>
          )}
        </div>
        {can('guests.edit') && (
          <div className="flex gap-2">
            <Button asChild variant="secondary" icon={<Upload aria-hidden />}>
              <Link href={`${eventHref(eventId, 'people')}/import`}>{t('importButton')}</Link>
            </Button>
            <Button icon={<UserPlus aria-hidden />} onClick={() => setPanel({ kind: 'new' })}>
              {t('addGuests')}
            </Button>
          </div>
        )}
      </div>

      {failed && (
        <Card className="items-center gap-3 py-8 text-center">
          <p className="text-body">{t('loadFailed')}</p>
          <Button variant="secondary" onClick={retry}>
            {t('retry')}
          </Button>
        </Card>
      )}
      {loading && !failed && <Skeleton className="h-64" />}

      {empty && (
        <Card className="items-center gap-3 py-12 text-center" data-testid="people-empty">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint">
            <UserPlus aria-hidden className="size-6 text-primary-text" />
          </span>
          <h2 className="text-h3">{t('emptyTitle')}</h2>
          <p className="max-w-md text-body text-fg-secondary">{t('emptyBody')}</p>
        </Card>
      )}

      {!loading && !failed && !empty && (
        <Tabs defaultValue={seesAll ? 'guests' : 'invitations'} className="gap-4">
          <TabsList aria-label={t('sections')}>
            {seesAll && (
              <TabsTrigger value="guests">
                {t('tabs.guests')}{' '}
                <span className="tabular-nums text-fg-muted">{rows.households.length}</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="invitations">
              {t('tabs.invitations')}{' '}
              <span className="tabular-nums text-fg-muted">{invitations.data.length}</span>
            </TabsTrigger>
            <TabsTrigger value="responses">{t('tabs.responses')}</TabsTrigger>
          </TabsList>
          {seesAll && (
            <TabsContent value="guests">
              <GuestList
                households={rows.households}
                everyone={rows.everyone}
                onOpen={(row) => setPanel({ kind: row.kind, id: row.id })}
                onInvited={(created) => created.length > 0 && setSending(created)}
              />
            </TabsContent>
          )}
          <TabsContent value="invitations">
            <InvitationsTab
              invitations={invitations.data}
              onOpen={seesAll ? openGuest : undefined}
              onSendAll={setSending}
            />
          </TabsContent>
          <TabsContent value="responses">
            <ResponsesTab attendance={attendance.data} onOpen={seesAll ? openGuest : undefined} />
          </TabsContent>
        </Tabs>
      )}

      <EditPanel
        open={panel !== null}
        onOpenChange={(open) => !open && setPanel(null)}
        title={panel?.kind === 'new' ? t('newGuest') : (current?.name ?? t('guest'))}
      >
        {panel &&
          (panel.kind === 'new' || current ? (
            <GuestPanelBody
              key={panel.kind === 'new' ? 'new' : panel.id}
              row={current ?? null}
              households={households.data ?? []}
              onCreated={(kind, id) => setPanel({ kind, id })}
              onDone={() => setPanel(null)}
            />
          ) : households.isFetching || contacts.isFetching ? (
            // Just created: the lists are catching up.
            <Skeleton className="h-40" />
          ) : (
            <p className="text-body text-fg-secondary">{t('gone')}</p>
          ))}
      </EditPanel>
      <SendSequence invitations={sending} onClose={() => setSending(null)} />
    </div>
  );
}
