'use client';

import type { Dashboard as DashboardData, Task } from '@pme/contracts';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckSquare,
  Hourglass,
  IndianRupee,
  ListChecks,
  ReceiptIndianRupee,
  Sparkles,
  Users,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { BudgetBar } from '@/components/budget/budget-bits';
import { CountUp } from '@/components/motion/count-up';
import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { ProgressFill } from '@/components/motion/progress-fill';
import { Reveal, RevealGroup } from '@/components/motion/reveal';
import { Skeleton } from '@/components/motion/skeleton';
import { useCurrentEvent } from '@/components/shell/current-event';
import { LiveRow } from '@/components/shell/live-row';
import { eventHref } from '@/components/shell/nav';
import { AssigneeStack, DueChip, TaskCheckbox, useToday } from '@/components/tasks/task-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NEARLY_FULL, percent, useDashboard } from '@/lib/dashboard';
import { formatInr, INR_FORMAT } from '@/lib/format';
import { cn } from '@/lib/utils';

import { RegistrationsChart } from './registrations-chart';
import { useCompleteTask } from './use-complete-task';

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const timeFormat = (timeZone: string) =>
  new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });

/**
 * Event home (Stitch "DevFest Bhopal 2026" and "Sharma Wedding" dashboards, MOTION.md 6.5):
 * what needs attention, four stat cards, upcoming deadlines, sub-events with their fill, budget
 * by category and registrations. Each part shows only when the API sent it (it leaves out what
 * I can't see). dashboard.changed re-fetches; numbers then count from old to new.
 */
export function Dashboard() {
  const t = useTranslations('dashboard');
  const { eventId } = useCurrentEvent();
  const { data, isError, refetch } = useDashboard(eventId);

  if (isError && !data) {
    return (
      <Card className="items-center gap-3 py-8 text-center">
        <p className="text-body">{t('loadFailed')}</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          {t('retry')}
        </Button>
      </Card>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <Countdown countdown={data.countdown} />
      <Attention data={data} />
      <StatCards data={data} />
      <div className="grid items-start gap-6 lg:grid-cols-3 lg:gap-8">
        {data.tasks && <Deadlines tasks={data.tasks} data={data} className="lg:col-span-2" />}
        {data.subEvents.length > 0 && (
          <SubEvents data={data} className={cn(!data.tasks && 'lg:col-span-3')} />
        )}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-8">
        {data.budget && <BudgetByCategory budget={data.budget} />}
        {data.registrations && data.registrations.total + data.registrations.waitlisted > 0 ? (
          <Registrations registrations={data.registrations} />
        ) : (
          data.invitations && <Invitations invitations={data.invitations} />
        )}
      </div>
      <p className="text-caption text-fg-muted">
        {t('updatedAt', {
          time: new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' }).format(
            new Date(data.generatedAt),
          ),
        })}
      </p>
    </div>
  );
}

// ---- Countdown -----------------------------------------------------------------------------

/** Static (MOTION.md 6.5): it changes once a day and needs no animation. */
function Countdown({ countdown }: { countdown: DashboardData['countdown'] }) {
  const t = useTranslations('dashboard.countdown');
  const { daysToGo, nextSubEvent, timeZone } = countdown;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-2 rounded-control bg-warning-tint px-3 py-2 text-warning-text">
        <Hourglass aria-hidden className="size-5" />
        <span className="text-label font-semibold">
          {daysToGo > 0
            ? t('daysToGo', { count: daysToGo })
            : daysToGo === 0
              ? t('today')
              : t('started')}
        </span>
      </span>
      {nextSubEvent && (
        <span className="text-small text-fg-secondary">
          {t('next', {
            name: nextSubEvent.name,
            time: timeFormat(timeZone).format(new Date(nextSubEvent.startsAt)),
          })}
        </span>
      )}
    </div>
  );
}

// ---- Needs your attention ----------------------------------------------------------------

interface AttentionItem {
  key: string;
  icon: ReactNode;
  title: string;
  detail: string;
  action: string;
  href: string;
  tone: 'danger' | 'warning' | 'info';
}

/** Derived here from the numbers (the API sends none of its own); resolved items collapse out. */
function Attention({ data }: { data: DashboardData }) {
  const t = useTranslations('dashboard.attention');
  const { eventId } = useCurrentEvent();
  const items: AttentionItem[] = [];
  if (data.tasks && data.tasks.overdue > 0) {
    items.push({
      key: 'overdue',
      icon: <AlertCircle aria-hidden className="size-5" />,
      title: t('overdue', { count: data.tasks.overdue }),
      detail: t('overdueDetail'),
      action: t('view'),
      href: eventHref(eventId, 'tasks'),
      tone: 'danger',
    });
  }
  if (data.budget && data.budget.paymentsDue.count > 0) {
    items.push({
      key: 'payments',
      icon: <ReceiptIndianRupee aria-hidden className="size-5" />,
      title: t('payments', { count: data.budget.paymentsDue.count }),
      detail: t('paymentsDetail', { amount: formatInr(data.budget.paymentsDue.outstandingPaise) }),
      action: t('review'),
      href: eventHref(eventId, 'budget'),
      tone: 'warning',
    });
  }
  for (const item of data.subEvents) {
    if (item.capacity && item.taken !== null && item.taken >= item.capacity * NEARLY_FULL) {
      items.push({
        key: `full-${item.id}`,
        icon: <UsersRound aria-hidden className="size-5" />,
        title:
          item.taken >= item.capacity
            ? t('full', { name: item.name })
            : t('nearlyFull', { name: item.name }),
        detail: t('capacityDetail', { taken: item.taken, capacity: item.capacity }),
        action: t('manage'),
        href: eventHref(eventId, 'schedule'),
        tone: 'info',
      });
    }
  }
  if (!items.length) return null;

  return (
    <section aria-labelledby="attention" className="rounded-card bg-warning-tint/60 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2
          id="attention"
          className="flex items-center gap-2 text-label font-semibold text-warning-text uppercase"
        >
          <Sparkles aria-hidden className="size-4" />
          {t('title')}
        </h2>
        <Badge tone="warning">{t('count', { count: items.length })}</Badge>
      </div>
      <ListPresence className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]">
        {items.map((item) => (
          <ListItem key={item.key}>
            <Link
              href={item.href}
              className="hover-lift flex items-center gap-3 rounded-control border border-border bg-surface p-3"
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-control',
                  item.tone === 'danger' && 'bg-danger-tint text-danger-text',
                  item.tone === 'warning' && 'bg-warning-tint text-warning-text',
                  item.tone === 'info' && 'bg-info-tint text-info-text',
                )}
              >
                {item.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-label font-semibold">{item.title}</span>
                <span className="truncate text-small text-fg-secondary">{item.detail}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-small font-semibold text-primary-text">
                {item.action}
                <ArrowRight aria-hidden className="size-4" />
              </span>
            </Link>
          </ListItem>
        ))}
      </ListPresence>
    </section>
  );
}

// ---- Stat cards --------------------------------------------------------------------------

function StatCard({
  label,
  icon,
  children,
  footer,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="h-full gap-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-label text-fg-secondary">{label}</h2>
        <span className="flex size-8 items-center justify-center rounded-control bg-primary-tint text-primary-text">
          {icon}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-small text-fg-secondary">
          {footer}
        </div>
      )}
    </Card>
  );
}

const Big = ({
  value,
  of,
  format,
}: {
  value: number;
  of?: string;
  format?: Intl.NumberFormatOptions;
}) => (
  <p className="flex items-baseline gap-1">
    <CountUp value={value} format={format} className="text-h2 font-semibold tabular-nums" />
    {of && <span className="text-body text-fg-secondary tabular-nums">{of}</span>}
  </p>
);

/** First load: RevealGroup staggers the cards (MOTION.md 6.5). */
function StatCards({ data }: { data: DashboardData }) {
  const t = useTranslations('dashboard.stats');
  const { tasks, budget, headcounts, invitations, team } = data;
  const people = headcounts
    ? headcounts.reduce(
        (sum, row) => ({
          expected: sum.expected + row.expected,
          confirmed: sum.confirmed + row.confirmed + row.registered + row.checkedIn,
          declined: sum.declined + row.declined,
        }),
        { expected: 0, confirmed: 0, declined: 0 },
      )
    : null;
  const number = (value: number) => new Intl.NumberFormat('en-IN').format(value);

  const cards: ReactNode[] = [];
  if (tasks) {
    const done = percent(tasks.done, tasks.total);
    cards.push(
      <StatCard
        key="tasks"
        label={t('tasks')}
        icon={<CheckSquare aria-hidden className="size-4" />}
        footer={
          <>
            <span>{t('inProgress', { count: tasks.inProgress })}</span>
            {tasks.overdue > 0 && (
              <span className="text-danger-text">{t('overdue', { count: tasks.overdue })}</span>
            )}
          </>
        }
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <Big value={tasks.done} of={`/${number(tasks.total)}`} />
            <p className="text-small text-fg-secondary">{t('done', { percent: done })}</p>
          </div>
          <ProgressFill variant="ring" value={done} label={t('tasksDone')} size={56} />
        </div>
      </StatCard>,
    );
  }
  if (budget) {
    const base = budget.budgetPaise ?? budget.plannedPaise;
    cards.push(
      <StatCard
        key="budget"
        label={t('committed')}
        icon={<IndianRupee aria-hidden className="size-4" />}
        footer={
          <>
            <span>{t('paid', { amount: formatInr(budget.paidPaise) })}</span>
            {base > 0 && (
              <span
                className={budget.committedPaise > base ? 'text-danger-text' : 'text-success-text'}
              >
                {budget.committedPaise > base
                  ? t('over', { amount: formatInr(budget.committedPaise - base) })
                  : t('left', { amount: formatInr(base - budget.committedPaise) })}
              </span>
            )}
          </>
        }
      >
        <Big value={budget.committedPaise / 100} format={INR_FORMAT} />
        {base > 0 && (
          <>
            <p className="text-small text-fg-secondary">
              {t(budget.budgetPaise ? 'ofBudget' : 'ofPlanned', { amount: formatInr(base) })}
            </p>
            <ProgressFill value={percent(budget.committedPaise, base)} label={t('committed')} />
          </>
        )}
      </StatCard>,
    );
  }
  if (people) {
    const delivered = invitations ? invitations.sentDigitally + invitations.deliveredInPerson : 0;
    cards.push(
      <StatCard
        key="guests"
        label={t('guests')}
        icon={<Users aria-hidden className="size-4" />}
        footer={
          invitations && invitations.total > 0 ? (
            <span>{t('delivered', { delivered, total: invitations.total })}</span>
          ) : (
            <span>{t('declined', { count: people.declined })}</span>
          )
        }
      >
        <Big value={people.confirmed} of={`/${number(people.expected)}`} />
        <p className="text-small text-fg-secondary">{t('confirmed')}</p>
        <ProgressFill value={percent(people.confirmed, people.expected)} label={t('confirmed')} />
      </StatCard>,
    );
  }
  if (team) {
    cards.push(
      <StatCard key="team" label={t('team')} icon={<UsersRound aria-hidden className="size-4" />}>
        <Big value={team.members} />
        <p className="text-small text-fg-secondary">{t('members', { count: team.members })}</p>
      </StatCard>,
    );
  }
  if (!cards.length) return null;
  return (
    <RevealGroup pace="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <Reveal key={index} className="h-full">
          {card}
        </Reveal>
      ))}
    </RevealGroup>
  );
}

// ---- Upcoming deadlines ------------------------------------------------------------------

type Filter = 'all' | 'week' | 'overdue';

function Deadlines({
  tasks,
  data,
  className,
}: {
  tasks: NonNullable<DashboardData['tasks']>;
  data: DashboardData;
  className?: string;
}) {
  const t = useTranslations('dashboard.deadlines');
  const { eventId } = useCurrentEvent();
  const [filter, setFilter] = useState<Filter>('all');
  const { complete, completed, canComplete } = useCompleteTask();
  const todayIso = useToday();
  const weekEnd = addDays(todayIso, 6);
  const shown = tasks.upcoming
    .filter((task) => !completed.has(task.id))
    .filter((task) =>
      filter === 'overdue'
        ? task.dueOn! < todayIso
        : filter === 'week'
          ? task.dueOn! >= todayIso && task.dueOn! <= weekEnd
          : true,
    );
  const subEventName = (id: string | null) => data.subEvents.find((item) => item.id === id)?.name;

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('all') },
    { key: 'week', label: t('week') },
    { key: 'overdue', label: t('overdue', { count: tasks.overdue }) },
  ];

  return (
    <Card className={cn('gap-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-h3">
          {t('title')}
          <Badge>{t('count', { count: tasks.upcoming.length })}</Badge>
        </h2>
        <div
          role="radiogroup"
          aria-label={t('filter')}
          className="flex rounded-control bg-surface-muted p-1"
        >
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={filter === item.key}
              onClick={() => setFilter(item.key)}
              className={cn(
                'rounded-control px-3 py-1.5 text-small',
                filter === item.key
                  ? 'bg-surface font-semibold text-fg shadow-card'
                  : 'text-fg-secondary',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-body text-fg-secondary">
          <ListChecks aria-hidden className="size-5" />
          {t('empty')}
        </p>
      ) : (
        <ListPresence className="flex flex-col divide-y divide-border">
          {shown.map((task) => (
            <ListItem key={task.id}>
              <DeadlineRow
                task={task}
                subEvent={subEventName(task.subEventId)}
                canComplete={canComplete(task)}
                onComplete={() => complete(task)}
              />
            </ListItem>
          ))}
        </ListPresence>
      )}

      <div className="flex justify-end border-t border-border pt-3">
        <Link
          href={eventHref(eventId, 'tasks')}
          className="flex items-center gap-1 text-small font-semibold text-primary-text"
        >
          {t('viewAll', { count: tasks.total - tasks.done })}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

function DeadlineRow({
  task,
  subEvent,
  canComplete,
  onComplete,
}: {
  task: Task;
  subEvent: string | undefined;
  canComplete: boolean;
  onComplete: () => void;
}) {
  return (
    <LiveRow entityId={task.id} className="flex items-center gap-3 py-3">
      <TaskCheckbox
        title={task.title}
        checked={false}
        disabled={!canComplete}
        onToggle={onComplete}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-label">{task.title}</span>
        <span className="flex flex-wrap items-center gap-2">
          <DueChip task={task} />
          {subEvent && <Badge tone="info">{subEvent}</Badge>}
        </span>
      </div>
      <AssigneeStack assignees={task.assignees} />
    </LiveRow>
  );
}

// ---- Sub-events --------------------------------------------------------------------------

function SubEvents({ data, className }: { data: DashboardData; className?: string }) {
  const t = useTranslations('dashboard.subEvents');
  const { eventId } = useCurrentEvent();
  const format = timeFormat(data.countdown.timeZone);
  const shown = data.subEvents.slice(0, 4);
  return (
    <Card className={cn('gap-4', className)}>
      <h2 className="flex items-center gap-2 text-h3">
        {t('title')}
        <Badge>{t('count', { count: data.subEvents.length })}</Badge>
      </h2>
      <ul className="flex flex-col gap-3">
        {shown.map((item) => {
          const fill = item.capacity && item.taken !== null ? item.taken / item.capacity : null;
          return (
            <li key={item.id} className="flex flex-col gap-2 rounded-control bg-surface-muted p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  {item.groupLabel && (
                    <span className="block text-caption font-semibold text-primary-text uppercase">
                      {item.groupLabel}
                    </span>
                  )}
                  <span className="block truncate text-label font-semibold">{item.name}</span>
                </span>
                {fill !== null && fill >= 1 ? (
                  <Badge tone="danger">{t('full')}</Badge>
                ) : fill !== null && fill >= NEARLY_FULL ? (
                  <Badge tone="warning">{t('nearlyFull')}</Badge>
                ) : null}
              </div>
              <span className="flex items-center gap-1.5 text-small text-fg-secondary">
                <CalendarClock aria-hidden className="size-4" />
                {format.format(new Date(item.startsAt))}
              </span>
              {item.capacity && item.taken !== null && (
                <div className="flex flex-col gap-1">
                  <span className="flex justify-between text-small text-fg-secondary">
                    {t('capacity')}
                    <span className="tabular-nums">
                      {item.taken} / {item.capacity}
                    </span>
                  </span>
                  <ProgressFill
                    value={percent(item.taken, item.capacity)}
                    label={t('fill', { name: item.name })}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button asChild variant="secondary">
        <Link href={eventHref(eventId, 'schedule')}>
          {t('viewSchedule', { count: data.subEvents.length })}
        </Link>
      </Button>
    </Card>
  );
}

// ---- Budget by category ------------------------------------------------------------------

function BudgetByCategory({ budget }: { budget: NonNullable<DashboardData['budget']> }) {
  const t = useTranslations('dashboard.budget');
  const { eventId } = useCurrentEvent();
  // The biggest five; the budget page has the rest.
  const top = [...budget.categories]
    .filter((item) => item.plannedPaise > 0 || item.committedPaise > 0)
    .sort(
      (a, b) =>
        Math.max(b.plannedPaise, b.committedPaise) - Math.max(a.plannedPaise, a.committedPaise),
    )
    .slice(0, 5);
  return (
    <Card className="gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('title')}</h2>
        <p className="text-small text-fg-secondary">
          {t('summary', { planned: formatInr(budget.plannedPaise) })}
        </p>
      </div>
      {top.length === 0 ? (
        <p className="py-4 text-body text-fg-secondary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {top.map((item) => (
            <li key={item.id} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-label">{item.name}</span>
                <span className="shrink-0 text-small tabular-nums">
                  <span className="font-semibold">{formatInr(item.committedPaise)}</span>
                  <span className="text-fg-secondary">
                    {item.plannedPaise > 0
                      ? ` / ${formatInr(item.plannedPaise)}`
                      : ` · ${t('noPlan')}`}
                  </span>
                </span>
              </span>
              <BudgetBar
                plannedPaise={item.plannedPaise}
                committedPaise={item.committedPaise}
                paidPaise={item.paidPaise}
                label={t('bar', {
                  name: item.name,
                  committed: formatInr(item.committedPaise),
                  planned: formatInr(item.plannedPaise),
                })}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end border-t border-border pt-3">
        <Link
          href={eventHref(eventId, 'budget')}
          className="flex items-center gap-1 text-small font-semibold text-primary-text"
        >
          {t('manage')}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

// ---- Registrations and invitations -------------------------------------------------------

function Registrations({
  registrations,
}: {
  registrations: NonNullable<DashboardData['registrations']>;
}) {
  const t = useTranslations('dashboard.registrations');
  const week = registrations.daily.slice(-7).reduce((sum, day) => sum + day.count, 0);
  const before = registrations.daily.slice(0, 7).reduce((sum, day) => sum + day.count, 0);
  const change = before > 0 ? Math.round(((week - before) / before) * 100) : null;
  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3">{t('title')}</h2>
          <p className="text-small text-fg-secondary">
            {t('total', { total: registrations.total, waitlisted: registrations.waitlisted })}
          </p>
        </div>
        {change !== null && (
          <Badge tone={change >= 0 ? 'success' : 'neutral'}>
            {t('change', { change: `${change >= 0 ? '+' : ''}${change}` })}
          </Badge>
        )}
      </div>
      <p className="flex items-baseline gap-2">
        <span className="text-h2 font-semibold tabular-nums">
          +<CountUp value={week} />
        </span>
        <span className="text-small text-fg-secondary">{t('pastWeek')}</span>
      </p>
      <RegistrationsChart days={registrations.daily.slice(-7)} />
    </Card>
  );
}

function Invitations({ invitations }: { invitations: NonNullable<DashboardData['invitations']> }) {
  const t = useTranslations('dashboard.invitations');
  const { eventId } = useCurrentEvent();
  const delivered = invitations.sentDigitally + invitations.deliveredInPerson;
  const rows = [
    { key: 'deliveredInPerson', value: invitations.deliveredInPerson },
    { key: 'sentDigitally', value: invitations.sentDigitally },
    { key: 'notSent', value: invitations.notSent },
  ] as const;
  return (
    <Card className="gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('title')}</h2>
        <p className="text-small text-fg-secondary">
          {t('summary', { delivered, total: invitations.total })}
        </p>
      </div>
      {invitations.total === 0 ? (
        <p className="py-4 text-body text-fg-secondary">{t('empty')}</p>
      ) : (
        <>
          <ProgressFill value={percent(delivered, invitations.total)} label={t('title')} />
          <dl className="grid grid-cols-3 gap-3">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex flex-col gap-1 rounded-control bg-surface-muted p-3"
              >
                <dt className="text-small text-fg-secondary">{t(row.key)}</dt>
                <dd className="text-h3 tabular-nums">
                  <CountUp value={row.value} />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <div className="flex justify-end border-t border-border pt-3">
        <Link
          href={eventHref(eventId, 'people')}
          className="flex items-center gap-1 text-small font-semibold text-primary-text"
        >
          {t('manage')}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Card>
  );
}
