'use client';

import type { Assignment, SubEvent } from '@pme/contracts';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** "Priya Sharma" → "PS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

/** DESIGN.md "Avatars": photo, or bold initials on a neutral circle. */
export function Avatar({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote avatars (Google) need no optimisation
    <img src={url} alt="" className={cn('size-10 shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-label text-primary-text',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Role chip: "Helper · Mehendi, Haldi", or just "Admin" for the whole event. */
export function AssignmentBadge({
  assignment,
  subEvents,
  isOwner = false,
}: {
  assignment: Assignment;
  subEvents: SubEvent[];
  isOwner?: boolean;
}) {
  const t = useTranslations('team');
  const scope = assignment.subEventIds.map(
    (id) => subEvents.find((item) => item.id === id)?.name ?? t('hiddenSubEvent'),
  );
  return (
    <Badge tone={isOwner ? 'accent' : 'info'} dot>
      {scope.length ? `${assignment.roleName} · ${scope.join(', ')}` : assignment.roleName}
    </Badge>
  );
}
