import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Pause, Play, Square } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { drillsApi } from '@/api/drills';
import type { Drill } from '@/api/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatElapsed, useNow } from '@/lib/useNow';
import { CompetitionBadge } from '../competition/CompetitionBadge';
import { availableActions } from '../exercises/actions';
import { FlagPanel } from './FlagPanel';
import { MissionPanel } from './MissionPanel';
import { ReadinessDialog } from './ReadinessDialog';
import { RefereeStrip } from './RefereeStrip';
import { ThreatMap } from './map/ThreatMap';
import { useThreatMap } from './useThreatMap';

const icon = 'grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Live range page: header with the exercise controls, the interactive map, and the player / referee overlays. */
export function LiveRangeReact({ drill, user }: { drill: Drill; user: { sub: string; role: string } }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const now = useNow();
  const operator = ['admin', 'lead'].includes(String(user.role).toLowerCase());
  const [match, setMatch] = useState(1); // operators: which match's range copy to show
  const [readiness, setReadiness] = useState(false);
  const [busy, setBusy] = useState(false);
  const map = useThreatMap(drill.id, operator ? match : 1);
  const actions = availableActions(drill);
  const status = drill.status;
  const env = (drill.environment_config ?? {}) as Record<string, unknown>;
  const cleanupRequired = status === 'scheduled' && env.cleanup_status !== 'stopped' && Boolean(env.provision_run_id || env.provision_status);

  const live = map.data?.assets ?? [];
  const failed = live.filter((a) => String(a.status ?? '').toLowerCase() === 'failed' || a.error).length;
  const ready = live.filter((a) => String(a.status ?? '').toLowerCase() === 'running').length;
  const networks = map.data?.scenario?.spec?.spec?.networks?.length ?? map.data?.networks?.length ?? 0;
  const started = (drill as { actual_start_at?: string | null }).actual_start_at ?? null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ['drills'] });
      await qc.invalidateQueries({ queryKey: ['threat-map', drill.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2">
        <button type="button" className={icon} aria-label="Back to exercises" title="Back to exercises" onClick={() => navigate(`/exercises?drill=${drill.id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{drill.title || 'Live operation'}</h1>
          <p className="truncate text-xs text-muted-foreground">{operator ? 'Operator workspace · full range visibility' : 'Participant workspace · assigned machines only'}</p>
        </div>
        <dl className="ml-auto hidden items-center gap-4 text-xs sm:flex" aria-label="Range status" aria-live="polite">
          {(
            [
              ['state', failed ? 'ATTENTION' : String(status).toUpperCase()],
              ['nodes', live.length ? `${ready}/${live.length}` : '--'],
              ['VLANs', networks || '--'],
              ['elapsed', started ? formatElapsed(started, now) : '--:--'],
            ] as [string, string | number][]
          ).map(([label, value]) => (
            <div key={label} className="text-right">
              <dd className={cn('font-mono font-semibold tabular-nums', label === 'state' && failed && 'text-danger')}>{value}</dd>
              <dt className="text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-2 max-sm:ml-auto">
          {operator && (
            <button type="button" className={icon} aria-label="Range readiness checks" title="Range readiness checks" onClick={() => setReadiness(true)}>
              <Check className="h-4 w-4" />
            </button>
          )}
          {operator && actions.prepare && (
            <Button size="sm" disabled={busy} onClick={() => run(() => drillsApi.prepare(drill.id), 'Range preparation started')}>
              {actions.prepareLabel}
            </Button>
          )}
          {operator && actions.start && (
            <Button size="sm" disabled={busy} onClick={() => run(() => drillsApi.start(drill.id), 'Exercise started')}>
              Start exercise
            </Button>
          )}
          {operator && cleanupRequired && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => drillsApi.stop(drill.id), 'Range cleaned up')}>
              Clean up range
            </Button>
          )}
          {operator && actions.pause && (
            <button type="button" className={icon} disabled={busy} aria-label="Pause drill" title="Pause drill" onClick={() => run(() => drillsApi.pause(drill.id), 'Exercise paused')}>
              <Pause className="h-4 w-4" />
            </button>
          )}
          {operator && actions.resume && (
            <button type="button" className={icon} disabled={busy} aria-label="Resume drill" title="Resume drill" onClick={() => run(() => drillsApi.resume(drill.id), 'Exercise resumed')}>
              <Play className="h-4 w-4" />
            </button>
          )}
          {operator && (status === 'active' || status === 'paused') && (
            <button type="button" className={icon} disabled={busy} aria-label="Stop drill" title="Stop drill" onClick={() => run(() => drillsApi.stop(drill.id), 'Exercise stopped')}>
              <Square className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1" aria-label="Interactive threat map">
        <ThreatMap
          drillId={drill.id}
          operator={operator}
          payload={map.data}
          loading={map.isLoading}
          error={map.error as Error | null}
          onRetry={() => void map.refetch()}
          dock={
            operator ? (
              <RefereeStrip drillId={drill.id} match={match} onMatch={setMatch} onReadiness={() => setReadiness(true)} />
            ) : (
              <>
                {status === 'active' && <FlagPanel drillId={drill.id} />}
                <CompetitionBadge drillId={drill.id} className="w-full" />
                <MissionPanel drillId={drill.id} me={user.sub} role={user.role} />
              </>
            )
          }
        />
      </main>

      <ReadinessDialog drillId={drill.id} open={readiness} onOpenChange={setReadiness} />
    </div>
  );
}
