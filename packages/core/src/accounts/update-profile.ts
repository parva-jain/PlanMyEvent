import type { UpdateMe } from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import { ActionError } from '../errors.js';
import type { CoreTx } from '../ports.js';

/**
 * A user edits their own profile (APIDesign PATCH /v1/me). Only the signed-in user can run
 * it on themselves, so it needs no event permission. Not event-scoped: no activity row.
 */
export const updateProfile: ActionDefinition<UpdateMe, void, CoreTx> = {
  name: 'accounts.updateProfile',
  permission: null,
  async execute(tx, ctx, input) {
    if (ctx.actor.kind !== 'user') {
      throw new ActionError('forbidden', 'Only a signed-in user can change their profile');
    }
    const found = await tx.users.updateProfile(ctx.actor.userId, input);
    if (!found) {
      throw new ActionError('not_found', 'User not found');
    }
    return { result: undefined };
  },
};
