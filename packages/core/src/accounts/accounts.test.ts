import { describe, expect, it } from 'vitest';

import { runAction } from '../action.js';
import type { ActionContext } from '../context.js';
import { memoryRuntime } from '../testing/memory-tx.js';
import { ensurePersonalWorkspace, personalWorkspaceName } from './ensure-personal-workspace.js';
import { queueSignInCode } from './queue-sign-in-code.js';
import { updateProfile } from './update-profile.js';

const ctx: ActionContext = {
  requestId: 'req_test',
  channel: 'system',
  actor: { kind: 'system', name: 'auth' },
  eventId: null,
  now: new Date('2026-10-26T00:00:00Z'),
};
const userCtx: ActionContext = {
  ...ctx,
  channel: 'app',
  actor: { kind: 'user', userId: 'u1', memberId: null },
};

describe('ensurePersonalWorkspace', () => {
  it('creates the workspace once and returns the same one afterwards', async () => {
    const { runtime, workspaces } = memoryRuntime();
    const input = { userId: 'u1', userName: 'Priya Sharma' };

    const first = await runAction(runtime, ctx, ensurePersonalWorkspace, input);
    const second = await runAction(runtime, ctx, ensurePersonalWorkspace, input);

    expect(first).toMatchObject({ name: "Priya's workspace", plan: 'free' });
    expect(second).toEqual(first);
    expect(workspaces.size).toBe(1);
  });

  it('names the workspace after the first name, with a fallback', () => {
    expect(personalWorkspaceName('  Arjun   Mehta ')).toBe("Arjun's workspace");
    expect(personalWorkspaceName('')).toBe('My workspace');
  });
});

describe('queueSignInCode', () => {
  it('writes one email.critical outbox row and sends nothing directly', async () => {
    const { runtime, outbox } = memoryRuntime();

    await runAction(runtime, ctx, queueSignInCode, {
      email: 'Neha@Example.com',
      code: '123456',
      expiresInMinutes: 5,
    });

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      topic: 'email.critical',
      payload: { template: 'sign-in-code', to: 'neha@example.com', code: '123456' },
    });
  });

  it('derives a stable dedupe key that reveals neither the email nor the code', async () => {
    const send = async (code: string) => {
      const { runtime, outbox } = memoryRuntime();
      await runAction(runtime, ctx, queueSignInCode, {
        email: 'neha@example.com',
        code,
        expiresInMinutes: 5,
      });
      return outbox[0]!.dedupeKey;
    };

    const key = await send('123456');
    expect(await send('123456')).toBe(key);
    expect(await send('654321')).not.toBe(key);
    expect(key).toMatch(/^sign-in-code-[0-9a-f]{32}$/);
  });
});

describe('updateProfile', () => {
  it("changes the signed-in user's own profile", async () => {
    const { runtime, profiles } = memoryRuntime();
    profiles.set('u1', {});
    await runAction(runtime, userCtx, updateProfile, {
      name: 'Neha Verma',
      phone: '+919876543210',
    });
    expect(profiles.get('u1')).toEqual({ name: 'Neha Verma', phone: '+919876543210' });
  });

  it('refuses non-user actors and unknown users', async () => {
    const { runtime } = memoryRuntime();
    await expect(runAction(runtime, ctx, updateProfile, { name: 'X' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(runAction(runtime, userCtx, updateProfile, { name: 'X' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('refuses a change with nothing in it', async () => {
    const { runtime, profiles } = memoryRuntime();
    profiles.set('u1', { name: 'Neha' });
    await expect(runAction(runtime, userCtx, updateProfile, {})).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(profiles.get('u1')).toEqual({ name: 'Neha' });
  });
});
