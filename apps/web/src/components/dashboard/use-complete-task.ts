'use client';

import type { Task } from '@pme/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useSnackbar } from '@/components/motion/undo-snackbar';
import { useCurrentEvent } from '@/components/shell/current-event';
import { useTaskAccess } from '@/components/tasks/use-task-actions';
import { apiFetch } from '@/lib/api';
import { taskKeys } from '@/lib/tasks';

/**
 * Ticking off a task from the dashboard's deadlines: the row collapses out at once
 * (MOTION.md 6.5, ListPresence) and comes back if the API refuses. The dashboard's numbers
 * follow when dashboard.changed arrives. It doesn't write into the task list's cache (which may
 * not be loaded, and would then hold just this task); it marks that list stale instead.
 */
export function useCompleteTask() {
  const t = useTranslations('dashboard.deadlines');
  const { eventId } = useCurrentEvent();
  const queryClient = useQueryClient();
  const show = useSnackbar();
  const { canMove } = useTaskAccess();
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set());

  const mark = (id: string, on: boolean) =>
    setCompleted((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const done = useMutation({
    mutationFn: (task: Task) =>
      apiFetch<Task>(`/v1/events/${eventId}/tasks/${task.id}`, {
        method: 'PATCH',
        body: { status: 'done' },
        headers: { 'If-Match': `"${task.version}"` },
      }),
    onMutate: (task) => mark(task.id, true),
    onError: (_error, task) => {
      mark(task.id, false);
      show({ message: t('saveFailed') });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all(eventId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.mine });
    },
  });

  return {
    completed,
    canComplete: canMove,
    complete: (task: Task) => done.mutate(task),
  };
}
