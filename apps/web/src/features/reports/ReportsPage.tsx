import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useDrills } from '@/api/hooks';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNote } from '@/components/ErrorNote';
import { PageHeader } from '@/components/PageHeader';
import { RankBadge } from '@/components/RankBadge';
import { StatusChip } from '@/components/StatusChip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatWhen } from '@/lib/utils';
import { ScoreboardView } from '../competition/ScoreboardView';
import { useScoreboard } from '../competition/api';
import { filterDrills } from '../exercises/filter';
import { useLeaderboard } from '../scoreboard/api';
import { useQuality, useTimeline } from './api';
import { durationText, keyEvents, playedSeconds } from './summary';

/** Finished exercises, newest first: a report is what an exercise left behind, so there is nothing to author. */
export function ReportsPage() {
  const { data, isLoading, isError, error, refetch } = useDrills();
  const finished = filterDrills(data ?? [], 'archive', '');
  return (
    <>
      <PageHeader title="Reports" description="Results and how it played, for every finished exercise." />
      {isError && <ErrorNote error={error} onRetry={() => refetch()} />}
      {isLoading ? <Skeleton className="h-40 w-full" /> : finished.length === 0 ? (
        <EmptyState title="No finished exercises yet" hint="An exercise appears here once it has been stopped." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {finished.map((d) => (
            <li key={d.id}>
              <Link to={`/reports/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.drill_type === 'team' ? 'Team competition' : 'Free play'} · {formatWhen(d.actual_end_at ?? d.created_at)}
                  </div>
                </div>
                <StatusChip status={d.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ReportDetail() {
  const { id } = useParams();
  const drillId = Number(id) || null;
  const drills = useDrills();
  const drill = (drills.data ?? []).find((d) => d.id === drillId);
  const teams = useScoreboard(drillId);
  const players = useLeaderboard(drillId);
  const quality = useQuality(drillId);
  const timeline = useTimeline(drillId);

  if (drills.isLoading) return <Skeleton className="h-64 w-full" />;
  if (drills.isError || !drill) return <ErrorNote error={drills.error ?? new Error('Exercise not found')} />;

  const events = keyEvents(timeline.data ?? []);
  const competing = (teams.data?.teams.length ?? 0) > 0;
  const rows = players.data ?? [];
  const played = quality.data?.drill?.duration_s ?? playedSeconds(drill.actual_start_at, drill.actual_end_at);
  const notes = quality.data?.observations ?? [];

  return (
    <>
      <Link to="/reports" className="mb-4 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Reports</Link>
      <PageHeader title={drill.title} description={`${drill.drill_type === 'team' ? 'Team competition' : 'Free play'} · ran ${durationText(played)}${drill.duration_limit_minutes ? ` of ${drill.duration_limit_minutes} min planned` : ''}`} />
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <StatusChip status={drill.status} />
          <span>{formatWhen(drill.actual_start_at)} to {formatWhen(drill.actual_end_at)}</span>
        </div>

        <Card>
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardContent>
            {competing && teams.data ? (
              <ScoreboardView board={teams.data} />
            ) : players.isLoading ? <Skeleton className="h-20 w-full" /> : rows.length === 0 ? (
              <p className="text-muted-foreground">No scores were recorded.</p>
            ) : (
              <ol className="space-y-1">
                {rows.map((r) => (
                  <li key={r.user_id} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-3"><RankBadge rank={r.rank} /><span className="font-medium">{r.name}</span></span>
                    <span className="tabular-nums">{r.total_points} pts · {r.flags_captured} {r.flags_captured === 1 ? 'flag' : 'flags'}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>How it played</CardTitle></CardHeader>
          <CardContent>
            {quality.isLoading ? <Skeleton className="h-16 w-full" /> : notes.length === 0 ? (
              <p className="text-muted-foreground">Nothing notable was recorded.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Key moments ({events.length})</CardTitle></CardHeader>
          <CardContent>
            {timeline.isLoading ? <Skeleton className="h-16 w-full" /> : events.length === 0 ? (
              <p className="text-muted-foreground">No captures or objectives were recorded.</p>
            ) : (
              <ul className="divide-y divide-border">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-3 py-2">
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">{formatWhen(e.created_at)}</span>
                    <span>{e.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
