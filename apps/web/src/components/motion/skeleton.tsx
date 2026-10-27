import { cn } from '@/lib/utils';

/** Loading placeholder (MOTION.md "Skeleton"); never a full-page spinner (DESIGN.md "Loading"). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-card', className)} />;
}
