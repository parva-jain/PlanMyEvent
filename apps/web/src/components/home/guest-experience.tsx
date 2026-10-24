'use client';

import { m, type Variants } from 'motion/react';
import { Check, CheckCircle2, Globe, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { distance, duration, ease, spring, stagger } from '@/lib/motion';

import { SectionHeading } from './section-heading';

/**
 * "Guests don't need an app" (MOTION.md 6.2): when in view, the invitation card rises and
 * unfolds from the top (scaleY 0.96 → 1, `gentle`), then its title, details and RSVP buttons
 * stagger in. Reduced motion: MotionConfig drops the transforms, leaving short fades.
 */
export function GuestExperience() {
  const t = useTranslations('home.guests');
  const reduced = useShouldReduceMotion();

  const card: Variants = {
    hidden: { opacity: 0, y: distance.riseLarge, scaleY: 0.96 },
    visible: {
      opacity: 1,
      y: 0,
      scaleY: 1,
      transition: reduced
        ? { duration: duration.fast, staggerChildren: 0, when: 'beforeChildren' }
        : { ...spring.gentle, staggerChildren: stagger.section, delayChildren: duration.base },
    },
  };
  const part: Variants = {
    hidden: { opacity: 0, y: distance.rise },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? duration.fast : duration.base, ease: ease.out },
    },
  };

  return (
    <section aria-labelledby="guests-title" className="bg-surface-muted py-16 lg:py-24">
      <div className="mx-auto grid max-w-content items-center gap-12 px-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:px-8">
        <div className="flex justify-center lg:order-none">
          <m.div
            aria-hidden
            variants={card}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.4 }}
            className="w-full max-w-sm origin-top rounded-dialog border border-border bg-surface p-6 shadow-raised"
          >
            <m.p
              variants={part}
              className="flex items-center gap-2 text-caption font-semibold tracking-wide text-event-wedding-text uppercase"
            >
              <Mail className="size-4" />
              {t('cardLabel')}
            </m.p>
            <m.div variants={part}>
              <p className="mt-3 font-display text-h2">{t('cardEvent')}</p>
              <p className="mt-1 text-small text-fg-secondary">{t('cardDetail')}</p>
            </m.div>
            <m.div variants={part} className="mt-5 rounded-card bg-surface-muted p-4">
              <p className="text-label">{t('cardQuestion')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-label">
                <span className="flex h-11 items-center justify-center gap-1.5 rounded-control bg-success text-white">
                  <Check className="size-4" />
                  {t('cardYes')}
                </span>
                <span className="flex h-11 items-center justify-center rounded-control border border-border bg-surface text-fg-secondary">
                  {t('cardNo')}
                </span>
              </div>
            </m.div>
            <m.p
              variants={part}
              className="mt-4 flex items-center justify-center gap-2 text-caption text-fg-secondary"
            >
              <Globe className="size-4" />
              {t('cardFooter')}
            </m.p>
          </m.div>
        </div>

        <div>
          <SectionHeading
            id="guests-title"
            eyebrow={t('eyebrow')}
            title={t('title')}
            body={t('body')}
            align="left"
          />
          <ul className="mt-6 flex flex-wrap gap-2">
            {(['point1', 'point2', 'point3'] as const).map((point) => (
              <li
                key={point}
                className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-small"
              >
                <CheckCircle2 aria-hidden className="size-4 text-success" />
                {t(point)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
