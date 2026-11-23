'use client';

import type {
  MarkNotificationsRead,
  MarkNotificationsReadResult,
  NotificationPage,
} from '@pme/contracts';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { apiFetch } from './api';

export const notificationKeys = {
  all: ['notifications'] as const,
};

type Pages = InfiniteData<NotificationPage, string | null>;

/**
 * GET /v1/notifications, newest first, 20 at a time. The first page carries the unread count,
 * so the bell's badge and the list share one query.
 */
export function useNotifications() {
  return useInfiniteQuery({
    queryKey: notificationKeys.all,
    queryFn: ({ pageParam }) =>
      apiFetch<NotificationPage>(
        `/v1/notifications${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : null),
  });
}

/** POST /v1/notifications/read: marks at once on screen, then settles with the server. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkNotificationsRead) =>
      apiFetch<MarkNotificationsReadResult>('/v1/notifications/read', { method: 'POST', body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previous = queryClient.getQueryData<Pages>(notificationKeys.all);
      if (previous) {
        const now = new Date().toISOString();
        const marks = (id: string) => body.all === true || (body.ids ?? []).includes(id);
        let marked = 0;
        const pages = previous.pages.map((page) => ({
          ...page,
          data: page.data.map((item) => {
            if (item.readAt || !marks(item.id)) return item;
            marked++;
            return { ...item, readAt: now };
          }),
        }));
        const unread = body.all ? 0 : Math.max(0, (pages[0]?.unreadCount ?? 0) - marked);
        queryClient.setQueryData<Pages>(notificationKeys.all, {
          ...previous,
          pages: pages.map((page) => ({ ...page, unreadCount: unread })),
        });
      }
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(notificationKeys.all, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
