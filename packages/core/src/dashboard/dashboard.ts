import {
  can,
  canSomewhere,
  subEventsWith,
  type Dashboard,
  type DashboardHeadcount,
  type EffectivePermissions,
  type Permission,
  type Task,
} from '@pme/contracts';

/*
 * The dashboard is computed once per event and cached (SystemDesign 5.2, key dash:{eventId}),
 * but members see different parts of it: sub-event scope and permissions decide. So the cached
 * aggregate keeps every number split by scope (a sub-event id, or null for event-wide rows), and
 * `dashboardFor` adds up the scopes one member covers. Cheap, and no member's view is cached.
 */

/** Event-wide rows have no sub-event. */
type Scope = string | null;

export interface DashboardAggregate {
  event: {
    startsOn: string;
    endsOn: string;
    timeZone: string;
    guestScope: 'whole_event' | 'per_sub_event';
    budgetPaise: number | null;
    /** The date in the event's time zone when this was computed. */
    today: string;
  };
  /** Live sub-events by start time. */
  subEvents: {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
    groupLabel: string | null;
    capacity: number | null;
  }[];
  /** Top-level task counts per scope. */
  tasks: {
    subEventId: Scope;
    total: number;
    done: number;
    inProgress: number;
    blocked: number;
    overdue: number;
    dueThisWeek: number;
  }[];
  /** The earliest-due open tasks of each scope (up to 5 each), so any member's top 5 is here. */
  upcomingTasks: Task[];
  categories: { id: string; name: string; plannedPaise: number }[];
  expenses: { categoryId: string; subEventId: Scope; committedPaise: number; paidPaise: number }[];
  paymentsDue: { subEventId: Scope; count: number; outstandingPaise: number }[];
  attendance: DashboardHeadcount[];
  /** Invitations counted per set of sub-events they cover (empty for whole-event guests). */
  invitations: {
    subEventIds: string[];
    notSent: number;
    sentDigitally: number;
    deliveredInPerson: number;
  }[];
  /** Open registrations in people (party sizes) per scope: registered or checked in, and waitlisted. */
  registrationTotals: { subEventId: Scope; total: number; waitlisted: number }[];
  /** People registered per scope and local day, the last 14 days. */
  registrations: { subEventId: Scope; date: string; count: number }[];
  members: number;
  generatedAt: string;
}

const UPCOMING = 5;
const DAYS = 14;

/** Which scopes a permission covers: everything, or these sub-events (never event-wide rows). */
function scopeFilter(access: EffectivePermissions, ...permissions: Permission[]) {
  const sets = permissions.map((permission) => subEventsWith(access, permission));
  if (sets.includes('all')) return () => true;
  const ids = new Set(sets.flatMap((set) => [...(set as Set<string>)]));
  return (subEventId: Scope) => subEventId !== null && ids.has(subEventId);
}

const sum = <T>(rows: T[], pick: (row: T) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The dashboard one member sees, from the event's cached aggregate. */
export function dashboardFor(
  aggregate: DashboardAggregate,
  access: EffectivePermissions,
  now: Date,
): Dashboard {
  const { event } = aggregate;
  const seesSubEvent = scopeFilter(access, 'subevents.view');
  const subEvents = aggregate.subEvents.filter((item) => seesSubEvent(item.id));

  // ---- Countdown ----------------------------------------------------------------------------
  const next = subEvents.find((item) => Date.parse(item.startsAt) > now.getTime());
  const countdown: Dashboard['countdown'] = {
    eventStartsOn: event.startsOn,
    eventEndsOn: event.endsOn,
    timeZone: event.timeZone,
    daysToGo: daysBetween(event.today, event.startsOn),
    nextSubEvent: next ? { id: next.id, name: next.name, startsAt: next.startsAt } : null,
  };

  // ---- Tasks --------------------------------------------------------------------------------
  let tasks: Dashboard['tasks'] = null;
  if (canSomewhere(access, 'tasks.view')) {
    const sees = scopeFilter(access, 'tasks.view');
    const rows = aggregate.tasks.filter((row) => sees(row.subEventId));
    tasks = {
      total: sum(rows, (row) => row.total),
      done: sum(rows, (row) => row.done),
      inProgress: sum(rows, (row) => row.inProgress),
      blocked: sum(rows, (row) => row.blocked),
      overdue: sum(rows, (row) => row.overdue),
      dueThisWeek: sum(rows, (row) => row.dueThisWeek),
      upcoming: aggregate.upcomingTasks
        .filter((task) => sees(task.subEventId))
        .sort((a, b) => a.dueOn!.localeCompare(b.dueOn!) || a.id.localeCompare(b.id))
        .slice(0, UPCOMING),
    };
  }

  // ---- Budget -------------------------------------------------------------------------------
  let budget: Dashboard['budget'] = null;
  if (canSomewhere(access, 'budget.view')) {
    const sees = scopeFilter(access, 'budget.view');
    const expenses = aggregate.expenses.filter((row) => sees(row.subEventId));
    const due = aggregate.paymentsDue.filter((row) => sees(row.subEventId));
    // Categories are event-wide; their planned amounts show to every budget viewer, like
    // GET E/budget-categories.
    const categories = aggregate.categories.map((category) => {
      const own = expenses.filter((row) => row.categoryId === category.id);
      return {
        ...category,
        committedPaise: sum(own, (row) => row.committedPaise),
        paidPaise: sum(own, (row) => row.paidPaise),
      };
    });
    budget = {
      budgetPaise: event.budgetPaise,
      plannedPaise: sum(categories, (row) => row.plannedPaise),
      committedPaise: sum(expenses, (row) => row.committedPaise),
      paidPaise: sum(expenses, (row) => row.paidPaise),
      paymentsDue: {
        count: sum(due, (row) => row.count),
        outstandingPaise: sum(due, (row) => row.outstandingPaise),
      },
      categories,
    };
  }

  // ---- Guests and registrations ----------------------------------------------------------
  const seesPeople = scopeFilter(access, 'guests.view', 'registrations.view');
  const headcounts =
    canSomewhere(access, 'guests.view') || canSomewhere(access, 'registrations.view')
      ? aggregate.attendance.filter((row) => seesPeople(row.subEventId))
      : null;

  const takenOf = (row: DashboardHeadcount | undefined) =>
    row ? row.confirmed + row.registered + row.checkedIn : 0;
  const eventWide = aggregate.attendance.find((row) => row.subEventId === null);
  const dashboardSubEvents = subEvents.map((item) => {
    const allowed =
      can(access, 'guests.view', item.id) || can(access, 'registrations.view', item.id);
    // With whole-event guests every guest comes to every sub-event.
    const row =
      event.guestScope === 'whole_event'
        ? eventWide
        : aggregate.attendance.find((entry) => entry.subEventId === item.id);
    return { ...item, taken: allowed ? takenOf(row) : null };
  });

  let invitations: Dashboard['invitations'] = null;
  if (canSomewhere(access, 'guests.view')) {
    const covered = subEventsWith(access, 'guests.view');
    const groups = aggregate.invitations.filter(
      (group) => covered === 'all' || group.subEventIds.some((id) => covered.has(id)),
    );
    const notSent = sum(groups, (row) => row.notSent);
    const sentDigitally = sum(groups, (row) => row.sentDigitally);
    const deliveredInPerson = sum(groups, (row) => row.deliveredInPerson);
    invitations = {
      total: notSent + sentDigitally + deliveredInPerson,
      notSent,
      sentDigitally,
      deliveredInPerson,
    };
  }

  let registrations: Dashboard['registrations'] = null;
  if (canSomewhere(access, 'registrations.view')) {
    const sees = scopeFilter(access, 'registrations.view');
    const rows = aggregate.registrations.filter((row) => sees(row.subEventId));
    const scoped = aggregate.registrationTotals.filter((row) => sees(row.subEventId));
    const first = addDays(event.today, -(DAYS - 1));
    registrations = {
      total: sum(scoped, (row) => row.total),
      waitlisted: sum(scoped, (row) => row.waitlisted),
      daily: Array.from({ length: DAYS }, (_, index) => {
        const date = addDays(first, index);
        return {
          date,
          count: sum(
            rows.filter((row) => row.date === date),
            (row) => row.count,
          ),
        };
      }),
    };
  }

  return {
    countdown,
    tasks,
    budget,
    headcounts,
    subEvents: dashboardSubEvents,
    invitations,
    registrations,
    team: can(access, 'members.view') ? { members: aggregate.members } : null,
    generatedAt: aggregate.generatedAt,
  };
}
