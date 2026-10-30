'use client';

import { PERMISSIONS, permissionArea, type Permission, type Role } from '@pme/contracts';
import { ArrowLeft, ChevronRight, Lock, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { Reveal } from '@/components/motion/reveal';
import { Skeleton } from '@/components/motion/skeleton';
import { useCurrentEvent } from '@/components/shell/current-event';
import { canSeeSection, eventHref } from '@/components/shell/nav';
import { NoAccess } from '@/components/shell/no-access';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useDeleteRole, useRoles, useSaveRole } from '@/lib/team';
import { cn } from '@/lib/utils';

/** Permissions grouped by the PRD's areas, in catalog order. */
const AREAS = [...new Set(PERMISSIONS.map(permissionArea))].map((area) => ({
  area,
  permissions: PERMISSIONS.filter((permission) => permissionArea(permission) === area),
}));

const rolesHref = (eventId: string) => `${eventHref(eventId, 'team')}/roles`;

function BackToTeam({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 self-start rounded-control text-small text-fg-secondary hover:text-fg"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {label}
    </Link>
  );
}

/** Roles (Stitch "Roles"): standard and custom roles with how many people hold each. */
export function RolesList() {
  const t = useTranslations('team.roles');
  const { eventId, can, membership } = useCurrentEvent();
  const { data: roles } = useRoles(eventId);
  if (!canSeeSection('team', membership.permissions)) return <NoAccess permission="members.view" />;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <BackToTeam href={eventHref(eventId, 'team')} label={t('backToTeam')} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
          <p className="text-body text-fg-secondary">{t('subtitle')}</p>
        </div>
        {can('roles.manage') && (
          <Button asChild icon={<Plus aria-hidden />}>
            <Link href={`${rolesHref(eventId)}/new`}>{t('create')}</Link>
          </Button>
        )}
      </div>
      {!roles ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="gap-0 p-0 sm:p-0">
          <ul className="flex flex-col divide-y divide-border">
            {roles.map((role) => (
              <li key={role.id}>
                <Link
                  href={`${rolesHref(eventId)}/${role.id}`}
                  data-testid="role"
                  className="flex items-center gap-3 px-4 py-4 transition-colors duration-(--dur-fast) hover:bg-surface-muted sm:px-6"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 text-label">
                      {role.name}
                      {role.isOwner && <Lock aria-hidden className="size-4 text-fg-muted" />}
                      <Badge tone={role.isStandard ? 'neutral' : 'info'}>
                        {role.isStandard ? t('standard') : t('custom')}
                      </Badge>
                    </span>
                    {role.description && (
                      <span className="text-small text-fg-secondary">{role.description}</span>
                    )}
                  </span>
                  <span className="text-small text-fg-secondary">
                    {t('permissionCount', { count: role.permissions.length })} ·{' '}
                    {t('memberCount', { count: role.memberCount })}
                  </span>
                  <ChevronRight aria-hidden className="size-5 text-fg-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Create (`roleId` = "new") or edit a role. */
export function RoleEditorPage({ roleId }: { roleId: string }) {
  const { eventId, membership } = useCurrentEvent();
  const { data: roles } = useRoles(eventId);
  if (!canSeeSection('team', membership.permissions)) return <NoAccess permission="members.view" />;
  if (!roles) return <Skeleton className="h-96" />;
  const role = roleId === 'new' ? null : (roles.find((item) => item.id === roleId) ?? undefined);
  if (role === undefined) return <NoAccess permission="members.view" />;
  // Remount on a new version, so a save (or someone else's) starts from the stored role.
  return <RoleEditor key={role ? `${role.id}-${role.version}` : 'new'} role={role} />;
}

/**
 * Role editor (Stitch "Edit role"): name, description and one switch per permission, grouped
 * by area. Switches for permissions I don't hold are disabled with the reason (PRD rule 3).
 * The Owner role is shown read-only. The summary lists what people with the role can do.
 */
function RoleEditor({ role }: { role: Role | null }) {
  const t = useTranslations('team.roles');
  const tArea = useTranslations('team.areas');
  const tPermission = useTranslations('team.permissions');
  const { eventId, can } = useCurrentEvent();
  const router = useRouter();
  const save = useSaveRole(eventId);
  const remove = useDeleteRole(eventId);
  // The API refuses changes to a role holding permissions I lack, so show it read-only.
  const outranksMe =
    !!role && !role.isOwner && !role.permissions.every((permission) => can(permission));
  const editable = can('roles.manage') && !role?.isOwner && !outranksMe;

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [granted, setGranted] = useState<Set<Permission>>(
    () => new Set(role?.permissions ?? ['event.view']),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggle(permission: Permission) {
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setError(null);
    const fields = {
      name: name.trim(),
      description: description.trim() || null,
      permissions: PERMISSIONS.filter((permission) => granted.has(permission)),
    };
    save.mutate(role ? { role, changes: fields } : { create: fields }, {
      onSuccess: (saved) => {
        if (!role) router.replace(`${rolesHref(eventId)}/${saved.id}`);
      },
      onError: (failed) => {
        if (!(failed instanceof ApiError)) return setError(t('failed'));
        if (failed.problem?.code === 'version_conflict') return setError(t('conflict'));
        if (failed.status === 403) return setError(t('beyondYours'));
        setError(failed.problem?.fields?.[0]?.message ?? t('failed'));
      },
    });
  }

  function onDelete() {
    if (!role) return;
    if (!confirmDelete) return setConfirmDelete(true);
    remove.mutate(role, {
      onSuccess: () => router.replace(rolesHref(eventId)),
      onError: (failed) =>
        setError(
          failed instanceof ApiError && failed.problem?.code === 'role_in_use'
            ? t('inUse')
            : t('failed'),
        ),
    });
  }

  const summary = PERMISSIONS.filter((permission) => granted.has(permission));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 lg:gap-8">
      <BackToTeam href={rolesHref(eventId)} label={t('backToRoles')} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-h1-phone sm:text-h1">
          {role ? (editable ? t('editTitle', { name: role.name }) : role.name) : t('newTitle')}
        </h1>
        {editable && (
          <Button type="submit" loading={save.isPending}>
            {role ? t('save') : t('createSave')}
          </Button>
        )}
      </div>

      {role?.isOwner && (
        <Reveal>
          <p className="flex items-center gap-2 rounded-control bg-accent-tint px-4 py-3 text-small text-accent-text">
            <Lock aria-hidden className="size-4 shrink-0" />
            {t('ownerLocked')}
          </p>
        </Reveal>
      )}
      {outranksMe && can('roles.manage') && (
        <Reveal>
          <p className="flex items-center gap-2 rounded-control bg-accent-tint px-4 py-3 text-small text-accent-text">
            <Lock aria-hidden className="size-4 shrink-0" />
            {t('outranksYou')}
          </p>
        </Reveal>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-control bg-danger-tint px-4 py-3 text-small text-danger-text"
        >
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <Field id="role-name" label={t('name')}>
              <Input
                id="role-name"
                required
                maxLength={60}
                value={name}
                disabled={!editable}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field id="role-description" label={t('description')} aside={t('optional')}>
              <Input
                id="role-description"
                maxLength={200}
                value={description}
                disabled={!editable}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </Card>

          {AREAS.map(({ area, permissions }) => (
            <Card key={area}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-h3">{tArea(area)}</h2>
                <span className="text-small text-fg-muted">
                  {t('enabledCount', {
                    on: permissions.filter((permission) => granted.has(permission)).length,
                    total: permissions.length,
                  })}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {permissions.map((permission) => {
                  // Only whole-event grants count: a role can be given for the whole event.
                  const mine = can(permission);
                  const disabled = !editable || (!mine && !granted.has(permission));
                  return (
                    <li
                      key={permission}
                      className={cn(
                        'flex items-center justify-between gap-4 rounded-control px-4 py-3',
                        disabled ? 'bg-surface-band' : 'bg-surface-muted',
                      )}
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="text-label">{tPermission(`${permission}.label`)}</span>
                        <span className="text-small text-fg-secondary">
                          {tPermission(`${permission}.help`)}
                        </span>
                        {editable && !mine && (
                          <span className="flex items-center gap-1 text-small text-warning-text">
                            <Lock aria-hidden className="size-3.5" />
                            {t('notYours')}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={granted.has(permission)}
                        aria-label={tPermission(`${permission}.label`)}
                        disabled={disabled}
                        onClick={() => toggle(permission)}
                        className="relative h-7 w-12 shrink-0 rounded-full bg-border-strong transition-colors duration-(--dur-fast) aria-checked:bg-primary disabled:opacity-60"
                      >
                        <span
                          aria-hidden
                          className="absolute top-1 left-1 size-5 rounded-full bg-surface shadow-card transition-transform duration-(--dur-fast) ease-(--ease-out) [[aria-checked=true]>&]:translate-x-5"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>

        <Card className="lg:sticky lg:top-24">
          <h2 className="text-h3">{t('summaryTitle')}</h2>
          {summary.length === 0 ? (
            <p className="text-small text-fg-secondary">{t('summaryEmpty')}</p>
          ) : (
            <ListPresence className="flex flex-col gap-1.5 text-small" data-testid="role-summary">
              {summary.map((permission) => (
                <ListItem key={permission} className="flex gap-2">
                  <span aria-hidden className="text-success">
                    ✓
                  </span>
                  {tPermission(`${permission}.label`)}
                </ListItem>
              ))}
            </ListPresence>
          )}
          {role && (
            <p className="text-small text-fg-muted">
              {t('memberCount', { count: role.memberCount })}
            </p>
          )}
          {role && editable && (
            <Button
              type="button"
              variant={confirmDelete ? 'destructive' : 'ghost'}
              icon={<Trash2 aria-hidden />}
              loading={remove.isPending}
              disabled={role.memberCount > 0}
              onClick={onDelete}
              className="self-start"
            >
              {confirmDelete ? t('confirmDelete') : t('delete')}
            </Button>
          )}
          {role && editable && role.memberCount > 0 && (
            <p className="text-small text-fg-secondary">{t('inUse')}</p>
          )}
        </Card>
      </div>
    </form>
  );
}
