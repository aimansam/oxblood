import { cn } from '@/lib/utils';

export interface ProgressTeam {
  id: number;
  name: string;
  color?: string | null;
  members: number;
}

/** "12 / 20 enrolled": how full the roster is, by side and by team, and what Start still needs. */
export function Progress({ enrolled, max, red, blue, teams }: { enrolled: number; max: number; red: number; blue: number; teams: ProgressTeam[] }) {
  const pct = max > 0 ? Math.min(100, Math.round((enrolled / max) * 100)) : 0;
  const missing = [red === 0 && 'a Red player', blue === 0 && 'a Blue player'].filter(Boolean).join(' and ');
  return (
    <section aria-label="Roster progress" className="mb-4 space-y-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-2xl font-semibold tabular-nums">{enrolled}</span>
          <span className="text-muted-foreground"> / {max} enrolled</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded border border-border px-2 py-1">
            <b className="text-danger">Red</b> {red}
          </span>
          <span className="rounded border border-border px-2 py-1">
            <b className="text-info">Blue</b> {blue}
          </span>
          {teams.map((t) => (
            <span key={t.id} className="rounded border border-border px-2 py-1">
              <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: t.color ?? 'currentColor' }} aria-hidden />
              {t.name} {t.members}
            </span>
          ))}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={enrolled} aria-valuemin={0} aria-valuemax={max} aria-label="Seats filled">
        <div className={cn('h-full rounded-full', enrolled >= max ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn('text-xs', missing ? 'text-warning' : 'text-success')}>{missing ? `Start needs ${missing}.` : 'The roster has both sides, so the exercise can start.'}</p>
    </section>
  );
}
