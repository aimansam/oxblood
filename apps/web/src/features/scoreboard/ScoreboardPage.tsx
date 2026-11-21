import { useSearchParams } from 'react-router-dom';
import { useDrills } from '@/api/hooks';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { RankBadge, ScoreBar } from '@/components/RankBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreboardView } from '../competition/ScoreboardView';
import { useScoreboard } from '../competition/api';
import { useLeaderboard } from './api';
import { scoreboardSummary } from './summary';

export function ScoreboardPage() {
  const drills = useDrills();
  const [params, setParams] = useSearchParams();
  const list = drills.data ?? [];
  const drillId = Number(params.get('drill')) || list[0]?.id || null;
  const board = useLeaderboard(drillId);
  const team = useScoreboard(drillId);
  const competing = (team.data?.teams.length ?? 0) > 0;
  if (drills.isLoading) return <Skeleton className="h-48 w-full" />;
  if (!list.length) return <EmptyState title="No exercises are available yet" />;
  const rows = board.data ?? [];
  const top = Math.max(0, ...rows.map((r) => r.total_points));
  return (
    <>
      <PageHeader title="Scoreboard" description={scoreboardSummary(team.data?.teams ?? [], rows.length)} />
      <div className="mb-4 max-w-md">
        <Select aria-label="Exercise" value={drillId ?? ''} onChange={(e) => setParams({ drill: e.target.value }, { replace: true })}>
          {list.map((d) => <option key={d.id} value={d.id}>{d.title} #{d.id}</option>)}
        </Select>
      </div>
      {competing && team.data ? (
        <ScoreboardView board={team.data} />
      ) : board.isLoading ? <Skeleton className="h-40 w-full" /> : board.isError ? (
        <p role="alert" className="text-danger">Scores are unavailable. {(board.error as Error).message}</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No scores have been recorded for this exercise" />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-left">
              <thead className="border-b border-border text-xs font-semibold text-muted-foreground">
                <tr><th className="px-5 py-3">Rank</th><th>Participant</th><th className="text-right">Points</th><th className="px-5 text-right">Flags</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    <td className="px-5 py-3"><RankBadge rank={r.rank} /></td>
                    <td><span className="font-medium">{r.name}</span><ScoreBar value={r.total_points} max={top} /></td>
                    <td className="text-right font-bold tabular-nums">{r.total_points}</td>
                    <td className="px-5 text-right tabular-nums">{r.flags_captured}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
