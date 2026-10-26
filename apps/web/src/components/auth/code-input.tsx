'use client';

import { m, useAnimationControls } from 'motion/react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { duration, ease } from '@/lib/motion';
import { cn } from '@/lib/utils';

const LENGTH = 6;

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once all six digits are in. */
  onComplete: (code: string) => void;
  /** Increment to shake the boxes (wrong code). */
  errorKey: number;
  invalid: boolean;
  disabled?: boolean;
  label: string;
  describedBy?: string;
}

/**
 * Six code boxes over one real input, so paste and the phone's one-time-code autofill work
 * and screen readers hear a single field. MOTION.md 6.3: each digit pops (1.08 → 1,
 * `instant`); a wrong code shakes the boxes together and turns them red (`fast`).
 * MotionConfig turns the pop and shake off with reduced motion; the red stays.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  errorKey,
  invalid,
  disabled,
  label,
  describedBy,
}: CodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const shake = useAnimationControls();

  useEffect(() => {
    if (errorKey > 0) {
      void shake.start({
        x: [0, -4, 4, -4, 4, 0],
        transition: { duration: duration.base, ease: ease.inOut },
      });
    }
  }, [errorKey, shake]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, LENGTH);
    onChange(digits);
    if (digits.length === LENGTH) {
      onComplete(digits);
    }
  };

  const active = Math.min(value.length, LENGTH - 1);

  return (
    <m.div animate={shake} className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={LENGTH}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-testid="code-input"
        // Transparent text and caret: the boxes below show the digits.
        className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
        autoFocus
      />
      <div aria-hidden className="grid grid-cols-6 gap-2 sm:gap-3">
        {Array.from({ length: LENGTH }, (_, index) => {
          const digit = value[index];
          return (
            <div
              key={index}
              className={cn(
                'flex h-14 items-center justify-center rounded-control border bg-surface-muted text-h2 tabular-nums',
                'transition-[border-color,background-color,box-shadow] duration-(--dur-fast) ease-(--ease-out)',
                invalid ? 'border-danger bg-danger-tint text-danger-text' : 'border-border-strong',
                // The focus ring sits on the box the next digit goes into (MOTION.md 6.3).
                !invalid &&
                  focused &&
                  index === active &&
                  'border-primary ring-3 ring-primary-tint',
              )}
            >
              {digit && (
                <m.span
                  key={`${index}-${digit}`}
                  initial={{ scale: 1.08 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: duration.instant, ease: ease.out }}
                >
                  {digit}
                </m.span>
              )}
            </div>
          );
        })}
      </div>
    </m.div>
  );
}
