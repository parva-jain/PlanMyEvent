import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { BrandPanel } from '@/components/auth/brand-panel';
import { LogoMark } from '@/components/motion/logo-mark';
import { QueryProvider } from '@/components/query-provider';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Sign-in and Welcome: form column, plus the brand panel on desktop (Stitch "Sign In"). */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('app');
  return (
    <QueryProvider>
      <div className="grid min-h-dvh bg-surface lg:grid-cols-2">
        <div className="flex flex-col px-4 py-6 sm:px-8 lg:px-16">
          <Link href="/" className="flex items-center gap-2 self-start rounded-control">
            <LogoMark size={32} />
            <span className="text-h3 font-bold">{t('brand')}</span>
          </Link>
          <main
            id="main"
            className="flex flex-1 items-start justify-center pt-10 pb-10 lg:items-center"
          >
            <div className="w-full max-w-sm">{children}</div>
          </main>
        </div>
        <BrandPanel />
      </div>
    </QueryProvider>
  );
}
