import type { Attendance, Rsvp } from '@pme/contracts';

import type { ActivityEntry, ActionDefinition } from '../action.js';
import { ActionError } from '../errors.js';
import type { CoreTx } from '../ports.js';

/*
 * What a guest does through their magic link (APIDesign "Public endpoints"). The API finds
 * the invitation by the link's hash and runs these as the guest (actor kind 'guest', channel
 * public_link); no session, no member permissions.
 */

const fieldError = (path: string, message: string) =>
  new ActionError('validation_failed', message, { fields: [{ path, message }] });

function invitationIdOf(actor: { kind: string; invitationId?: string }) {
  if (actor.kind !== 'guest' || !actor.invitationId) {
    throw new ActionError('forbidden', 'Only the invited guest can answer');
  }
  return actor.invitationId;
}

/** The link was opened: lastOpenedAt, at most once an hour. Not logged. */
export const recordInvitationOpened: ActionDefinition<Record<string, never>, void, CoreTx> = {
  name: 'invitations.opened',
  permission: null,
  noActivity: 'Opening a link is noted on the invitation, not in the log',
  async execute(tx, ctx) {
    await tx.invitations.markOpened(ctx.eventId!, invitationIdOf(ctx.actor), ctx.now);
    return { result: undefined };
  },
};

/**
 * POST /v1/public/invites/{token}/rsvp: attending or not, and how many, for each scope on
 * the invitation that is invite + RSVP. One answer per household per scope; the last wins.
 * Party size isn't checked against the expected count: organizers see the difference.
 */
export const respondToInvitation: ActionDefinition<Rsvp, Attendance[], CoreTx> = {
  name: 'invitations.respond',
  permission: null,
  async execute(tx, ctx, { responses }) {
    const eventId = ctx.eventId!;
    const invitation = await tx.invitations.find(eventId, invitationIdOf(ctx.actor));
    if (!invitation) throw new ActionError('link_revoked', 'This invitation was withdrawn');
    const event = await tx.events.find(eventId);
    if (!event) throw new ActionError('not_found', 'Event not found');

    const seen = new Set<string | null>();
    const answered: Attendance[] = [];
    const activity: ActivityEntry[] = [];
    for (const [index, response] of responses.entries()) {
      const path = `responses.${index}`;
      if (seen.has(response.subEventId)) throw fieldError(path, 'Answer each part once');
      seen.add(response.subEventId);
      const row = invitation.attendance.find(
        (item) => item.subEventId === response.subEventId && item.status !== 'cancelled',
      );
      const onInvitation =
        event.guestScope === 'whole_event'
          ? response.subEventId === null
          : response.subEventId !== null && invitation.subEventIds.includes(response.subEventId);
      if (!row || !onInvitation) throw fieldError(path, "This isn't on your invitation");
      const subEvent = response.subEventId
        ? await tx.subEvents.find(eventId, response.subEventId)
        : null;
      const mode = subEvent?.responseMode ?? event.responseMode;
      if (mode !== 'invite_rsvp') throw fieldError(path, "This part doesn't take replies");
      if (response.attending && response.partySize === undefined) {
        throw fieldError(`${path}.partySize`, 'Say how many are coming');
      }
      const answer = {
        status: response.attending ? ('confirmed' as const) : ('declined' as const),
        partySize: response.attending ? response.partySize! : row.partySize,
        respondedAt: ctx.now,
      };
      const after = await tx.attendance.respond(eventId, row.id, answer);
      if (!after) throw new ActionError('not_found', 'Attendance not found');
      answered.push(after);
      activity.push({
        action: 'respond',
        entityType: 'attendance',
        entityId: row.id,
        before: { subEventId: row.subEventId, status: row.status, partySize: row.partySize },
        after: { subEventId: row.subEventId, status: after.status, partySize: after.partySize },
      });
    }
    return { result: answered, activity };
  },
};
