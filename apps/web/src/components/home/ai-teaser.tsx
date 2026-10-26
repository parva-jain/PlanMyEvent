'use client';

import { m } from 'motion/react';
import { CalendarClock, CheckCircle2, Mic, Sparkles, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, useState } from 'react';

import { Typewriter } from '@/components/motion/typewriter';
import { Reveal } from '@/components/motion/reveal';
import { Badge } from '@/components/ui/badge';
import { spring } from '@/lib/motion';

/** MOTION.md 6.2: result cards pop in 120 ms apart after the sentence is typed. */
const CARD_GAP = 0.12;

const RESULTS = [
  { key: 'resultTask', Icon: CheckCircle2, tint: 'bg-success-tint text-success-text' },
  { key: 'resultExpense', Icon: Wallet, tint: 'bg-accent-tint text-accent-text' },
  { key: 'resultDue', Icon: CalendarClock, tint: 'bg-primary-tint text-primary-text' },
] as const;

/**
 * "Coming soon" AI assistant teaser (a V2 feature). When in view, once: the sentence types
 * out, then three result cards pop in with `bouncy`. The server HTML shows everything; cards
 * hide only if the section starts off-screen, and reappear when the text is complete
 * (immediately under reduced motion, where nothing types).
 */
export function AiTeaser() {
  const t = useTranslations('home.ai');
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect && (rect.top > window.innerHeight || rect.bottom < 0)) setShown(false);
  }, []);

  return (
    <section aria-labelledby="ai-title" className="py-16 lg:py-24">
      <div className="mx-auto max-w-content px-4 lg:px-8">
        <Reveal>
          <div className="rounded-sheet border border-border bg-surface p-6 shadow-card sm:p-10">
            <Badge tone="accent" className="gap-1.5 px-3 py-1 text-label font-medium">
              <Sparkles aria-hidden className="size-4" />
              {t('badge')}
            </Badge>
            <h2 id="ai-title" className="mt-4 text-h1-phone sm:text-h1">
              {t('title')}
            </h2>
            <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">{t('body')}</p>

            <div ref={ref} className="mt-8">
              <div className="rounded-card border border-border bg-surface-muted p-4 sm:p-5">
                <p className="flex items-center gap-2 text-caption font-semibold tracking-wide text-fg-secondary uppercase">
                  <Mic aria-hidden className="size-4 text-accent-text" />
                  {t('inputLabel')}
                </p>
                <p className="mt-2 text-body-lg italic">
                  <Typewriter text={t('example')} onDone={() => setShown(true)} />
                </p>
              </div>

              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                {RESULTS.map(({ key, Icon, tint }, index) => (
                  <m.li
                    key={key}
                    initial={false}
                    animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                    transition={{ ...spring.bouncy, delay: shown ? index * CARD_GAP : 0 }}
                    className="flex items-center gap-3 rounded-card border border-border bg-surface p-4"
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-control ${tint}`}
                    >
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <div>
                      <p className="text-caption tracking-wide text-fg-secondary uppercase">
                        {t(`${key}Label`)}
                      </p>
                      <p className="text-label">{t(key)}</p>
                    </div>
                  </m.li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
