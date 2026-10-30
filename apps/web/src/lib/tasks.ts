'use client';

import {
  positionBetween,
  type CreateTask,
  type MyTask,
  type Task,
  type TaskStatus,
  type UpdateTask,
} from '@pme/contracts';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiFetch, newRequestId } from './api';
import { eventKeys } from './events';

interface Page<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const taskKeys = {
  all: (eventId: string) => ['events', eventId, 'tasks'] as const,
  mine: ['me', 'tasks'] as const,
};

const E = (eventId: string) => `/v1/events/${eventId}` as const;
const ifMatch = (version: number) => ({ 'If-Match': `"${version}"` });

/** Board and list columns, in order. */
export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;

/** Fractional keys compare byte by byte, like Postgres `collate "C"`. */
export const byPosition = (a: Task, b: Task) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

/** Top-level tasks with this status, in board order. */
export const column = (tasks: readonly Task[], status: TaskStatus) =>
  tasks.filter((task) => !task.parentTaskId && task.status === status).sort(byPosition);

/** Subtasks of a task, in order. */
export const subtasksOf = (tasks: readonly Task[], taskId: string) =>
  tasks.filter((task) => task.parentTaskId === taskId).sort(byPosition);

/** The position after the last task in `status`, so a card moved there goes last. */
export const lastIn = (tasks: readonly Task[], status: TaskStatus) =>
  positionBetween(column(tasks, status).at(-1)?.position ?? null, null);

/** Whether a task is overdue: not done, and due before today (YYYY-MM-DD in the browser). */
export const isOverdue = (task: Pick<Task, 'status' | 'dueOn'>, today: string) =>
  task.status !== 'done' && task.dueOn !== null && task.dueOn < today;

// ---- Reads -------------------------------------------------------------------------------

/**
 * Every task I can see in the event, subtasks included, in one array (the API pages by 500;
 * events stay well under that, so one request is the norm). Screens filter and sort locally.
 */
export function useTasks(eventId: string) {
  return useQuery({
    queryKey: taskKeys.all(eventId),
    queryFn: async () => {
      const tasks: Task[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `&cursor=${cursor}` : '';
        const page: Page<Task> = await apiFetch(`${E(eventId)}/tasks?limit=500${query}`);
        tasks.push(...page.data);
        cursor = page.hasMore ? page.nextCursor : null;
      } while (cursor);
      return tasks;
    },
  });
}

/** GET /v1/me/tasks: my open tasks across events, earliest due first. */
export function useMyTasks() {
  return useQuery({
    queryKey: taskKeys.mine,
    queryFn: async () => (await apiFetch<{ data: MyTask[] }>('/v1/me/tasks')).data,
  });
}

// ---- Writes ------------------------------------------------------------------------------

/** Replaces one task in the cached list (or adds it), keeping the rest. */
export function putTask(queryClient: QueryClient, eventId: string, task: Task) {
  queryClient.setQueryData<Task[]>(taskKeys.all(eventId), (tasks = []) =>
    tasks.some((item) => item.id === task.id)
      ? tasks.map((item) => (item.id === task.id ? task : item))
      : [...tasks, task],
  );
}

/** After any task write: the event's counts and my cross-event list may have moved too. */
function settled(queryClient: QueryClient, eventId: string) {
  void queryClient.invalidateQueries({ queryKey: taskKeys.all(eventId) });
  void queryClient.invalidateQueries({ queryKey: taskKeys.mine });
}

export function useCreateTask(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTask) =>
      apiFetch<Task>(`${E(eventId)}/tasks`, { method: 'POST', body }),
    onSuccess: (task) => putTask(queryClient, eventId, task),
    onSettled: () => settled(queryClient, eventId),
  });
}

/**
 * PATCH a task. The cached copy changes at once (ticking a box, dropping a card shouldn't
 * wait for the network) and rolls back if the API refuses.
 */
export function useUpdateTask(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, changes }: { task: Task; changes: UpdateTask }) =>
      apiFetch<Task>(`${E(eventId)}/tasks/${task.id}`, {
        method: 'PATCH',
        body: changes,
        headers: ifMatch(task.version),
      }),
    onMutate: async ({ task, changes }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all(eventId) });
      const previous = queryClient.getQueryData<Task[]>(taskKeys.all(eventId));
      const optimistic: Task = { ...task, ...changes };
      if (changes.status && changes.status !== task.status) {
        optimistic.completedAt = changes.status === 'done' ? new Date().toISOString() : null;
      }
      putTask(queryClient, eventId, optimistic);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(taskKeys.all(eventId), context.previous);
    },
    onSuccess: (task) => putTask(queryClient, eventId, task),
    onSettled: () => settled(queryClient, eventId),
  });
}

export function useAssignTask(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, memberIds }: { task: Task; memberIds: string[] }) =>
      apiFetch<Task>(`${E(eventId)}/tasks/${task.id}/assignees`, {
        method: 'PUT',
        body: { memberIds },
        headers: ifMatch(task.version),
      }),
    onSuccess: (task) => putTask(queryClient, eventId, task),
    onSettled: () => settled(queryClient, eventId),
  });
}

export function useDeleteTask(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    /** Resolves with the request id, to undo it from the undo bar. */
    mutationFn: async (task: Task) => {
      const requestId = newRequestId();
      await apiFetch<null>(`${E(eventId)}/tasks/${task.id}`, {
        method: 'DELETE',
        headers: ifMatch(task.version),
        requestId,
      });
      return requestId;
    },
    onSuccess: (_requestId, task) =>
      // Its subtasks go with it.
      queryClient.setQueryData<Task[]>(taskKeys.all(eventId), (tasks = []) =>
        tasks.filter((item) => item.id !== task.id && item.parentTaskId !== task.id),
      ),
    onSettled: () => {
      settled(queryClient, eventId);
      void queryClient.invalidateQueries({ queryKey: eventKeys.event(eventId), exact: true });
    },
  });
}
