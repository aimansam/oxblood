import { cn } from '@/lib/utils';

const PODIUM = ['bg-warning text-black', 'bg-muted-foreground/25 text-foreground', 'bg-primary text-primary-foreground'];

/** Rank number in a round badge; the top three get a podium fill. */
export function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={cn('inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-extrabold tabular-nums', PODIUM[rank - 1] ?? 'bg-muted text-muted-foreground')}>
      {rank}
    </span>
  );
}

/** Thin proportional score bar, decorative. */
export function ScoreBar({ value, max, color }: { value: number; max: number; color?: string | null }) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return (
    <span aria-hidden className="mt-2 block h-2 w-full max-w-[14rem] overflow-hidden rounded-full bg-muted">
      <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%`, ...(color ? { background: color } : null) }} />
    </span>
  );
}
