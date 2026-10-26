import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * DESIGN.md "Inputs": 48 px, surface-muted fill, border-strong; on focus the border turns
 * primary with a 3 px primary-tint ring. `aria-invalid` turns it red.
 */
const inputClasses = cn(
  'h-12 w-full rounded-control border border-border-strong bg-surface-muted px-4 text-body text-fg placeholder:text-fg-muted',
  'transition-[border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out)',
  'focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary-tint focus-visible:outline-none',
  'aria-invalid:border-danger aria-invalid:ring-danger-tint',
  'disabled:opacity-60',
);

function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(inputClasses, className)} {...props} />;
}

/** Indian mobile number with a fixed +91 prefix (DESIGN.md "Special inputs"). */
function PhoneInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <div className="flex">
      <span
        aria-hidden
        className="flex h-12 items-center rounded-l-control border border-r-0 border-border-strong bg-surface-band px-3 text-label text-fg-secondary"
      >
        +91
      </span>
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        className={cn('rounded-l-none', className)}
        {...props}
      />
    </div>
  );
}

/** Label above, control, then helper or error text below. */
function Field({
  id,
  label,
  hint,
  error,
  aside,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Right side of the label row, e.g. "Optional". */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-label">
          {label}
        </label>
        {aside && <span className="text-small text-fg-muted">{aside}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-small text-danger-text">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-small text-fg-secondary">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export { Field, Input, PhoneInput };
