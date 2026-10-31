'use client';

import type { AttendanceSummary, DeliveryStatus, Invitation } from '@pme/contracts';
import { RefreshCw, Send, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Dialog } from '@/components/motion/dialog';
import { useCurrentEvent } from '@/components/shell/current-event';
import { useOfferUndo } from '@/components/shell/use-offer-undo';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { subEventName, useSubEvents } from '@/lib/events';
import { highlight } from '@/lib/live-highlights';
import {
  useAttendance,
  useCreateInvitation,
  useRegenerateLink,
  useUpdateAttendance,
  useUpdateInvitation,
  useWithdrawInvitation,
} from '@/lib/people';

import { AttendanceChip, ShareButtons, useMemberNames, type GuestRow } from './people-bits';

const DELIVERY: DeliveryStatus[] = ['not_sent', 'sent_digitally', 'delivered_in_person'];

/**
 * A guest's invitation in their panel (Stitch "Guest detail"): invite them, or track how the
 * card went out, share the link, regenerate or withdraw it, and see their replies.
 */
export function InvitationCard({ row }: { row: GuestRow }) {
  const t = useTranslations('people.invitation');
  const { can, membership } = useCurrentEvent();
  const invitation = row.invitation;
  // A contact in an invited household answers through the household's card.
  const viaHousehold = row.kind === 'contact' && invitation?.householdId != null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="invitation-heading">
      <h3 id="invitation-heading" className="text-h3">
        {t('title')}
      </h3>
      {!invitation ? (
        can('guests.invite') ? (
          <InviteNow row={row} />
        ) : (
          <p className="text-body text-fg-secondary">{t('notInvited')}</p>
        )
      ) : viaHousehold ? (
        <p className="text-body text-fg-secondary">
          {t('viaHousehold', { household: row.household?.name ?? '' })}
        </p>
      ) : (
        <InvitationDetails
          invitation={invitation}
          canManage={can('guests.invite')}
          isMine={invitation.distributorMemberId === membership.member.id}
        />
      )}
    </section>
  );
}

function InviteNow({ row }: { row: GuestRow }) {
  const t = useTranslations('people.invitation');
  const { eventId, event, can } = useCurrentEvent();
  const { data: subEvents = [] } = useSubEvents(eventId);
  const create = useCreateInvitation(eventId);
  const perSubEvent = event.guestScope === 'per_sub_event';
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function invite() {
    if (perSubEvent && chosen.length === 0) return setError(t('chooseSubEvent'));
    setError(null);
    create.mutate(
      {
        ...(row.kind === 'household' ? { householdId: row.id } : { contactId: row.id }),
        ...(perSubEvent && { subEventIds: chosen }),
      },
      {
        onSuccess: (created) =>
          highlight(created.id, { source: 'own', op: 'created', actorUserId: null }),
        onError: (failed) =>
          setError(
            failed instanceof ApiError && failed.status === 409 ? t('alreadyInvited') : t('failed'),
          ),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-control bg-surface-muted p-3">
      <p className="text-body text-fg-secondary">{t('notInvited')}</p>
      {perSubEvent && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">{t('subEvents')}</legend>
          {subEvents
            .filter((item) => can('guests.invite', item.id))
            .map((item) => (
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
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <Button
        icon={<Send aria-hidden />}
        loading={create.isPending}
        onClick={invite}
        className="self-start"
      >
        {t('invite')}
      </Button>
    </div>
  );
}

function InvitationDetails({
  invitation,
  canManage,
  isMine,
}: {
  invitation: Invitation;
  canManage: boolean;
  isMine: boolean;
}) {
  const t = useTranslations('people.invitation');
  const tDelivery = useTranslations('people.delivery');
  const { eventId, event } = useCurrentEvent();
  const { data: subEvents } = useSubEvents(eventId);
  const memberNames = useMemberNames();
  const update = useUpdateInvitation(eventId);
  const regenerate = useRegenerateLink(eventId);
  const withdraw = useWithdrawInvitation(eventId);
  const offerUndo = useOfferUndo();
  const [confirm, setConfirm] = useState<'regenerate' | 'withdraw' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const failure = (failed: unknown) =>
    setError(failed instanceof ApiError && failed.status === 409 ? t('conflict') : t('failed'));
  const change = (changes: Parameters<typeof update.mutate>[0]['changes']) => {
    setError(null);
    update.mutate({ invitation, changes }, { onError: failure });
  };

  return (
    <div
      className="flex flex-col gap-4 rounded-control bg-surface-muted p-3"
      data-testid="invitation-card"
    >
      {event.guestScope === 'per_sub_event' && invitation.subEventIds.length > 0 && (
        <p className="text-small text-fg-secondary">
          {t('covers', {
            names: invitation.subEventIds
              .map((id) => subEventName(subEvents, id).name ?? t('hiddenSubEvent'))
              .join(', '),
          })}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-label">
          {t('delivery')}
          <Select
            size="sm"
            value={invitation.deliveryStatus}
            disabled={!canManage && !isMine}
            onChange={(e) => change({ deliveryStatus: e.target.value as DeliveryStatus })}
          >
            {DELIVERY.map((status) => (
              <option key={status} value={status}>
                {tDelivery(status)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-2 text-label">
          {t('distributor')}
          <Select
            size="sm"
            value={invitation.distributorMemberId ?? ''}
            disabled={!canManage || memberNames.size === 0}
            onChange={(e) => change({ distributorMemberId: e.target.value || null })}
          >
            <option value="">{t('nobody')}</option>
            {invitation.distributorMemberId && !memberNames.has(invitation.distributorMemberId) && (
              <option value={invitation.distributorMemberId}>{t('teamMember')}</option>
            )}
            {[...memberNames].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <ShareButtons
        invitation={invitation}
        onShared={() =>
          invitation.deliveryStatus === 'not_sent' &&
          (canManage || isMine) &&
          change({ deliveryStatus: 'sent_digitally' })
        }
      />
      <p className="text-small text-fg-secondary">
        {invitation.lastOpenedAt
          ? t('lastOpened', { when: new Date(invitation.lastOpenedAt) })
          : t('neverOpened')}
      </p>

      <Replies attendance={invitation.attendance} />

      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw aria-hidden />}
            onClick={() => setConfirm('regenerate')}
          >
            {t('regenerate')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 aria-hidden />}
            className="text-danger-text hover:bg-danger-tint"
            onClick={() => setConfirm('withdraw')}
          >
            {t('withdraw')}
          </Button>
        </div>
      )}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === 'withdraw' ? t('withdrawTitle') : t('regenerateTitle')}
        description={confirm === 'withdraw' ? t('withdrawBody') : t('regenerateBody')}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            {t('cancel')}
          </Button>
          <Button
            variant={confirm === 'withdraw' ? 'destructive' : 'primary'}
            loading={regenerate.isPending || withdraw.isPending}
            onClick={() => {
              setError(null);
              if (confirm === 'regenerate') {
                regenerate.mutate(invitation, {
                  onSuccess: () => {
                    setConfirm(null);
                    highlight(invitation.id, { source: 'own', op: 'updated', actorUserId: null });
                  },
                  onError: (failed) => {
                    setConfirm(null);
                    failure(failed);
                  },
                });
              } else {
                withdraw.mutate(invitation, {
                  onSuccess: (requestId) => {
                    setConfirm(null);
                    offerUndo(
                      t('withdrawn', { name: invitation.guestName }),
                      invitation.id,
                      requestId,
                    );
                  },
                  onError: (failed) => {
                    setConfirm(null);
                    failure(failed);
                  },
                });
              }
            }}
          >
            {confirm === 'withdraw' ? t('withdrawConfirm') : t('regenerateConfirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/** The guest's answers: one for the whole event, or one per sub-event. Editable with guests.edit. */
function Replies({ attendance }: { attendance: AttendanceSummary[] }) {
  const t = useTranslations('people.invitation');
  const { eventId, can } = useCurrentEvent();
  const { data: subEvents } = useSubEvents(eventId);
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-label">{t('replies')}</h4>
      <ul className="flex flex-col gap-2">
        {attendance.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface px-3 py-2"
            data-testid="reply-row"
          >
            <span className="text-body">
              {row.subEventId
                ? (subEventName(subEvents, row.subEventId).name ?? t('hiddenSubEvent'))
                : t('wholeEvent')}
            </span>
            {can('guests.edit', row.subEventId) ? (
              <EditReply row={row} />
            ) : (
              <span className="flex items-center gap-2">
                <AttendanceChip status={row.status} />
                <span className="text-small tabular-nums text-fg-secondary">
                  {t('party', { count: row.partySize })}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Status and party size; saves the full attendance row (it carries the version). */
function EditReply({ row }: { row: AttendanceSummary }) {
  const t = useTranslations('people.invitation');
  const tStatus = useTranslations('people.attendance');
  const { eventId } = useCurrentEvent();
  const { data: rows } = useAttendance(eventId);
  const update = useUpdateAttendance(eventId);
  const full = rows?.find((item) => item.id === row.id);
  const [failed, setFailed] = useState(false);
  const save = (changes: { status?: 'invited' | 'confirmed' | 'declined'; partySize?: number }) => {
    if (!full) return;
    setFailed(false);
    update.mutate({ row: full, changes }, { onError: () => setFailed(true) });
  };
  const editable =
    row.status === 'invited' || row.status === 'confirmed' || row.status === 'declined';
  return (
    <span className="flex items-center gap-2">
      {editable ? (
        <Select
          size="sm"
          aria-label={t('status')}
          value={row.status}
          disabled={!full}
          onChange={(e) => save({ status: e.target.value as 'invited' | 'confirmed' | 'declined' })}
          className="w-auto"
        >
          {(['invited', 'confirmed', 'declined'] as const).map((status) => (
            <option key={status} value={status}>
              {tStatus(status)}
            </option>
          ))}
        </Select>
      ) : (
        <AttendanceChip status={row.status} />
      )}
      <input
        type="number"
        min={1}
        max={50}
        aria-label={t('partySize')}
        defaultValue={row.partySize}
        key={`${row.id}:${row.partySize}`}
        disabled={!full}
        onBlur={(e) => {
          const size = Math.min(50, Math.max(1, Number(e.target.value) || 1));
          if (size !== row.partySize) save({ partySize: size });
        }}
        className="h-10 w-16 rounded-control border border-border-strong bg-surface-muted px-2 text-center text-small tabular-nums"
      />
      {failed && (
        <span role="alert" className="text-small text-danger-text">
          {t('failed')}
        </span>
      )}
    </span>
  );
}
