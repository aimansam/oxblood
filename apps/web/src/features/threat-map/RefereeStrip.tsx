import { cn } from '@/lib/utils';
import { formatElapsed, useNow } from '@/lib/useNow';
import { useFlagRotation, useMatchMode, useRangeReset, useRounds, useTeams } from '../competition/api';

/** One line for operators: round clock, range reset, flag planting and (separate matches) which range copy is shown. */
export function RefereeStrip({
  drillId,
  match,
  onMatch,
  onReadiness,
}: {
  drillId: number;
  match: number;
  onMatch: (n: number) => void;
  onReadiness: () => void;
}) {
  const rounds = useRounds(drillId).data ?? [];
  const teams = useTeams(drillId).data ?? [];
  const reset = useRangeReset(drillId).data;
  const rotation = useFlagRotation(drillId).data;
  const mode = useMatchMode(drillId).data;
  const now = useNow();
  if (teams.length === 0 && rounds.length === 0) return null;
  const active = rounds.find((r) => r.status === 'active');
  const copies = mode === 'separate' ? Math.max(...teams.map((t) => t.match_number), 1) : 1;
  const chip = 'rounded border border-border bg-card/95 px-2 py-1 text-xs backdrop-blur';
  const bad = (s?: string) => s === 'failed' || s === 'partial';

  return (
    <div role="region" aria-label="Referee status" className="map-overlay fixed bottom-16 left-3.5 z-[1100] flex max-w-[calc(100%-1.75rem)] flex-wrap items-center gap-2 md:bottom-auto md:top-[56px] md:max-w-[calc(100%-7rem)]">
      <span className={chip}>
        {active ? (
          <>
            {active.name} · <span className="tabular-nums">{formatElapsed(active.started_at, now)}</span>
          </>
        ) : (
          'No round running'
        )}
      </span>
      {reset && (
        <span className={cn(chip, reset.status === 'failed' && 'border-danger text-danger', reset.status === 'resetting' && 'text-warning')}>
          Range {reset.status === 'ready' ? 'reset' : reset.status}
        </span>
      )}
      {rotation && rotation.status !== 'skipped' && (
        <span className={cn(chip, bad(rotation.status) && 'border-warning text-warning')} title={rotation.failed.map((f) => `${f.flag}: ${f.error}`).join('\n')}>
          Flags R{rotation.round}: {rotation.status === 'rotated' ? `${rotation.rotated.length} planted` : rotation.status}
        </span>
      )}
      {copies > 1 && (
        <span role="group" aria-label="Range copy" className={cn(chip, 'flex items-center gap-1')}>
          {Array.from({ length: copies }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" aria-pressed={match === n} className={cn('rounded px-1.5', match === n ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} onClick={() => onMatch(n)}>
              Match {n}
            </button>
          ))}
        </span>
      )}
      <button type="button" className={cn(chip, 'hover:bg-muted')} onClick={onReadiness}>
        Readiness
      </button>
    </div>
  );
}
