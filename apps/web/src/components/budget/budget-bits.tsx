'use client';

import type { Expense, PaymentStatus } from '@pme/contracts';
import { Check } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps, type ReactNode } from 'react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { ProgressFill } from '@/components/motion/progress-fill';
import { LiveRow } from '@/components/shell/live-row';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatInr, formatShortDate } from '@/lib/format';
import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** "1250000" typed → "12,50,000" shown; whole rupees only. */
const rupeesText = (paise: number | null) =>
  paise === null ? '' : grouping.format(Math.round(paise / 100));

/**
 * Rupee amount (DESIGN.md "Special inputs"): a fixed ₹ prefix, Indian digit grouping as you
 * type (MOTION.md 6.14: no animation), and the value in paise. Empty is null.
 */
export function MoneyInput({
  value,
  onChange,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: number | null;
  onChange: (paise: number | null) => void;
}) {
  return (
    <div className="flex">
      <span
        aria-hidden
        className="flex h-12 items-center rounded-l-control border border-r-0 border-border-strong bg-surface-band px-3 text-label text-fg-secondary"
      >
        ₹
      </span>
      <Input
        inputMode="numeric"
        autoComplete="off"
        value={rupeesText(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
          onChange(digits ? Number(digits) * 100 : null);
        }}
        className={cn('rounded-l-none tabular-nums', className)}
        {...props}
      />
    </div>
  );
}

const STATUS_TONE: Record<PaymentStatus, 'neutral' | 'info' | 'warning' | 'success'> = {
  planned: 'neutral',
  advance_paid: 'info',
  partially_paid: 'warning',
  paid: 'success',
};

/**
 * Payment status chip. Turning "Paid" crossfades to green with a tick (MOTION.md 6.14
 * "Record a payment"); first render shows it as it is.
 */
export function PaymentChip({ status }: { status: PaymentStatus }) {
  const t = useTranslations('budget.status');
  const reduced = useShouldReduceMotion();
  // Only a change crossfades; the status it opened with just shows.
  const [first] = useState(status);
  return (
    <m.span
      key={status}
      className="inline-flex"
      initial={status === first ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? duration.fast : duration.base }}
    >
      <Badge tone={STATUS_TONE[status]} dot={status !== 'paid'} data-testid="payment-status">
        {status === 'paid' && <Check aria-hidden className="size-3.5" />}
        {t(status)}
      </Badge>
    </m.span>
  );
}

/**
 * Category bar (MOTION.md 6.14): the paid segment fills first, then the committed-but-unpaid
 * segment 100 ms later. Spending beyond the plan shows in danger red past the plan's mark.
 * Only transforms and opacity animate; reduced motion shows the final bar.
 */
export function BudgetBar({
  plannedPaise,
  committedPaise,
  paidPaise,
  label,
}: {
  plannedPaise: number;
  committedPaise: number;
  paidPaise: number;
  label: string;
}) {
  const reduced = useShouldReduceMotion();
  const base = Math.max(plannedPaise, committedPaise, 1);
  const over = plannedPaise > 0 && committedPaise > plannedPaise;
  const fill = (fraction: number, delay = 0) => ({
    initial: { scaleX: 0 },
    animate: { scaleX: Math.min(1, fraction) },
    transition: reduced
      ? { duration: 0 }
      : { duration: duration.deliberate, ease: ease.out, delay },
  });
  const plannedEnd = plannedPaise / base;
  return (
    <div
      role="img"
      aria-label={label}
      className="relative h-2 overflow-hidden rounded-full bg-surface-muted"
    >
      <m.div
        className="absolute inset-0 origin-left rounded-full bg-accent/35"
        {...fill(committedPaise / base, reduced ? 0 : 0.1)}
      />
      <m.div
        className="absolute inset-0 origin-left rounded-full bg-accent"
        {...fill(paidPaise / base)}
      />
      {over && (
        <m.div
          className="absolute inset-y-0 right-0 bg-danger"
          style={{ left: `${plannedEnd * 100}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: duration.fast,
            delay: reduced ? 0 : duration.deliberate,
          }}
        />
      )}
    </div>
  );
}

/** "Over by ₹12,000": pops in (`overshoot`), no shake. */
export function OverChip({ byPaise }: { byPaise: number }) {
  const t = useTranslations('budget');
  return (
    <m.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: duration.fast, ease: ease.overshoot }}
      className="inline-flex"
    >
      <Badge tone="danger" dot>
        {t('overBy', { amount: formatInr(byPaise) })}
      </Badge>
    </m.span>
  );
}

/** DESIGN.md expense row: title, vendor, amount, paid-of-total bar, status chip. */
export function ExpenseRow({
  expense,
  onOpen,
  showDue = false,
  category,
}: {
  expense: Expense;
  onOpen: (expenseId: string) => void;
  showDue?: boolean;
  /** The category's name, where the list mixes categories. */
  category?: string;
}) {
  const t = useTranslations('budget');
  const percent = (expense.paidPaise / expense.amountPaise) * 100;
  return (
    <LiveRow entityId={expense.id} className="rounded-control">
      <button
        type="button"
        data-testid="expense-row"
        onClick={() => onOpen(expense.id)}
        className="flex w-full flex-col gap-2 rounded-control px-3 py-3 text-left hover:bg-surface-muted"
      >
        <span className="flex items-start gap-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body">{expense.title}</span>
            {(category || expense.vendorName || (showDue && expense.dueOn)) && (
              <span className="text-small text-fg-secondary">
                {[
                  category,
                  expense.vendorName,
                  showDue && expense.dueOn && t('dueOn', { date: formatShortDate(expense.dueOn) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </span>
          <span className="flex flex-col items-end gap-1">
            <span className="text-label tabular-nums">{formatInr(expense.amountPaise)}</span>
            <PaymentChip status={expense.paymentStatus} />
          </span>
        </span>
        {expense.paymentStatus !== 'planned' && expense.paymentStatus !== 'paid' && (
          <span className="flex items-center gap-3">
            <ProgressFill
              value={percent}
              label={t('paidOf', {
                paid: formatInr(expense.paidPaise),
                total: formatInr(expense.amountPaise),
              })}
              className="flex-1"
            />
            <span className="text-caption text-fg-secondary tabular-nums">
              {t('paidShort', { paid: formatInr(expense.paidPaise) })}
            </span>
          </span>
        )}
      </button>
    </LiveRow>
  );
}

/**
 * Height expand (`moderate`, MOTION.md 6.14): fields a status reveals, a category's expenses.
 * Reduced motion: a `fast` fade.
 */
export function Expand({ show, children }: { show: boolean; children: ReactNode }) {
  const reduced = useShouldReduceMotion();
  const transition = reduced
    ? { duration: duration.fast }
    : { duration: duration.moderate, ease: ease.out };
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          initial={{ height: reduced ? 'auto' : 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: reduced ? 'auto' : 0, opacity: 0 }}
          transition={transition}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-4 pt-1 pb-1">{children}</div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
