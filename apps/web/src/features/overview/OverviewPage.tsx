import { Link } from 'react-router-dom';
import { useAudit, useDrills, useScenarios } from '@/api/hooks';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNote } from '@/components/ErrorNote';
import { PageHeader } from '@/components/PageHeader';
import { StatusChip } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatWhen } from '@/lib/utils';
import { useWizard } from '../wizard/WizardProvider';
import { humanizeAction, visibleActivity } from './activity';
import { nextDrill } from '../exercises/filter';

const TILE: Record<string, string> = {
  success: 'bg-success text-white',
  warning: 'bg-warning text-black',
  info: 'bg-info text-white',
  danger: 'bg-primary text-primary-foreground',
};

function Stat({ label, value, tone }: { label: string; value: number | undefined; tone: keyof typeof TILE }) {
  return (
    <div className={cn('rounded-lg p-5 shadow-soft', TILE[tone])}>
      <div className="text-sm font-semibold opacity-90">{label}</div>
      {value === undefined ? <Skeleton className="mt-2 h-12 w-16 bg-white/30" /> : <div className="mt-1 text-6xl font-extrabold leading-none tracking-tight tabular-nums">{value}</div>}
    </div>
  );
}

export function OverviewPage() {
  const wizard = useWizard();
  const drills = useDrills();
  const scenarios = useScenarios();
  const audit = useAudit(30);
  const list = drills.data;
  const count = (status: string) => list?.filter((d) => d.status === status).length;
  const next = list ? nextDrill(list) : undefined;
  const recent = list ? [...list].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 5) : [];

  return (
    <>
      <PageHeader
        title="Overview"
        description="What is running, what is coming up, and what changed."
        actions={
          <Button onClick={() => wizard.open()}>New exercise</Button>
        }
      />

      {drills.isError && (
        <div className="mb-6">
          <ErrorNote error={drills.error} onRetry={() => drills.refetch()} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Live" tone="success" value={count('active')} />
        <Stat label="Scheduled" tone="warning" value={count('scheduled')} />
        <Stat label="Completed" tone="info" value={count('completed')} />
        <Stat label="Organizations" tone="danger" value={scenarios.data?.length} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>{next?.status === 'active' ? 'Live exercise' : 'Next exercise'}</CardTitle>
          </CardHeader>
          <CardContent>
            {drills.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : next ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{next.title}</div>
                  <div className="mt-1 text-muted-foreground">{formatWhen(next.scheduled_start_at ?? next.created_at)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusChip status={next.status} />
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/exercises?drill=${next.id}`}>View</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Nothing scheduled"
                hint="Pick an organization and schedule an exercise to get started."
                action={<Button onClick={() => wizard.open()}>New exercise</Button>}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent exercises</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/exercises">All exercises</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 pt-3">
            {drills.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : recent.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">No exercises yet.</p>
            ) : (
              recent.map((d) => (
                <Link
                  key={d.id}
                  to={`/exercises?drill=${d.id}`}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
                >
                  <span className="truncate">{d.title}</span>
                  <StatusChip status={d.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/reports">Reports</Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-3">
          {audit.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : visibleActivity(audit.data ?? [], 8).length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">No recent activity.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visibleActivity(audit.data ?? [], 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">
                    {humanizeAction(a.action)}
                    {a.actor ? <span className="text-muted-foreground"> · {a.actor}</span> : null}
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground">{formatWhen(a.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
