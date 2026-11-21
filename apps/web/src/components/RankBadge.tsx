import { cn } from '@/lib/utils';

const PODIUM = ['border-warning/60 text-warning shadow-[0_0_10px_hsl(var(--warning)/0.35)]', 'border-muted-foreground/60 text-foreground', 'border-primary/60 text-primary'];

/** Rank number in a square tag; the top three get a podium accent. */
export function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={cn('inline-flex h-7 min-w-7 items-center justify-center rounded-sm border px-1.5 font-mono text-sm font-semibold tabular-nums', PODIUM[rank - 1] ?? 'border-border text-muted-foreground')}>
      {rank}
    </span>
  );
}

/** Thin proportional score bar, decorative. */
export function ScoreBar({ value, max, color }: { value: number; max: number; color?: string | null }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span aria-hidden className="mt-1.5 block h-1 w-full max-w-[14rem] bg-muted">
      <span className="block h-full bg-primary" style={{ width: `${pct}%`, ...(color ? { background: color } : null) }} />
    </span>
  );
}
