'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { AmbientFloat } from '@/components/motion/ambient-float';
import { useConfetti } from '@/components/motion/confetti';
import { LogoMark } from '@/components/motion/logo-mark';
import { Typewriter } from '@/components/motion/typewriter';

import { Demo } from './demo';

const FLOAT_CARDS = [
  { key: 'floatOne', offset: 0 },
  { key: 'floatTwo', offset: 2 },
  { key: 'floatThree', offset: 4 },
] as const;

/** Celebration, brand and marketing-only patterns. */
export function BrandDemos() {
  const t = useTranslations('devUi.demos');
  const fire = useConfetti();
  const celebrateRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Demo title="LogoMark" description={t('logoMark')} replayable>
        {(key) => (
          <div key={key} className="flex items-center gap-6">
            <LogoMark size={64} play="always" title="Plan My Event" />
            <LogoMark size={32} play="static" />
            <span className="flex items-center gap-2 text-small text-fg-secondary">
              <LogoMark size={32} play="session" />
              {t('logoSession')}
            </span>
          </div>
        )}
      </Demo>

      <Demo title="Confetti" description={t('confetti')}>
        {() => (
          <button
            ref={celebrateRef}
            type="button"
            onClick={() => void fire({ origin: celebrateRef.current, accent: '#E11D74' })}
            className="pressable h-12 rounded-control bg-primary px-5 text-label text-on-primary hover:bg-primary-hover lg:h-10"
          >
            {t('celebrate')}
          </button>
        )}
      </Demo>

      <Demo title="AmbientFloat" description={t('ambientFloat')}>
        {() => (
          <div className="flex flex-wrap gap-3 py-2">
            {FLOAT_CARDS.map((card) => (
              <AmbientFloat key={card.key} offset={card.offset}>
                <button
                  type="button"
                  className="rounded-card border border-border bg-surface px-4 py-3 text-small shadow-card"
                >
                  {t(card.key)}
                </button>
              </AmbientFloat>
            ))}
          </div>
        )}
      </Demo>

      <Demo title="Typewriter" description={t('typewriter')} replayable>
        {(key) => (
          <p key={key} className="rounded-control bg-surface-muted px-3 py-3 italic">
            <Typewriter text={t('typewriterSample')} />
          </p>
        )}
      </Demo>
    </div>
  );
}
