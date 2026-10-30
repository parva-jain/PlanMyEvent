import { createHash } from 'node:crypto';

import { jobId, type EmailJob } from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import type { CoreTx } from '../ports.js';

export interface QueueSignInCodeInput {
  email: string;
  code: string;
  expiresInMinutes: number;
}

/**
 * Sign-in code emails go through the outbox like every other side effect (CLAUDE.md rule 2),
 * on the `email.critical` topic. The dedupe key hashes email and code, so a relay retry
 * can't send the same code twice and the key itself reveals neither.
 */
export const queueSignInCode: ActionDefinition<QueueSignInCodeInput, void, CoreTx> = {
  name: 'accounts.queueSignInCode',
  permission: null,
  outsideEvent: true,
  noActivity: 'Sign-in, before any event; activity_log is per event',
  execute(_tx, _ctx, input) {
    const email = input.email.toLowerCase();
    const digest = createHash('sha256').update(`${email}\n${input.code}`).digest('hex');
    const payload: EmailJob = {
      template: 'sign-in-code',
      to: email,
      code: input.code,
      expiresInMinutes: input.expiresInMinutes,
    };
    return Promise.resolve({
      result: undefined,
      outbox: [
        { topic: 'email.critical', dedupeKey: jobId('sign-in-code', digest.slice(0, 32)), payload },
      ],
    });
  },
};
