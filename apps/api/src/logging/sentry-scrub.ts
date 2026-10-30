import type { Event, NodeOptions } from '@sentry/nestjs';

import { redactUrl } from './redact-url';

const SECRET_HEADERS = new Set(['cookie', 'authorization', 'set-cookie']);

function scrubData(data: Record<string, unknown> | undefined) {
  if (!data) return;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') data[key] = redactUrl(value);
  }
}

/**
 * Link tokens and session secrets never reach Sentry, the same rule the pino logger follows
 * (APIDesign "Link tokens"): URLs, transaction names, span names and breadcrumbs go through
 * redactUrl, and cookie and authorization headers are dropped.
 */
export function scrubEvent<T extends Event>(event: T): T {
  if (event.transaction) event.transaction = redactUrl(event.transaction);
  const request = event.request;
  if (request) {
    if (request.url) request.url = redactUrl(request.url);
    delete request.cookies;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => !SECRET_HEADERS.has(name.toLowerCase())),
      );
    }
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = redactUrl(breadcrumb.message);
    scrubData(breadcrumb.data);
  }
  scrubData(event.contexts?.trace?.data);
  for (const span of event.spans ?? []) {
    if (span.description) span.description = redactUrl(span.description);
    scrubData(span.data);
  }
  return event;
}

export function sentryOptions(dsn: string): NodeOptions {
  return {
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  };
}
