import {
  jobId,
  normalizePhone,
  type Attendance,
  type Contact,
  type CreateAttendance,
  type EmailJob,
  type Event,
  type Register,
  type RegistrationResult,
  type SubEvent,
} from '@pme/contracts';

import type { ActivityEntry, ActionDefinition, OutboxMessage } from '../action.js';
import type { ActionContext } from '../context.js';
import { ActionError } from '../errors.js';
import type { CoreTx } from '../ports.js';

/*
 * Open registration (PRD "Open registration", APIDesign "Registration rules") and the
 * organizer's walk-ins (POST E/attendance). Registrations and invited guests share one
 * attendance table, so the dashboard and the attendance list count them together.
 */

const fieldError = (path: string, message: string) =>
  new ActionError('validation_failed', message, { fields: [{ path, message }] });

/** Statuses where the event is visible but takes no registrations, and where it isn't public. */
const CLOSED: readonly Event['status'][] = ['completed'];
const HIDDEN: readonly Event['status'][] = ['draft', 'archived'];

/** The mode that applies to a sub-event: its own with separate guest lists, else the event's. */
export const modeOf = (event: Event, subEvent: SubEvent | null) =>
  (event.guestScope === 'per_sub_event' ? subEvent?.responseMode : null) ?? event.responseMode;

/** A sub-event registrations can reach: public, and open to registration. */
export const isOpenForRegistration = (event: Event, subEvent: SubEvent) =>
  subEvent.visibility === 'public' && modeOf(event, subEvent) === 'open_registration';

export interface RegisterInput extends Omit<Register, 'turnstileToken'> {
  /** Where the magic link points, e.g. https://planmyevent.in/i/ (the token is appended). */
  linkBase: string;
}

function confirmation(
  ctx: ActionContext,
  event: Event,
  invitationId: string,
  to: string,
  guestName: string,
  url: string,
  partySize: number,
  items: SubEvent[],
): OutboxMessage {
  const payload: EmailJob = {
    template: 'registration-confirmed',
    to,
    eventName: event.name,
    guestName,
    url,
    partySize,
    timeZone: event.timeZone,
    items: items.map((item) => ({ name: item.name, startsAt: item.startsAt })),
    eventStartsOn: event.startsOn,
    eventEndsOn: event.endsOn,
  };
  // Per request: someone registering again gets the email again.
  return {
    topic: 'email.critical',
    dedupeKey: jobId('registration', invitationId, ctx.requestId),
    payload,
  };
}

/**
 * POST /v1/public/events/{slug}/registrations, run as the visitor (actor kind 'visitor',
 * channel public_link) once the API has checked Turnstile and the per-IP limit.
 *
 * - The contact is matched by email when one is given, else by phone; a phone match never
 *   takes a different email, so nobody can register under someone else's number and receive
 *   their link. No match makes a new contact.
 * - Someone already invited or registered changes nothing: the link is emailed again to the
 *   email on file. The answer is the same as for a new registration, so the form can't be
 *   used to find out who is on the list.
 * - Capacity is checked with the sub-events locked (SubEventStore.lockForCapacity), so two
 *   registrations for the last place can't both get it: the second gets capacity_full.
 */
export const registerForEvent: ActionDefinition<RegisterInput, RegistrationResult, CoreTx> = {
  name: 'registrations.create',
  permission: null,
  async execute(tx, ctx, input) {
    if (ctx.actor.kind !== 'visitor') {
      throw new ActionError('forbidden', 'Registration is for visitors on the public page');
    }
    const eventId = ctx.eventId!;
    // A shared lock: a guest-scope switch can't change the scope under us.
    const event = await tx.events.findForShare(eventId);
    if (!event || HIDDEN.includes(event.status)) {
      throw new ActionError('not_found', 'Event not found');
    }
    if (CLOSED.includes(event.status)) {
      throw new ActionError('registration_closed', 'Registration for this event has closed');
    }

    const wholeEvent = event.guestScope === 'whole_event';
    const requested = [...new Set(input.subEventIds)];
    let scopes: (string | null)[];
    let locked: SubEvent[];
    if (wholeEvent) {
      if (requested.length) throw fieldError('subEventIds', 'Register for the whole event');
      if (event.responseMode !== 'open_registration') {
        throw new ActionError('registration_closed', 'This event doesn’t take registrations');
      }
      scopes = [null];
      locked = await tx.subEvents.lockForCapacity(eventId, 'all');
    } else {
      if (!requested.length) throw fieldError('subEventIds', 'Choose at least one');
      locked = await tx.subEvents.lockForCapacity(eventId, requested);
      for (const id of requested) {
        const subEvent = locked.find((item) => item.id === id);
        if (!subEvent || !isOpenForRegistration(event, subEvent)) {
          throw fieldError('subEventIds', 'One of these isn’t open for registration');
        }
      }
      scopes = requested;
    }

    const email = input.email?.trim().toLowerCase() ?? null;
    const phone = input.phone ? normalizePhone(input.phone) : null;
    const [match] = await tx.contacts.findMatches(
      eventId,
      email ? { emails: [email], phones: [] } : { emails: [], phones: phone ? [phone] : [] },
    );
    const items = wholeEvent ? [] : scopes.map((id) => locked.find((item) => item.id === id)!);
    const result: RegistrationResult = { subEventIds: scopes, confirmationEmail: email !== null };

    // Capacity, with the sub-events locked. With whole-event guests every sub-event with a
    // capacity has to fit them.
    const ensureRoom = async () => {
      const taken = await tx.attendance.taken(eventId, scopes);
      const limits = wholeEvent
        ? locked.filter((item) => item.capacity !== null).map((item) => ({ item, scope: null }))
        : items.filter((item) => item.capacity !== null).map((item) => ({ item, scope: item.id }));
      for (const { item, scope } of limits) {
        if ((taken.get(scope) ?? 0) + input.partySize > item.capacity!) {
          throw new ActionError('capacity_full', `${item.name} is full`, {
            subEventId: item.id,
            spotsLeft: Math.max(0, item.capacity! - (taken.get(scope) ?? 0)),
          });
        }
      }
    };
    const emailLink = async (invitationId: string, to: string | null, guestName: string) => {
      const token = to ? await tx.invitations.linkToken(eventId, invitationId) : null;
      return to && token
        ? [
            confirmation(
              ctx,
              event,
              invitationId,
              to,
              guestName,
              `${input.linkBase}${token}`,
              input.partySize,
              items,
            ),
          ]
        : [];
    };

    if (match) {
      const [existing] = await tx.invitations.findForGuests(eventId, {
        householdIds: match.householdId ? [match.householdId] : [],
        contactIds: [match.id],
      });
      if (existing) {
        const rows = scopes.map((scope) =>
          existing.attendance.find((item) => item.subEventId === scope),
        );
        const reopen = rows.every(
          (row) => row && (row.status === 'cancelled' || row.status === 'declined'),
        );
        if (!reopen) {
          // Already on the list (or for something else; adding to an invitation is the
          // organizer's job): change nothing, send the link again.
          return {
            result,
            activity: [],
            outbox: await emailLink(existing.id, match.email, existing.guestName),
          };
        }
        // They cancelled before and are registering again: their rows come back, if there is room.
        await ensureRoom();
        const activity: ActivityEntry[] = [];
        for (const row of rows) {
          const before = await tx.attendance.find(eventId, row!.id);
          const after = await tx.attendance.update(eventId, row!.id, before!.version, {
            status: 'registered',
            source: 'registered',
            partySize: input.partySize,
          });
          activity.push({
            action: 'register',
            entityType: 'attendance',
            entityId: row!.id,
            before,
            after,
          });
        }
        return {
          result,
          activity,
          outbox: await emailLink(existing.id, match.email, existing.guestName),
        };
      }
    }

    await ensureRoom();

    const activity: ActivityEntry[] = [];
    let contact: Contact | undefined = match;
    if (!contact) {
      [contact] = await tx.contacts.insert(eventId, [
        { householdId: null, name: input.name, phone, email, tags: ['registered'], notes: null },
      ]);
      activity.push({
        action: 'create',
        entityType: 'contact',
        entityId: contact!.id,
        before: null,
        after: contact,
      });
    }
    const [invitation] = await tx.invitations.insert(eventId, [
      {
        householdId: null,
        contactId: contact!.id,
        distributorMemberId: null,
        subEventIds: wholeEvent ? [] : requested,
        attendance: scopes.map((subEventId) => ({ subEventId, partySize: input.partySize })),
        registeredAt: ctx.now,
      },
    ]);
    activity.push({
      action: 'register',
      entityType: 'invitation',
      entityId: invitation!.id,
      before: null,
      after: invitation,
    });

    const to = contact!.email ?? email;
    const outbox = await emailLink(invitation!.id, to, contact!.name);
    return { result: { ...result, confirmationEmail: to !== null }, activity, outbox };
  },
};

/**
 * POST E/attendance: an organizer adds a walk-in (checked in) or a manual registration. An
 * existing contact or a new one; if the guest (or their household) already has a row for that
 * scope, it takes the new status, so an invited guest arriving is simply checked in. Capacity
 * isn't enforced here: the organizer at the door decides.
 */
export const createAttendance: ActionDefinition<CreateAttendance, Attendance, CoreTx> = {
  name: 'attendance.create',
  permission: 'guests.edit',
  subEventOf: (_tx, _ctx, input) => input.subEventId,
  async execute(tx, ctx, input) {
    const eventId = ctx.eventId!;
    const event = await tx.events.findForShare(eventId);
    if (!event) throw new ActionError('not_found', 'Event not found');
    if (event.guestScope === 'whole_event' && input.subEventId !== null) {
      throw fieldError('subEventId', 'Guests belong to the whole event');
    }
    if (event.guestScope === 'per_sub_event') {
      if (input.subEventId === null) throw fieldError('subEventId', 'Choose a sub-event');
      if (!(await tx.subEvents.find(eventId, input.subEventId))) {
        throw fieldError('subEventId', 'Sub-event not found');
      }
    }

    const activity: ActivityEntry[] = [];
    let contact: Contact | null | undefined;
    if (input.contactId) {
      contact = await tx.contacts.find(eventId, input.contactId);
      if (!contact) throw fieldError('contactId', 'Contact not found');
    } else {
      const fresh = input.contact!;
      [contact] = await tx.contacts.insert(eventId, [
        {
          householdId: null,
          name: fresh.name,
          phone: fresh.phone ? normalizePhone(fresh.phone) : null,
          email: fresh.email?.trim().toLowerCase() ?? null,
          tags: [],
          notes: null,
        },
      ]);
      activity.push({
        action: 'create',
        entityType: 'contact',
        entityId: contact!.id,
        before: null,
        after: contact,
      });
    }

    const checkedIn = input.status === 'checked_in';
    const memberId = ctx.actor.kind === 'user' ? ctx.actor.memberId : null;
    const stamp = {
      checkedInAt: checkedIn ? ctx.now : null,
      checkedInByMemberId: checkedIn ? memberId : null,
    };
    const existing = await tx.attendance.findForContact(eventId, contact!.id, input.subEventId);
    if (existing) {
      const after = await tx.attendance.update(eventId, existing.id, existing.version, {
        status: input.status,
        partySize: input.partySize,
        ...stamp,
      });
      if (!after) throw new ActionError('version_conflict', 'This guest just changed');
      activity.push({
        action: checkedIn ? 'check_in' : 'update',
        entityType: 'attendance',
        entityId: existing.id,
        before: existing,
        after,
      });
      return { result: after, activity };
    }

    const row = await tx.attendance.insert(eventId, {
      contactId: contact!.id,
      subEventId: input.subEventId,
      partySize: input.partySize,
      status: input.status,
      ...stamp,
    });
    activity.push({
      action: 'create',
      entityType: 'attendance',
      entityId: row.id,
      before: null,
      after: row,
    });
    return { result: row, activity };
  },
};
