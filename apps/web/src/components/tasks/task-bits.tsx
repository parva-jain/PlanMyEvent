'use client';

import type { SubEvent, Task, TaskAssignee } from '@pme/contracts';
import { CalendarClock, ListChecks } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CheckDraw } from '@/components/motion/check-draw';
import { initials } from '@/components/team/member-bits';
import { Badge } from '@/components/ui/badge';
import { subEventName } from '@/lib/events';
import { formatShortDate, todayIso } from '@/lib/format';
import { duration, ease } from '@/lib/motion';
import { isOverdue } from '@/lib/tasks';
import { cn } from '@/lib/utils';

/** Today's date, fixed for the life of the screen (render stays pure). */
export function useToday(): string {
  const [today] = useState(todayIso);
  return today;
}

export function SubEventChip({
  subEvents,
  subEventId,
}: {
  subEvents: readonly SubEvent[] | undefined;
  subEventId: string | null;
}) {
  const t = useTranslations('tasks');
  const { name, deleted } = subEventName(subEvents, subEventId);
  if (deleted) {
    return (
      <Badge tone="warning" data-testid="deleted-sub-event">
        {t('deletedSubEvent')}
      </Badge>
    );
  }
  return name ? <Badge tone="info">{name}</Badge> : null;
}

/** Due date chip; red with "Overdue" once past (DESIGN.md task row). */
export function DueChip({ task }: { task: Pick<Task, 'status' | 'dueOn'> }) {
  const t = useTranslations('tasks');
  const today = useToday();
  if (!task.dueOn) return null;
  const overdue = isOverdue(task, today);
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-small tabular-nums',
        overdue ? 'text-danger-text' : 'text-fg-secondary',
      )}
    >
      <CalendarClock aria-hidden className="size-4" />
      {overdue
        ? t('overdueOn', { date: formatShortDate(task.dueOn) })
        : formatShortDate(task.dueOn)}
    </span>
  );
}

/** "2/5" subtasks done. */
export function SubtaskCount({ task }: { task: Task }) {
  const t = useTranslations('tasks');
  if (!task.subtasks.total) return null;
  return (
    <span
      className="flex items-center gap-1 text-small text-fg-secondary tabular-nums"
      aria-label={t('subtaskCount', task.subtasks)}
    >
      <ListChecks aria-hidden className="size-4" />
      {task.subtasks.done}/{task.subtasks.total}
    </span>
  );
}

/** High and urgent stand out; low and medium stay quiet. */
export function PriorityChip({ task }: { task: Task }) {
  const t = useTranslations('tasks.priority');
  if (task.priority !== 'high' && task.priority !== 'urgent') return null;
  return (
    <Badge tone={task.priority === 'urgent' ? 'danger' : 'warning'} dot>
      {t(task.priority)}
    </Badge>
  );
}

/** Up to three initials, then "+2" (DESIGN.md task row: assignee avatars). */
export function AssigneeStack({ assignees }: { assignees: readonly TaskAssignee[] }) {
  const t = useTranslations('tasks');
  if (!assignees.length) return null;
  const shown = assignees.slice(0, 3);
  return (
    <span
      className="flex items-center -space-x-2"
      aria-label={t('assignedTo', { names: assignees.map((item) => item.name).join(', ') })}
      role="img"
    >
      {shown.map((assignee) => (
        <span
          key={assignee.memberId}
          title={assignee.name}
          className="flex size-7 items-center justify-center rounded-full bg-primary-tint text-caption font-semibold text-primary-text ring-2 ring-surface"
        >
          {initials(assignee.name)}
        </span>
      ))}
      {assignees.length > shown.length && (
        <span className="flex size-7 items-center justify-center rounded-full bg-surface-muted text-caption text-fg-secondary ring-2 ring-surface">
          +{assignees.length - shown.length}
        </span>
      )}
    </span>
  );
}

/** A 44 px tap target around the 20 px box (DESIGN.md "Touch targets"). */
export function TaskCheckbox({
  title,
  checked,
  disabled,
  onToggle,
  small = false,
}: {
  title: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  /** A 16 px box for subtasks under a row; the tap target stays 44 px. */
  small?: boolean;
}) {
  const t = useTranslations('tasks');
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={t('complete', { title })}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-control disabled:opacity-50',
        small ? '-m-3.5' : '-m-3',
      )}
    >
      <CheckDraw checked={checked} size={small ? 16 : 20} />
    </button>
  );
}

/**
 * The title, struck through left to right when completed (MOTION.md 6.6: 200 ms). The line
 * is a scaled bar, so only a transform animates; reduced motion shows it at once.
 */
export function StruckTitle({
  title,
  struck,
  className,
}: {
  title: string;
  struck: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative w-fit max-w-full', struck && 'text-fg-muted', className)}>
      {title}
      <m.span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px origin-left bg-current"
        initial={false}
        animate={{ scaleX: struck ? 1 : 0 }}
        transition={{ duration: duration.base, ease: ease.out }}
      />
    </span>
  );
}
