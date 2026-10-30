'use client';

import {
  VALUE_SETS,
  type CreateTask,
  type Member,
  type Task,
  type UpdateTask,
} from '@pme/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { CheckDraw } from '@/components/motion/check-draw';
import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { useOfferUndo } from '@/components/shell/use-offer-undo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select, Textarea } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { subEventName, useSubEvents } from '@/lib/events';
import { highlight } from '@/lib/live-highlights';
import {
  putTask,
  subtasksOf,
  useAssignTask,
  useCreateTask,
  useDeleteTask,
  useTasks,
  useUpdateTask,
} from '@/lib/tasks';
import { membersQuery } from '@/lib/team';

import { StruckTitle, TaskCheckbox } from './task-bits';
import { useTaskAccess } from './use-task-actions';

interface FormState {
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  category: string;
  dueOn: string;
  /** '' = the whole event. */
  subEventId: string;
  assigneeIds: string[];
}

const fromTask = (task: Task): FormState => ({
  title: task.title,
  description: task.description ?? '',
  status: task.status,
  priority: task.priority,
  category: task.category ?? '',
  dueOn: task.dueOn ?? '',
  subEventId: task.subEventId ?? '',
  assigneeIds: task.assignees.map((assignee) => assignee.memberId),
});

/** The body fields, from the form (empty optional fields are null). */
const fields = (form: FormState) => ({
  title: form.title.trim(),
  description: form.description.trim() || null,
  status: form.status,
  priority: form.priority,
  category: form.category.trim() || null,
  dueOn: form.dueOn || null,
  subEventId: form.subEventId || null,
});

/** Only what changed, so an untouched deleted sub-event isn't sent back (and refused). */
function changesFrom(task: Task, form: FormState): UpdateTask {
  const next = fields(form);
  const before = fields(fromTask(task));
  return Object.fromEntries(
    Object.entries(next).filter(([key, value]) => before[key as keyof typeof before] !== value),
  );
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

const isConflict = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.problem?.code === 'version_conflict';

/**
 * The task panel (MOTION.md 6.6: SidePanel on desktop, Sheet on phone). Opens on the live
 * copy of the task, so someone else's change shows; if they deleted it, says so.
 */
export function TaskPanelBody({
  taskId,
  defaults,
  onDone,
}: {
  /** A task id, or 'new'. */
  taskId: string;
  defaults?: Partial<CreateTask>;
  onDone: () => void;
}) {
  const t = useTranslations('tasks.form');
  const { eventId } = useCurrentEvent();
  const { data: tasks } = useTasks(eventId);
  // Bumped after a version conflict: the form starts again from the latest copy.
  const [attempt, setAttempt] = useState(0);
  if (taskId === 'new') return <TaskForm task={null} defaults={defaults} onDone={onDone} />;
  const task = tasks?.find((item) => item.id === taskId);
  if (!task) {
    return tasks ? (
      <p role="status" className="text-body text-fg-secondary">
        {t('gone')}
      </p>
    ) : null;
  }
  return (
    <TaskForm
      key={attempt}
      task={task}
      conflicted={attempt > 0}
      onConflict={() => setAttempt((count) => count + 1)}
      onDone={onDone}
    />
  );
}

function TaskForm({
  task,
  defaults,
  conflicted = false,
  onConflict,
  onDone,
}: {
  task: Task | null;
  defaults?: Partial<CreateTask>;
  conflicted?: boolean;
  onConflict?: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('tasks');
  const { eventId, can } = useCurrentEvent();
  const queryClient = useQueryClient();
  const { data: subEvents } = useSubEvents(eventId);
  const { canEdit, canMove } = useTaskAccess();
  const create = useCreateTask(eventId);
  const update = useUpdateTask(eventId);
  const assign = useAssignTask(eventId);
  const remove = useDeleteTask(eventId);
  const offerUndo = useOfferUndo();
  const [form, setForm] = useState<FormState>(() =>
    task
      ? fromTask(task)
      : {
          title: defaults?.title ?? '',
          description: '',
          status: defaults?.status ?? 'todo',
          priority: 'medium',
          category: '',
          dueOn: '',
          subEventId: defaults?.subEventId ?? '',
          assigneeIds: [],
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (changes: Partial<FormState>) => setForm((current) => ({ ...current, ...changes }));

  // Someone who can't add whole-event tasks starts in the first sub-event they can.
  const wholeEventAllowed = can('tasks.edit') || (task !== null && !task.subEventId);
  const places = (subEvents ?? []).filter(
    (item) => can('tasks.edit', item.id) || item.id === task?.subEventId,
  );
  const place = !wholeEventAllowed && !form.subEventId ? (places[0]?.id ?? '') : form.subEventId;
  const chosen = { ...form, subEventId: place };
  const subEventId = place || null;
  // A new task can go anywhere I may add tasks; an existing one is limited by its own rules.
  const editable = task ? canEdit(task) : true;
  const statusEditable = task ? canMove(task) : true;
  const canAssign = can('tasks.assign', subEventId) && can('members.view') && editable;
  const { data: members = [] } = useQuery({ ...membersQuery(eventId), enabled: canAssign });
  const assignable = canAssign ? members.filter((member) => member.status === 'active') : [];

  const current = subEventName(subEvents, task?.subEventId ?? null);

  async function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError(t('form.titleRequired'));
    setSaving(true);
    try {
      if (!task) {
        const created = await create.mutateAsync({
          ...fields(chosen),
          ...(form.assigneeIds.length && { assigneeIds: form.assigneeIds }),
        });
        highlight(created.id, { source: 'own', op: 'created', actorUserId: null });
      } else {
        let latest = task;
        const all = changesFrom(task, chosen);
        // Assignees of their own task may change its status only.
        const changes: UpdateTask = editable ? all : { ...(all.status && { status: all.status }) };
        if (Object.keys(changes).length) {
          latest = await update.mutateAsync({ task: latest, changes });
        }
        const before = task.assignees.map((assignee) => assignee.memberId);
        if (canAssign && !sameSet(before, form.assigneeIds)) {
          await assign.mutateAsync({ task: latest, memberIds: form.assigneeIds });
        }
      }
      onDone();
    } catch (failure) {
      if (isConflict(failure)) {
        const now = (failure.problem as { current?: Task }).current;
        if (now) putTask(queryClient, eventId, now);
        onConflict?.();
      } else if (
        failure instanceof ApiError &&
        failure.problem?.fields?.some(
          (field) => field.path.startsWith('assigneeIds') || field.path.startsWith('memberIds'),
        )
      ) {
        setError(t('form.cantSee'));
      } else {
        setError(t('saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!task) return;
    if (!confirmDelete) return setConfirmDelete(true);
    remove.mutate(task, {
      onSuccess: (requestId) => {
        onDone();
        offerUndo(t('deleted', { title: task.title }), task.id, requestId);
      },
      onError: (failure) => {
        if (isConflict(failure)) onConflict?.();
        else setError(t('form.deleteFailed'));
      },
    });
  }

  const toggleAssignee = (member: Member) =>
    set({
      assigneeIds: form.assigneeIds.includes(member.id)
        ? form.assigneeIds.filter((id) => id !== member.id)
        : [...form.assigneeIds, member.id],
    });

  return (
    <form
      onSubmit={(formEvent) => void onSubmit(formEvent)}
      className="flex flex-col gap-4"
      data-testid="task-form"
    >
      {conflicted && (
        <p
          role="alert"
          className="rounded-control bg-warning-tint px-4 py-3 text-small text-warning-text"
        >
          {t('form.conflict')}
        </p>
      )}
      {!editable && (
        <p className="rounded-control bg-info-tint px-4 py-3 text-small text-info-text">
          {statusEditable ? t('form.ownOnly') : t('form.readOnly')}
        </p>
      )}
      <Field id="task-title" label={t('form.title')}>
        <Input
          id="task-title"
          value={form.title}
          maxLength={200}
          disabled={!editable}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="task-status" label={t('form.status')}>
          <Select
            id="task-status"
            value={form.status}
            disabled={!statusEditable}
            onChange={(e) => set({ status: e.target.value as Task['status'] })}
          >
            {VALUE_SETS.taskStatus.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="task-priority" label={t('form.priority')}>
          <Select
            id="task-priority"
            value={form.priority}
            disabled={!editable}
            onChange={(e) => set({ priority: e.target.value as Task['priority'] })}
          >
            {VALUE_SETS.taskPriority.map((priority) => (
              <option key={priority} value={priority}>
                {t(`priority.${priority}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="task-due" label={t('form.dueOn')} aside={t('form.optional')}>
          <Input
            id="task-due"
            type="date"
            value={form.dueOn}
            disabled={!editable}
            onChange={(e) => set({ dueOn: e.target.value })}
          />
        </Field>
        <Field id="task-category" label={t('form.category')} aside={t('form.optional')}>
          <Input
            id="task-category"
            value={form.category}
            maxLength={60}
            disabled={!editable}
            onChange={(e) => set({ category: e.target.value })}
          />
        </Field>
      </div>
      {!task?.parentTaskId && (
        <Field
          id="task-sub-event"
          label={t('form.subEvent')}
          hint={current.deleted ? t('form.deletedHint') : undefined}
        >
          <Select
            id="task-sub-event"
            value={place}
            disabled={!editable}
            onChange={(e) => set({ subEventId: e.target.value })}
          >
            {wholeEventAllowed && <option value="">{t('form.wholeEvent')}</option>}
            {current.deleted && task?.subEventId && (
              <option value={task.subEventId}>{t('deletedSubEvent')}</option>
            )}
            {places.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id="task-description" label={t('form.description')} aside={t('form.optional')}>
        <Textarea
          id="task-description"
          value={form.description}
          maxLength={5000}
          disabled={!editable}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>

      {canAssign ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">{t('form.assignees')}</legend>
          <ul className="flex flex-col gap-1">
            {assignable.map((member) => {
              const checked = form.assigneeIds.includes(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggleAssignee(member)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-body hover:bg-surface-muted"
                  >
                    <CheckDraw checked={checked} />
                    {member.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : (
        task &&
        task.assignees.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-label">{t('form.assignees')}</span>
            <span className="text-body text-fg-secondary">
              {task.assignees.map((assignee) => assignee.name).join(', ')}
            </span>
          </div>
        )
      )}

      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {(editable || statusEditable) && (
          <Button type="submit" loading={saving}>
            {task ? t('form.save') : t('form.create')}
          </Button>
        )}
        {task && editable && (
          <Button
            type="button"
            variant={confirmDelete ? 'destructive' : 'ghost'}
            icon={<Trash2 aria-hidden />}
            loading={remove.isPending}
            onClick={onDelete}
            className="ml-auto"
          >
            {confirmDelete ? t('form.confirmDelete') : t('form.delete')}
          </Button>
        )}
      </div>

      {task && !task.parentTaskId && <Subtasks parent={task} editable={editable} />}
    </form>
  );
}

/** Checklist under a task (one level). Ticking saves at once; no slide, they stay in place. */
function Subtasks({ parent, editable }: { parent: Task; editable: boolean }) {
  const t = useTranslations('tasks');
  const { eventId } = useCurrentEvent();
  const { data: tasks = [] } = useTasks(eventId);
  const { canMove } = useTaskAccess();
  const create = useCreateTask(eventId);
  const update = useUpdateTask(eventId);
  const remove = useDeleteTask(eventId);
  const offerUndo = useOfferUndo();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const subtasks = subtasksOf(tasks, parent.id);
  const done = subtasks.filter((item) => item.status === 'done').length;

  const add = () => {
    if (!title.trim()) return;
    setError(null);
    create.mutate(
      { title: title.trim(), parentTaskId: parent.id },
      {
        onSuccess: (created) => {
          setTitle('');
          highlight(created.id, { source: 'own', op: 'created', actorUserId: null });
        },
        onError: () => setError(t('saveFailed')),
      },
    );
  };

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4" aria-label={t('subtasks')}>
      <h3 className="flex items-center justify-between text-label">
        {t('subtasks')}
        {subtasks.length > 0 && (
          <span className="text-small text-fg-muted tabular-nums">
            {done}/{subtasks.length}
          </span>
        )}
      </h3>
      <ListPresence className="flex flex-col gap-1" data-testid="subtasks">
        {subtasks.map((subtask) => (
          <ListItem key={subtask.id}>
            <LiveRow entityId={subtask.id} className="rounded-control">
              <div className="flex min-h-11 items-center gap-3 rounded-control px-2">
                <TaskCheckbox
                  title={subtask.title}
                  checked={subtask.status === 'done'}
                  disabled={!canMove(subtask)}
                  onToggle={() =>
                    update.mutate(
                      {
                        task: subtask,
                        changes: { status: subtask.status === 'done' ? 'todo' : 'done' },
                      },
                      { onError: () => setError(t('saveFailed')) },
                    )
                  }
                />
                <StruckTitle
                  title={subtask.title}
                  struck={subtask.status === 'done'}
                  className="flex-1 text-body"
                />
                {editable && (
                  <button
                    type="button"
                    aria-label={t('removeSubtask', { title: subtask.title })}
                    onClick={() =>
                      remove.mutate(subtask, {
                        onSuccess: (requestId) =>
                          offerUndo(t('deleted', { title: subtask.title }), subtask.id, requestId),
                      })
                    }
                    className="flex size-10 items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-danger-text"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </div>
            </LiveRow>
          </ListItem>
        ))}
      </ListPresence>
      {editable && (
        <div className="flex gap-2">
          <Input
            aria-label={t('newSubtask')}
            placeholder={t('newSubtask')}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // Inside the task form: Enter adds a subtask instead of saving the task.
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            icon={<Plus aria-hidden />}
            loading={create.isPending}
            onClick={add}
          >
            {t('addSubtask')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
    </section>
  );
}
