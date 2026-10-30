import {
  normalizePhone,
  type Contact,
  type CreateContact,
  type CreateHousehold,
  type Household,
  type UpdateContact,
  type UpdateHousehold,
} from '@pme/contracts';

import type { ActivityEntry, ActionDefinition } from '../action.js';
import type { ActionContext } from '../context.js';
import { ActionError } from '../errors.js';
import { versionMismatch } from '../events/versioned.js';
import type { CoreTx, NewContact } from '../ports.js';

/*
 * Contacts and households (PRD "Contacts and households"). Both belong to the whole event,
 * so every action needs guests.edit without a sub-event scope; who may see which guests by
 * sub-event comes with invitations.
 */

const fieldError = (path: string, message: string) =>
  new ActionError('validation_failed', message, { fields: [{ path, message }] });

async function findHousehold(tx: CoreTx, ctx: ActionContext, householdId: string) {
  const household = await tx.households.find(ctx.eventId!, householdId);
  if (!household) throw new ActionError('not_found', 'Household not found');
  return household;
}

async function findContact(tx: CoreTx, ctx: ActionContext, contactId: string) {
  const contact = await tx.contacts.find(ctx.eventId!, contactId);
  if (!contact) throw new ActionError('not_found', 'Contact not found');
  return contact;
}

async function assertHousehold(
  tx: CoreTx,
  eventId: string,
  householdId: string | null | undefined,
) {
  if (householdId && !(await tx.households.find(eventId, householdId))) {
    throw fieldError('householdId', 'Household not found in this event');
  }
}

/** E.164 for storage; the schema already refused what can't be one. */
function phoneOf(phone: string | null | undefined) {
  if (phone === undefined || phone === null) return phone;
  const normalized = normalizePhone(phone);
  if (!normalized) throw fieldError('phone', 'Enter a valid phone number');
  return normalized;
}

/**
 * A contact leaving its household (moved or deleted) stops being its primary contact; the
 * household's change is logged as its own entry.
 */
async function releasePrimary(
  tx: CoreTx,
  eventId: string,
  householdId: string | null,
  contactId: string,
): Promise<ActivityEntry[]> {
  if (!householdId) return [];
  const before = await tx.households.find(eventId, householdId);
  if (before?.primaryContactId !== contactId) return [];
  const after = await tx.households.update(eventId, householdId, before.version, {
    primaryContactId: null,
  });
  if (!after) versionMismatch(await tx.households.find(eventId, householdId), before.version);
  return [{ action: 'update', entityType: 'household', entityId: householdId, before, after }];
}

// ---- Households -------------------------------------------------------------------------------

export const createHousehold: ActionDefinition<CreateHousehold, Household, CoreTx> = {
  name: 'households.create',
  permission: 'guests.edit',
  async execute(tx, ctx, input) {
    const [household] = await tx.households.insert(ctx.eventId!, [input]);
    return {
      result: household!,
      activity: [
        {
          action: 'create',
          entityType: 'household',
          entityId: household!.id,
          before: null,
          after: household,
        },
      ],
    };
  },
};

/** The primary contact must be one of the household's own contacts. */
export const updateHousehold: ActionDefinition<
  { householdId: string; expectedVersion: number; changes: UpdateHousehold },
  Household,
  CoreTx
> = {
  name: 'households.update',
  permission: 'guests.edit',
  async execute(tx, ctx, { householdId, expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const before = await findHousehold(tx, ctx, householdId);
    if (changes.primaryContactId) {
      const contact = await tx.contacts.find(eventId, changes.primaryContactId);
      if (contact?.householdId !== householdId) {
        throw fieldError('primaryContactId', 'Choose someone from this household');
      }
    }
    const after = await tx.households.update(eventId, householdId, expectedVersion, changes);
    if (!after) versionMismatch(await tx.households.find(eventId, householdId), expectedVersion);
    return {
      result: after,
      activity: [
        { action: 'update', entityType: 'household', entityId: householdId, before, after },
      ],
    };
  },
};

/**
 * Soft delete. Its contacts stay, read as not in a household; restoring it (undo) links them
 * again, since their household_id is untouched.
 */
export const deleteHousehold: ActionDefinition<
  { householdId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'households.delete',
  permission: 'guests.edit',
  async execute(tx, ctx, { householdId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const before = await findHousehold(tx, ctx, householdId);
    if (!(await tx.households.softDelete(eventId, householdId, expectedVersion))) {
      versionMismatch(await tx.households.find(eventId, householdId), expectedVersion);
    }
    return {
      result: undefined,
      activity: [
        { action: 'delete', entityType: 'household', entityId: householdId, before, after: null },
      ],
    };
  },
};

export const restoreHousehold: ActionDefinition<{ householdId: string }, Household, CoreTx> = {
  name: 'households.restore',
  permission: 'guests.edit',
  async execute(tx, ctx, { householdId }) {
    const after = await tx.households.restore(ctx.eventId!, householdId);
    if (!after) throw new ActionError('not_found', 'Household not found');
    return {
      result: after,
      activity: [
        { action: 'restore', entityType: 'household', entityId: householdId, before: null, after },
      ],
    };
  },
};

// ---- Contacts ---------------------------------------------------------------------------------

export const createContact: ActionDefinition<CreateContact, Contact, CoreTx> = {
  name: 'contacts.create',
  permission: 'guests.edit',
  async execute(tx, ctx, input) {
    const eventId = ctx.eventId!;
    await assertHousehold(tx, eventId, input.householdId);
    const [contact] = await tx.contacts.insert(eventId, [
      {
        householdId: input.householdId ?? null,
        name: input.name,
        phone: phoneOf(input.phone) ?? null,
        email: input.email ?? null,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
      },
    ]);
    return {
      result: contact!,
      activity: [
        {
          action: 'create',
          entityType: 'contact',
          entityId: contact!.id,
          before: null,
          after: contact,
        },
      ],
    };
  },
};

export const updateContact: ActionDefinition<
  { contactId: string; expectedVersion: number; changes: UpdateContact },
  Contact,
  CoreTx
> = {
  name: 'contacts.update',
  permission: 'guests.edit',
  async execute(tx, ctx, { contactId, expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const before = await findContact(tx, ctx, contactId);
    await assertHousehold(tx, eventId, changes.householdId);
    const { phone, ...rest } = changes;
    const fields: Partial<NewContact> = {
      ...rest,
      ...(phone !== undefined && { phone: phoneOf(phone) }),
    };
    const after = await tx.contacts.update(eventId, contactId, expectedVersion, fields);
    if (!after) versionMismatch(await tx.contacts.find(eventId, contactId), expectedVersion);
    const moved = changes.householdId !== undefined && changes.householdId !== before.householdId;
    return {
      result: after,
      activity: [
        { action: 'update', entityType: 'contact', entityId: contactId, before, after },
        ...(moved ? await releasePrimary(tx, eventId, before.householdId, contactId) : []),
      ],
    };
  },
};

export const deleteContact: ActionDefinition<
  { contactId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'contacts.delete',
  permission: 'guests.edit',
  async execute(tx, ctx, { contactId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const before = await findContact(tx, ctx, contactId);
    if (!(await tx.contacts.softDelete(eventId, contactId, expectedVersion))) {
      versionMismatch(await tx.contacts.find(eventId, contactId), expectedVersion);
    }
    return {
      result: undefined,
      activity: [
        { action: 'delete', entityType: 'contact', entityId: contactId, before, after: null },
        ...(await releasePrimary(tx, eventId, before.householdId, contactId)),
      ],
    };
  },
};

export const restoreContact: ActionDefinition<{ contactId: string }, Contact, CoreTx> = {
  name: 'contacts.restore',
  permission: 'guests.edit',
  async execute(tx, ctx, { contactId }) {
    const after = await tx.contacts.restore(ctx.eventId!, contactId);
    if (!after) throw new ActionError('not_found', 'Contact not found');
    return {
      result: after,
      activity: [
        { action: 'restore', entityType: 'contact', entityId: contactId, before: null, after },
      ],
    };
  },
};
