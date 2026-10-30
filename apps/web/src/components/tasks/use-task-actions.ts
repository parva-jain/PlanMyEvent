'use client';

import type { Task } from '@pme/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useConfetti } from '@/components/motion/confetti';
import { useSnackbar } from '@/components/motion/undo-snackbar';
import { ACCENT_HEX } from '@/components/shell/accents';
import { useCurrentEvent } from '@/components/shell/current-event';
import { useSubEvents } from '@/lib/events';
import { taskKeys, useUpdateTask } from '@/lib/tasks';

/** MOTION.md 6.6: the struck-through row waits this long before sliding into Done. */
const SETTLE_MS = 600;

/**
 * What I may do to a task: edit it (tasks.edit in its sub-event), or, as one of its assignees
 * with tasks.update_own, change its status and position only. The API decides either way.
 */
export function useTaskAccess() {
  const { can, membership } = useCurrentEvent();
  const canEdit = (task: Pick<Task, 'subEventId'>) => can('tasks.edit', task.subEventId);
  const isMine = (task: Pick<Task, 'assignees'>) =>
    task.assignees.some((assignee) => assignee.memberId === membership.member.id);
  return {
    canEdit,
    isMine,
    canMove: (task: Pick<Task, 'subEventId' | 'assignees'>) =>
      canEdit(task) || (can('tasks.update_own', task.subEventId) && isMine(task)),
  };
}

/**
 * Ticking a task off (MOTION.md 6.6): the box and strike-through show at once, the change is
 * saved 600 ms later so the row then slides into Done. Finishing the last open task of a
 * sub-event celebrates once. Unticking saves straight away.
 */
export function useToggleDone(task: Task) {
  const t = useTranslations('tasks');
  const { eventId, event } = useCurrentEvent();
  const queryClient = useQueryClient();
  const update = useUpdateTask(eventId);
  const { data: subEvents } = useSubEvents(eventId);
  const show = useSnackbar();
  const confetti = useConfetti();
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const failed = () => {
    setPending(false);
    show({ message: t('saveFailed') });
  };

  const celebrate = () => {
    const subEventId = task.subEventId;
    if (!subEventId || task.parentTaskId) return;
    const tasks = queryClient.getQueryData<Task[]>(taskKeys.all(eventId)) ?? [];
    const siblings = tasks.filter((item) => item.subEventId === subEventId && !item.parentTaskId);
    if (!siblings.every((item) => item.status === 'done')) return;
    const name = subEvents?.find((item) => item.id === subEventId)?.name;
    if (!name) return;
    void confetti({ accent: ACCENT_HEX[event.type], onceKey: `tasks-done:${subEventId}` });
    show({ message: t('allDone', { name }) });
  };

  // mutateAsync, not mutate's callbacks: the row unmounts when it moves to Done, and the
  // celebration must still run.
  const toggle = () => {
    if (task.status === 'done') {
      update.mutateAsync({ task, changes: { status: 'todo' } }).catch(failed);
      return;
    }
    if (pending) return;
    setPending(true);
    timer.current = setTimeout(() => {
      update.mutateAsync({ task, changes: { status: 'done' } }).then(() => {
        setPending(false);
        celebrate();
      }, failed);
    }, SETTLE_MS);
  };

  return { checked: task.status === 'done' || pending, toggle };
}
