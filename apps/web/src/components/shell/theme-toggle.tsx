'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const;

/** Light, dark or system theme as a three-way segmented control. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('app.theme');
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  return (
    <fieldset
      className={cn(
        'inline-flex rounded-control border border-border bg-surface-muted p-1',
        className,
      )}
    >
      <legend className="sr-only">{t('label')}</legend>
      {OPTIONS.map(({ value, icon: Icon }) => (
        <label
          key={value}
          title={t(value)}
          className={cn(
            'flex size-10 cursor-pointer items-center justify-center rounded-[10px] text-fg-secondary lg:size-8',
            'transition-colors duration-(--dur-fast) hover:text-fg',
            'has-checked:bg-surface has-checked:text-primary-text has-checked:shadow-card',
            'has-focus-visible:outline-2 has-focus-visible:outline-primary',
          )}
        >
          <input
            type="radio"
            name="app-theme"
            value={value}
            checked={hydrated && theme === value}
            onChange={() => setTheme(value)}
            className="sr-only"
          />
          <Icon aria-hidden className="size-4" />
          <span className="sr-only">{t(value)}</span>
        </label>
      ))}
    </fieldset>
  );
}
