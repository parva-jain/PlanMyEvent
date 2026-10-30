'use client';

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { positionBetween, type SubEvent, type Task, type TaskStatus } from '@pme/contracts';
import { m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { useSnackbar } from '@/components/motion/undo-snackbar';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { duration, spring } from '@/lib/motion';
import { column, lastIn, TASK_STATUSES, useUpdateTask } from '@/lib/tasks';
import { cn } from '@/lib/utils';

import {
  AssigneeStack,
  DueChip,
  PriorityChip,
  StruckTitle,
  SubEventChip,
  SubtaskCount,
} from './task-bits';
import { useTaskAccess } from './use-task-actions';

type Columns = Record<TaskStatus, string[]>;

/** CSS cubic-bezier for dnd-kit's own transitions, from the `out` token. */
const EASE_OUT_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MOVE_MS = duration.moderate * 1000;
const CLICK_GUARD_MS = 300;

/**
 * What the card is over: whatever it overlaps most, else the nearest corners. Columns
 * stretch to the tallest one, so corners alone would keep an empty column's top looking
 * farther away than a card beside it.
 */
const collisionDetection: CollisionDetection = (args) => {
  const overlapping = rectIntersection(args);
  return overlapping.length ? overlapping : closestCorners(args);
};

const isStatus = (id: UniqueIdentifier): id is TaskStatus =>
  (TASK_STATUSES as readonly UniqueIdentifier[]).includes(id);

/** Which column holds a card (or is the droppable itself). */
function columnOf(columns: Columns, id: UniqueIdentifier): TaskStatus | null {
  if (isStatus(id)) return id;
  return TASK_STATUSES.find((status) => columns[status].includes(String(id))) ?? null;
}

function CardBody({ task, subEvents }: { task: Task; subEvents: readonly SubEvent[] | undefined }) {
  return (
    <>
      <StruckTitle title={task.title} struck={task.status === 'done'} className="text-label" />
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PriorityChip task={task} />
        <DueChip task={task} />
        <SubEventChip subEvents={subEvents} subEventId={task.subEventId} />
        <SubtaskCount task={task} />
        <span className="ml-auto">
          <AssigneeStack assignees={task.assignees} />
        </span>
      </span>
    </>
  );
}

const cardClasses =
  'flex w-full flex-col gap-2 rounded-card border border-border bg-surface p-3 text-left shadow-card';

/**
 * A sortable card. Cards I can't move are still buttons that open the task; dnd-kit makes
 * the rest draggable by pointer (after 6 px, so a tap still opens) and by keyboard (Space).
 */
function BoardCard({
  task,
  subEvents,
  onOpen,
}: {
  task: Task;
  subEvents: readonly SubEvent[] | undefined;
  onOpen: (taskId: string) => void;
}) {
  const { canMove } = useTaskAccess();
  const reduced = useShouldReduceMotion();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canMove(task),
    transition: reduced ? null : { duration: MOVE_MS, easing: EASE_OUT_CSS },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <LiveRow entityId={task.id} className="rounded-card">
        <button
          type="button"
          data-testid="task-card"
          {...attributes}
          {...listeners}
          onClick={() => onOpen(task.id)}
          className={cn(cardClasses, 'hover-lift touch-manipulation')}
        >
          <CardBody task={task} subEvents={subEvents} />
        </button>
      </LiveRow>
    </li>
  );
}

function BoardColumn({
  status,
  tasks,
  subEvents,
  onOpen,
}: {
  status: TaskStatus;
  tasks: Task[];
  subEvents: readonly SubEvent[] | undefined;
  onOpen: (taskId: string) => void;
}) {
  const t = useTranslations('tasks');
  // Empty columns still take drops.
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      aria-label={t(`status.${status}`)}
      data-testid={`board-column-${status}`}
      className="flex w-72 shrink-0 flex-col gap-3 lg:w-auto lg:min-w-0 lg:flex-1"
    >
      <h2 className="flex items-center gap-2 px-1 text-label text-fg-secondary">
        {t(`status.${status}`)}
        <span className="rounded-full bg-surface-muted px-2 text-caption tabular-nums">
          {tasks.length}
        </span>
      </h2>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cn(
            'flex min-h-32 flex-col gap-2 rounded-card bg-surface-band p-2 transition-colors duration-(--dur-fast)',
            isOver && 'bg-primary-tint',
          )}
        >
          {tasks.map((task) => (
            <BoardCard key={task.id} task={task} subEvents={subEvents} onOpen={onOpen} />
          ))}
          {!tasks.length && (
            <li className="px-2 py-6 text-center text-small text-fg-muted">{t('emptyColumn')}</li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

/**
 * Board view (MOTION.md 6.6): a column per status. The dragged card lifts (scale 1.03,
 * rotate 2°, raised shadow) on the `drag` spring, others make room, and the drop settles.
 * A drop saves the status and a fractional position between its new neighbours, so moving
 * one card writes one row; the cache moves it at once and rolls back if refused.
 */
export function TaskBoard({
  tasks,
  subEvents,
  onOpen,
}: {
  tasks: readonly Task[];
  subEvents: readonly SubEvent[] | undefined;
  onOpen: (taskId: string) => void;
}) {
  const t = useTranslations('tasks');
  const tBoard = useTranslations('tasks.dnd');
  const { eventId } = useCurrentEvent();
  const update = useUpdateTask(eventId);
  const show = useSnackbar();
  const reduced = useShouldReduceMotion();
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const settled = useMemo(
    () =>
      Object.fromEntries(
        TASK_STATUSES.map((status) => [status, column(tasks, status).map((task) => task.id)]),
      ) as Columns,
    [tasks],
  );
  // While dragging, cards move between columns here; the cache changes only on drop.
  const [dragging, setDragging] = useState<{ id: string; columns: Columns } | null>(null);
  const columns = dragging?.columns ?? settled;
  const active = dragging ? byId.get(dragging.id) : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks up and drops; Enter stays the button's own "open".
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );
  // The click that ends a drag (pointer up, or Space's key up) mustn't open the card.
  const recentDrag = useRef(false);
  const open = (taskId: string) => {
    if (!recentDrag.current) onOpen(taskId);
  };
  const endDrag = () => {
    setDragging(null);
    setTimeout(() => (recentDrag.current = false), CLICK_GUARD_MS);
  };

  const titleOf = (id: UniqueIdentifier) => byId.get(String(id))?.title ?? '';
  const placeOf = (id: UniqueIdentifier) => {
    const status = columnOf(columns, id);
    return status
      ? {
          column: t(`status.${status}`),
          position: columns[status].indexOf(String(id)) + 1,
        }
      : null;
  };
  const announcements: Announcements = {
    onDragStart: ({ active: item }) => tBoard('picked', { title: titleOf(item.id) }),
    onDragOver: ({ active: item }) => {
      const place = placeOf(item.id);
      return place ? tBoard('over', { title: titleOf(item.id), ...place }) : undefined;
    },
    onDragEnd: ({ active: item }) => {
      const place = placeOf(item.id);
      return place ? tBoard('dropped', { title: titleOf(item.id), ...place }) : undefined;
    },
    onDragCancel: ({ active: item }) => tBoard('cancelled', { title: titleOf(item.id) }),
  };

  const onDragStart = ({ active: item }: DragStartEvent) => {
    recentDrag.current = true;
    setDragging({ id: String(item.id), columns: settled });
  };

  /** Crossing into another column moves the card there, at the card it's over. */
  const onDragOver = ({ active: item, over }: DragOverEvent) => {
    if (!dragging || !over) return;
    const from = columnOf(dragging.columns, item.id);
    const to = columnOf(dragging.columns, over.id);
    if (!from || !to || from === to) return;
    const target = dragging.columns[to];
    const index = isStatus(over.id) ? target.length : target.indexOf(String(over.id));
    setDragging({
      id: dragging.id,
      columns: {
        ...dragging.columns,
        [from]: dragging.columns[from].filter((id) => id !== item.id),
        [to]: [...target.slice(0, index), String(item.id), ...target.slice(index)],
      },
    });
  };

  const onDragEnd = ({ active: item, over }: DragEndEvent) => {
    const current = dragging?.columns;
    endDrag();
    const task = byId.get(String(item.id));
    if (!current || !over || !task) return;
    const status = columnOf(current, item.id);
    if (!status) return;
    let ids = current[status];
    if (!isStatus(over.id) && ids.includes(String(over.id))) {
      ids = arrayMove(ids, ids.indexOf(String(item.id)), ids.indexOf(String(over.id)));
    }
    const index = ids.indexOf(String(item.id));
    const before = byId.get(ids[index - 1] ?? '')?.position ?? null;
    const after = byId.get(ids[index + 1] ?? '')?.position ?? null;
    let position: string;
    try {
      position = positionBetween(before, after);
    } catch {
      // Neighbours out of order (a live change mid-drag): go last instead.
      position = lastIn(tasks, status);
    }
    const unchanged = status === task.status && settled[status].indexOf(task.id) === index;
    if (unchanged) return;
    update.mutate(
      { task, changes: status === task.status ? { position } : { status, position } },
      { onError: () => show({ message: t('saveFailed') }) },
    );
  };

  const dropAnimation: DropAnimation | null = reduced
    ? null
    : { duration: MOVE_MS, easing: EASE_OUT_CSS };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: tBoard('instructions') },
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      <div
        className="-mx-4 flex items-start gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0"
        data-testid="task-board"
      >
        {TASK_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={columns[status].flatMap((id) => byId.get(id) ?? [])}
            subEvents={subEvents}
            onOpen={open}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={dropAnimation}>
        {active && (
          <m.div
            className={cn(cardClasses, 'cursor-grabbing shadow-raised')}
            initial={{ scale: 1, rotate: 0 }}
            animate={{ scale: 1.03, rotate: 2 }}
            transition={spring.drag}
          >
            <CardBody task={active} subEvents={subEvents} />
          </m.div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
