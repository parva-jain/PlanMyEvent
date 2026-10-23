import { Inject, Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';

const FORCE_EXIT_MS = 30_000;

/**
 * Graceful shutdown: readiness reports "draining" first so the load balancer stops
 * routing here, then Nest closes HTTP and sockets, then database and Redis close.
 */
@Injectable()
export class LifecycleService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(LifecycleService.name);
  private draining = false;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  get isDraining(): boolean {
    return this.draining;
  }

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.draining = true;
    this.logger.log(`Shutting down (${signal ?? 'close'})`);
    setTimeout(() => {
      this.logger.error('Shutdown took too long, forcing exit');
      process.exit(1);
    }, FORCE_EXIT_MS).unref();
    if (this.env.SHUTDOWN_GRACE_SECONDS > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.env.SHUTDOWN_GRACE_SECONDS * 1000));
    }
  }
}
