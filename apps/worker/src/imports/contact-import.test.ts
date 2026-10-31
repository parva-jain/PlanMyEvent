import { type ContactImportJob, type ContactImportResult, type LiveSignal } from '@pme/contracts';
import { ActionError } from '@pme/core';
import { describe, expect, it } from 'vitest';

import { failContactImport, runContactImport, type ImportDeps } from './contact-import';
import { jobStatusStore } from './job-status';

const IMPORT_ID = '0192f7aa-0000-7000-8000-000000000001';
const EVENT_ID = '0192f7aa-0000-7000-8000-000000000002';
const USER_ID = '0192f7aa-0000-7000-8000-000000000003';

function job(rows: number): ContactImportJob {
  const lines = Array.from(
    { length: rows },
    (_, index) => `Guest ${index + 1},Family ${index % 2}`,
  );
  return {
    importId: IMPORT_ID,
    eventId: EVENT_ID,
    userId: USER_ID,
    csv: `Name,Family\n${lines.join('\n')}\n`,
    mapping: { name: ['Name'], household: 'Family' },
  };
}

function deps(failOnChunk?: number) {
  const values = new Map<string, string>();
  const statuses = jobStatusStore({
    get: (key) => Promise.resolve(values.get(key) ?? null),
    set: (key, value) => Promise.resolve(values.set(key, value)),
  });
  const chunks: { size: number; firstLine: number; sizes: Record<string, number> }[] = [];
  const signals: LiveSignal[] = [];
  const fake: ImportDeps = {
    statuses,
    publish: (signal) => {
      signals.push(signal);
      return Promise.resolve();
    },
    importChunk: (ctx, input) => {
      if (chunks.length === failOnChunk) return Promise.reject(new Error('database went away'));
      expect(ctx).toMatchObject({ eventId: EVENT_ID, actor: { kind: 'user', userId: USER_ID } });
      chunks.push({
        size: input.rows.length,
        firstLine: input.rows[0]!.line,
        sizes: input.householdSizes,
      });
      const result: ContactImportResult = {
        created: input.rows.length,
        updated: 0,
        skipped: 0,
        householdsCreated: 0,
        errorCount: 1,
        errors: [{ line: input.rows[0]!.line, message: 'Something odd' }],
      };
      return Promise.resolve(result);
    },
  };
  return { fake, statuses, chunks, signals };
}

describe('contact import job', () => {
  it('imports 500 rows per chunk, adding up the results and reporting progress', async () => {
    const { fake, statuses, chunks, signals } = deps();
    await runContactImport(job(1_200), fake);
    expect(chunks.map((chunk) => [chunk.size, chunk.firstLine])).toEqual([
      [500, 2],
      [500, 502],
      [200, 1002],
    ]);
    // Households are counted over the whole file, not one chunk.
    expect(chunks[0]!.sizes).toEqual({ 'family 0': 600, 'family 1': 600 });
    expect(await statuses.get(IMPORT_ID)).toMatchObject({
      status: 'succeeded',
      userId: USER_ID,
      progress: { done: 1_200, total: 1_200 },
      result: {
        created: 1_200,
        errorCount: 3,
        errors: [{ line: 2 }, { line: 502 }, { line: 1002 }],
      },
    });
    expect(signals.at(-1)).toMatchObject({
      kind: 'emit',
      room: `user:${USER_ID}`,
      event: 'job.progress',
      data: { jobId: IMPORT_ID, status: 'succeeded', done: 1_200, total: 1_200 },
    });
  });

  it('resumes after the last finished chunk when retried', async () => {
    const first = deps(1);
    await expect(runContactImport(job(1_200), first.fake)).rejects.toThrow('database went away');
    expect(await first.statuses.get(IMPORT_ID)).toMatchObject({
      status: 'running',
      progress: { done: 500 },
    });
    // The retry shares the status store.
    const retry = deps();
    retry.fake.statuses = first.statuses;
    await runContactImport(job(1_200), retry.fake);
    expect(retry.chunks.map((chunk) => chunk.firstLine)).toEqual([502, 1002]);
    expect(await first.statuses.get(IMPORT_ID)).toMatchObject({
      status: 'succeeded',
      result: { created: 1_200 },
    });
  });

  it('a failure says why and keeps what was saved', async () => {
    const { fake, statuses } = deps(1);
    await expect(runContactImport(job(800), fake)).rejects.toThrow();
    await failContactImport(job(800), fake, new ActionError('forbidden', 'No'));
    expect(await statuses.get(IMPORT_ID)).toMatchObject({
      status: 'failed',
      error: "You can no longer edit this event's guests",
      progress: { done: 500, total: 800 },
      result: { created: 500 },
    });
  });
});
