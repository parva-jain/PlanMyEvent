import {
  jobId,
  type AttendanceStatus,
  type GuestScopeJob,
  type GuestScopeResult,
  type SwitchGuestScope,
} from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import { ActionError } from '../errors.js';
import type { CoreTx, ScopedAttendance } from '../ports.js';

const fieldError = (message: string) =>
  new ActionError('validation_failed', message, {
    fields: [{ path: 'guestScope', message }],
  });

/**
 * POST E/guest-scope (event.settings): checks the switch makes sense now, then queues it
 * through the outbox. The worker runs `switchGuestScope` as the member who asked.
 */
export const startGuestScopeSwitch: ActionDefinition<
  SwitchGuestScope & { switchId: string },
  { jobId: string },
  CoreTx
> = {
  name: 'events.guestScope.start',
  permission: 'event.settings',
  noActivity: 'The switch logs its own entry when the worker runs it',
  async execute(tx, ctx, { switchId, guestScope }) {
    const eventId = ctx.eventId!;
    const event = await tx.events.find(eventId);
    if (!event) throw new ActionError('not_found', 'Event not found');
    if (event.guestScope === guestScope) {
      throw fieldError(
        guestScope === 'whole_event'
          ? 'Guests already belong to the whole event'
          : 'Guests are already separate per sub-event',
      );
    }
    // Copying guests onto no sub-events would drop every answer.
    if (guestScope === 'per_sub_event' && !(await tx.guestScope.subEventIds(eventId)).length) {
      throw fieldError('Add a sub-event first');
    }
    const userId = ctx.actor.kind === 'user' ? ctx.actor.userId : null;
    if (!userId) throw new ActionError('forbidden', 'Only a member can switch guest scope');
    const job: GuestScopeJob = { switchId, eventId, userId, guestScope };
    return {
      result: { jobId: switchId },
      outbox: [
        { topic: 'event.guest_scope', dedupeKey: jobId('guest-scope', switchId), payload: job },
      ],
    };
  },
};

/**
 * How committed an answer is, for merging per-sub-event rows (DatabaseDesign: checked in,
 * then confirmed or registered, then invited, then declined). Waitlisted sits above invited;
 * cancelled counts only when every row is cancelled.
 */
const COMMITMENT: Record<AttendanceStatus, number> = {
  checked_in: 6,
  confirmed: 5,
  registered: 5,
  waitlisted: 4,
  invited: 3,
  declined: 2,
  cancelled: 1,
};

const guestKey = (row: ScopedAttendance) => row.householdId ?? `contact:${row.contactId}`;

/**
 * Per sub-event back to the whole event: each guest's rows become one, with the most
 * committed status and the largest party among the rows still live.
 */
export function mergeRows(rows: readonly ScopedAttendance[]) {
  const byGuest = new Map<string, ScopedAttendance[]>();
  for (const row of rows) byGuest.set(guestKey(row), [...(byGuest.get(guestKey(row)) ?? []), row]);
  return [...byGuest.values()].map((group) => {
    const ranked = [...group].sort(
      (a, b) => COMMITMENT[b.status] - COMMITMENT[a.status] || b.partySize - a.partySize,
    );
    const keep = ranked[0]!;
    const live = group.filter((row) => row.status !== 'cancelled');
    return {
      keepId: keep.id,
      status: keep.status,
      partySize: Math.max(...(live.length ? live : group).map((row) => row.partySize)),
      removeIds: ranked.slice(1).map((row) => row.id),
    };
  });
}

/**
 * Switches guest scope (DatabaseDesign "Switching guest scope") in one transaction holding
 * the event row, so RSVPs and invitation changes wait for it:
 * - to per sub-event: every whole-event answer is copied onto each sub-event, invitations
 *   cover every sub-event, and sub-events take the event's response mode;
 * - back to the whole event: each guest's answers merge into one, invitations cover the
 *   whole event, and sub-events drop their response modes.
 * The event's version moves, so every open screen re-fetches. A second run finds the scope
 * already switched and changes nothing.
 */
export const switchGuestScope: ActionDefinition<SwitchGuestScope, GuestScopeResult, CoreTx> = {
  name: 'events.guestScope.switch',
  permission: 'event.settings',
  async execute(tx, ctx, { guestScope }) {
    const eventId = ctx.eventId!;
    const before = await tx.guestScope.lockEvent(eventId);
    if (!before) throw new ActionError('not_found', 'Event not found');
    if (before.guestScope === guestScope) {
      return { result: { guestScope, attendanceRows: 0 }, activity: [] };
    }

    let attendanceRows: number;
    if (guestScope === 'per_sub_event') {
      const subEventIds = await tx.guestScope.subEventIds(eventId);
      if (!subEventIds.length) throw fieldError('Add a sub-event first');
      attendanceRows = await tx.guestScope.spread(eventId, subEventIds);
      await tx.guestScope.setInvitationSubEvents(eventId, subEventIds);
      await tx.guestScope.setSubEventResponseModes(eventId, before.responseMode);
    } else {
      const merges = mergeRows(
        (await tx.guestScope.attendance(eventId)).filter((row) => row.subEventId !== null),
      );
      await tx.guestScope.collapse(eventId, merges);
      attendanceRows = merges.length;
      await tx.guestScope.setInvitationSubEvents(eventId, []);
      await tx.guestScope.setSubEventResponseModes(eventId, null);
    }
    const after = await tx.guestScope.setScope(eventId, guestScope);
    return {
      result: { guestScope, attendanceRows },
      activity: [
        {
          action: 'guest_scope',
          entityType: 'event',
          entityId: eventId,
          before: { guestScope: before.guestScope },
          after: { guestScope: after.guestScope, attendanceRows },
        },
      ],
    };
  },
};
