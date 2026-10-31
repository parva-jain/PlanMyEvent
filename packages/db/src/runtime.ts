import {
  ActionError,
  type AccessStore,
  type BudgetCategoryStore,
  type ActionContext,
  type AttendanceStore,
  type ContactStore,
  type HouseholdStore,
  type InvitationStore,
  type ActivityStore,
  type ActionRuntime,
  type CoreTx,
  type EventStore,
  type ExpenseStore,
  type MemberInviteStore,
  type MemberStore,
  type RoleStore,
  type PersonalWorkspace,
  type SubEventStore,
  type TaskStore,
  type UserStore,
  type VenueStore,
  type WorkspaceStore,
} from '@pme/core';
import { can, type ValueOf } from '@pme/contracts';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from './client.js';
import { users } from './schema/auth.js';
import { contacts, households } from './schema/guests.js';
import { invitations } from './schema/invitations.js';
import { outbox } from './schema/outbox.js';
import { workspaces } from './schema/workspaces.js';
import { activityStore } from './stores/activity.js';
import { budgetCategoryStore, expenseStore } from './stores/budget.js';
import { eventStore, subEventStore, venueStore } from './stores/events.js';
import { contactStore, householdStore } from './stores/guests.js';
import { attendanceStore, invitationStore } from './stores/invitations.js';
import { taskStore } from './stores/tasks.js';
import { accessStore, memberInviteStore, memberStore, roleStore } from './stores/team.js';

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

export interface RuntimeOptions {
  /** Derives invitation link tokens (APIDesign "Link tokens"); the API sets it. */
  invitationLinkKey?: string;
}

/** CoreTx backed by one Drizzle transaction; `db` stays reachable for the runtime's own writes. */
export class DbTx implements CoreTx {
  readonly users: UserStore;
  readonly workspaces: WorkspaceStore;
  readonly events: EventStore;
  readonly venues: VenueStore;
  readonly subEvents: SubEventStore;
  readonly roles: RoleStore;
  readonly members: MemberStore;
  readonly access: AccessStore;
  readonly memberInvites: MemberInviteStore;
  readonly activity: ActivityStore;
  readonly tasks: TaskStore;
  readonly budgetCategories: BudgetCategoryStore;
  readonly expenses: ExpenseStore;
  readonly households: HouseholdStore;
  readonly contacts: ContactStore;
  readonly invitations: InvitationStore;
  readonly attendance: AttendanceStore;

  constructor(
    readonly db: DrizzleTx,
    options: RuntimeOptions = {},
  ) {
    this.users = userStore(db);
    this.workspaces = workspaceStore(db);
    this.events = eventStore(db);
    this.venues = venueStore(db);
    this.subEvents = subEventStore(db);
    this.roles = roleStore(db);
    this.members = memberStore(db);
    this.access = accessStore(db);
    this.memberInvites = memberInviteStore(db);
    this.activity = activityStore(db);
    this.tasks = taskStore(db);
    this.budgetCategories = budgetCategoryStore(db);
    this.expenses = expenseStore(db);
    this.households = householdStore(db);
    this.contacts = contactStore(db);
    this.invitations = invitationStore(db, options.invitationLinkKey);
    this.attendance = attendanceStore(db);
  }
}

/**
 * "Priya Sharma", or the email's local part before Welcome; a guest is "Sharma family (link)"
 * and the system "System". The label is stored, so the log still reads right after a rename.
 */
async function actorLabelOf(tx: DbTx, ctx: ActionContext): Promise<string> {
  if (ctx.actor.kind === 'guest') {
    // "Sharma family (link)": who answered, through their magic link.
    const [guest] = await tx.db
      .select({ name: sql<string | null>`coalesce(${households.name}, ${contacts.name})` })
      .from(invitations)
      .leftJoin(households, eq(households.id, invitations.householdId))
      .leftJoin(contacts, eq(contacts.id, invitations.contactId))
      .where(eq(invitations.id, ctx.actor.invitationId));
    return guest?.name ? `${guest.name} (link)` : 'Guest';
  }
  if (ctx.actor.kind === 'system') return 'System';
  const [user] = await tx.db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, ctx.actor.userId));
  return user?.name.trim() || user?.email.split('@')[0] || 'Someone';
}

/** Waits at most this long for a row lock before failing, instead of queueing forever. */
const LOCK_TIMEOUT = '2s';

/**
 * The ActionRuntime that core's `runAction` uses in the API and worker. Permissions are read
 * inside the action's transaction (never from cache), so a role change committed a moment
 * ago already counts.
 */
export function createActionRuntime(
  db: Database,
  options: RuntimeOptions = {},
): ActionRuntime<DbTx> {
  return {
    transaction: (fn) =>
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local lock_timeout = '${LOCK_TIMEOUT}'`));
        return fn(new DbTx(tx, options));
      }),
    async checkPermission(tx, ctx, permission, subEventId) {
      const access =
        ctx.eventId !== null && ctx.actor.kind === 'user'
          ? await tx.access.forUser(ctx.eventId, ctx.actor.userId)
          : null;
      // Non-members can't tell the event exists (APIDesign "404 or 403").
      if (!access) throw new ActionError('not_found', 'Event not found');
      if (!can(access, permission, subEventId)) {
        throw new ActionError('forbidden', `You need the ${permission} permission`, {
          permission,
        });
      }
    },
    async recordActivity(tx, ctx, entries) {
      const actorLabel = await actorLabelOf(tx, ctx);
      await tx.activity.insert(
        entries.map((entry) => {
          const eventId = entry.eventId ?? ctx.eventId;
          if (!eventId) throw new Error(`Activity for ${entry.entityType} has no event`);
          return {
            eventId,
            actorUserId: ctx.actor.kind === 'user' ? ctx.actor.userId : null,
            actorLabel,
            channel: ctx.channel,
            action: `${entry.entityType}.${entry.action}`,
            entityType: entry.entityType,
            entityId: entry.entityId,
            before: entry.before ?? null,
            after: entry.after ?? null,
            requestId: ctx.requestId,
            undoOfId: entry.undoOfId ?? null,
          };
        }),
      );
    },
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
