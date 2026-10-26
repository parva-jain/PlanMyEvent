import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { LogoMark } from '@/components/motion/logo-mark';
import { Reveal } from '@/components/motion/reveal';

/** Flat indigo banner (MOTION.md 6.2: Reveal; button Pressable + HoverLift). */
export function FinalCta() {
  const t = useTranslations('home.cta');

  return (
    <section aria-labelledby="cta-title" className="px-4 pb-16 lg:px-8 lg:pb-24">
      <Reveal className="mx-auto max-w-content">
        <div className="rounded-sheet bg-primary px-6 py-12 text-center text-on-primary sm:px-12 lg:py-16">
          <span className="mx-auto grid size-14 place-items-center rounded-card bg-on-primary/10">
            <LogoMark size={36} play="static" />
          </span>
          <h2 id="cta-title" className="mt-6 text-h1-phone text-balance sm:text-display">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-body-lg">{t('body')}</p>
          <Link
            href="/sign-in"
            prefetch={false}
            className="pressable hover-lift mt-8 inline-flex h-12 items-center gap-2 rounded-control bg-on-primary px-6 text-label text-primary"
          >
            {t('button')}
            <ArrowRight aria-hidden className="size-5" />
          </Link>
          <p className="mt-4 text-small">{t('note')}</p>
        </div>
      </Reveal>
    </section>
  );
}
