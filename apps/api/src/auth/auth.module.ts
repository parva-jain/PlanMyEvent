import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ensurePersonalWorkspace, runAction, type ActionRuntime, type CoreTx } from '@pme/core';
import type { Database } from '@pme/db';
import type { Redis } from 'ioredis';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';
import { ACTION_RUNTIME, DB } from '../database/database.module';
import { REDIS } from '../redis/redis.module';
import { AUTH, createAuth } from './auth';
import { createRateLimiter } from './rate-limit';
import { SessionGuard } from './session.guard';
import {
  outboxSignInCodeSender,
  SIGN_IN_CODE_SENDER,
  type SignInCodeSender,
} from './sign-in-codes';
import { authSystemContext } from './system-context';

@Global()
@Module({
  providers: [
    {
      provide: SIGN_IN_CODE_SENDER,
      inject: [ACTION_RUNTIME],
      useFactory: (runtime: ActionRuntime<CoreTx>) => outboxSignInCodeSender(runtime),
    },
    {
      provide: AUTH,
      inject: [API_ENV, DB, REDIS, ACTION_RUNTIME, SIGN_IN_CODE_SENDER],
      useFactory: (
        env: ApiEnv,
        db: Database,
        redis: Redis,
        runtime: ActionRuntime<CoreTx>,
        signInCodes: SignInCodeSender,
      ) =>
        createAuth({
          env,
          db,
          rateLimiter: createRateLimiter(redis),
          signInCodes,
          onUserCreated: async (user) => {
            await runAction(runtime, authSystemContext(), ensurePersonalWorkspace, {
              userId: user.id,
              userName: user.name,
            });
          },
        }),
    },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AUTH],
})
export class AuthModule {}
