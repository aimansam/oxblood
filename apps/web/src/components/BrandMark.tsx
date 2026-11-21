import { cn } from '@/lib/utils';

/** Crosshair-in-hexagon mark. Decorative: the wordmark beside it carries the name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('h-5 w-5 text-primary', className)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square">
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 6.5v2.5M12 15v2.5M6.5 12H9M15 12h2.5" />
    </svg>
  );
}

export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.18em]', className)}>
      <BrandMark />
      OxBlood<span className="text-primary">//</span>
      {!compact && <span className="font-normal text-muted-foreground">Range</span>}
    </span>
  );
}
