import type { ActionContext } from './context.js';
import { ActionError } from './errors.js';

/** activity_log row an action asks to write (shape firms up in milestone 5). */
export interface ActivityEntry {
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
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
  permission: string | null;
  execute(tx: TTx, ctx: ActionContext, input: TInput): Promise<ActionOutcome<TResult>>;
}

/**
 * What runAction needs from the outside world. Structural, so core stays free of
 * NestJS and Drizzle; packages/db provides the real implementation.
 */
export interface ActionRuntime<TTx> {
  /** Opens one transaction (with local lock and statement timeouts) and commits or rolls back. */
  transaction<T>(fn: (tx: TTx) => Promise<T>): Promise<T>;
  checkPermission(tx: TTx, ctx: ActionContext, permission: string): Promise<void>;
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
  return runtime.transaction(async (tx) => {
    if (action.permission !== null) {
      await runtime.checkPermission(tx, ctx, action.permission);
    }
    const outcome = await action.execute(tx, ctx, input);
    if (outcome.activity?.length) {
      await runtime.recordActivity(tx, ctx, outcome.activity);
    }
    if (outcome.outbox?.length) {
      await runtime.writeOutbox(tx, ctx, outcome.outbox);
    }
    return outcome.result;
  });
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
