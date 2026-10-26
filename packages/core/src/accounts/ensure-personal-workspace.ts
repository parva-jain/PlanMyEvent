import type { ActionDefinition } from '../action.js';
import type { CoreTx, PersonalWorkspace } from '../ports.js';

export interface EnsurePersonalWorkspaceInput {
  userId: string;
  userName: string;
}

/** "Parv's workspace" from "Parv Jain"; never shown in the MVP, which hides workspaces. */
export function personalWorkspaceName(userName: string): string {
  const first = userName.trim().split(/\s+/)[0];
  return first ? `${first}'s workspace` : 'My workspace';
}

/**
 * Every user has exactly one hidden personal workspace (PRD 1). Runs right after sign-up and
 * again whenever it's found missing, so it is idempotent: a second call returns the same
 * workspace. Not event-scoped, so no activity log row.
 */
export const ensurePersonalWorkspace: ActionDefinition<
  EnsurePersonalWorkspaceInput,
  PersonalWorkspace,
  CoreTx
> = {
  name: 'accounts.ensurePersonalWorkspace',
  permission: null,
  async execute(tx, _ctx, input) {
    const existing = await tx.workspaces.findPersonal(input.userId);
    if (existing) {
      return { result: existing };
    }
    const { workspace } = await tx.workspaces.createPersonal({
      ownerUserId: input.userId,
      name: personalWorkspaceName(input.userName),
    });
    return { result: workspace };
  },
};
