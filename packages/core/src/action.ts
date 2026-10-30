import type { Permission } from '@pme/contracts';

import type { ActionContext } from './context.js';
import { ActionError } from './errors.js';
import { liveSignals } from './live.js';

/**
 * activity_log row an action asks to write. `action` is the verb (create, update, delete,
 * join…); the log stores `<entityType>.<verb>`. For updates, runAction keeps only the fields
 * that changed in before and after (DatabaseDesign "activity_log").
 */
export interface ActivityEntry {
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  /** For actions outside an event context (events.create, accepting an invite). */
  eventId?: string;
  /** Set by undo on the entries it writes: the entry being undone. */
  undoOfId?: string;
}

/** outbox row an action asks to write; dedupeKey becomes the BullMQ job id (build it with `jobId()`). */
export interface OutboxMessage {
  topic: string;
  dedupeKey: string;
  payload: unknown;
  availableAt?: Date;
}

export interface ActionOutcome<TResult> {
  result: TResult;
  activity?: ActivityEntry[];
  outbox?: OutboxMessage[];
}

export interface ActionDefinition<TInput, TResult, TTx> {
  name: string;
  /** Permission from the catalog, or null for actions any signed-in user may run. */
  permission: Permission | null;
  /**
   * The sub-event the target belongs to, so a grant scoped to it counts (APIDesign
   * "Authorization"). Omitted, or returning null: only a whole-event grant does.
   */
  subEventOf?(tx: TTx, ctx: ActionContext, input: TInput): Promise<string | null> | string | null;
  /**
   * Set for the few actions that run before there is an event in context: account actions,
   * events.create (which makes the event) and accepting an invite (the token names it).
   * Every other action is refused when ctx.eventId is null, so tenancy can't be skipped.
   */
  outsideEvent?: true;
  /**
   * Why this action writes no activity_log row. Without it, execute must return `activity`:
   * leaving it out is a bug and rolls back; `activity: []` says nothing changed.
   */
  noActivity?: string;
  execute(tx: TTx, ctx: ActionContext, input: TInput): Promise<ActionOutcome<TResult>>;
}

/**
 * What runAction needs from the outside world. Structural, so core stays free of
 * NestJS and Drizzle; packages/db provides the real implementation.
 */
export interface ActionRuntime<TTx> {
  /** Opens one transaction (with local lock and statement timeouts) and commits or rolls back. */
  transaction<T>(fn: (tx: TTx) => Promise<T>): Promise<T>;
  /** Throws not_found for non-members and forbidden (naming the permission) for the rest. */
  checkPermission(
    tx: TTx,
    ctx: ActionContext,
    permission: Permission,
    subEventId: string | null,
  ): Promise<void>;
  recordActivity(tx: TTx, ctx: ActionContext, entries: ActivityEntry[]): Promise<void>;
  writeOutbox(tx: TTx, ctx: ActionContext, messages: OutboxMessage[]): Promise<void>;
}

/**
 * The one way to write: permission check, the change, activity log and outbox rows,
 * all in a single transaction (CLAUDE.md rules 1 and 2, SystemDesign 5.1).
 */
export async function runAction<TInput, TResult, TTx>(
  runtime: ActionRuntime<TTx>,
  ctx: ActionContext,
  action: ActionDefinition<TInput, TResult, TTx>,
  input: TInput,
): Promise<TResult> {
  if (!action.outsideEvent && ctx.eventId === null) {
    throw new Error(`${action.name} needs an event in its context`);
  }
  return runtime.transaction(async (tx) => {
    if (action.permission !== null) {
      const subEventId = (await action.subEventOf?.(tx, ctx, input)) ?? null;
      await runtime.checkPermission(tx, ctx, action.permission, subEventId);
    }
    const outcome = await action.execute(tx, ctx, input);
    if (outcome.activity === undefined && action.noActivity === undefined) {
      throw new Error(
        `${action.name} returned no activity entry and declares no noActivity reason`,
      );
    }
    if (outcome.activity?.length) {
      await runtime.recordActivity(tx, ctx, outcome.activity.map(changedOnly));
    }
    // Every logged change also tells open screens (CLAUDE.md rule 11), from the full rows.
    const outbox = [...(outcome.outbox ?? []), ...liveSignals(ctx, outcome.activity ?? [])];
    if (outbox.length) {
      await runtime.writeOutbox(tx, ctx, outbox);
    }
    return outcome.result;
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * An update keeps only the fields whose values differ. Creates and deletes (one side null)
 * and list snapshots (arrays, like a module set) are stored whole.
 */
export function changedOnly(entry: ActivityEntry): ActivityEntry {
  const { before, after } = entry;
  if (!isRecord(before) || !isRecord(after)) return entry;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [...keys].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  return {
    ...entry,
    before: Object.fromEntries(changed.map((key) => [key, before[key] ?? null])),
    after: Object.fromEntries(changed.map((key) => [key, after[key] ?? null])),
  };
}

/**
 * Placeholder hooks until milestones 4 (permissions) and 5 (activity log, outbox).
 * Permission checks fail closed so nothing ships unguarded by accident.
 */
export const placeholderHooks: Omit<ActionRuntime<unknown>, 'transaction'> = {
  checkPermission(_tx, _ctx, permission) {
    // TODO(M4): resolve effective permissions incl. sub-event scope.
    return Promise.reject(
      new ActionError('forbidden', `Permission checks are not implemented yet (${permission})`),
    );
  },
  recordActivity() {
    // TODO(M5): insert activity_log rows.
    return Promise.resolve();
  },
  writeOutbox() {
    // TODO(M5): insert outbox rows.
    return Promise.resolve();
  },
};
