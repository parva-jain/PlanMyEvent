'use client';

import type { Notification } from '@pme/contracts';
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckSquare,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { AnimatePresence, m, useAnimationControls } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { EditPanel } from '@/components/motion/side-panel';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { formatShortDate, timeAgo } from '@/lib/format';
import { duration, ease } from '@/lib/motion';
import { useMarkRead, useNotifications } from '@/lib/notifications';
import { cn } from '@/lib/utils';

import { eventHref } from './nav';

/**
 * The bell in the top bar (MOTION.md 6.1): a badge with my unread count, one gentle 8° wiggle
 * when it goes up (once per batch), the badge popping in with `overshoot`. Opens my
 * notifications in a side panel on desktop and a sheet on phone. notification.new from my
 * personal room re-fetches the list.
 */
export function NotificationBell() {
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);
  const query = useNotifications();
  const unread = query.data?.pages[0]?.unreadCount ?? 0;
  const bell = useAnimationControls();
  const reduced = useShouldReduceMotion();
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = unread;
    // Not on the first load: only when something new arrives.
    if (before === null || unread <= before || reduced) return;
    void bell.start({
      rotate: [0, 8, -8, 4, 0],
      transition: { duration: duration.slow, ease: ease.out },
    });
  }, [unread, reduced, bell]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread ? t('openUnread', { count: unread }) : t('open')}
        className="relative flex size-11 items-center justify-center rounded-control text-fg-secondary hover:bg-surface-muted hover:text-fg"
      >
        <m.span animate={bell} className="flex origin-top">
          <Bell aria-hidden className="size-5" />
        </m.span>
        <AnimatePresence>
          {unread > 0 && (
            <m.span
              key={unread > 9 ? '9+' : unread}
              aria-hidden
              initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.base, ease: ease.overshoot }}
              className="absolute top-1.5 right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-caption font-semibold text-white tabular-nums"
            >
              {unread > 9 ? '9+' : unread}
            </m.span>
          )}
        </AnimatePresence>
      </button>
      <EditPanel open={open} onOpenChange={setOpen} title={t('title')}>
        <NotificationList query={query} onNavigate={() => setOpen(false)} />
      </EditPanel>
    </>
  );
}

function NotificationList({
  query,
  onNavigate,
}: {
  query: ReturnType<typeof useNotifications>;
  onNavigate: () => void;
}) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const markRead = useMarkRead();
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const unread = query.data?.pages[0]?.unreadCount ?? 0;

  const openItem = (item: Notification) => {
    if (!item.readAt) markRead.mutate({ ids: [item.id] });
    const href = targetOf(item);
    if (href) {
      onNavigate();
      router.push(href);
    }
  };

  if (query.isError && !query.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-body">{t('loadFailed')}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center text-fg-secondary">
        <BellOff aria-hidden className="size-8" />
        <p className="text-body">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-small text-fg-secondary">{t('unread', { count: unread })}</p>
        {unread > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markRead.mutate({ all: true })}>
            {t('markAll')}
          </Button>
        )}
      </div>
      <ListPresence className="flex flex-col gap-1">
        {items.map((item) => (
          <ListItem key={item.id}>
            <button
              type="button"
              onClick={() => openItem(item)}
              className={cn(
                'flex w-full items-start gap-3 rounded-control p-3 text-left transition-colors duration-(--dur-base) ease-(--ease-out) hover:bg-surface-muted',
                !item.readAt && 'bg-primary-tint/40',
              )}
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-surface-muted text-fg-secondary">
                <TypeIcon type={item.type} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-label">
                  <Message item={item} />
                </span>
                <span className="truncate text-small text-fg-secondary">
                  {item.event ? `${item.event.name} · ` : ''}
                  <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
                </span>
              </span>
              {!item.readAt && (
                <span className="mt-2 size-2 shrink-0 rounded-full bg-primary">
                  <span className="sr-only">{t('unreadLabel')}</span>
                </span>
              )}
            </button>
          </ListItem>
        ))}
      </ListPresence>
      {query.hasNextPage && (
        <Button
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('more')}
        </Button>
      )}
    </div>
  );
}

function TypeIcon({ type }: { type: Notification['type'] }) {
  const Icon =
    type === 'task_assigned'
      ? CheckSquare
      : type === 'task_due'
        ? CalendarClock
        : type === 'role_changed'
          ? ShieldCheck
          : TriangleAlert;
  return <Icon aria-hidden className="size-4" />;
}

function Message({ item }: { item: Notification }) {
  const t = useTranslations('notifications.types');
  const actor = item.actor?.name ?? t('someone');
  switch (item.type) {
    case 'task_assigned':
      return t('taskAssigned', { actor, title: item.data.taskTitle });
    case 'task_due':
      return t('taskDue', { title: item.data.taskTitle, date: formatShortDate(item.data.dueOn) });
    case 'role_changed':
      return item.data.roleNames.length
        ? t('roleChanged', { actor, roles: item.data.roleNames.join(', ') })
        : t('rolesRemoved', { actor });
    case 'job_failed':
      return t('jobFailed');
  }
}

/** Where a notification leads: the task, or the team page for role changes. */
function targetOf(item: Notification): string | null {
  if (!item.event) return null;
  switch (item.type) {
    case 'task_assigned':
    case 'task_due':
      return `${eventHref(item.event.id, 'tasks')}?task=${item.data.taskId}`;
    case 'role_changed':
      return eventHref(item.event.id, 'team');
    case 'job_failed':
      return eventHref(item.event.id, 'people');
  }
}
