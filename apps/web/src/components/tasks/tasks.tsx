'use client';

import { canSomewhere, VALUE_SETS, type Task, type TaskAssignee } from '@pme/contracts';
import { ListPlus, Plus } from 'lucide-react';
import { domMax, LazyMotion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { EditPanel } from '@/components/motion/side-panel';
import { Skeleton } from '@/components/motion/skeleton';
import { useCurrentEvent } from '@/components/shell/current-event';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSubEvents } from '@/lib/events';
import { highlight } from '@/lib/live-highlights';
import { isOverdue, useCreateTask, useTasks } from '@/lib/tasks';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

import { useToday } from './task-bits';
import { TaskBoard } from './task-board';
import { TaskList } from './task-list';
import { TaskPanelBody } from './task-panel';

/** '' = every sub-event, 'event' = whole-event tasks only, else a sub-event id. */
type Place = string;

interface Filters {
  mine: boolean;
  place: Place;
  /** A member id, or ''. */
  assignee: string;
  /** A status, or '' (the list view only; the board shows every column). */
  status: string;
}

function matches(task: Task, filters: Filters, myMemberId: string, board: boolean) {
  if (task.parentTaskId) return false;
  const assigned = (memberId: string) => task.assignees.some((item) => item.memberId === memberId);
  if (filters.mine && !assigned(myMemberId)) return false;
  if (filters.assignee && !assigned(filters.assignee)) return false;
  if (filters.place === 'event' && task.subEventId) return false;
  if (filters.place && filters.place !== 'event' && task.subEventId !== filters.place) return false;
  if (!board && filters.status && task.status !== filters.status) return false;
  return true;
}

/** People to filter by: whoever has tasks here (needs no members.view). */
function assigneesOf(tasks: readonly Task[]): TaskAssignee[] {
  const byId = new Map<string, TaskAssignee>();
  for (const task of tasks) for (const item of task.assignees) byId.set(item.memberId, item);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Tasks (Stitch "Tasks"): a list grouped by status or a board, filtered by me, sub-event,
 * assignee and status. Helpers, who can't add tasks, start on their own. The open task
 * lives in the URL (?task=…), so My tasks can link straight to one; ?add=1 opens a new one.
 */
export function Tasks() {
  const t = useTranslations('tasks');
  const { eventId, membership, can } = useCurrentEvent();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: tasks, isError, refetch } = useTasks(eventId);
  const { data: subEvents } = useSubEvents(eventId);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const today = useToday();
  const canAdd = canSomewhere(membership.permissions, 'tasks.edit');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [filters, setFilters] = useState<Filters>({
    mine: !canAdd,
    place: '',
    assignee: '',
    status: '',
  });
  const setFilter = (changes: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...changes }));

  const openId = searchParams.get('add') === '1' ? 'new' : searchParams.get('task');
  /** A task id, 'new', or null to close. */
  const openTask = (taskId: string | null) => {
    const query = taskId === 'new' ? '?add=1' : taskId ? `?task=${taskId}` : '';
    router.replace(`${pathname}${query}`, { scroll: false });
  };

  const top = (tasks ?? []).filter((task) => !task.parentTaskId);
  const done = top.filter((task) => task.status === 'done').length;
  const overdue = top.filter((task) => isOverdue(task, today)).length;
  const shownFor = (board: boolean) =>
    (tasks ?? []).filter((task) => matches(task, filters, membership.member.id, board));
  const filtered = filters.mine || filters.place || filters.assignee || filters.status;
  // Quick add puts the task where the filter points, if I may add tasks there.
  const addPlace =
    filters.place && filters.place !== 'event' ? filters.place : (null as string | null);
  const subEventsHere = (subEvents ?? []).filter((item) =>
    top.some((task) => task.subEventId === item.id),
  );

  return (
    <LazyMotion features={domMax}>
      <div className="flex flex-col gap-6 lg:gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
            {tasks && (
              <p className="text-body text-fg-secondary" data-testid="tasks-summary">
                {t('summary', { done, total: top.length })}
                {overdue > 0 && (
                  <span className="text-danger-text"> · {t('overdue', { count: overdue })}</span>
                )}
              </p>
            )}
          </div>
          {canAdd && (
            <Button icon={<ListPlus aria-hidden />} onClick={() => openTask('new')}>
              {t('add')}
            </Button>
          )}
        </div>

        <Tabs
          value={view}
          onValueChange={(value) => setView(value as 'list' | 'board')}
          className="gap-6"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList aria-label={t('view')}>
              <TabsTrigger value="list">{t('list')}</TabsTrigger>
              <TabsTrigger value="board">{t('board')}</TabsTrigger>
            </TabsList>
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label={t('filters')}
            >
              <button
                type="button"
                aria-pressed={filters.mine}
                onClick={() => setFilter({ mine: !filters.mine })}
                className={cn(
                  'h-10 rounded-full border px-4 text-small transition-colors duration-(--dur-fast)',
                  filters.mine
                    ? 'border-primary bg-primary-tint text-primary-text'
                    : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted',
                )}
              >
                {t('assignedToMe')}
              </button>
              <Select
                size="sm"
                aria-label={t('filterSubEvent')}
                value={filters.place}
                onChange={(e) => setFilter({ place: e.target.value })}
                className="w-auto"
              >
                <option value="">{t('allSubEvents')}</option>
                <option value="event">{t('wholeEventOnly')}</option>
                {subEventsHere.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select
                size="sm"
                aria-label={t('filterAssignee')}
                value={filters.assignee}
                onChange={(e) => setFilter({ assignee: e.target.value })}
                className="w-auto"
              >
                <option value="">{t('anyone')}</option>
                {assigneesOf(top).map((item) => (
                  <option key={item.memberId} value={item.memberId}>
                    {item.name}
                  </option>
                ))}
              </Select>
              {view === 'list' && (
                <Select
                  size="sm"
                  aria-label={t('filterStatus')}
                  value={filters.status}
                  onChange={(e) => setFilter({ status: e.target.value })}
                  className="w-auto"
                >
                  <option value="">{t('anyStatus')}</option>
                  {VALUE_SETS.taskStatus.map((status) => (
                    <option key={status} value={status}>
                      {t(`status.${status}`)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>

          {isError && (
            <Card className="items-center gap-3 py-8 text-center">
              <p className="text-body">{t('loadFailed')}</p>
              <Button variant="secondary" onClick={() => void refetch()}>
                {t('retry')}
              </Button>
            </Card>
          )}
          {!tasks && !isError && <Skeleton className="h-64" />}

          {tasks && top.length === 0 && (
            <Card className="items-center gap-3 py-12 text-center">
              <h2 className="text-h3">{t('emptyTitle')}</h2>
              <p className="max-w-md text-body text-fg-secondary">{t('emptyBody')}</p>
            </Card>
          )}

          {tasks && top.length > 0 && (
            <>
              <TabsContent value="list">
                <div className="flex flex-col gap-6">
                  {can('tasks.edit', addPlace) && <QuickAdd subEventId={addPlace} />}
                  {shownFor(false).length === 0 && filtered ? (
                    <EmptyFiltered
                      onClear={() =>
                        setFilters({ mine: false, place: '', assignee: '', status: '' })
                      }
                    />
                  ) : (
                    <TaskList
                      tasks={shownFor(false)}
                      subEvents={subEvents}
                      onOpen={openTask}
                      swipeable={!desktop}
                    />
                  )}
                </div>
              </TabsContent>
              <TabsContent value="board">
                <TaskBoard tasks={shownFor(true)} subEvents={subEvents} onOpen={openTask} />
              </TabsContent>
            </>
          )}
        </Tabs>

        <EditPanel
          open={openId !== null}
          onOpenChange={(open) => !open && openTask(null)}
          title={openId === 'new' ? t('newTitle') : t('editTitle')}
        >
          {openId !== null && (
            <TaskPanelBody
              taskId={openId}
              defaults={{ subEventId: addPlace }}
              onDone={() => openTask(null)}
            />
          )}
        </EditPanel>
      </div>
    </LazyMotion>
  );
}

function EmptyFiltered({ onClear }: { onClear: () => void }) {
  const t = useTranslations('tasks');
  return (
    <Card className="items-center gap-3 py-8 text-center">
      <p className="text-body text-fg-secondary">{t('emptyFiltered')}</p>
      <Button variant="secondary" size="sm" onClick={onClear}>
        {t('clearFilters')}
      </Button>
    </Card>
  );
}

/** "Add a task" + Enter (MOTION.md 6.6: the new row enters with a short own-change glow). */
function QuickAdd({ subEventId }: { subEventId: string | null }) {
  const t = useTranslations('tasks');
  const { eventId } = useCurrentEvent();
  const create = useCreateTask(eventId);
  const [title, setTitle] = useState('');
  const [failed, setFailed] = useState(false);

  function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!title.trim()) return;
    setFailed(false);
    create.mutate(
      { title: title.trim(), subEventId },
      {
        onSuccess: (task) => {
          setTitle('');
          highlight(task.id, { source: 'own', op: 'created', actorUserId: null });
        },
        onError: () => setFailed(true),
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          aria-label={t('quickAdd')}
          placeholder={t('quickAdd')}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          icon={<Plus aria-hidden />}
          loading={create.isPending}
        >
          {t('addShort')}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-small text-danger-text">
          {t('saveFailed')}
        </p>
      )}
    </form>
  );
}
