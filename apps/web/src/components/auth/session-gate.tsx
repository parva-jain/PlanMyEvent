'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { needsWelcome, useMe } from '@/lib/me';
import { withReturnTo } from '@/lib/return-to';

import { FullPageLoading } from './full-page-loading';

/**
 * The app shell renders only for a signed-in user with a name. The session cookie belongs
 * to the API's host, so the check runs in the browser through GET /v1/me: signed out goes
 * to /sign-in, a new account to /welcome (both with `?next=` back here), and an unreachable
 * API gets a retry.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const t = useTranslations('auth.gate');
  const router = useRouter();
  const { data: me, isPending, isError, refetch, isFetching } = useMe();

  // Signed-out visitors come back to the page they opened once they've signed in.
  useEffect(() => {
    const here = window.location.pathname + window.location.search;
    if (me === null) router.replace(withReturnTo('/sign-in', here));
    else if (me && needsWelcome(me)) router.replace(withReturnTo('/welcome', here));
  }, [me, router]);

  if (isError) {
    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
      >
        <p className="text-h3">{t('unreachable')}</p>
        <p className="max-w-sm text-body text-fg-secondary">{t('unreachableBody')}</p>
        <Button
          variant="secondary"
          loading={isFetching}
          icon={<RefreshCw aria-hidden />}
          onClick={() => void refetch()}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (isPending || !me || needsWelcome(me)) {
    return (
      <div className="flex min-h-dvh">
        <FullPageLoading />
      </div>
    );
  }
  return children;
}
