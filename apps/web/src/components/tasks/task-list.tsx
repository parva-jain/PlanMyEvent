'use client';

import type { SubEvent, Task } from '@pme/contracts';
import { Check } from 'lucide-react';
import { m, useMotionValue, useTransform } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useRef, type ReactNode } from 'react';

import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { useSnackbar } from '@/components/motion/undo-snackbar';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { spring } from '@/lib/motion';
import { subtasksOf, TASK_STATUSES, useUpdateTask } from '@/lib/tasks';

import {
  AssigneeStack,
  DueChip,
  PriorityChip,
  StruckTitle,
  SubEventChip,
  SubtaskCount,
  TaskCheckbox,
} from './task-bits';
import { useTaskAccess, useToggleDone } from './use-task-actions';

/** MOTION.md 6.6: a swipe past 40% of the row completes the task. */
const SWIPE_THRESHOLD = 0.4;

/**
 * Phone swipe to complete (MOTION.md 6.6): the row follows the finger to the right over a
 * green "Done"; past 40% it completes, otherwise it springs back (`drag`). Vertical scrolling
 * stays with the page (touch-action pan-y), and a swipe never counts as a tap on the row.
 */
function SwipeToComplete({
  children,
  onComplete,
}: {
  children: ReactNode;
  onComplete: () => void;
}) {
  const t = useTranslations('tasks');
  const ref = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const x = useMotionValue(0);
  const reveal = useTransform(x, [0, 96], [0, 1]);
  return (
    <div ref={ref} className="relative overflow-hidden rounded-card">
      <m.div
        aria-hidden
        style={{ opacity: reveal }}
        className="absolute inset-0 flex items-center gap-2 bg-success px-5 text-label text-white"
      >
        <Check className="size-5" />
        {t('swipeDone')}
      </m.div>
      <m.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 1 }}
        dragSnapToOrigin
        dragTransition={{
          bounceStiffness: spring.drag.stiffness,
          bounceDamping: spring.drag.damping,
        }}
        style={{ x, touchAction: 'pan-y' }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={() => {
          if (x.get() > (ref.current?.offsetWidth ?? Infinity) * SWIPE_THRESHOLD) onComplete();
          // The click that ends a drag comes after this; let it be swallowed first.
          setTimeout(() => (dragged.current = false));
        }}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        className="relative"
      >
        {children}
      </m.div>
    </div>
  );
}

/**
 * A subtask under its row: smaller and indented. Ticking saves at once and it stays in
 * place (like the panel's checklist); tapping it opens the parent.
 */
function SubtaskItem({ subtask, onOpen }: { subtask: Task; onOpen: () => void }) {
  const t = useTranslations('tasks');
  const { eventId } = useCurrentEvent();
  const { canMove } = useTaskAccess();
  const update = useUpdateTask(eventId);
  const show = useSnackbar();
  const done = subtask.status === 'done';
  return (
    <LiveRow entityId={subtask.id} className="rounded-control">
      <div className="flex min-h-9 items-center gap-2.5" data-testid="row-subtask">
        <TaskCheckbox
          small
          title={subtask.title}
          checked={done}
          disabled={!canMove(subtask)}
          onToggle={() =>
            update.mutate(
              { task: subtask, changes: { status: done ? 'todo' : 'done' } },
              { onError: () => show({ message: t('saveFailed') }) },
            )
          }
        />
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 text-left">
          <StruckTitle title={subtask.title} struck={done} className="text-small" />
        </button>
      </div>
    </LiveRow>
  );
}

/**
 * DESIGN.md task row: checkbox, title, due date, sub-event chip, assignee avatars, and its
 * subtasks indented underneath.
 */
export function TaskRow({
  task,
  subtasks = [],
  subEvents,
  onOpen,
  swipeable,
}: {
  task: Task;
  subtasks?: readonly Task[];
  subEvents: readonly SubEvent[] | undefined;
  onOpen: (taskId: string) => void;
  swipeable: boolean;
}) {
  const t = useTranslations('tasks');
  const { canMove } = useTaskAccess();
  const movable = canMove(task);
  const { checked, toggle } = useToggleDone(task);
  const row = (
    <div
      data-testid="task-row"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3 shadow-card"
    >
      <div className="flex items-start gap-3">
        <span className="pt-0.5">
          <TaskCheckbox
            title={task.title}
            checked={checked}
            disabled={!movable}
            onToggle={toggle}
          />
        </span>
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
        >
          <StruckTitle title={task.title} struck={checked} className="text-body" />
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <PriorityChip task={task} />
            <DueChip task={task} />
            <SubEventChip subEvents={subEvents} subEventId={task.subEventId} />
            <SubtaskCount task={task} />
          </span>
        </button>
        <AssigneeStack assignees={task.assignees} />
      </div>
      {subtasks.length > 0 && (
        <ListPresence
          aria-label={t('subtasksOf', { title: task.title })}
          className="ml-2.5 flex flex-col border-l border-border pl-5"
        >
          {subtasks.map((subtask) => (
            <ListItem key={subtask.id}>
              <SubtaskItem subtask={subtask} onOpen={() => onOpen(task.id)} />
            </ListItem>
          ))}
        </ListPresence>
      )}
    </div>
  );
  return (
    <LiveRow entityId={task.id} className="rounded-card">
      {swipeable && movable && !checked ? (
        <SwipeToComplete onComplete={toggle}>{row}</SwipeToComplete>
      ) : (
        row
      )}
    </LiveRow>
  );
}

/**
 * List view: top-level tasks grouped by status, in board order, each with its subtasks.
 * Every group stays mounted (headers hide when empty), so a completed task can slide into
 * Done with ListPresence.
 */
export function TaskList({
  tasks,
  allTasks,
  subEvents,
  onOpen,
  swipeable,
}: {
  tasks: readonly Task[];
  /** Every task, subtasks included, to find each row's subtasks. */
  allTasks: readonly Task[];
  subEvents: readonly SubEvent[] | undefined;
  onOpen: (taskId: string) => void;
  swipeable: boolean;
}) {
  const t = useTranslations('tasks.status');
  return (
    <div className="flex flex-col gap-6">
      {TASK_STATUSES.map((status) => {
        const items = tasks.filter((task) => task.status === status);
        return (
          <section
            key={status}
            aria-label={t(status)}
            className={items.length ? 'flex flex-col gap-3' : 'hidden'}
            data-testid={`task-group-${status}`}
          >
            <h2 className="text-label text-fg-secondary">
              {t(status)} <span className="text-fg-muted tabular-nums">· {items.length}</span>
            </h2>
            <ListPresence className="flex flex-col gap-2">
              {items.map((task) => (
                <ListItem key={task.id}>
                  <TaskRow
                    task={task}
                    subtasks={subtasksOf(allTasks, task.id)}
                    subEvents={subEvents}
                    onOpen={onOpen}
                    swipeable={swipeable}
                  />
                </ListItem>
              ))}
            </ListPresence>
          </section>
        );
      })}
    </div>
  );
}
