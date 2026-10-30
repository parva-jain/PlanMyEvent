'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Card } from '@/components/ui/card';
import { eventHref } from '@/components/shell/nav';
import { useMyTasks } from '@/lib/tasks';

import { DueChip, PriorityChip } from './task-bits';

/**
 * My tasks across every event (PRD "My tasks view for helpers"), earliest due first. Each
 * row opens the task in its event. Hidden when I have none.
 */
export function MyTasks() {
  const t = useTranslations('tasks.mine');
  const { data: tasks } = useMyTasks();
  if (!tasks?.length) return null;
  const multipleEvents = new Set(tasks.map((task) => task.event.id)).size > 1;
  return (
    <Card className="gap-2" data-testid="my-tasks">
      <h2 className="text-h3">{t('title', { count: tasks.length })}</h2>
      <ul className="-mx-3 flex flex-col">
        {tasks.map((task) => (
          <li key={task.id}>
            <Link
              href={`${eventHref(task.event.id, 'tasks')}?task=${task.id}`}
              className="flex min-h-12 items-center gap-3 rounded-control px-3 py-2 hover:bg-surface-muted"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-body">{task.title}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-fg-secondary">
                  {multipleEvents && <span>{task.event.name}</span>}
                  <PriorityChip task={task} />
                  <DueChip task={task} />
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-fg-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
