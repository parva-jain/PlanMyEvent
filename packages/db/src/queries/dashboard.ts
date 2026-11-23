import type { DashboardAggregate } from '@pme/core';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { budgetCategories } from '../schema/budget.js';
import { events, subEvents } from '../schema/events.js';
import { members } from '../schema/team.js';
import { tasks } from '../schema/tasks.js';
import { withDetails } from '../stores/tasks.js';

const UPCOMING_PER_SCOPE = 5;
const REGISTRATION_DAYS = 14;

const int = (value: unknown) => Number(value ?? 0);

/**
 * GET E/dashboard's numbers for a whole event (DatabaseDesign "Key queries"): every count split
 * by sub-event, so core's `dashboardFor` can show each member the scopes they cover. Each part is
 * one indexed, grouped query; they run side by side and may be a moment apart, which the
 * dashboard allows (SystemDesign "dashboards may lag a few seconds").
 */
export async function loadDashboardAggregate(
  db: Database,
  eventId: string,
  now: Date,
): Promise<DashboardAggregate | null> {
  const [event] = await db
    .select({
      startsOn: events.startsOn,
      endsOn: events.endsOn,
      timeZone: events.timeZone,
      guestScope: events.guestScope,
      budgetPaise: events.budgetPaise,
      today: sql<string>`to_char((${now}::timestamptz at time zone ${events.timeZone})::date, 'YYYY-MM-DD')`,
    })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)));
  if (!event) return null;
  const today = sql`${event.today}::date`;

  const [
    subEventRows,
    taskRows,
    upcomingIds,
    categoryRows,
    expenseRows,
    dueRows,
    attendanceRows,
    invitationRows,
    registrationTotals,
    registrationDays,
    memberCount,
  ] = await Promise.all([
    db
      .select({
        id: subEvents.id,
        name: subEvents.name,
        startsAt: subEvents.startsAt,
        endsAt: subEvents.endsAt,
        groupLabel: subEvents.groupLabel,
        capacity: subEvents.capacity,
      })
      .from(subEvents)
      .where(and(eq(subEvents.eventId, eventId), isNull(subEvents.deletedAt)))
      .orderBy(asc(subEvents.startsAt), asc(subEvents.id)),

    // Top-level tasks only: subtasks are checklist items under them.
    db.execute<Record<string, unknown>>(sql`
      select sub_event_id,
        count(*) as total,
        count(*) filter (where status = 'done') as done,
        count(*) filter (where status = 'in_progress') as in_progress,
        count(*) filter (where status = 'blocked') as blocked,
        count(*) filter (where status <> 'done' and due_on < ${today}) as overdue,
        count(*) filter (where status <> 'done' and due_on between ${today} and ${today} + 6::int) as due_this_week
      from tasks
      where event_id = ${eventId} and deleted_at is null and parent_task_id is null
      group by sub_event_id`),

    // The earliest-due open tasks of each scope, so every member's top 5 is among them.
    db.execute<{ id: string }>(sql`
      select id from (
        select id, row_number() over (partition by sub_event_id order by due_on, id) as rank
        from tasks
        where event_id = ${eventId} and deleted_at is null and parent_task_id is null
          and status <> 'done' and due_on is not null
      ) ranked
      where rank <= ${UPCOMING_PER_SCOPE}`),

    db
      .select({
        id: budgetCategories.id,
        name: budgetCategories.name,
        plannedPaise: budgetCategories.plannedPaise,
      })
      .from(budgetCategories)
      .where(and(eq(budgetCategories.eventId, eventId), isNull(budgetCategories.deletedAt)))
      .orderBy(asc(budgetCategories.position), asc(budgetCategories.id)),

    db.execute<Record<string, unknown>>(sql`
      select category_id, sub_event_id, sum(amount_paise) as committed, sum(paid_paise) as paid
      from expenses
      where event_id = ${eventId} and deleted_at is null
      group by category_id, sub_event_id`),

    db.execute<Record<string, unknown>>(sql`
      select sub_event_id, count(*) as count, sum(amount_paise - paid_paise) as outstanding
      from expenses
      where event_id = ${eventId} and deleted_at is null
        and payment_status <> 'paid' and due_on <= ${today} + 6::int
      group by sub_event_id`),

    db.execute<Record<string, unknown>>(sql`
      select sub_event_id,
        coalesce(sum(party_size) filter (where status not in ('declined', 'cancelled')), 0) as expected,
        coalesce(sum(party_size) filter (where status = 'confirmed'), 0) as confirmed,
        coalesce(sum(party_size) filter (where status = 'registered'), 0) as registered,
        coalesce(sum(party_size) filter (where status = 'waitlisted'), 0) as waitlisted,
        coalesce(sum(party_size) filter (where status = 'declined'), 0) as declined,
        coalesce(sum(party_size) filter (where status = 'checked_in'), 0) as checked_in
      from attendance
      where event_id = ${eventId}
      group by sub_event_id`),

    // Live invitations, counted per set of sub-events they cover.
    db.execute<Record<string, unknown>>(sql`
      select covers, delivery_status, count(*) as count
      from (
        select i.delivery_status,
          coalesce((
            select array_agg(s.sub_event_id::text order by s.sub_event_id)
            from invitation_sub_events s where s.invitation_id = i.id
          ), '{}') as covers
        from invitations i
        where i.event_id = ${eventId} and i.deleted_at is null and i.revoked_at is null
      ) invited
      group by covers, delivery_status`),

    db.execute<Record<string, unknown>>(sql`
      select sub_event_id,
        coalesce(sum(party_size) filter (where status in ('registered', 'checked_in')), 0) as total,
        coalesce(sum(party_size) filter (where status = 'waitlisted'), 0) as waitlisted
      from attendance
      where event_id = ${eventId} and source = 'registered'
      group by sub_event_id`),

    db.execute<Record<string, unknown>>(sql`
      select sub_event_id,
        to_char((created_at at time zone ${event.timeZone})::date, 'YYYY-MM-DD') as day,
        sum(party_size) as count
      from attendance
      where event_id = ${eventId} and source = 'registered' and status <> 'cancelled'
        and created_at >= (${today} - ${REGISTRATION_DAYS - 1}::int)::timestamp at time zone ${event.timeZone}
      group by 1, 2`),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(members)
      .where(and(eq(members.eventId, eventId), eq(members.status, 'active'))),
  ]);

  const ids = upcomingIds.rows.map((row) => row.id);
  const upcomingTasks = ids.length
    ? await withDetails(
        db,
        await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.eventId, eventId), inArray(tasks.id, ids))),
      )
    : [];

  const scope = (row: Record<string, unknown>) => (row.sub_event_id as string | null) ?? null;
  const invitationGroups = new Map<string, DashboardAggregate['invitations'][number]>();
  for (const row of invitationRows.rows) {
    const covers = row.covers as string[];
    const key = covers.join(',');
    const group = invitationGroups.get(key) ?? {
      subEventIds: covers,
      notSent: 0,
      sentDigitally: 0,
      deliveredInPerson: 0,
    };
    const status = row.delivery_status as string;
    if (status === 'not_sent') group.notSent += int(row.count);
    else if (status === 'sent_digitally') group.sentDigitally += int(row.count);
    else group.deliveredInPerson += int(row.count);
    invitationGroups.set(key, group);
  }

  return {
    event: {
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      timeZone: event.timeZone,
      guestScope: event.guestScope as DashboardAggregate['event']['guestScope'],
      budgetPaise: event.budgetPaise,
      today: event.today,
    },
    subEvents: subEventRows.map((row) => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    })),
    // count() and sum(bigint) come back as strings from the driver.
    tasks: taskRows.rows.map((row) => ({
      subEventId: scope(row),
      total: int(row.total),
      done: int(row.done),
      inProgress: int(row.in_progress),
      blocked: int(row.blocked),
      overdue: int(row.overdue),
      dueThisWeek: int(row.due_this_week),
    })),
    upcomingTasks,
    categories: categoryRows,
    expenses: expenseRows.rows.map((row) => ({
      categoryId: row.category_id as string,
      subEventId: scope(row),
      committedPaise: int(row.committed),
      paidPaise: int(row.paid),
    })),
    paymentsDue: dueRows.rows.map((row) => ({
      subEventId: scope(row),
      count: int(row.count),
      outstandingPaise: int(row.outstanding),
    })),
    attendance: attendanceRows.rows.map((row) => ({
      subEventId: scope(row),
      expected: int(row.expected),
      confirmed: int(row.confirmed),
      registered: int(row.registered),
      waitlisted: int(row.waitlisted),
      declined: int(row.declined),
      checkedIn: int(row.checked_in),
    })),
    invitations: [...invitationGroups.values()],
    registrationTotals: registrationTotals.rows.map((row) => ({
      subEventId: scope(row),
      total: int(row.total),
      waitlisted: int(row.waitlisted),
    })),
    registrations: registrationDays.rows.map((row) => ({
      subEventId: scope(row),
      date: row.day as string,
      count: int(row.count),
    })),
    members: memberCount[0]?.count ?? 0,
    generatedAt: now.toISOString(),
  };
}
