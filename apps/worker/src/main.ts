import './load-env';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { WorkerModule } from './worker.module';

/** Standalone Nest app: no HTTP server, just DI, lifecycle hooks and BullMQ workers. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

void bootstrap();
