'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

/** Ends the session (POST /v1/auth/sign-out), forgets cached data, back to /sign-in. */
export function SignOutButton({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations('auth');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    queryClient.clear();
    router.replace('/sign-in');
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      title={compact ? t('signOut') : undefined}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-control px-3 text-label text-fg-secondary transition-colors duration-(--dur-fast) hover:bg-surface-muted hover:text-fg disabled:opacity-60',
        compact && 'justify-center px-0',
        className,
      )}
    >
      <LogOut aria-hidden className="size-5" />
      <span className={cn(compact && 'sr-only')}>{t('signOut')}</span>
    </button>
  );
}
