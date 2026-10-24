import type { ReactNode } from 'react';

import { Reveal } from '@/components/motion/reveal';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  /** Id for the heading, referenced by the section's aria-labelledby. */
  id: string;
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  align?: 'center' | 'left';
  /** Eyebrow colour; the problem section uses danger. */
  tone?: 'primary' | 'danger';
  className?: string;
}

/** Eyebrow, heading and intro used by every home section. MOTION.md 6.2: headings Reveal with riseLarge. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  body,
  align = 'center',
  tone = 'primary',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn(align === 'center' && 'mx-auto max-w-2xl text-center', className)}>
      <Reveal rise="riseLarge">
        <p
          className={cn(
            'text-caption font-semibold tracking-wide uppercase',
            tone === 'danger' ? 'text-danger-text' : 'text-primary-text',
          )}
        >
          {eyebrow}
        </p>
        <h2 id={id} className="mt-3 text-h1-phone text-balance sm:text-h1">
          {title}
        </h2>
      </Reveal>
      {body && (
        <Reveal delay={0.15}>
          <p className="mt-4 text-body-lg text-fg-secondary">{body}</p>
        </Reveal>
      )}
    </div>
  );
}
