import { z } from 'zod';

import { TaskSchema } from './tasks.js';

/*
 * GET E/dashboard (APIDesign "Dashboard", PRD "Event dashboard"). One read for the event home:
 * counts the Stitch dashboards show, each section filtered to what the caller may see. A
 * section is null when the caller has no matching permission anywhere in the event. The web
 * derives "needs your attention" (overdue tasks, payments due, sub-events nearly full) from
 * these numbers rather than the API choosing them.
 */

const count = z.number().int().min(0);
const paise = z.number().int();

export const DashboardSubEventSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  groupLabel: z.string().nullable(),
  capacity: z.number().int().positive().nullable(),
  /** People confirmed, registered or checked in; null without guests.view or registrations.view there. */
  taken: count.nullable(),
});
export type DashboardSubEvent = z.infer<typeof DashboardSubEventSchema>;

export const DashboardHeadcountSchema = z.object({
  /** Null is the whole event (guest scope whole_event). */
  subEventId: z.uuid().nullable(),
  /** Everyone still expected: party sizes of every row not declined or cancelled. */
  expected: count,
  confirmed: count,
  registered: count,
  waitlisted: count,
  declined: count,
  checkedIn: count,
});
export type DashboardHeadcount = z.infer<typeof DashboardHeadcountSchema>;

export const DashboardBudgetCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  plannedPaise: paise,
  committedPaise: paise,
  paidPaise: paise,
});

export const DashboardSchema = z.object({
  countdown: z.object({
    eventStartsOn: z.iso.date(),
    eventEndsOn: z.iso.date(),
    timeZone: z.string(),
    /** Days from today (in the event's time zone) to the first day; 0 on it, negative after. */
    daysToGo: z.number().int(),
    nextSubEvent: z
      .object({ id: z.uuid(), name: z.string(), startsAt: z.iso.datetime({ offset: true }) })
      .nullable(),
  }),
  /** Top-level tasks only; subtasks are checklist items. Needs tasks.view. */
  tasks: z
    .object({
      total: count,
      done: count,
      inProgress: count,
      blocked: count,
      /** Not done, due before today. */
      overdue: count,
      /** Not done, due today or in the next 6 days. */
      dueThisWeek: count,
      /** Up to 5 open tasks with a due date, earliest first (overdue ones lead). */
      upcoming: z.array(TaskSchema),
    })
    .nullable(),
  /** Needs budget.view; committed and paid cover only the expenses the caller can see. */
  budget: z
    .object({
      budgetPaise: paise.nullable(),
      plannedPaise: paise,
      committedPaise: paise,
      paidPaise: paise,
      /** Not fully paid and due within 6 days, or already past due. */
      paymentsDue: z.object({ count, outstandingPaise: paise }),
      categories: z.array(DashboardBudgetCategorySchema),
    })
    .nullable(),
  /** Per scope the caller covers with guests.view or registrations.view. */
  headcounts: z.array(DashboardHeadcountSchema).nullable(),
  /** Sub-events the caller can see (subevents.view), by start time. */
  subEvents: z.array(DashboardSubEventSchema),
  /** Invitation distribution (e.g. 212 of 340 delivered). Needs guests.view. */
  invitations: z
    .object({ total: count, notSent: count, sentDigitally: count, deliveredInPerson: count })
    .nullable(),
  /** Open registrations, in people (party sizes). Needs registrations.view. */
  registrations: z
    .object({
      /** Registered or already checked in; the waitlist is counted apart. */
      total: count,
      waitlisted: count,
      /** People registered each day of the last 14 in the event's time zone, oldest first. */
      daily: z.array(z.object({ date: z.iso.date(), count })),
    })
    .nullable(),
  /** Needs members.view. */
  team: z.object({ members: count }).nullable(),
  /** When the numbers were computed; the cache keeps them up to 30 seconds. */
  generatedAt: z.iso.datetime({ offset: true }),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

/*
 * The cache (SystemDesign 5.2). The relay bumps the event's generation on every change that
 * moves a number; readers look the generation up first, so a value computed before a change
 * lands under the old generation and is never read again.
 */
export const DASHBOARD_CACHE_SECONDS = 30;
export const dashboardGenerationKey = (eventId: string) => `dash-gen:${eventId}`;
/** v1: the aggregate's shape; bump it when DashboardAggregate changes. */
export const dashboardCacheKey = (eventId: string, generation: string) =>
  `dash:v1:${eventId}:${generation}`;
/** Entity types whose changes move dashboard numbers. */
export const DASHBOARD_ENTITY_TYPES: readonly string[] = [
  'event',
  'sub_event',
  'task',
  'budget_category',
  'expense',
  'invitation',
  'attendance',
  'member',
];
