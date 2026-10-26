'use client';

import { HealthReadySchema, type HealthReady } from '@pme/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { apiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

/** How often the widget re-checks the API. */
const POLL_MS = 30_000;

type Status = 'checking' | 'ok' | 'degraded' | 'offline';

/** 503 from /ready still carries a body naming the dependency that is down. */
async function fetchReadiness(): Promise<HealthReady> {
  const res = await fetch(apiUrl('/v1/health/ready'), { cache: 'no-store' });
  return HealthReadySchema.parse(await res.json());
}

function useApiStatus(): Status {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: fetchReadiness,
    refetchInterval: POLL_MS,
    retry: false,
  });
  if (isPending) return 'checking';
  if (isError) return 'offline';
  return data.status === 'ok' ? 'ok' : 'degraded';
}

const DOT: Record<Status, string> = {
  checking: 'bg-fg-muted',
  ok: 'bg-success',
  degraded: 'bg-warning',
  offline: 'bg-danger',
};

/**
 * API status from /v1/health/ready: the first live call from the web app to the API.
 * `compact` shows only the dot (tablet rail); the label stays for screen readers.
 */
export function StatusWidget({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations('app.status');
  const status = useApiStatus();

  return (
    <p
      role="status"
      data-status={status}
      data-testid="api-status"
      title={compact ? t(status) : undefined}
      className={cn('flex items-center gap-2 text-small text-fg-secondary', className)}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full transition-colors duration-(--dur-fast)',
          DOT[status],
        )}
      />
      <span className={cn(compact && 'sr-only')}>{t(status)}</span>
    </p>
  );
}
