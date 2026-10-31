import {
  can,
  DISTRIBUTOR_FIELDS,
  type Attendance,
  type AttendanceSummary,
  type BulkCreateInvitations,
  type BulkCreateInvitationsResult,
  type BulkUpdateInvitations,
  type CreateInvitation,
  type Invitation,
  type InviteSkipReason,
  type UpdateAttendance,
  type UpdateInvitation,
} from '@pme/contracts';

import type { ActivityEntry, ActionDefinition } from '../action.js';
import type { ActionContext } from '../context.js';
import { ActionError } from '../errors.js';
import { versionMismatch } from '../events/versioned.js';
import type { CoreTx, InvitationChanges, NewInvitation } from '../ports.js';
import { actorAccess } from '../team/access.js';

/*
 * Invitations and attendance (PRD "Invitations and responses"). Inviting and managing
 * invitations needs guests.invite for the whole event, since guests belong to the whole
 * event; the member handing over a card may mark it delivered without it. Attendance follows
 * sub-event scope: an editor of the Mehendi may correct Mehendi answers.
 */

const fieldError = (path: string, message: string) =>
  new ActionError('validation_failed', message, { fields: [{ path, message }] });

async function findInvitation(tx: CoreTx, ctx: ActionContext, invitationId: string) {
  const invitation = await tx.invitations.find(ctx.eventId!, invitationId);
  if (!invitation) throw new ActionError('not_found', 'Invitation not found');
  return invitation;
}

/** The event's guest scope decides whether sub-events are chosen, and they must be live. */
async function checkSubEvents(tx: CoreTx, eventId: string, subEventIds: string[] | undefined) {
  const event = await tx.events.find(eventId);
  if (!event) throw new ActionError('not_found', 'Event not found');
  if (event.guestScope === 'whole_event') {
    if (subEventIds?.length) {
      throw fieldError('subEventIds', 'Guests are invited to the whole event');
    }
    return [];
  }
  if (!subEventIds?.length) throw fieldError('subEventIds', 'Choose at least one sub-event');
  for (const [index, subEventId] of subEventIds.entries()) {
    if (!(await tx.subEvents.find(eventId, subEventId))) {
      throw fieldError(`subEventIds.${index}`, 'Sub-event not found in this event');
    }
  }
  return subEventIds;
}

async function checkDistributor(tx: CoreTx, eventId: string, memberId: string | null | undefined) {
  if (!memberId) return;
  const member = await tx.members.find(eventId, memberId);
  if (member?.status !== 'active') {
    throw fieldError('distributorMemberId', 'Not a member of this event');
  }
}

const conflict = (reason: InviteSkipReason, message: string) =>
  new ActionError('conflict', message, { reason });

/**
 * The invitations to make for these guests, and the ones that can't be: already invited, a
 * contact whose household is invited, or a household one of whose people has their own.
 */
async function plan(
  tx: CoreTx,
  eventId: string,
  guests: { householdIds: string[]; contactIds: string[] },
  shared: { subEventIds: string[]; distributorMemberId: string | null },
) {
  const toMake: NewInvitation[] = [];
  const skipped: BulkCreateInvitationsResult['skipped'] = [];
  const households = await Promise.all(
    guests.householdIds.map((id) => tx.households.find(eventId, id)),
  );
  const contacts = await Promise.all(guests.contactIds.map((id) => tx.contacts.find(eventId, id)));
  const members = await tx.contacts.inHouseholds(eventId, guests.householdIds);
  const existing = await tx.invitations.findForGuests(eventId, {
    householdIds: [
      ...guests.householdIds,
      ...contacts.flatMap((contact) => (contact?.householdId ? [contact.householdId] : [])),
    ],
    contactIds: [...guests.contactIds, ...members.map((member) => member.id)],
  });
  const invitedHousehold = new Set(existing.flatMap((item) => item.householdId ?? []));
  const invitedContact = new Set(existing.flatMap((item) => item.contactId ?? []));
  const rows = (partySize: number) =>
    shared.subEventIds.length
      ? shared.subEventIds.map((subEventId) => ({ subEventId, partySize }))
      : [{ subEventId: null, partySize }];

  guests.householdIds.forEach((householdId, index) => {
    const household = households[index];
    const skip = (reason: InviteSkipReason) =>
      skipped.push({ householdId, contactId: null, reason });
    if (!household) return skip('not_found');
    if (invitedHousehold.has(householdId)) return skip('already_invited');
    const own = members.some(
      (member) => member.householdId === householdId && invitedContact.has(member.id),
    );
    if (own) return skip('member_invited');
    invitedHousehold.add(householdId);
    toMake.push({
      householdId,
      contactId: null,
      ...shared,
      attendance: rows(household.expectedCount),
    });
  });
  guests.contactIds.forEach((contactId, index) => {
    const contact = contacts[index];
    const skip = (reason: InviteSkipReason) =>
      skipped.push({ householdId: null, contactId, reason });
    if (!contact) return skip('not_found');
    if (invitedContact.has(contactId)) return skip('already_invited');
    if (contact.householdId && invitedHousehold.has(contact.householdId)) {
      return skip('household_invited');
    }
    invitedContact.add(contactId);
    toMake.push({ householdId: null, contactId, ...shared, attendance: rows(1) });
  });
  return { toMake, skipped };
}

const created = (invitation: Invitation): ActivityEntry => ({
  action: 'create',
  entityType: 'invitation',
  entityId: invitation.id,
  before: null,
  after: invitation,
});

// ---- Create ---------------------------------------------------------------------------------

const SKIP_MESSAGES: Record<InviteSkipReason, string> = {
  already_invited: 'Already invited',
  household_invited: 'Their household is already invited',
  member_invited: 'Someone in this household has their own invitation',
  not_found: 'Guest not found',
};

/** POST E/invitations: one household or contact; attendance starts as invited. */
export const createInvitation: ActionDefinition<CreateInvitation, Invitation, CoreTx> = {
  name: 'invitations.create',
  permission: 'guests.invite',
  async execute(tx, ctx, input) {
    const eventId = ctx.eventId!;
    const subEventIds = await checkSubEvents(tx, eventId, input.subEventIds);
    await checkDistributor(tx, eventId, input.distributorMemberId);
    const { toMake, skipped } = await plan(
      tx,
      eventId,
      {
        householdIds: input.householdId ? [input.householdId] : [],
        contactIds: input.contactId ? [input.contactId] : [],
      },
      { subEventIds, distributorMemberId: input.distributorMemberId ?? null },
    );
    if (skipped[0]) {
      const { reason } = skipped[0];
      if (reason === 'not_found') {
        throw fieldError(input.householdId ? 'householdId' : 'contactId', SKIP_MESSAGES.not_found);
      }
      throw conflict(reason, SKIP_MESSAGES[reason]);
    }
    const [invitation] = await tx.invitations.insert(eventId, toMake);
    return { result: invitation!, activity: [created(invitation!)] };
  },
};

/** POST E/invitations/bulk: up to 200 guests; the ones that can't be invited are listed. */
export const createInvitations: ActionDefinition<
  BulkCreateInvitations,
  BulkCreateInvitationsResult,
  CoreTx
> = {
  name: 'invitations.bulkCreate',
  permission: 'guests.invite',
  async execute(tx, ctx, input) {
    const eventId = ctx.eventId!;
    const subEventIds = await checkSubEvents(tx, eventId, input.subEventIds);
    await checkDistributor(tx, eventId, input.distributorMemberId);
    const { toMake, skipped } = await plan(
      tx,
      eventId,
      {
        householdIds: [...new Set(input.householdIds)],
        contactIds: [...new Set(input.contactIds)],
      },
      { subEventIds, distributorMemberId: input.distributorMemberId ?? null },
    );
    const invitations = await tx.invitations.insert(eventId, toMake);
    return { result: { created: invitations, skipped }, activity: invitations.map(created) };
  },
};

// ---- Update ---------------------------------------------------------------------------------

/** Delivery dates follow the status: sent and delivered are stamped once, cleared by not sent. */
function deliveryChanges(
  ctx: ActionContext,
  before: Invitation,
  status: Invitation['deliveryStatus'] | undefined,
): InvitationChanges {
  if (!status || status === before.deliveryStatus) return {};
  if (status === 'not_sent') return { deliveryStatus: status, sentAt: null, deliveredAt: null };
  if (status === 'sent_digitally') {
    return { deliveryStatus: status, ...(!before.sentAt && { sentAt: ctx.now }) };
  }
  return { deliveryStatus: status, ...(!before.deliveredAt && { deliveredAt: ctx.now }) };
}

async function applyUpdate(
  tx: CoreTx,
  ctx: ActionContext,
  before: Invitation,
  expectedVersion: number,
  changes: UpdateInvitation,
): Promise<Invitation> {
  const eventId = ctx.eventId!;
  let current = before;
  let version = expectedVersion;
  if (changes.subEventIds !== undefined) {
    const wanted = await checkSubEvents(tx, eventId, changes.subEventIds);
    const add = wanted.filter((id) => !before.subEventIds.includes(id));
    const remove = before.subEventIds.filter((id) => !wanted.includes(id));
    if (add.length || remove.length) {
      const partySize = before.householdId
        ? ((await tx.households.find(eventId, before.householdId))?.expectedCount ?? 1)
        : 1;
      const after = await tx.invitations.changeSubEvents(eventId, before.id, version, {
        add: add.map((subEventId) => ({ subEventId, partySize })),
        remove,
      });
      if (!after) versionMismatch(await tx.invitations.find(eventId, before.id), version);
      current = after;
      version = after.version;
    }
  }
  if (changes.distributorMemberId !== undefined) {
    await checkDistributor(tx, eventId, changes.distributorMemberId);
  }
  const fields: InvitationChanges = {
    ...deliveryChanges(ctx, before, changes.deliveryStatus),
    ...(changes.distributorMemberId !== undefined &&
      changes.distributorMemberId !== before.distributorMemberId && {
        distributorMemberId: changes.distributorMemberId,
      }),
  };
  if (!Object.keys(fields).length) return current;
  const after = await tx.invitations.update(eventId, before.id, version, fields);
  if (!after) versionMismatch(await tx.invitations.find(eventId, before.id), version);
  return after;
}

/**
 * PATCH E/invitations/{id}. guests.invite for anything; without it, the member handing over
 * the card may change its delivery status only.
 */
export const updateInvitation: ActionDefinition<
  { invitationId: string; expectedVersion: number; changes: UpdateInvitation },
  Invitation,
  CoreTx
> = {
  name: 'invitations.update',
  permission: null,
  async execute(tx, ctx, { invitationId, expectedVersion, changes }) {
    const access = await actorAccess(tx, ctx);
    const before = await findInvitation(tx, ctx, invitationId);
    if (!can(access, 'guests.invite')) {
      const distributor =
        before.distributorMemberId === access.memberId &&
        Object.keys(changes).every((key) =>
          (DISTRIBUTOR_FIELDS as readonly string[]).includes(key),
        );
      if (!distributor) {
        throw new ActionError('forbidden', 'You need the guests.invite permission', {
          permission: 'guests.invite',
        });
      }
    }
    const after = await applyUpdate(tx, ctx, before, expectedVersion, changes);
    return {
      result: after,
      activity:
        after === before
          ? []
          : [{ action: 'update', entityType: 'invitation', entityId: invitationId, before, after }],
    };
  },
};

/**
 * PATCH E/invitations/bulk: one delivery status or distributor for many (no If-Match; each
 * is guarded by the version just read). Ids not found are returned as missing.
 */
export const updateInvitations: ActionDefinition<
  BulkUpdateInvitations,
  { updated: Invitation[]; missing: string[] },
  CoreTx
> = {
  name: 'invitations.bulkUpdate',
  permission: 'guests.invite',
  async execute(tx, ctx, input) {
    const updated: Invitation[] = [];
    const missing: string[] = [];
    const activity: ActivityEntry[] = [];
    for (const invitationId of new Set(input.invitationIds)) {
      const before = await tx.invitations.find(ctx.eventId!, invitationId);
      if (!before) {
        missing.push(invitationId);
        continue;
      }
      const after = await applyUpdate(tx, ctx, before, before.version, {
        deliveryStatus: input.deliveryStatus,
        distributorMemberId: input.distributorMemberId,
      });
      updated.push(after);
      if (after !== before) {
        activity.push({
          action: 'update',
          entityType: 'invitation',
          entityId: invitationId,
          before,
          after,
        });
      }
    }
    return { result: { updated, missing }, activity };
  },
};

// ---- Withdraw, restore, new link ------------------------------------------------------------

/** DELETE E/invitations/{id}: the link stops working and the guest's attendance is cancelled. */
export const deleteInvitation: ActionDefinition<
  { invitationId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'invitations.delete',
  permission: 'guests.invite',
  async execute(tx, ctx, { invitationId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const before = await findInvitation(tx, ctx, invitationId);
    if (!(await tx.invitations.softDelete(eventId, invitationId, expectedVersion))) {
      versionMismatch(await tx.invitations.find(eventId, invitationId), expectedVersion);
    }
    return {
      result: undefined,
      activity: [
        { action: 'delete', entityType: 'invitation', entityId: invitationId, before, after: null },
      ],
    };
  },
};

/** Undo of a withdrawal: the same link works again and the answers come back. */
export const restoreInvitation: ActionDefinition<
  { invitationId: string; attendance: Pick<AttendanceSummary, 'subEventId' | 'status'>[] },
  Invitation,
  CoreTx
> = {
  name: 'invitations.restore',
  permission: 'guests.invite',
  async execute(tx, ctx, { invitationId, attendance }) {
    const after = await tx.invitations.restore(ctx.eventId!, invitationId, attendance);
    if (after === 'already_invited') {
      throw conflict('already_invited', 'This guest has been invited again since');
    }
    if (!after) throw new ActionError('not_found', 'Invitation not found');
    return {
      result: after,
      activity: [
        {
          action: 'restore',
          entityType: 'invitation',
          entityId: invitationId,
          before: null,
          after,
        },
      ],
    };
  },
};

/** POST E/invitations/{id}/regenerate-link: the old link stops working. Not undoable. */
export const regenerateInvitationLink: ActionDefinition<
  { invitationId: string; expectedVersion: number },
  Invitation,
  CoreTx
> = {
  name: 'invitations.regenerateLink',
  permission: 'guests.invite',
  async execute(tx, ctx, { invitationId, expectedVersion }) {
    const eventId = ctx.eventId!;
    await findInvitation(tx, ctx, invitationId);
    const after = await tx.invitations.regenerate(eventId, invitationId, expectedVersion);
    if (!after) versionMismatch(await tx.invitations.find(eventId, invitationId), expectedVersion);
    return {
      result: after,
      activity: [
        {
          action: 'regenerate_link',
          entityType: 'invitation',
          entityId: invitationId,
          before: null,
          after: { version: after.version },
        },
      ],
    };
  },
};

// ---- Attendance -----------------------------------------------------------------------------

/** PATCH E/attendance/{id}: guests.edit in the row's sub-event. */
export const updateAttendance: ActionDefinition<
  { attendanceId: string; expectedVersion: number; changes: UpdateAttendance },
  Attendance,
  CoreTx
> = {
  name: 'attendance.update',
  permission: 'guests.edit',
  async subEventOf(tx, ctx, input) {
    return (await tx.attendance.find(ctx.eventId!, input.attendanceId))?.subEventId ?? null;
  },
  async execute(tx, ctx, { attendanceId, expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const before = await tx.attendance.find(eventId, attendanceId);
    if (!before) throw new ActionError('not_found', 'Attendance not found');
    const after = await tx.attendance.update(eventId, attendanceId, expectedVersion, changes);
    if (!after) versionMismatch(await tx.attendance.find(eventId, attendanceId), expectedVersion);
    return {
      result: after,
      activity: [
        { action: 'update', entityType: 'attendance', entityId: attendanceId, before, after },
      ],
    };
  },
};
