'use client';

import {
  VALUE_SETS,
  type BudgetCategoryTotals,
  type CreateExpense,
  type Expense,
  type PaymentStatus,
  type UpdateExpense,
} from '@pme/contracts';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { m, useAnimationControls } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { useCurrentEvent } from '@/components/shell/current-event';
import { useOfferUndo } from '@/components/shell/use-offer-undo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select, Textarea } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useDeleteExpense, useSaveExpense } from '@/lib/budget';
import { subEventName, useSubEvents } from '@/lib/events';
import { todayIso } from '@/lib/format';
import { highlight } from '@/lib/live-highlights';
import { duration, ease } from '@/lib/motion';
import { membersQuery } from '@/lib/team';
import { cn } from '@/lib/utils';

import { Expand, MoneyInput } from './budget-bits';

interface FormState {
  title: string;
  amountPaise: number | null;
  categoryId: string;
  /** '' = the whole event. */
  subEventId: string;
  vendorName: string;
  paymentStatus: PaymentStatus;
  paidPaise: number | null;
  dueOn: string;
  paidOn: string;
  paidByMemberId: string;
  transactionRef: string;
  notes: string;
}

const partial = (status: PaymentStatus) => status === 'advance_paid' || status === 'partially_paid';

const fromExpense = (expense: Expense): FormState => ({
  title: expense.title,
  amountPaise: expense.amountPaise,
  categoryId: expense.categoryId,
  subEventId: expense.subEventId ?? '',
  vendorName: expense.vendorName ?? '',
  paymentStatus: expense.paymentStatus,
  paidPaise: expense.paidPaise,
  dueOn: expense.dueOn ?? '',
  paidOn: expense.paidOn ?? '',
  paidByMemberId: expense.paidByMemberId ?? '',
  transactionRef: expense.transactionRef ?? '',
  notes: expense.notes ?? '',
});

/**
 * The body, from the form. Status and paid-so-far go together: paid-so-far only for the
 * partly-paid kinds (the server fills it for planned and paid, and re-checks the rule).
 * Fields a status hides are cleared: no due date once paid, no payment details while planned.
 */
function body(form: FormState) {
  const planned = form.paymentStatus === 'planned';
  return {
    title: form.title.trim(),
    amountPaise: form.amountPaise ?? 0,
    categoryId: form.categoryId,
    subEventId: form.subEventId || null,
    vendorName: form.vendorName.trim() || null,
    paymentStatus: form.paymentStatus,
    ...(partial(form.paymentStatus) && { paidPaise: form.paidPaise ?? 0 }),
    dueOn: form.paymentStatus === 'paid' ? null : form.dueOn || null,
    paidOn: planned ? null : form.paidOn || null,
    paidByMemberId: planned ? null : form.paidByMemberId || null,
    transactionRef: planned ? null : form.transactionRef.trim() || null,
    notes: form.notes.trim() || null,
  };
}

/** What changed, sending status and paid-so-far together whenever the amounts moved. */
function changesFrom(expense: Expense, form: FormState): UpdateExpense {
  const next = body(form);
  const before = body(fromExpense(expense));
  const changes = Object.fromEntries(
    Object.entries(next).filter(([key, value]) => before[key as keyof typeof before] !== value),
  ) as UpdateExpense;
  const amounts = ['amountPaise', 'paymentStatus', 'paidPaise'] as const;
  if (amounts.some((key) => key in changes)) {
    changes.paymentStatus = next.paymentStatus;
    if ('paidPaise' in next) changes.paidPaise = next.paidPaise;
  }
  return changes;
}

/** MOTION.md 6.1 field error: shakes 4 px left-right twice (200 ms). */
function useShake(errorKey: number) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (errorKey > 0) {
      void controls.start({
        x: [0, -4, 4, -4, 4, 0],
        transition: { duration: duration.base, ease: ease.inOut },
      });
    }
  }, [errorKey, controls]);
  return controls;
}

type FieldErrors = Partial<
  Record<'title' | 'amountPaise' | 'paidPaise' | 'transactionRef', string>
>;

export function ExpenseForm({
  expense,
  categories,
  defaults,
  conflicted = false,
  onConflict,
  onDone,
}: {
  expense: Expense | null;
  categories: readonly BudgetCategoryTotals[];
  defaults?: Partial<CreateExpense>;
  conflicted?: boolean;
  onConflict?: (current: Expense) => void;
  onDone: () => void;
}) {
  const t = useTranslations('budget.form');
  const tBudget = useTranslations('budget');
  const { eventId, can } = useCurrentEvent();
  const { data: subEvents } = useSubEvents(eventId);
  const { data: members = [] } = useQuery({
    ...membersQuery(eventId),
    enabled: can('members.view'),
  });
  const save = useSaveExpense(eventId);
  const remove = useDeleteExpense(eventId);
  const offerUndo = useOfferUndo();
  // One key per new expense, so a retried save can't record it twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState<FormState>(() =>
    expense
      ? fromExpense(expense)
      : {
          title: '',
          amountPaise: null,
          categoryId: defaults?.categoryId ?? categories[0]?.id ?? '',
          subEventId: defaults?.subEventId ?? '',
          vendorName: '',
          paymentStatus: 'planned',
          paidPaise: null,
          dueOn: '',
          paidOn: '',
          paidByMemberId: '',
          transactionRef: '',
          notes: '',
        },
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [refShake, setRefShake] = useState(0);
  const shake = useShake(refShake);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (changes: Partial<FormState>) => setForm((current) => ({ ...current, ...changes }));

  const current = subEventName(subEvents, expense?.subEventId ?? null);
  const places = (subEvents ?? []).filter(
    (item) => can('budget.edit', item.id) || item.id === expense?.subEventId,
  );
  // Someone who can't add whole-event expenses starts in the first sub-event they can.
  const wholeEventAllowed = can('budget.edit') || (expense !== null && !expense.subEventId);
  const place = !wholeEventAllowed && !form.subEventId ? (places[0]?.id ?? '') : form.subEventId;
  const chosen = { ...form, subEventId: place };
  const editable = can('budget.edit', expense ? expense.subEventId : place || null);
  const status = form.paymentStatus;

  function setStatus(next: PaymentStatus) {
    // Paying fills in today; the rest the person types.
    set({
      paymentStatus: next,
      ...(next !== 'planned' && !form.paidOn && { paidOn: todayIso() }),
    });
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!form.title.trim()) found.title = t('titleRequired');
    if (!form.amountPaise) found.amountPaise = t('amountRequired');
    if (partial(status) && form.amountPaise) {
      const paid = form.paidPaise ?? 0;
      if (paid <= 0 || paid >= form.amountPaise) found.paidPaise = t('paidBetween');
    }
    return found;
  }

  function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    save.mutate(
      expense
        ? { expense, changes: changesFrom(expense, chosen) }
        : { create: body(chosen), idempotencyKey },
      {
        onSuccess: (saved) => {
          highlight(saved.id, {
            source: 'own',
            op: expense ? 'updated' : 'created',
            actorUserId: null,
          });
          onDone();
        },
        onError: (failure) => {
          if (!(failure instanceof ApiError)) return setError(t('saveFailed'));
          const code = failure.problem?.code;
          if (code === 'duplicate_transaction_ref') {
            setErrors({ transactionRef: t('duplicateRef') });
            setRefShake((count) => count + 1);
          } else if (code === 'version_conflict') {
            const now = (failure.problem as { current?: Expense }).current;
            if (now) onConflict?.(now);
          } else if (failure.problem?.fields?.some((field) => field.path === 'paidPaise')) {
            setErrors({ paidPaise: t('paidBetween') });
          } else {
            setError(t('saveFailed'));
          }
        },
      },
    );
  }

  function onDelete() {
    if (!expense) return;
    if (!confirmDelete) return setConfirmDelete(true);
    remove.mutate(expense, {
      onSuccess: (requestId) => {
        onDone();
        offerUndo(tBudget('deleted', { name: expense.title }), expense.id, requestId);
      },
      onError: (failure) => {
        const now =
          failure instanceof ApiError && failure.problem?.code === 'version_conflict'
            ? (failure.problem as { current?: Expense }).current
            : undefined;
        if (now) onConflict?.(now);
        else setError(t('deleteFailed'));
      },
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid="expense-form" noValidate>
      {conflicted && (
        <p
          role="alert"
          className="rounded-control bg-warning-tint px-4 py-3 text-small text-warning-text"
        >
          {t('conflict')}
        </p>
      )}
      <fieldset disabled={!editable} className="flex flex-col gap-4">
        <Field id="expense-title" label={t('title')} error={errors.title}>
          <Input
            id="expense-title"
            value={form.title}
            maxLength={200}
            aria-invalid={!!errors.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field id="expense-amount" label={t('amount')} error={errors.amountPaise}>
            <MoneyInput
              id="expense-amount"
              value={form.amountPaise}
              aria-invalid={!!errors.amountPaise}
              onChange={(amountPaise) => set({ amountPaise })}
            />
          </Field>
          <Field id="expense-category" label={t('category')}>
            <Select
              id="expense-category"
              value={form.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="expense-vendor" label={t('vendor')} aside={t('optional')}>
            <Input
              id="expense-vendor"
              value={form.vendorName}
              maxLength={120}
              onChange={(e) => set({ vendorName: e.target.value })}
            />
          </Field>
          <Field
            id="expense-sub-event"
            label={t('subEvent')}
            hint={current.deleted ? t('deletedHint') : undefined}
          >
            <Select
              id="expense-sub-event"
              value={place}
              onChange={(e) => set({ subEventId: e.target.value })}
            >
              {wholeEventAllowed && <option value="">{t('wholeEvent')}</option>}
              {current.deleted && expense?.subEventId && (
                <option value={expense.subEventId}>{tBudget('deletedSubEvent')}</option>
              )}
              {places.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">{t('status')}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
            {VALUE_SETS.paymentStatus.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={status === value}
                onClick={() => setStatus(value)}
                className={cn(
                  'h-11 rounded-control border px-2 text-small transition-colors duration-(--dur-fast)',
                  status === value
                    ? 'border-primary bg-primary-tint text-primary-text'
                    : 'border-border bg-surface text-fg-secondary hover:bg-surface-muted',
                )}
              >
                {tBudget(`status.${value}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <Expand show={partial(status)}>
          <Field id="expense-paid" label={t('paidSoFar')} error={errors.paidPaise}>
            <MoneyInput
              id="expense-paid"
              value={form.paidPaise}
              aria-invalid={!!errors.paidPaise}
              onChange={(paidPaise) => set({ paidPaise })}
            />
          </Field>
        </Expand>
        <Expand show={status !== 'planned'}>
          <div className="grid grid-cols-2 gap-4">
            <Field id="expense-paid-on" label={t('paidOn')}>
              <Input
                id="expense-paid-on"
                type="date"
                value={form.paidOn}
                onChange={(e) => set({ paidOn: e.target.value })}
              />
            </Field>
            {can('members.view') && (
              <Field id="expense-paid-by" label={t('paidBy')} aside={t('optional')}>
                <Select
                  id="expense-paid-by"
                  value={form.paidByMemberId}
                  onChange={(e) => set({ paidByMemberId: e.target.value })}
                >
                  <option value="">{t('nobody')}</option>
                  {members
                    .filter((member) => member.status === 'active')
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
          </div>
          <m.div animate={shake}>
            <Field
              id="expense-ref"
              label={t('reference')}
              aside={t('optional')}
              hint={t('referenceHint')}
              error={errors.transactionRef}
            >
              <Input
                id="expense-ref"
                value={form.transactionRef}
                maxLength={64}
                aria-invalid={!!errors.transactionRef}
                onChange={(e) => set({ transactionRef: e.target.value })}
              />
            </Field>
          </m.div>
        </Expand>
        <Expand show={status !== 'paid'}>
          <Field id="expense-due" label={t('dueOn')} aside={t('optional')}>
            <Input
              id="expense-due"
              type="date"
              value={form.dueOn}
              onChange={(e) => set({ dueOn: e.target.value })}
            />
          </Field>
        </Expand>
        <Field id="expense-notes" label={t('notes')} aside={t('optional')}>
          <Textarea
            id="expense-notes"
            value={form.notes}
            maxLength={2000}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      </fieldset>

      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" loading={save.isPending}>
            {expense ? t('save') : t('create')}
          </Button>
          {expense && (
            <Button
              type="button"
              variant={confirmDelete ? 'destructive' : 'ghost'}
              icon={<Trash2 aria-hidden />}
              loading={remove.isPending}
              onClick={onDelete}
              className="ml-auto"
            >
              {confirmDelete ? t('confirmDelete') : t('delete')}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
