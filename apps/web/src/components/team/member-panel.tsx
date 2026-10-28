'use client';

import type { Grant, Member, Permission, Role } from '@pme/contracts';
import { Crown, LogOut, Plus, Trash2, UserMinus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { useCurrentEvent } from '@/components/shell/current-event';
import { MY_EVENTS_HREF } from '@/components/shell/nav';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useSubEvents } from '@/lib/events';
import {
  useLeaveEvent,
  useRemoveMember,
  useReplaceMemberRoles,
  useRoles,
  useTransferOwnership,
} from '@/lib/team';

import { assignableRoles, canGrant, GrantPicker, selectClass } from './grant-picker';
import { AssignmentBadge, Avatar } from './member-bits';

const message = (error: unknown, t: (key: string) => string) => {
  if (!(error instanceof ApiError)) return t('failed');
  if (error.problem?.code === 'version_conflict') return t('conflict');
  if (error.status === 403) return t('forbidden');
  return error.problem?.fields?.[0]?.message ?? t('failed');
};

/**
 * One member (Stitch "Member detail"): their roles and where they apply, and what that lets
 * them do. With members.manage, roles can be changed or the member removed; the Owner can
 * hand over ownership; anyone but the Owner can leave.
 */
export function MemberPanelBody({ member, onDone }: { member: Member; onDone: () => void }) {
  const t = useTranslations('team.member');
  const { eventId, membership, can } = useCurrentEvent();
  const { data: roles = [] } = useRoles(eventId);
  const { data: subEvents = [] } = useSubEvents(eventId);
  const isMe = member.id === membership.member.id;
  const manage = can('members.manage') && !member.isOwner;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} url={member.avatarUrl} className="size-12" />
        <div className="flex min-w-0 flex-col">
          <span className="text-h3">
            {member.name}
            {isMe && <span className="text-body text-fg-muted"> · {t('you')}</span>}
          </span>
          <span className="truncate text-small text-fg-secondary">{member.email}</span>
        </div>
      </div>

      {manage ? (
        // Keyed by member, not version: a save refetches the member at a new version, and
        // remounting then would drop the mutation's onSuccess (which closes the panel).
        <RolesEditor key={member.id} member={member} roles={roles} onDone={onDone} />
      ) : (
        <section className="flex flex-col gap-2">
          <h3 className="text-label">{t('roles')}</h3>
          <div className="flex flex-wrap gap-2">
            {member.assignments.map((assignment) => (
              <AssignmentBadge
                key={assignment.roleId}
                assignment={assignment}
                subEvents={subEvents}
                isOwner={member.isOwner && roles.find((r) => r.id === assignment.roleId)?.isOwner}
              />
            ))}
          </div>
        </section>
      )}

      <CanDo member={member} roles={roles} />

      {membership.member.isOwner && !isMe && (
        <Transfer member={member} roles={roles} onDone={onDone} />
      )}
      {manage && !isMe && <Remove member={member} onDone={onDone} />}
      {isMe && !member.isOwner && <Leave />}
    </div>
  );
}

const nextKey = (rows: { key: number }[]) => Math.max(-1, ...rows.map((row) => row.key)) + 1;

function RolesEditor({
  member,
  roles,
  onDone,
}: {
  member: Member;
  roles: Role[];
  onDone: () => void;
}) {
  const t = useTranslations('team.member');
  const { eventId, membership } = useCurrentEvent();
  const { data: subEvents = [] } = useSubEvents(eventId);
  const replace = useReplaceMemberRoles(eventId);
  // Rows keep a key of their own: keying by role would remount a row when its role changes.
  const [rows, setRows] = useState<{ key: number; grant: Grant }[]>(() =>
    member.assignments.map(({ roleId, subEventIds }, key) => ({
      key,
      grant: { roleId, subEventIds },
    })),
  );
  const grants = rows.map((row) => row.grant);
  const setGrants = (update: (current: Grant[]) => Grant[]) =>
    setRows((current) => {
      const next = update(current.map((row) => row.grant));
      // Rows are only ever edited in place, removed, or appended.
      const kept = current.filter((row) => next.includes(row.grant));
      return next.map((grant, index) => ({
        grant,
        key:
          kept.find((row) => row.grant === grant)?.key ?? current[index]?.key ?? nextKey(current),
      }));
    });
  const [error, setError] = useState<string | null>(null);
  const unused = assignableRoles(roles).filter(
    (role) =>
      !grants.some((grant) => grant.roleId === role.id) &&
      canGrant(membership.permissions, role, []),
  );

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-label">{t('roles')}</h3>
      <ListPresence className="flex flex-col gap-3">
        {grants.map((grant, index) => (
          <ListItem
            key={rows[index]!.key}
            className="relative rounded-control border border-border p-3"
          >
            <GrantPicker
              idPrefix={`member-grant-${index}`}
              value={grant}
              onChange={(next) =>
                setGrants((current) => current.map((item, i) => (i === index ? next : item)))
              }
              roles={roles.filter(
                (role) =>
                  role.id === grant.roleId || !grants.some((item) => item.roleId === role.id),
              )}
              subEvents={subEvents}
              mine={membership.permissions}
            />
            {grants.length > 1 && (
              <button
                type="button"
                aria-label={t('removeRole')}
                onClick={() => setGrants((current) => current.filter((_, i) => i !== index))}
                className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted"
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
          </ListItem>
        ))}
      </ListPresence>
      {unused[0] && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Plus aria-hidden />}
          className="self-start"
          onClick={() =>
            setGrants((current) => [...current, { roleId: unused[0]!.id, subEventIds: [] }])
          }
        >
          {t('addRole')}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <Button
        type="button"
        className="self-start"
        loading={replace.isPending}
        onClick={() => {
          setError(null);
          replace.mutate(
            { member, assignments: grants },
            { onSuccess: onDone, onError: (failed) => setError(message(failed, t)) },
          );
        }}
      >
        {t('save')}
      </Button>
    </section>
  );
}

/** "What Vikram can do": the permissions their roles add up to, by area. */
function CanDo({ member, roles }: { member: Member; roles: Role[] }) {
  const t = useTranslations('team.member');
  const tPermission = useTranslations('team.permissions');
  const granted = new Set<Permission>();
  for (const assignment of member.assignments) {
    for (const permission of roles.find((role) => role.id === assignment.roleId)?.permissions ??
      []) {
      granted.add(permission);
    }
  }
  if (!granted.size) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-label">
        {t('canDo', { name: member.name.split(' ')[0] ?? member.name })}
      </h3>
      <ul className="flex flex-col gap-1 text-small text-fg-secondary">
        {[...granted].map((permission) => (
          <li key={permission}>• {tPermission(`${permission}.label`)}</li>
        ))}
      </ul>
    </section>
  );
}

function Remove({ member, onDone }: { member: Member; onDone: () => void }) {
  const t = useTranslations('team.member');
  const { eventId } = useCurrentEvent();
  const remove = useRemoveMember(eventId);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <Button
        type="button"
        variant={confirm ? 'destructive' : 'ghost'}
        icon={<UserMinus aria-hidden />}
        loading={remove.isPending}
        className="self-start"
        onClick={() => {
          if (!confirm) return setConfirm(true);
          remove.mutate(member, {
            onSuccess: onDone,
            onError: (failed) => setError(message(failed, t)),
          });
        }}
      >
        {confirm ? t('confirmRemove', { name: member.name }) : t('remove')}
      </Button>
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

function Transfer({
  member,
  roles,
  onDone,
}: {
  member: Member;
  roles: Role[];
  onDone: () => void;
}) {
  const t = useTranslations('team.member');
  const { eventId } = useCurrentEvent();
  const transfer = useTransferOwnership(eventId);
  const choices = assignableRoles(roles);
  const [keepRoleId, setKeepRoleId] = useState(
    () =>
      (choices.find((role) => role.isStandard && role.name === 'Admin') ?? choices[0])?.id ?? '',
  );
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (member.status !== 'active' || !keepRoleId) return null;
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="text-label">{t('transferTitle')}</h3>
      <p className="text-small text-fg-secondary">{t('transferBody', { name: member.name })}</p>
      <label htmlFor="keep-role" className="text-small text-fg-secondary">
        {t('keepRole')}
      </label>
      <select
        id="keep-role"
        className={selectClass}
        value={keepRoleId}
        onChange={(e) => setKeepRoleId(e.target.value)}
      >
        {choices.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant={confirm ? 'destructive' : 'secondary'}
        icon={<Crown aria-hidden />}
        loading={transfer.isPending}
        className="self-start"
        onClick={() => {
          if (!confirm) return setConfirm(true);
          transfer.mutate(
            { memberId: member.id, keepRoleId },
            { onSuccess: onDone, onError: (failed) => setError(message(failed, t)) },
          );
        }}
      >
        {confirm ? t('confirmTransfer') : t('transfer')}
      </Button>
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
    </section>
  );
}

function Leave() {
  const t = useTranslations('team.member');
  const { eventId } = useCurrentEvent();
  const router = useRouter();
  const leave = useLeaveEvent(eventId);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <Button
        type="button"
        variant={confirm ? 'destructive' : 'ghost'}
        icon={confirm ? <Trash2 aria-hidden /> : <LogOut aria-hidden />}
        loading={leave.isPending}
        className="self-start"
        onClick={() => {
          if (!confirm) return setConfirm(true);
          leave.mutate(undefined, { onSuccess: () => router.replace(MY_EVENTS_HREF) });
        }}
      >
        {confirm ? t('confirmLeave') : t('leave')}
      </Button>
    </div>
  );
}
