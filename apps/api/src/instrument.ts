// Imported first in main.ts so Sentry can instrument everything loaded after it.
import './load-env';

import * as Sentry from '@sentry/nestjs';

import { sentryOptions } from './logging/sentry-scrub';

if (process.env.SENTRY_DSN) {
  Sentry.init(sentryOptions(process.env.SENTRY_DSN));
}
