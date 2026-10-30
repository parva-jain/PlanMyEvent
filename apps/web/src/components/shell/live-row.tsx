'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { LiveHighlight } from '@/components/motion/live-highlight';
import { useHighlight } from '@/lib/live-highlights';
import { membersQuery } from '@/lib/team';

import { useCurrentEvent } from './current-event';

/**
 * A row that glows when its entity changes (MOTION.md 6.12): someone else's change for 1.5 s
 * with "Rahul just updated this", my own undo for 800 ms without a label.
 */
export function LiveRow({
  entityId,
  children,
  className,
}: {
  entityId: string;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations('app.live');
  const { eventId, can } = useCurrentEvent();
  const change = useHighlight(entityId);
  const actorUserId = change?.source === 'others' ? change.actorUserId : null;
  // Names come from the team list; only fetched once something has changed.
  const { data: members } = useQuery({
    ...membersQuery(eventId),
    enabled: actorUserId !== null && can('members.view'),
  });
  const name = members?.find((member) => member.userId === actorUserId)?.name.split(/\s+/)[0];
  return (
    <LiveHighlight
      highlightKey={change?.key ?? null}
      source={change?.source}
      label={name && t(change?.op === 'created' ? 'added' : 'updated', { name })}
      className={className}
    >
      {children}
    </LiveHighlight>
  );
}
