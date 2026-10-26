import {
  placeholderHooks,
  type ActionRuntime,
  type CoreTx,
  type PersonalWorkspace,
  type UserStore,
  type WorkspaceStore,
} from '@pme/core';
import type { ValueOf } from '@pme/contracts';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from './client.js';
import { users } from './schema/auth.js';
import { outbox } from './schema/outbox.js';
import { workspaces } from './schema/workspaces.js';

/** The Drizzle transaction handle `db.transaction` passes to its callback. */
export type DrizzleTx = Parameters<Parameters<Database['transaction']>[0]>[0];

function toWorkspace(row: { id: string; name: string; plan: string }): PersonalWorkspace {
  return { id: row.id, name: row.name, plan: row.plan as ValueOf<'plan'> };
}

function workspaceStore(db: DrizzleTx): WorkspaceStore {
  const personalOf = (ownerUserId: string) =>
    and(eq(workspaces.ownerUserId, ownerUserId), eq(workspaces.isPersonal, true));

  return {
    async findPersonal(ownerUserId) {
      const [row] = await db.select().from(workspaces).where(personalOf(ownerUserId)).limit(1);
      return row ? toWorkspace(row) : null;
    },
    async createPersonal({ ownerUserId, name }) {
      const [inserted] = await db
        .insert(workspaces)
        .values({ ownerUserId, name, isPersonal: true })
        // A concurrent sign-in may have created it first (unique personal-workspace index).
        .onConflictDoNothing({
          target: workspaces.ownerUserId,
          where: sql`${workspaces.isPersonal}`,
        })
        .returning();
      if (inserted) {
        return { workspace: toWorkspace(inserted), created: true };
      }
      const [existing] = await db.select().from(workspaces).where(personalOf(ownerUserId));
      return { workspace: toWorkspace(existing!), created: false };
    },
  };
}

function userStore(db: DrizzleTx): UserStore {
  return {
    async updateProfile(userId, changes) {
      const updated = await db
        .update(users)
        .set(changes)
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      return updated.length > 0;
    },
  };
}

/** CoreTx backed by one Drizzle transaction; `db` stays reachable for the runtime's own writes. */
export class DbTx implements CoreTx {
  readonly users: UserStore;
  readonly workspaces: WorkspaceStore;

  constructor(readonly db: DrizzleTx) {
    this.users = userStore(db);
    this.workspaces = workspaceStore(db);
  }
}

/** Waits at most this long for a row lock before failing, instead of queueing forever. */
const LOCK_TIMEOUT = '2s';

/**
 * The ActionRuntime that core's `runAction` uses in the API and worker. Permission checks
 * (milestone 4) and the activity log (milestone 5) are still placeholders; the outbox is real.
 */
export function createActionRuntime(db: Database): ActionRuntime<DbTx> {
  return {
    transaction: (fn) =>
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local lock_timeout = '${LOCK_TIMEOUT}'`));
        return fn(new DbTx(tx));
      }),
    checkPermission: placeholderHooks.checkPermission,
    recordActivity: placeholderHooks.recordActivity,
    async writeOutbox(tx, ctx, messages) {
      await tx.db.insert(outbox).values(
        messages.map((message) => ({
          eventId: ctx.eventId,
          topic: message.topic,
          dedupeKey: message.dedupeKey,
          payload: message.payload,
          ...(message.availableAt ? { availableAt: message.availableAt } : {}),
        })),
      );
    },
  };
}
