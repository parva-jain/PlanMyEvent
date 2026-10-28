'use client';

import {
  can,
  type EffectivePermissions,
  type Grant,
  type Role,
  type SubEvent,
} from '@pme/contracts';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

export const selectClass =
  'h-12 w-full rounded-control border border-border-strong bg-surface-muted px-4 text-body text-fg focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary-tint focus-visible:outline-none disabled:opacity-60';

/**
 * Whether I could grant `role` in this scope: every permission it holds must be mine, for the
 * whole event or in each chosen sub-event (PRD rule 3). The API checks the same thing.
 */
export function canGrant(mine: EffectivePermissions, role: Role, subEventIds: string[]): boolean {
  const scopes = subEventIds.length ? subEventIds : [null];
  return role.permissions.every((permission) =>
    scopes.every((subEventId) => can(mine, permission, subEventId)),
  );
}

/** Roles anyone may hand out: never Owner, which only moves by transfer. */
export const assignableRoles = (roles: Role[]) => roles.filter((role) => !role.isOwner);

/**
 * One role and where it applies (Stitch "Invite people"): the whole event, or only some
 * sub-events from a checklist that expands (MOTION.md 6.10, `moderate`).
 */
export function GrantPicker({
  value,
  onChange,
  roles,
  subEvents,
  mine,
  idPrefix,
}: {
  value: Grant;
  onChange: (grant: Grant) => void;
  roles: Role[];
  subEvents: SubEvent[];
  mine: EffectivePermissions;
  idPrefix?: string;
}) {
  const t = useTranslations('team.grant');
  const reduced = useShouldReduceMotion();
  const generated = useId();
  const id = idPrefix ?? generated;
  const scoped = value.subEventIds.length > 0;
  const [first] = subEvents;

  function toggle(subEventId: string) {
    const has = value.subEventIds.includes(subEventId);
    const next = has
      ? value.subEventIds.filter((item) => item !== subEventId)
      : [...value.subEventIds, subEventId];
    // Unticking the last one would mean "whole event"; keep one ticked instead.
    if (next.length) onChange({ ...value, subEventIds: next });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-role`} className="text-label">
          {t('role')}
        </label>
        <select
          id={`${id}-role`}
          className={selectClass}
          value={value.roleId}
          onChange={(e) => onChange({ ...value, roleId: e.target.value })}
        >
          {assignableRoles(roles).map((role) => (
            <option
              key={role.id}
              value={role.id}
              disabled={!canGrant(mine, role, value.subEventIds)}
            >
              {canGrant(mine, role, value.subEventIds)
                ? role.name
                : t('beyondYours', { role: role.name })}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">{t('where')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                key: 'whole',
                checked: !scoped,
                onSelect: () => onChange({ ...value, subEventIds: [] }),
              },
              {
                key: 'some',
                checked: scoped,
                onSelect: () => first && !scoped && onChange({ ...value, subEventIds: [first.id] }),
              },
            ] as const
          ).map((option) => (
            <label
              key={option.key}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-control border p-3 transition-colors duration-(--dur-fast)',
                option.checked
                  ? 'border-primary bg-primary-tint'
                  : 'border-border bg-surface-muted hover:border-border-strong',
                option.key === 'some' && !first && 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="flex items-center gap-2 text-label">
                <input
                  type="radio"
                  name={`${id}-scope`}
                  className="size-4 accent-primary"
                  checked={option.checked}
                  disabled={option.key === 'some' && !first}
                  onChange={option.onSelect}
                />
                {t(`${option.key}.title`)}
              </span>
              <span className="text-small text-fg-secondary">{t(`${option.key}.body`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <AnimatePresence initial={false}>
        {scoped && (
          <m.fieldset
            key="sub-events"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? duration.fast : duration.moderate, ease: ease.out }}
          >
            <legend className="sr-only">{t('subEvents')}</legend>
            <ul className="flex flex-col gap-2 rounded-control bg-surface-muted p-3">
              {subEvents.map((subEvent) => (
                <li key={subEvent.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control bg-surface px-3 text-body">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={value.subEventIds.includes(subEvent.id)}
                      onChange={() => toggle(subEvent.id)}
                    />
                    {subEvent.name}
                  </label>
                </li>
              ))}
            </ul>
          </m.fieldset>
        )}
      </AnimatePresence>
    </div>
  );
}
