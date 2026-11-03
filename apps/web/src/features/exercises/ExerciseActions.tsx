import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, unwrap } from '@/api/client';
import { drillsApi } from '@/api/drills';
import type { Drill } from '@/api/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EditDrillDialog } from './EditDrillDialog';
import { availableActions } from './actions';

/** Lifecycle buttons for one exercise. Which ones appear depends on its status and range state. */
export function ExerciseActions({ drill, onRemoved }: { drill: Drill; onRemoved: () => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'delete' | 'stop'>(null);
  const [editing, setEditing] = useState(false);
  const actions = availableActions(drill);
  // Why Start would be refused: the range checks the server enforces, shown before the click.
  const health = useQuery({
    queryKey: ['range-health', drill.id, 'card'],
    enabled: actions.start,
    refetchInterval: 10_000,
    queryFn: async () => unwrap(await api.GET('/api/v2/drills/{drill_id}/range-health', { params: { path: { drill_id: drill.id } } })),
  });
  const blockersOf = (checks: { id?: string | null; required?: boolean; state: string; detail?: string | null; label: string }[] | undefined) =>
    (checks ?? []).filter((c) => c.required && c.state !== 'ready');
  const blockers = blockersOf(health.data?.checks);
  const needsRoster = blockers.some((c) => c.id === 'mission-roster');

  // Start re-reads the checks first, so a roster fixed a moment ago is not held back by a stale list.
  const start = async () => {
    const fresh = await health.refetch();
    const unmet = blockersOf(fresh.data?.checks);
    if (unmet.length > 0) {
      toast.error(`Cannot start yet: ${unmet.map((c) => c.detail || c.label).join(' ')}`);
      return;
    }
    await run('start', 'Exercise started', () => drillsApi.start(drill.id));
  };

  const run = async (key: string, label: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      toast.success(label);
      await queryClient.invalidateQueries({ queryKey: ['drills'] });
      await queryClient.invalidateQueries({ queryKey: ['drill-status', drill.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.prepare && (
          <Button size="sm" disabled={busy !== null} onClick={() => run('prepare', 'Range preparation started', () => drillsApi.prepare(drill.id))}>
            {actions.prepareLabel}
          </Button>
        )}
        {actions.start && (
          <Button size="sm" disabled={busy !== null} onClick={start}>
            Start
          </Button>
        )}
        {actions.pause && (
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run('pause', 'Exercise paused', () => drillsApi.pause(drill.id))}>
            Pause
          </Button>
        )}
        {actions.resume && (
          <Button size="sm" disabled={busy !== null} onClick={() => run('resume', 'Exercise resumed', () => drillsApi.resume(drill.id))}>
            Resume
          </Button>
        )}
        {actions.stop && (
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirm('stop')}>
            Stop
          </Button>
        )}
      </div>
      {actions.start && blockers.length > 0 && (
        <div role="status" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          <div className="font-semibold">Start will be refused until:</div>
          <ul className="list-disc pl-4">
            {blockers.map((c) => (
              <li key={c.id ?? c.label}>{c.detail || c.label}</li>
            ))}
          </ul>
          {needsRoster && (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/players?drill=${drill.id}`}>Add players</Link>
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {actions.edit && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run('duplicate', 'Exercise duplicated', () => drillsApi.duplicate(drill))}>
          Duplicate
        </Button>
        {actions.remove && (
          <Button size="sm" variant="outline" className="text-danger" disabled={busy !== null} onClick={() => setConfirm('delete')}>
            Delete
          </Button>
        )}
      </div>
      <EditDrillDialog drill={drill} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={confirm === 'stop'}
        title="Stop this exercise?"
        description="Participants lose access and the range VMs are cleaned up."
        confirmLabel="Stop exercise"
        destructive
        busy={busy === 'stop'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run('stop', 'Exercise stopped', () => drillsApi.stop(drill.id))}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this exercise?"
        description="It is removed from the list. Finish VM cleanup first if the range is still up."
        confirmLabel="Delete"
        destructive
        busy={busy === 'delete'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run('delete', 'Exercise deleted', async () => { await drillsApi.remove(drill.id); onRemoved(); })}
      />
    </div>
  );
}
