import { describe, expect, it, vi } from 'vitest';

import { runScheduledJob, type ScheduledDeps } from './scheduled-jobs';

const NOW = new Date('2027-02-01T04:30:00Z');
const DAY = 86_400_000;

function deps(overrides: Partial<ScheduledDeps> = {}): ScheduledDeps {
  return {
    deletePublishedOutbox: vi.fn().mockResolvedValue(3),
    deleteExpiredIdempotencyKeys: vi.fn().mockResolvedValue(2),
    deleteReadNotifications: vi.fn().mockResolvedValue(1),
    eventsWithTasksDue: vi.fn().mockResolvedValue([]),
    notifyDueTasks: vi.fn().mockResolvedValue({ notified: 0 }),
    mediaToRemove: vi.fn().mockResolvedValue([]),
    removeFiles: vi.fn().mockResolvedValue(undefined),
    forgetMedia: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('scheduled jobs', () => {
  it('keep published outbox rows 7 days and read notifications 90', async () => {
    const outbox = vi.fn().mockResolvedValue(3);
    const notifications = vi.fn().mockResolvedValue(1);
    const keys = vi.fn().mockResolvedValue(2);
    const d = deps({
      deletePublishedOutbox: outbox,
      deleteReadNotifications: notifications,
      deleteExpiredIdempotencyKeys: keys,
    });
    expect(await runScheduledJob('outbox-cleanup', d, NOW, 'r')).toBe(3);
    expect(outbox).toHaveBeenCalledWith(new Date(NOW.getTime() - 7 * DAY));
    expect(await runScheduledJob('notifications-cleanup', d, NOW, 'r')).toBe(1);
    expect(notifications).toHaveBeenCalledWith(new Date(NOW.getTime() - 90 * DAY));
    expect(await runScheduledJob('idempotency-cleanup', d, NOW, 'r')).toBe(2);
    expect(keys).toHaveBeenCalledWith(NOW);
  });

  it('runs the due-task reminder per event as the system, and fails after trying them all', async () => {
    const notifyDueTasks = vi
      .fn()
      .mockRejectedValueOnce(new Error('lock timeout'))
      .mockResolvedValueOnce({ notified: 4 });
    const d = deps({
      eventsWithTasksDue: vi.fn().mockResolvedValue([
        { eventId: 'e1', dueOn: '2027-02-01' },
        { eventId: 'e2', dueOn: '2027-01-31' },
      ]),
      notifyDueTasks,
    });
    await expect(runScheduledJob('task-due-scan', d, NOW, 'job_1')).rejects.toThrow(
      '1 events failed',
    );
    expect(notifyDueTasks).toHaveBeenCalledTimes(2);
    expect(notifyDueTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventId: 'e2',
        channel: 'system',
        actor: { kind: 'system', name: 'scheduler' },
        requestId: 'job_1',
      }),
      { dueOn: '2027-01-31' },
    );
  });

  it('removes old media files per bucket, then forgets their rows', async () => {
    const removeFiles = vi.fn().mockResolvedValue(undefined);
    const forgetMedia = vi.fn().mockResolvedValue(2);
    const d = deps({
      mediaToRemove: vi.fn().mockResolvedValue([
        { id: 'a', bucket: 'public', keys: ['a-320.webp', 'a-1600.webp'] },
        { id: 'b', bucket: 'private', keys: ['b.pdf'] },
      ]),
      removeFiles,
      forgetMedia,
    });
    expect(await runScheduledJob('media-cleanup', d, NOW, 'req')).toBe(2);
    expect(removeFiles).toHaveBeenCalledWith('public', ['a-320.webp', 'a-1600.webp']);
    expect(removeFiles).toHaveBeenCalledWith('private', ['b.pdf']);
    expect(forgetMedia).toHaveBeenCalledWith(['a', 'b']);
  });
});
