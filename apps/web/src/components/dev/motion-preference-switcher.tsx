'use client';

import { useTranslations } from 'next-intl';

import {
  useMotionPreference,
  useShouldReduceMotion,
  type MotionPreference,
} from '@/components/motion/motion-provider';

const OPTIONS: MotionPreference[] = ['user', 'always', 'never'];
const LABEL_KEYS = {
  user: 'motionUser',
  always: 'motionAlways',
  never: 'motionNever',
} as const;

/** Lets /dev/ui compare normal and reduced motion without changing the OS setting. */
export function MotionPreferenceSwitcher() {
  const t = useTranslations('devUi');
  const { preference, setPreference } = useMotionPreference();
  const reduced = useShouldReduceMotion();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <fieldset className="flex items-center gap-2">
        <legend className="sr-only">{t('reducedMotion')}</legend>
        {OPTIONS.map((option) => (
          <label
            key={option}
            className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1 text-small has-checked:border-primary has-checked:bg-primary-tint has-checked:text-primary-text"
          >
            <input
              type="radio"
              name="reduced-motion"
              value={option}
              checked={preference === option}
              onChange={() => setPreference(option)}
              className="sr-only"
            />
            {t(LABEL_KEYS[option])}
          </label>
        ))}
      </fieldset>
      <output className="text-small text-fg-secondary" aria-live="polite">
        {reduced ? t('motionStateReduced') : t('motionStateFull')}
      </output>
    </div>
  );
}
