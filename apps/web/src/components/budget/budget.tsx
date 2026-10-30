'use client';

import {
  canSomewhere,
  type BudgetCategoryTotals,
  type CreateExpense,
  type Expense,
} from '@pme/contracts';
import { ChevronDown, Pencil, Plus, ReceiptIndianRupee, Trash2 } from 'lucide-react';
import { m } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { useConfetti } from '@/components/motion/confetti';
import { CountUp } from '@/components/motion/count-up';
import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { EditPanel } from '@/components/motion/side-panel';
import { Skeleton } from '@/components/motion/skeleton';
import { useSnackbar } from '@/components/motion/undo-snackbar';
import { ACCENT_HEX } from '@/components/shell/accents';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { useOfferUndo } from '@/components/shell/use-offer-undo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { useBudgetCategories, useDeleteCategory, useExpenses, useSaveCategory } from '@/lib/budget';
import { subEventName, useSubEvents, useUpdateEvent } from '@/lib/events';
import { formatInr, INR_FORMAT, todayIso } from '@/lib/format';
import { highlight } from '@/lib/live-highlights';
import { duration, ease, maxStaggeredRows, stagger } from '@/lib/motion';

import { BudgetBar, Expand, ExpenseRow, MoneyInput, OverChip } from './budget-bits';
import { ExpenseForm } from './expense-form';

/** "Due soon": unpaid lines due within two weeks, or already late. */
const DUE_SOON_DAYS = 14;

/** What the panel shows; `id` is 'new' for a new one. */
type Panel =
  | { kind: 'expense'; id: string; defaults?: Partial<CreateExpense> }
  | { kind: 'category'; id: string };

const rupees = (paise: number) => paise / 100;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Budget (Stitch "Budget"): overall totals, payments due soon, and spending by category or
 * by sub-event. Totals are the API's sums over the expenses I can see. Expenses and
 * categories open a side panel on desktop and a sheet on phone (MOTION.md 6.14).
 */
export function Budget() {
  const t = useTranslations('budget');
  const { eventId, event, membership, can } = useCurrentEvent();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: categories, isError, refetch } = useBudgetCategories(eventId);
  const { data: expenses } = useExpenses(eventId);
  const [today] = useState(todayIso);
  const [chosen, setChosen] = useState<Panel | null>(null);
  // Quick add's "Expense" lands here with ?add=1.
  const panel: Panel | null =
    searchParams.get('add') === '1' ? { kind: 'expense', id: 'new' } : chosen;
  const setPanel = (next: Panel | null) => {
    setChosen(next);
    if (searchParams.has('add')) router.replace(pathname, { scroll: false });
  };
  const canAddExpense = canSomewhere(membership.permissions, 'budget.edit');

  const totals = (categories ?? []).reduce(
    (sum, item) => ({
      planned: sum.planned + item.plannedPaise,
      committed: sum.committed + item.committedPaise,
      paid: sum.paid + item.paidPaise,
      count: sum.count + item.expenseCount,
    }),
    { planned: 0, committed: 0, paid: 0, count: 0 },
  );
  const outstanding = totals.committed - totals.paid;
  useSettledCelebration(categories ? outstanding : null, totals.count);

  const dueSoon = (expenses ?? [])
    .filter(
      (item) =>
        item.paymentStatus !== 'paid' &&
        item.dueOn !== null &&
        item.dueOn <= addDays(today, DUE_SOON_DAYS),
    )
    .sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : 1));

  const openExpense = (id: string) => setPanel({ kind: 'expense', id });

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
          <p className="text-body text-fg-secondary">
            {t('summary', { count: totals.count, categories: categories?.length ?? 0 })}
          </p>
        </div>
        {canAddExpense && (categories?.length ?? 0) > 0 && (
          <Button
            icon={<ReceiptIndianRupee aria-hidden />}
            onClick={() => setPanel({ kind: 'expense', id: 'new' })}
          >
            {t('addExpense')}
          </Button>
        )}
      </div>

      {isError && (
        <Card className="items-center gap-3 py-8 text-center">
          <p className="text-body">{t('loadFailed')}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Card>
      )}
      {!categories && !isError && <Skeleton className="h-40" />}

      {categories && (
        <>
          <div
            className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
            data-testid="budget-summary"
          >
            <OverallBudget plannedPaise={totals.planned} committedPaise={totals.committed} />
            <Stat label={t('committed')} paise={totals.committed} testId="total-committed">
              {event.budgetPaise ? (
                <span>
                  {t('ofBudget', {
                    percent: Math.round((totals.committed / event.budgetPaise) * 100),
                  })}
                </span>
              ) : null}
            </Stat>
            <Stat label={t('paid')} paise={totals.paid} testId="total-paid" />
            <Stat label={t('outstanding')} paise={outstanding} testId="total-outstanding">
              {dueSoon.length > 0 && <span>{t('dueSoonCount', { count: dueSoon.length })}</span>}
            </Stat>
          </div>

          {dueSoon.length > 0 && (
            <Card className="gap-2">
              <h2 className="text-h3">{t('dueSoon')}</h2>
              <ListPresence className="flex flex-col" data-testid="due-soon">
                {dueSoon.map((expense) => (
                  <ListItem key={expense.id}>
                    <ExpenseRow expense={expense} onOpen={openExpense} showDue />
                  </ListItem>
                ))}
              </ListPresence>
            </Card>
          )}

          <Tabs defaultValue="category" className="gap-4">
            <TabsList aria-label={t('groupBy')}>
              <TabsTrigger value="category">{t('byCategory')}</TabsTrigger>
              <TabsTrigger value="session">{t('bySession')}</TabsTrigger>
            </TabsList>
            <TabsContent value="category" className="flex flex-col gap-3">
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  expenses={(expenses ?? []).filter((item) => item.categoryId === category.id)}
                  onOpen={openExpense}
                  onAdd={() =>
                    setPanel({ kind: 'expense', id: 'new', defaults: { categoryId: category.id } })
                  }
                  onEdit={() => setPanel({ kind: 'category', id: category.id })}
                />
              ))}
              {can('budget.edit') && (
                <Button
                  variant="secondary"
                  icon={<Plus aria-hidden />}
                  onClick={() => setPanel({ kind: 'category', id: 'new' })}
                  className="self-start"
                >
                  {t('addCategory')}
                </Button>
              )}
            </TabsContent>
            <TabsContent value="session">
              <BySession expenses={expenses ?? []} onOpen={openExpense} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <EditPanel
        open={panel !== null}
        onOpenChange={(open) => !open && setPanel(null)}
        title={
          panel?.kind === 'category'
            ? t(panel.id === 'new' ? 'newCategory' : 'editCategory')
            : t(panel?.id === 'new' ? 'newExpense' : 'editExpense')
        }
      >
        {panel?.kind === 'expense' && categories && (
          <ExpensePanelBody
            expenseId={panel.id}
            expenses={expenses}
            categories={categories}
            defaults={panel.defaults}
            onDone={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'category' && categories && (
          <CategoryForm
            category={
              panel.id === 'new' ? null : (categories.find((item) => item.id === panel.id) ?? null)
            }
            onDone={() => setPanel(null)}
          />
        )}
      </EditPanel>
    </div>
  );
}

/**
 * "Every payment is settled": one Confetti burst and a toast when outstanding reaches ₹0
 * with at least one expense, once per event (MOTION.md 6.14). Only a change counts, not
 * opening a budget that was already settled.
 */
function useSettledCelebration(outstanding: number | null, expenseCount: number) {
  const t = useTranslations('budget');
  const { eventId, event } = useCurrentEvent();
  const confetti = useConfetti();
  const show = useSnackbar();
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (outstanding === null) return;
    const before = previous.current;
    previous.current = outstanding;
    if (before !== null && before > 0 && outstanding === 0 && expenseCount > 0) {
      void confetti({ accent: ACCENT_HEX[event.type], onceKey: `settled:${eventId}` });
      show({ message: t('allSettled') });
    }
  }, [outstanding, expenseCount, confetti, show, t, eventId, event.type]);
}

function Stat({
  label,
  paise,
  testId,
  children,
}: {
  label: string;
  paise: number;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-1" data-testid={testId}>
      <span className="text-small text-fg-secondary">{label}</span>
      <CountUp
        value={rupees(paise)}
        format={INR_FORMAT}
        className="text-h3 tabular-nums sm:text-h2"
      />
      {children && <span className="text-small text-fg-secondary">{children}</span>}
    </Card>
  );
}

/** The overall budget (event.budgetPaise), set and changed here by those with event.settings. */
function OverallBudget({
  plannedPaise,
  committedPaise,
}: {
  plannedPaise: number;
  committedPaise: number;
}) {
  const t = useTranslations('budget');
  const { eventId, event, can } = useCurrentEvent();
  const update = useUpdateEvent(eventId);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<number | null>(event.budgetPaise);
  const [failed, setFailed] = useState(false);
  const editable = can('event.settings');

  function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setFailed(false);
    update.mutate(
      { version: event.version, changes: { budgetPaise: amount } },
      { onSuccess: () => setEditing(false), onError: () => setFailed(true) },
    );
  }

  if ((editing || event.budgetPaise === null) && editable) {
    return (
      <Card className="col-span-2 lg:col-span-1 gap-2">
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <label htmlFor="overall-budget" className="text-small text-fg-secondary">
            {event.budgetPaise === null ? t('setBudget') : t('overall')}
          </label>
          <MoneyInput id="overall-budget" value={amount} onChange={setAmount} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={update.isPending}>
              {t('saveBudget')}
            </Button>
            {editing && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('cancel')}
              </Button>
            )}
          </div>
          {failed && (
            <p role="alert" className="text-small text-danger-text">
              {t('saveFailed')}
            </p>
          )}
        </form>
      </Card>
    );
  }

  return (
    <Card className="col-span-2 lg:col-span-1 gap-1">
      <span className="flex items-center justify-between text-small text-fg-secondary">
        {t('overall')}
        {editable && (
          <button
            type="button"
            aria-label={t('editBudget')}
            onClick={() => {
              setAmount(event.budgetPaise);
              setEditing(true);
            }}
            className="-m-2 flex size-10 items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted"
          >
            <Pencil aria-hidden className="size-4" />
          </button>
        )}
      </span>
      {event.budgetPaise === null ? (
        <span className="text-h2 text-fg-muted">{t('notSet')}</span>
      ) : (
        <CountUp
          value={rupees(event.budgetPaise)}
          format={INR_FORMAT}
          className="text-h2 tabular-nums"
        />
      )}
      <span className="text-small text-fg-secondary">
        {t('plannedAcross', { amount: formatInr(plannedPaise) })}
        {event.budgetPaise !== null && committedPaise > event.budgetPaise && (
          <span className="text-danger-text"> · {t('overBudget')}</span>
        )}
      </span>
    </Card>
  );
}

/**
 * One category: name, committed of planned, the bar, and an over-plan chip. Expanding it
 * shows its expenses, staggered (MOTION.md 6.14).
 */
function CategoryRow({
  category,
  expenses,
  onOpen,
  onAdd,
  onEdit,
}: {
  category: BudgetCategoryTotals;
  expenses: Expense[];
  onOpen: (expenseId: string) => void;
  onAdd: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations('budget');
  const { can } = useCurrentEvent();
  const reduced = useShouldReduceMotion();
  const [open, setOpen] = useState(false);
  const over = category.plannedPaise > 0 ? category.committedPaise - category.plannedPaise : 0;
  const amounts = category.plannedPaise
    ? t('committedOf', {
        committed: formatInr(category.committedPaise),
        planned: formatInr(category.plannedPaise),
      })
    : t('committedNoPlan', { committed: formatInr(category.committedPaise) });
  return (
    <LiveRow entityId={category.id} className="rounded-card">
      <section
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
        data-testid="budget-category"
        aria-label={category.name}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex min-w-0 flex-1 flex-col gap-1 text-left"
          >
            <span className="flex items-center gap-2 text-h3">
              <m.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: duration.moderate, ease: ease.out }}
                className="flex"
              >
                <ChevronDown aria-hidden className="size-5 text-fg-muted" />
              </m.span>
              {category.name}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-small text-fg-secondary tabular-nums">
              {amounts}
              {category.expenseCount > 0 && (
                <span className="text-fg-muted">
                  · {t('expenseCount', { count: category.expenseCount })}
                </span>
              )}
            </span>
          </button>
          {over > 0 && <OverChip byPaise={over} />}
          {can('budget.edit') && (
            <button
              type="button"
              aria-label={t('editNamed', { name: category.name })}
              onClick={onEdit}
              className="flex size-10 items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted"
            >
              <Pencil aria-hidden className="size-4" />
            </button>
          )}
        </div>
        <BudgetBar
          plannedPaise={category.plannedPaise}
          committedPaise={category.committedPaise}
          paidPaise={category.paidPaise}
          label={t('barLabel', {
            name: category.name,
            paid: formatInr(category.paidPaise),
            committed: formatInr(category.committedPaise),
            planned: formatInr(category.plannedPaise),
          })}
        />
        <Expand show={open}>
          <ul className="-mx-3 flex flex-col">
            {expenses.map((expense, index) => (
              <m.li
                key={expense.id}
                initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: duration.base,
                  ease: ease.out,
                  delay: reduced ? 0 : Math.min(index, maxStaggeredRows) * stagger.list,
                }}
              >
                <ExpenseRow expense={expense} onOpen={onOpen} />
              </m.li>
            ))}
            {expenses.length === 0 && (
              <li className="px-3 py-2 text-small text-fg-muted">{t('noExpenses')}</li>
            )}
          </ul>
          {can('budget.edit') && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus aria-hidden />}
              onClick={onAdd}
              className="self-start"
            >
              {t('addHere')}
            </Button>
          )}
        </Expand>
      </section>
    </LiveRow>
  );
}

/** By sub-event: each with its committed and paid, the whole event first. */
function BySession({
  expenses,
  onOpen,
}: {
  expenses: Expense[];
  onOpen: (expenseId: string) => void;
}) {
  const t = useTranslations('budget');
  const { eventId } = useCurrentEvent();
  const { data: subEvents } = useSubEvents(eventId);
  const groups = new Map<string | null, Expense[]>();
  for (const expense of expenses) {
    groups.set(expense.subEventId, [...(groups.get(expense.subEventId) ?? []), expense]);
  }
  // The schedule's order, then deleted sub-events.
  const order = [null, ...(subEvents ?? []).map((item) => item.id)];
  const keys = [...groups.keys()].sort((a, b) => {
    const rank = (key: string | null) => (order.includes(key) ? order.indexOf(key) : order.length);
    return rank(a) - rank(b);
  });
  if (!expenses.length) {
    return <p className="text-body text-fg-secondary">{t('noExpensesYet')}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {keys.map((key) => {
        const items = groups.get(key)!;
        const { name, deleted } = subEventName(subEvents, key);
        const committed = items.reduce((sum, item) => sum + item.amountPaise, 0);
        const paid = items.reduce((sum, item) => sum + item.paidPaise, 0);
        return (
          <Card key={key ?? 'event'} className="gap-2" data-testid="budget-session">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-h3">
                {key === null ? t('wholeEvent') : deleted ? t('deletedSubEvent') : name}
              </h3>
              <span className="text-small text-fg-secondary tabular-nums">
                {t('committedPaid', { committed: formatInr(committed), paid: formatInr(paid) })}
              </span>
            </div>
            <ul className="-mx-3 flex flex-col">
              {items.map((expense) => (
                <li key={expense.id}>
                  <ExpenseRow expense={expense} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/** The expense panel: the live copy, a fresh form after a conflict, or "deleted". */
function ExpensePanelBody({
  expenseId,
  expenses,
  categories,
  defaults,
  onDone,
}: {
  /** An expense id, or 'new'. */
  expenseId: string;
  expenses: Expense[] | undefined;
  categories: BudgetCategoryTotals[];
  defaults?: Partial<CreateExpense>;
  onDone: () => void;
}) {
  const t = useTranslations('budget.form');
  const [conflict, setConflict] = useState<Expense | null>(null);
  if (expenseId === 'new') {
    return (
      <ExpenseForm expense={null} categories={categories} defaults={defaults} onDone={onDone} />
    );
  }
  const expense = conflict ?? expenses?.find((item) => item.id === expenseId);
  if (!expense) {
    return expenses ? (
      <p role="status" className="text-body text-fg-secondary">
        {t('gone')}
      </p>
    ) : null;
  }
  return (
    <ExpenseForm
      key={expense.version}
      expense={expense}
      categories={categories}
      conflicted={conflict !== null}
      onConflict={setConflict}
      onDone={onDone}
    />
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category: BudgetCategoryTotals | null;
  onDone: () => void;
}) {
  const t = useTranslations('budget.categoryForm');
  const tBudget = useTranslations('budget');
  const { eventId } = useCurrentEvent();
  const save = useSaveCategory(eventId);
  const remove = useDeleteCategory(eventId);
  const offerUndo = useOfferUndo();
  const [name, setName] = useState(category?.name ?? '');
  const [planned, setPlanned] = useState<number | null>(category?.plannedPaise ?? null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const failure = (problem: unknown, fallback: string) => {
    const code = problem instanceof ApiError ? problem.problem?.code : undefined;
    const fields = problem instanceof ApiError ? problem.problem?.fields : undefined;
    if (fields?.some((field) => field.path === 'name')) return setError(t('nameTaken'));
    if (code === 'conflict') return setError(t('inUse'));
    if (code === 'version_conflict') return setError(t('conflict'));
    setError(fallback);
  };

  function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t('nameRequired'));
    const fields = { name: name.trim(), plannedPaise: planned ?? 0 };
    save.mutate(category ? { category, changes: fields } : { create: fields }, {
      onSuccess: (saved) => {
        highlight(saved.id, {
          source: 'own',
          op: category ? 'updated' : 'created',
          actorUserId: null,
        });
        onDone();
      },
      onError: (problem) => failure(problem, t('saveFailed')),
    });
  }

  function onDelete() {
    if (!category) return;
    if (!confirmDelete) return setConfirmDelete(true);
    remove.mutate(category, {
      onSuccess: (requestId) => {
        onDone();
        offerUndo(tBudget('deleted', { name: category.name }), category.id, requestId);
      },
      onError: (problem) => {
        setConfirmDelete(false);
        failure(problem, t('deleteFailed'));
      },
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid="category-form">
      <Field id="category-name" label={t('name')}>
        <Input
          id="category-name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id="category-planned" label={t('planned')} hint={t('plannedHint')}>
        <MoneyInput id="category-planned" value={planned} onChange={setPlanned} />
      </Field>
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" loading={save.isPending}>
          {category ? t('save') : t('create')}
        </Button>
        {category && (
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
    </form>
  );
}
