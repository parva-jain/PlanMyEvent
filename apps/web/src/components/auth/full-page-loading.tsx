'use client';

import { useTranslations } from 'next-intl';

import { LogoMark } from '@/components/motion/logo-mark';

/** MOTION.md 6.1 "Full-page loading": the logo plays once while the session loads. */
export function FullPageLoading() {
  const t = useTranslations('auth');
  return (
    <div role="status" className="flex min-h-[50dvh] flex-1 items-center justify-center">
      <LogoMark size={56} play="session" />
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}
