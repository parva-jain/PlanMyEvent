import {
  IMPORT_CHUNK_SIZE,
  importRows,
  MAX_IMPORT_ERRORS,
  parseCsv,
  userRoom,
  type ContactImportJob,
  type ContactImportResult,
  type ContactImportRow,
  type LiveSignal,
  type StoredJobStatus,
} from '@pme/contracts';
import { ActionError, type ActionContext } from '@pme/core';

import type { JobStatusStore } from './job-status';

export interface ImportDeps {
  /** One chunk through core's importContacts (runAction), as the member in ctx. */
  importChunk(
    ctx: ActionContext,
    input: {
      importId: string;
      rows: ContactImportRow[];
      householdSizes: Record<string, number>;
    },
  ): Promise<ContactImportResult>;
  statuses: JobStatusStore;
  publish(signal: LiveSignal): Promise<void>;
}

const empty = (): ContactImportResult => ({
  created: 0,
  updated: 0,
  skipped: 0,
  householdsCreated: 0,
  errorCount: 0,
  errors: [],
});

function add(total: ContactImportResult, chunk: ContactImportResult): ContactImportResult {
  return {
    created: total.created + chunk.created,
    updated: total.updated + chunk.updated,
    skipped: total.skipped + chunk.skipped,
    householdsCreated: total.householdsCreated + chunk.householdsCreated,
    errorCount: total.errorCount + chunk.errorCount,
    errors: [...total.errors, ...chunk.errors].slice(0, MAX_IMPORT_ERRORS),
  };
}

/** The member lost guests.edit or left, or the event is gone: retrying won't help. */
export const isPermanent = (error: unknown) =>
  error instanceof ActionError && (error.code === 'forbidden' || error.code === 'not_found');

/**
 * Runs a CSV import (SystemDesign 5.3 "imports"): 500 rows per transaction, as the member who
 * started it, so their permissions are checked again for every chunk. After each chunk the
 * status is saved and the member's sockets hear job.progress. A retry resumes after the last
 * finished chunk; rows matched by phone or email wouldn't duplicate anyway.
 */
export async function runContactImport(job: ContactImportJob, deps: ImportDeps): Promise<void> {
  const rows = importRows(parseCsv(job.csv), job.mapping);
  const householdSizes: Record<string, number> = {};
  for (const row of rows) {
    const name = row.household.trim().toLowerCase();
    if (name) householdSizes[name] = (householdSizes[name] ?? 0) + 1;
  }
  const previous = await deps.statuses.get(job.importId);
  let status: StoredJobStatus = {
    jobId: job.importId,
    kind: 'contacts.import',
    eventId: job.eventId,
    userId: job.userId,
    status: 'running',
    progress: { done: previous?.progress.done ?? 0, total: rows.length },
    result: previous?.result ?? empty(),
    error: null,
  };
  const report = async (next: StoredJobStatus) => {
    status = next;
    await deps.statuses.set(next);
    await deps
      .publish({
        kind: 'emit',
        room: userRoom(job.userId),
        event: 'job.progress',
        data: {
          jobId: next.jobId,
          eventId: next.eventId,
          status: next.status,
          done: next.progress.done,
          total: next.progress.total,
        },
      })
      .catch(() => undefined);
  };
  await report(status);

  const ctx: ActionContext = {
    requestId: job.importId,
    channel: 'app',
    actor: { kind: 'user', userId: job.userId, memberId: null },
    eventId: job.eventId,
    now: new Date(),
  };
  for (let start = status.progress.done; start < rows.length; start += IMPORT_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + IMPORT_CHUNK_SIZE);
    const result = await deps.importChunk(
      { ...ctx, now: new Date() },
      { importId: job.importId, rows: chunk, householdSizes },
    );
    await report({
      ...status,
      progress: { done: start + chunk.length, total: rows.length },
      result: add(status.result ?? empty(), result),
    });
  }
  await report({ ...status, status: 'succeeded' });
}

/** Records a failure the member can read: what went wrong and what was already saved. */
export async function failContactImport(
  job: ContactImportJob,
  deps: ImportDeps,
  error: unknown,
): Promise<void> {
  const previous = await deps.statuses.get(job.importId);
  const message =
    error instanceof ActionError && error.code === 'forbidden'
      ? "You can no longer edit this event's guests"
      : error instanceof ActionError && error.code === 'not_found'
        ? 'The event is no longer available'
        : 'The import stopped unexpectedly';
  const status: StoredJobStatus = {
    jobId: job.importId,
    kind: 'contacts.import',
    eventId: job.eventId,
    userId: job.userId,
    status: 'failed',
    progress: previous?.progress ?? { done: 0, total: 0 },
    result: previous?.result ?? null,
    error: message,
  };
  await deps.statuses.set(status);
  await deps
    .publish({
      kind: 'emit',
      room: userRoom(job.userId),
      event: 'job.progress',
      data: {
        jobId: status.jobId,
        eventId: status.eventId,
        status: 'failed',
        done: status.progress.done,
        total: status.progress.total,
      },
    })
    .catch(() => undefined);
}
