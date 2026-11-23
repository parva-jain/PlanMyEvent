import { LIVE_TOPIC, type LiveSignal, type MediaJob } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { runAction, type ActionDefinition } from '../action.js';
import type { CoreTx } from '../ports.js';
import { createBudgetCategory, createExpense } from '../budget/budget-actions.js';
import { ctxFor, testWedding } from '../testing/wedding.js';
import {
  completeUpload,
  createGalleryUpload,
  createReceiptUpload,
  deleteMedia,
  finishMediaProcessing,
  updateMedia,
} from './media-actions.js';

async function wedding() {
  const wedding = await testWedding();
  await wedding.addMember('editor', [{ roleId: wedding.role('Editor').id, subEventIds: [] }]);
  await wedding.addMember('helper', [{ roleId: wedding.role('Helper').id, subEventIds: [] }]);
  /** Runs an action as the media worker. */
  const asWorker = <I, R>(action: ActionDefinition<I, R, CoreTx>, input: I) =>
    runAction(
      wedding.runtime,
      {
        ...ctxFor('system', wedding.event.id),
        actor: { kind: 'system', name: 'media' },
        channel: 'system',
      },
      action,
      input,
    );
  const photo = { kind: 'gallery' as const, mime: 'image/jpeg' as const, bytes: 420_000 };
  return { ...wedding, asWorker, photo };
}

describe('uploads', () => {
  it('a helper uploads a gallery photo: pending, public, keyed under the event', async () => {
    const { run, event, photo, subEvent } = await wedding();
    const haldi = subEvent('Haldi');
    const row = await run('helper', createGalleryUpload, { ...photo, subEventId: haldi.id });
    expect(row).toMatchObject({
      kind: 'gallery',
      status: 'pending',
      bucket: 'public',
      subEventId: haldi.id,
      uploadedByUserId: 'helper',
      uploadedAt: null,
    });
    expect(row.storageKey).toBe(`events/${event.id}/gallery/${row.id}.jpg`);
  });

  it('keeps receipts private and needs budget.edit; gallery uploads must be photos', async () => {
    const { run, photo } = await wedding();
    const receipt = await run('editor', createReceiptUpload, {
      kind: 'receipt',
      mime: 'application/pdf',
      bytes: 90_000,
    });
    expect(receipt).toMatchObject({ bucket: 'private', kind: 'receipt' });
    expect(receipt.storageKey.endsWith('.pdf')).toBe(true);
    await expect(
      run('helper', createReceiptUpload, { kind: 'receipt', mime: 'image/png', bytes: 1 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      run('helper', createGalleryUpload, { ...photo, mime: 'application/pdf' }),
    ).rejects.toMatchObject({ code: 'unsupported_media_type' });
  });

  it('confirming logs the upload once and queues the worker; only the uploader confirms', async () => {
    const { run, photo, outbox, activity, event } = await wedding();
    const row = await run('helper', createGalleryUpload, photo);
    await expect(run('editor', completeUpload, { mediaId: row.id })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await run('helper', completeUpload, { mediaId: row.id });
    await run('helper', completeUpload, { mediaId: row.id });
    const jobs = outbox.filter((message) => message.topic === 'media.process');
    expect(jobs).toEqual([
      expect.objectContaining({
        payload: { mediaId: row.id, eventId: event.id } satisfies MediaJob,
      }),
    ]);
    expect(activity.filter((entry) => entry.action === 'media.upload')).toHaveLength(1);
  });

  it('the worker marks it ready with its versions and tells open screens', async () => {
    const { run, asWorker, photo, outbox, media } = await wedding();
    const row = await run('helper', createGalleryUpload, photo);
    await run('helper', completeUpload, { mediaId: row.id });
    await asWorker(finishMediaProcessing, {
      mediaId: row.id,
      outcome: {
        status: 'ready',
        mime: 'image/webp',
        bytes: 120_000,
        width: 1600,
        height: 1067,
        variants: { thumb: 'a-320.webp', display: 'a-1600.webp' },
      },
    });
    expect(media.get(row.id)).toMatchObject({ status: 'ready', width: 1600 });
    const signal = outbox
      .filter((message) => message.topic === LIVE_TOPIC)
      .map((message) => message.payload as LiveSignal)
      .find(
        (item) =>
          item.kind === 'emit' && item.data.entityId === row.id && item.data.op === 'updated',
      );
    expect(signal).toBeDefined();
    // Members can't pretend to be the worker.
    await expect(
      run('editor', finishMediaProcessing, { mediaId: row.id, outcome: { status: 'failed' } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('captions, albums and deleting need gallery.manage', async () => {
    const { run, photo, subEvent } = await wedding();
    const row = await run('helper', createGalleryUpload, photo);
    await expect(
      run('helper', updateMedia, {
        mediaId: row.id,
        expectedVersion: 1,
        changes: { caption: 'x' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const after = await run('owner', updateMedia, {
      mediaId: row.id,
      expectedVersion: 1,
      changes: { caption: 'The haldi', subEventId: subEvent('Haldi').id },
    });
    expect(after).toMatchObject({ caption: 'The haldi', version: 2 });
    await expect(
      run('owner', deleteMedia, { mediaId: row.id, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'version_conflict' });
    await run('owner', deleteMedia, { mediaId: row.id, expectedVersion: 2 });
    await expect(
      run('owner', updateMedia, { mediaId: row.id, expectedVersion: 3, changes: { caption: 'y' } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('receipts on expenses', () => {
  it('an expense takes a receipt of this event, not a gallery photo', async () => {
    const { run, photo } = await wedding();
    const category = await run('owner', createBudgetCategory, { name: 'Receipts test' });
    const receipt = await run('owner', createReceiptUpload, {
      kind: 'receipt',
      mime: 'image/jpeg',
      bytes: 10_000,
    });
    const expense = await run('owner', createExpense, {
      categoryId: category.id,
      title: 'Flowers',
      amountPaise: 500_000,
      receiptMediaId: receipt.id,
    });
    expect(expense.receiptMediaId).toBe(receipt.id);
    const gallery = await run('owner', createGalleryUpload, photo);
    await expect(
      run('owner', createExpense, {
        categoryId: category.id,
        title: 'Lights',
        amountPaise: 100_000,
        receiptMediaId: gallery.id,
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});
