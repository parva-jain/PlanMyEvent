import { queueSignInCode, runAction, type ActionRuntime, type CoreTx } from '@pme/core';

import { authSystemContext } from './system-context';

/** Delivers a sign-in code. Real: an outbox row via core. Tests swap in a fake to read the code. */
export interface SignInCodeSender {
  send(input: { email: string; code: string; expiresInMinutes: number }): Promise<void>;
}

export const SIGN_IN_CODE_SENDER = Symbol('SIGN_IN_CODE_SENDER');

export function outboxSignInCodeSender(runtime: ActionRuntime<CoreTx>): SignInCodeSender {
  return {
    send: (input) => runAction(runtime, authSystemContext(), queueSignInCode, input),
  };
}
