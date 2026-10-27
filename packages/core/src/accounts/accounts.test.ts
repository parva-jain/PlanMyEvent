import { describe, expect, it } from 'vitest';

import { runAction, type ActionRuntime, type OutboxMessage } from '../action.js';
import type { ActionContext } from '../context.js';
import type { CoreTx, PersonalWorkspace } from '../ports.js';
import { updateProfile } from './update-profile.js';
import { ensurePersonalWorkspace, personalWorkspaceName } from './ensure-personal-workspace.js';
import { queueSignInCode } from './queue-sign-in-code.js';

/** In-memory stores and an outbox list standing in for packages/db. */
function fakeRuntime() {
  const workspaces = new Map<string, PersonalWorkspace>();
  const outbox: OutboxMessage[] = [];
  let inserts = 0;
  const profiles = new Map<string, { name?: string; phone?: string | null }>([['u1', {}]]);
  const tx: CoreTx = {
    users: {
      updateProfile: (userId, changes) => {
        const profile = profiles.get(userId);
        if (!profile) return Promise.resolve(false);
        Object.assign(profile, changes);
        return Promise.resolve(true);
      },
    },
    workspaces: {
      findPersonal: (ownerUserId) => Promise.resolve(workspaces.get(ownerUserId) ?? null),
      createPersonal: ({ ownerUserId, name }) => {
        inserts += 1;
        const workspace = { id: `ws-${inserts}`, name, plan: 'free' as const };
        workspaces.set(ownerUserId, workspace);
        return Promise.resolve({ workspace, created: true });
      },
    },
  };
  const runtime: ActionRuntime<CoreTx> = {
    transaction: (fn) => fn(tx),
    checkPermission: () => Promise.reject(new Error('these actions need no permission')),
    recordActivity: () => Promise.resolve(),
    writeOutbox: (_tx, _ctx, messages) => {
      outbox.push(...messages);
      return Promise.resolve();
    },
  };
  return { runtime, outbox, profiles, inserts: () => inserts };
}

const ctx: ActionContext = {
  requestId: 'req_test',
  channel: 'system',
  actor: { kind: 'system', name: 'auth' },
  eventId: null,
  now: new Date('2026-10-26T00:00:00Z'),
};

describe('ensurePersonalWorkspace', () => {
  it('creates the workspace once and returns the same one afterwards', async () => {
    const { runtime, inserts } = fakeRuntime();
    const input = { userId: 'u1', userName: 'Priya Sharma' };

    const first = await runAction(runtime, ctx, ensurePersonalWorkspace, input);
    const second = await runAction(runtime, ctx, ensurePersonalWorkspace, input);

    expect(first).toEqual({ id: 'ws-1', name: "Priya's workspace", plan: 'free' });
    expect(second).toEqual(first);
    expect(inserts()).toBe(1);
  });

  it('names the workspace after the first name, with a fallback', () => {
    expect(personalWorkspaceName('  Arjun   Mehta ')).toBe("Arjun's workspace");
    expect(personalWorkspaceName('')).toBe('My workspace');
  });
});

describe('queueSignInCode', () => {
  it('writes one email.critical outbox row and sends nothing directly', async () => {
    const { runtime, outbox } = fakeRuntime();

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
      const { runtime, outbox } = fakeRuntime();
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
  const userCtx: ActionContext = {
    ...ctx,
    channel: 'app',
    actor: { kind: 'user', userId: 'u1', memberId: null },
  };

  it("changes the signed-in user's own profile", async () => {
    const { runtime, profiles } = fakeRuntime();
    await runAction(runtime, userCtx, updateProfile, {
      name: 'Neha Verma',
      phone: '+919876543210',
    });
    expect(profiles.get('u1')).toEqual({ name: 'Neha Verma', phone: '+919876543210' });
  });

  it('refuses non-user actors and unknown users', async () => {
    const { runtime } = fakeRuntime();
    await expect(runAction(runtime, ctx, updateProfile, { name: 'X' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    const ghost: ActionContext = {
      ...userCtx,
      actor: { kind: 'user', userId: 'nobody', memberId: null },
    };
    await expect(runAction(runtime, ghost, updateProfile, { name: 'X' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
