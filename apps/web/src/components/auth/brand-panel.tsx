import { getTranslations } from 'next-intl/server';

import { LivePlanCard } from '@/components/home/live-plan-card';
import { Reveal } from '@/components/motion/reveal';

/**
 * Desktop-only indigo panel beside the sign-in and Welcome forms (Stitch "Sign In"): the
 * live plan card floats in once, then stays still (MOTION.md 6.3).
 */
export async function BrandPanel() {
  const t = await getTranslations('auth.brand');
  return (
    <aside
      aria-hidden
      className="relative hidden flex-col items-center justify-center gap-10 overflow-hidden bg-primary px-12 py-16 text-on-primary lg:flex"
    >
      <Reveal rise="riseLarge" className="w-full max-w-md">
        <LivePlanCard className="shadow-raised" />
      </Reveal>
      <Reveal delay={0.15} className="flex max-w-md flex-col items-center gap-3 text-center">
        <p className="text-h2">{t('headline')}</p>
        <p className="text-body-lg opacity-80">{t('body')}</p>
      </Reveal>
    </aside>
  );
}
