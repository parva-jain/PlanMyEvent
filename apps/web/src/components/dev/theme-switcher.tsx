'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const OPTIONS = ['light', 'dark', 'system'] as const;
const LABEL_KEYS = { light: 'themeLight', dark: 'themeDark', system: 'themeSystem' } as const;

// The theme is only known in the browser, so render the selection after hydration.
const subscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

export function ThemeSwitcher() {
  const t = useTranslations('devUi');
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">{t('theme')}</legend>
      {OPTIONS.map((option) => (
        <label
          key={option}
          className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1 text-small has-checked:border-primary has-checked:bg-primary-tint has-checked:text-primary-text"
        >
          <input
            type="radio"
            name="theme"
            value={option}
            checked={hydrated && theme === option}
            onChange={() => setTheme(option)}
            className="sr-only"
          />
          {t(LABEL_KEYS[option])}
        </label>
      ))}
    </fieldset>
  );
}
