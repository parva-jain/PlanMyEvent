import type {
  CreateSubEvent,
  CreateVenue,
  SubEvent,
  UpdateSubEvent,
  UpdateVenue,
  Venue,
} from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import { ActionError } from '../errors.js';
import { permissionsChanged } from '../live.js';
import type { CoreTx } from '../ports.js';
import { versionMismatch } from './versioned.js';

const fieldError = (path: string, message: string) =>
  new ActionError('validation_failed', message, { fields: [{ path, message }] });

/** The venue must exist in this event (the composite foreign key enforces it too). */
async function assertVenue(tx: CoreTx, eventId: string, venueId: string | null | undefined) {
  if (venueId && !(await tx.venues.find(eventId, venueId))) {
    throw fieldError('venueId', 'Venue not found in this event');
  }
}

/** DatabaseDesign: a sub-event's response mode is used only with separate guest lists. */
async function assertResponseMode(tx: CoreTx, eventId: string, responseMode: unknown) {
  if (responseMode === undefined || responseMode === null) return;
  const event = await tx.events.find(eventId);
  if (event?.guestScope !== 'per_sub_event') {
    throw fieldError(
      'responseMode',
      'Set per sub-event only when guests are separate per sub-event',
    );
  }
}

// ---- Venues (no version column: last write wins) -----------------------------------------

export const createVenue: ActionDefinition<CreateVenue, Venue, CoreTx> = {
  name: 'venues.create',
  permission: 'subevents.edit',
  async execute(tx, ctx, input) {
    const venue = await tx.venues.insert(ctx.eventId!, input);
    return {
      result: venue,
      activity: [
        { action: 'create', entityType: 'venue', entityId: venue.id, before: null, after: venue },
      ],
    };
  },
};

export const updateVenue: ActionDefinition<
  { venueId: string; changes: UpdateVenue },
  Venue,
  CoreTx
> = {
  name: 'venues.update',
  permission: 'subevents.edit',
  async execute(tx, ctx, { venueId, changes }) {
    const before = await tx.venues.find(ctx.eventId!, venueId);
    const after = before && (await tx.venues.update(ctx.eventId!, venueId, changes));
    if (!before || !after) throw new ActionError('not_found', 'Venue not found');
    return {
      result: after,
      activity: [{ action: 'update', entityType: 'venue', entityId: venueId, before, after }],
    };
  },
};

/** Soft delete; sub-events at this venue keep their times and lose the venue. */
export const deleteVenue: ActionDefinition<{ venueId: string }, void, CoreTx> = {
  name: 'venues.delete',
  permission: 'subevents.edit',
  async execute(tx, ctx, { venueId }) {
    const before = await tx.venues.find(ctx.eventId!, venueId);
    if (!before || !(await tx.venues.softDelete(ctx.eventId!, venueId))) {
      throw new ActionError('not_found', 'Venue not found');
    }
    return {
      result: undefined,
      activity: [{ action: 'delete', entityType: 'venue', entityId: venueId, before, after: null }],
    };
  },
};

// ---- Sub-events ----------------------------------------------------------------------------

export const createSubEvent: ActionDefinition<CreateSubEvent, SubEvent, CoreTx> = {
  name: 'subEvents.create',
  permission: 'subevents.edit',
  async execute(tx, ctx, input) {
    const eventId = ctx.eventId!;
    await assertVenue(tx, eventId, input.venueId);
    await assertResponseMode(tx, eventId, input.responseMode);
    const [subEvent] = await tx.subEvents.insert(eventId, [
      { ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) },
    ]);
    return {
      result: subEvent!,
      activity: [
        {
          action: 'create',
          entityType: 'sub_event',
          entityId: subEvent!.id,
          before: null,
          after: subEvent,
        },
      ],
    };
  },
};

export const updateSubEvent: ActionDefinition<
  { subEventId: string; expectedVersion: number; changes: UpdateSubEvent },
  SubEvent,
  CoreTx
> = {
  name: 'subEvents.update',
  permission: 'subevents.edit',
  subEventOf: (_tx, _ctx, input) => input.subEventId,
  async execute(tx, ctx, { subEventId, expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const before = await tx.subEvents.find(eventId, subEventId);
    if (!before) throw new ActionError('not_found', 'Sub-event not found');
    await assertVenue(tx, eventId, changes.venueId);
    await assertResponseMode(tx, eventId, changes.responseMode);
    const startsAt = changes.startsAt ?? before.startsAt;
    const endsAt = changes.endsAt ?? before.endsAt;
    if (new Date(endsAt) <= new Date(startsAt)) {
      throw fieldError('endsAt', 'Must end after it starts');
    }
    const after = await tx.subEvents.update(eventId, subEventId, expectedVersion, changes);
    if (!after) versionMismatch(await tx.subEvents.find(eventId, subEventId), expectedVersion);
    return {
      result: after,
      activity: [
        { action: 'update', entityType: 'sub_event', entityId: subEventId, before, after },
      ],
    };
  },
};

export const deleteSubEvent: ActionDefinition<
  { subEventId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'subEvents.delete',
  permission: 'subevents.edit',
  subEventOf: (_tx, _ctx, input) => input.subEventId,
  async execute(tx, ctx, { subEventId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const before = await tx.subEvents.find(eventId, subEventId);
    if (!before) throw new ActionError('not_found', 'Sub-event not found');
    if (!(await tx.subEvents.softDelete(eventId, subEventId, expectedVersion))) {
      versionMismatch(await tx.subEvents.find(eventId, subEventId), expectedVersion);
    }
    // Scoped grants lose this sub-event; ones left with no scope go rather than widen.
    const scopesDropped = await tx.access.removeSubEventScopes(eventId, subEventId);
    if (scopesDropped) await tx.access.bumpRolesVersion(eventId);
    return {
      result: undefined,
      ...(scopesDropped ? { outbox: [permissionsChanged(eventId)] } : {}),
      activity: [
        { action: 'delete', entityType: 'sub_event', entityId: subEventId, before, after: null },
      ],
    };
  },
};

// ---- Restores (undo of a delete) ------------------------------------------------------------

/** Brings back a soft-deleted venue. Sub-events it was cleared from stay without one. */
export const restoreVenue: ActionDefinition<{ venueId: string }, Venue, CoreTx> = {
  name: 'venues.restore',
  permission: 'subevents.edit',
  async execute(tx, ctx, { venueId }) {
    const after = await tx.venues.restore(ctx.eventId!, venueId);
    if (!after) throw new ActionError('not_found', 'Venue not found');
    return {
      result: after,
      activity: [
        { action: 'restore', entityType: 'venue', entityId: venueId, before: null, after },
      ],
    };
  },
};

/** Brings back a soft-deleted sub-event; its venue is cleared if that was deleted meanwhile. */
export const restoreSubEvent: ActionDefinition<{ subEventId: string }, SubEvent, CoreTx> = {
  name: 'subEvents.restore',
  permission: 'subevents.edit',
  subEventOf: (_tx, _ctx, input) => input.subEventId,
  async execute(tx, ctx, { subEventId }) {
    const eventId = ctx.eventId!;
    let after = await tx.subEvents.restore(eventId, subEventId);
    if (!after) throw new ActionError('not_found', 'Sub-event not found');
    if (after.venueId && !(await tx.venues.find(eventId, after.venueId))) {
      after = (await tx.subEvents.update(eventId, subEventId, after.version, { venueId: null }))!;
    }
    return {
      result: after,
      activity: [
        { action: 'restore', entityType: 'sub_event', entityId: subEventId, before: null, after },
      ],
    };
  },
};
