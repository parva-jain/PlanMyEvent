'use client';

import type { DeliveryStatus, Invitation } from '@pme/contracts';
import { Search, Send, UserRoundCheck, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { CountUp } from '@/components/motion/count-up';
import { Dialog } from '@/components/motion/dialog';
import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSubEvents } from '@/lib/events';
import { distance, duration, spring } from '@/lib/motion';
import { useCreateInvitations, useUpdateInvitations } from '@/lib/people';
import { cn } from '@/lib/utils';

import { DeliveryChip, formatPhone, useMemberNames, type GuestRow } from './people-bits';

/** Rows shown before "Show more": long lists stay quick to render and reflow. */
const PAGE = 100;

type StatusFilter = 'all' | 'not_invited' | DeliveryStatus;

const rowKey = (row: GuestRow) => `${row.kind}:${row.id}`;

/** Lower-case name, member names and phone digits, for search. */
function haystack(row: GuestRow): string {
  return [row.name, ...row.members.map((item) => item.name), row.phone ?? '']
    .join(' ')
    .toLowerCase();
}

/**
 * Guests (Stitch "People"): households with their members, or everyone one by one; search,
 * tag, invitation and distributor filters; select rows to invite them or give them a
 * distributor (MOTION.md 6.15: filters reflow with ListPresence, the selection bar slides up).
 */
export function GuestList({
  households,
  everyone,
  onOpen,
  onInvited,
}: {
  households: GuestRow[];
  everyone: GuestRow[];
  onOpen: (row: GuestRow) => void;
  /** New invitations, to offer sending them on WhatsApp one by one. */
  onInvited: (invitations: Invitation[]) => void;
}) {
  const t = useTranslations('people.guests');
  const { can } = useCurrentEvent();
  const memberNames = useMemberNames();
  const [view, setView] = useState<'households' | 'everyone'>('households');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [distributor, setDistributor] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectable = can('guests.invite');

  const rows = view === 'households' ? households : everyone;
  const tags = useMemo(
    () => [...new Set(everyone.flatMap((row) => row.tags))].sort((a, b) => a.localeCompare(b)),
    [everyone],
  );
  const distributors = useMemo(
    () => [...new Set(households.flatMap((row) => row.invitation?.distributorMemberId ?? []))],
    [households],
  );

  const needle = query.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  const filtered = rows.filter((row) => {
    if (needle) {
      const text = haystack(row);
      const phoneHit = digits.length >= 3 && (row.phone ?? '').includes(digits);
      if (!text.includes(needle) && !phoneHit) return false;
    }
    if (tag && !row.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return false;
    if (status === 'not_invited' && row.invitation) return false;
    if (status !== 'all' && status !== 'not_invited' && row.invitation?.deliveryStatus !== status)
      return false;
    if (distributor && row.invitation?.distributorMemberId !== distributor) return false;
    return true;
  });
  const visible = filtered.slice(0, shown);
  const chosen = rows.filter((row) => selected.has(rowKey(row)));

  const toggle = (row: GuestRow) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(rowKey(row))) next.delete(rowKey(row));
      else next.add(rowKey(row));
      return next;
    });
  const allVisibleChosen = visible.length > 0 && visible.every((row) => selected.has(rowKey(row)));
  const toggleAll = () => setSelected(allVisibleChosen ? new Set() : new Set(visible.map(rowKey)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={view}
          onValueChange={(value) => {
            setView(value as typeof view);
            setSelected(new Set());
          }}
        >
          <TabsList aria-label={t('viewLabel')}>
            <TabsTrigger value="households">{t('households')}</TabsTrigger>
            <TabsTrigger value="everyone">{t('everyone')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative lg:max-w-xs lg:flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            type="search"
            aria-label={t('search')}
            placeholder={t('search')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            className="pl-10 lg:h-10"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.length > 0 && (
          <Select
            size="sm"
            aria-label={t('tag')}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="w-auto"
          >
            <option value="">{t('allTags')}</option>
            {tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        )}
        <Select
          size="sm"
          aria-label={t('status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="w-auto"
        >
          <option value="all">{t('anyStatus')}</option>
          <option value="not_invited">{t('notInvited')}</option>
          <option value="not_sent">{t('notSent')}</option>
          <option value="sent_digitally">{t('sentDigitally')}</option>
          <option value="delivered_in_person">{t('delivered')}</option>
        </Select>
        {distributors.length > 0 && memberNames.size > 0 && (
          <Select
            size="sm"
            aria-label={t('distributor')}
            value={distributor}
            onChange={(e) => setDistributor(e.target.value)}
            className="w-auto"
          >
            <option value="">{t('anyDistributor')}</option>
            {distributors.map((id) => (
              <option key={id} value={id}>
                {memberNames.get(id) ?? t('teamMember')}
              </option>
            ))}
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-body text-fg-secondary">
          {rows.length === 0 ? t('emptyEveryone') : t('noMatches')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="hidden items-center gap-4 px-4 text-caption tracking-wide text-fg-muted uppercase lg:flex">
            {selectable && (
              <input
                type="checkbox"
                aria-label={t('selectAll')}
                checked={allVisibleChosen}
                onChange={toggleAll}
                className="size-5 accent-primary"
              />
            )}
            <span className="flex-1">
              {view === 'households' ? t('colHousehold') : t('colName')}
            </span>
            <span className="w-16 text-center">{t('colExpected')}</span>
            <span className="w-40">{t('colTags')}</span>
            <span className="w-36">{t('colPhone')}</span>
            <span className="w-36">{t('colInvitation')}</span>
            <span className="w-32">{t('colDistributor')}</span>
          </div>
          <ListPresence className="flex flex-col gap-2" data-testid="guest-list">
            {visible.map((row) => (
              <ListItem key={rowKey(row)}>
                <GuestLine
                  row={row}
                  selectable={selectable}
                  selected={selected.has(rowKey(row))}
                  onToggle={() => toggle(row)}
                  onOpen={() => onOpen(row)}
                  distributorName={
                    row.invitation?.distributorMemberId
                      ? (memberNames.get(row.invitation.distributorMemberId) ?? t('teamMember'))
                      : null
                  }
                />
              </ListItem>
            ))}
          </ListPresence>
          {filtered.length > shown && (
            <Button
              variant="secondary"
              className="self-center"
              onClick={() => setShown((count) => count + PAGE)}
            >
              {t('showMore', { count: filtered.length - shown })}
            </Button>
          )}
        </div>
      )}

      <SelectionBar
        rows={chosen}
        onClear={() => setSelected(new Set())}
        onInvited={(invitations) => {
          setSelected(new Set());
          onInvited(invitations);
        }}
      />
    </div>
  );
}

function GuestLine({
  row,
  selectable,
  selected,
  onToggle,
  onOpen,
  distributorName,
}: {
  row: GuestRow;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  distributorName: string | null;
}) {
  const t = useTranslations('people.guests');
  const others =
    row.kind === 'household'
      ? row.members.map((item) => item.name).join(', ')
      : row.household
        ? row.household.name
        : '';
  return (
    <LiveRow entityId={row.id} className="rounded-card">
      <div
        data-testid="guest-row"
        className={cn(
          'flex items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-card lg:items-center lg:gap-4',
          selected && 'border-primary bg-primary-tint/40',
        )}
      >
        {selectable && (
          <input
            type="checkbox"
            aria-label={t('select', { name: row.name })}
            checked={selected}
            onChange={onToggle}
            className="mt-1 size-5 shrink-0 accent-primary lg:mt-0"
          />
        )}
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
        >
          <span className="truncate text-label hover:text-primary-text">{row.name}</span>
          {others && <span className="line-clamp-1 text-small text-fg-secondary">{others}</span>}
          {/* Phone layout: the details below the name. */}
          <span className="mt-1 flex flex-wrap items-center gap-2 lg:hidden">
            <DeliveryChip status={row.invitation?.deliveryStatus ?? null} />
            <span className="text-small text-fg-secondary">
              {t('expectedShort', { count: row.expected })}
            </span>
            {row.tags.slice(0, 2).map((item) => (
              <Badge key={item} tone="accent">
                {item}
              </Badge>
            ))}
          </span>
        </button>
        <span className="hidden w-16 justify-center lg:flex">
          <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-label tabular-nums">
            {row.expected}
          </span>
        </span>
        <span className="hidden w-40 flex-wrap gap-1 lg:flex">
          {row.tags.slice(0, 2).map((item) => (
            <Badge key={item} tone="accent">
              {item}
            </Badge>
          ))}
          {row.tags.length > 2 && <Badge>+{row.tags.length - 2}</Badge>}
        </span>
        <span className="hidden w-36 text-small tabular-nums text-fg-secondary lg:block">
          {row.phone ? formatPhone(row.phone) : '—'}
        </span>
        <span className="hidden w-36 lg:block">
          <DeliveryChip status={row.invitation?.deliveryStatus ?? null} />
        </span>
        <span className="hidden w-32 truncate text-small text-fg-secondary lg:block">
          {distributorName ?? '—'}
        </span>
      </div>
    </LiveRow>
  );
}

/**
 * The bulk bar: invite the chosen guests (choosing sub-events when guests are per
 * sub-event), or give their invitations a distributor.
 */
function SelectionBar({
  rows,
  onClear,
  onInvited,
}: {
  rows: GuestRow[];
  onClear: () => void;
  onInvited: (invitations: Invitation[]) => void;
}) {
  const t = useTranslations('people.guests');
  const reduced = useShouldReduceMotion();
  const [dialog, setDialog] = useState<'invite' | 'distributor' | null>(null);
  const uninvited = rows.filter((row) => !row.invitation);
  const invited = rows.flatMap((row) => (row.invitation ? [row.invitation] : []));

  return (
    <>
      <AnimatePresence>
        {rows.length > 0 && (
          <m.div
            role="region"
            aria-label={t('selection')}
            data-testid="selection-bar"
            initial={{ y: reduced ? 0 : distance.riseLarge * 3, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: reduced ? 0 : distance.riseLarge * 3, opacity: 0 }}
            transition={reduced ? { duration: duration.fast } : spring.gentle}
            className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-card bg-fg p-2 text-surface shadow-overlay lg:bottom-6"
          >
            <span className="flex items-center gap-1 px-2 text-label">
              <CountUp value={rows.length} className="tabular-nums" />
              {t('selectedCount', { count: rows.length })}
            </span>
            <button
              type="button"
              aria-label={t('clearSelection')}
              onClick={onClear}
              className="flex size-10 items-center justify-center rounded-control hover:bg-surface/10"
            >
              <X aria-hidden className="size-4" />
            </button>
            <span className="flex-1" />
            {uninvited.length > 0 && (
              <Button size="sm" icon={<Send aria-hidden />} onClick={() => setDialog('invite')}>
                {t('invite', { count: uninvited.length })}
              </Button>
            )}
            {invited.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={<UserRoundCheck aria-hidden />}
                onClick={() => setDialog('distributor')}
              >
                {t('assignDistributor')}
              </Button>
            )}
          </m.div>
        )}
      </AnimatePresence>
      <InviteDialog
        open={dialog === 'invite'}
        rows={uninvited}
        onClose={() => setDialog(null)}
        onInvited={(invitations) => {
          setDialog(null);
          onInvited(invitations);
        }}
      />
      <DistributorDialog
        open={dialog === 'distributor'}
        invitations={invited}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          onClear();
        }}
      />
    </>
  );
}

/** Invites households and contacts at once (200 per request); asks for sub-events when needed. */
export function InviteDialog({
  open,
  rows,
  onClose,
  onInvited,
}: {
  open: boolean;
  rows: GuestRow[];
  onClose: () => void;
  onInvited: (invitations: Invitation[]) => void;
}) {
  const t = useTranslations('people.inviteDialog');
  const { eventId, event, can } = useCurrentEvent();
  const { data: subEvents = [] } = useSubEvents(eventId);
  const memberNames = useMemberNames();
  const create = useCreateInvitations(eventId);
  const perSubEvent = event.guestScope === 'per_sub_event';
  const [chosen, setChosen] = useState<string[]>([]);
  const [distributor, setDistributor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  // One key per batch of 200, made when the dialog opens.
  const [keys] = useState(() => new Map<number, string>());
  const places = subEvents.filter((item) => can('guests.invite', item.id));

  async function invite() {
    if (perSubEvent && chosen.length === 0) return setError(t('chooseSubEvent'));
    setError(null);
    const created: Invitation[] = [];
    let skippedCount = 0;
    try {
      for (let start = 0; start < rows.length; start += 200) {
        const batch = rows.slice(start, start + 200);
        if (!keys.has(start)) keys.set(start, crypto.randomUUID());
        const result = await create.mutateAsync({
          idempotencyKey: keys.get(start)!,
          body: {
            householdIds: batch.filter((row) => row.kind === 'household').map((row) => row.id),
            contactIds: batch.filter((row) => row.kind === 'contact').map((row) => row.id),
            ...(perSubEvent && { subEventIds: chosen }),
            ...(distributor && { distributorMemberId: distributor }),
          },
        });
        created.push(...result.created);
        skippedCount += result.skipped.length;
      }
    } catch {
      return setError(t('failed'));
    }
    keys.clear();
    setSkipped(skippedCount);
    onInvited(created);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title', { count: rows.length })}
      description={perSubEvent ? t('perSubEvent') : t('wholeEvent')}
    >
      <div className="flex flex-col gap-4" data-testid="invite-dialog">
        {perSubEvent && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label">{t('subEvents')}</legend>
            {places.map((item) => (
              <label key={item.id} className="flex items-center gap-3 text-body">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={chosen.includes(item.id)}
                  onChange={(e) =>
                    setChosen((current) =>
                      e.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.name}
              </label>
            ))}
          </fieldset>
        )}
        {memberNames.size > 0 && (
          <label className="flex flex-col gap-2 text-label">
            {t('distributor')}
            <Select value={distributor} onChange={(e) => setDistributor(e.target.value)}>
              <option value="">{t('noDistributor')}</option>
              {[...memberNames].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
        )}
        {skipped > 0 && (
          <p role="status" className="text-small text-fg-secondary">
            {t('skipped', { count: skipped })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-small text-danger-text">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            icon={<Send aria-hidden />}
            loading={create.isPending}
            onClick={() => void invite()}
          >
            {t('confirm', { count: rows.length })}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DistributorDialog({
  open,
  invitations,
  onClose,
  onDone,
}: {
  open: boolean;
  invitations: Invitation[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('people.distributorDialog');
  const { eventId } = useCurrentEvent();
  const memberNames = useMemberNames();
  const update = useUpdateInvitations(eventId);
  const [member, setMember] = useState('');
  const [failed, setFailed] = useState(false);

  function save() {
    setFailed(false);
    update.mutate(
      { invitationIds: invitations.map((item) => item.id), distributorMemberId: member || null },
      { onSuccess: onDone, onError: () => setFailed(true) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title', { count: invitations.length })}
      description={t('description')}
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-label">
          {t('member')}
          <Select value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="">{t('nobody')}</option>
            {[...memberNames].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        {failed && (
          <p role="alert" className="text-small text-danger-text">
            {t('failed')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button loading={update.isPending} onClick={save}>
            {t('save')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
