import type { ValueOf } from '@pme/contracts';

/*
 * What actions need from storage, as interfaces core owns (ports). packages/db implements
 * them with Drizzle inside the action's transaction; tests use fakes. This keeps core free
 * of Drizzle and NestJS (CLAUDE.md, packages/core). Grows milestone by milestone.
 */

export interface PersonalWorkspace {
  id: string;
  name: string;
  plan: ValueOf<'plan'>;
}

export interface WorkspaceStore {
  findPersonal(ownerUserId: string): Promise<PersonalWorkspace | null>;
  /**
   * Inserts the user's personal workspace unless one exists (the unique index makes this
   * safe under concurrency) and returns it either way.
   */
  createPersonal(input: {
    ownerUserId: string;
    name: string;
  }): Promise<{ workspace: PersonalWorkspace; created: boolean }>;
}

/** The transaction handle every action receives. */
export interface CoreTx {
  workspaces: WorkspaceStore;
}
