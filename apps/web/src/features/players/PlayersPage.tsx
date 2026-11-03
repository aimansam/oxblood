import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useDrills, useMe } from '@/api/hooks';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { competitionApi, useTeams } from '../competition/api';
import { useRoster } from '../teams/api';
import { AddPlayers, type TeamTarget } from './AddPlayers';
import { Progress } from './Progress';
import { SideRoster } from './SideRoster';
import { TeamRoster } from './TeamRoster';

/** Everyone in one exercise: how full it is, how to add people, and who is where. */
export function PlayersPage() {
  const drills = useDrills();
  const me = useMe();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [teamCount, setTeamCount] = useState('4');
  const [busy, setBusy] = useState(false);
  const list = drills.data ?? [];
  const requested = Number(params.get('drill')) || null;
  const selected = list.find((d) => d.id === requested) ?? list.find((d) => d.status === 'scheduled') ?? list[0];
  const drillId = selected?.id ?? null;
  const scheduled = selected?.status === 'scheduled';
  const roster = useRoster(drillId);
  const teams = useTeams(drillId);

  if (drills.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!selected || drillId === null) return <EmptyState title="No exercises are available yet" hint="Create an exercise first, then add its players here." />;

  const people = roster.data?.participants ?? [];
  const teamList = teams.data ?? [];
  const sideOf = (side: string) => people.filter((p) => String(p.role).toLowerCase() === side).length;
  const targets: TeamTarget[] = teamList.map((t, i) => ({ id: t.id, name: t.name, members: t.member_count, side: i < teamList.length / 2 ? 'red' : 'blue' }));

  const createTeams = async () => {
    setBusy(true);
    try {
      await competitionApi.createTeams(drillId, Number(teamCount));
      toast.success('Teams created');
      await queryClient.invalidateQueries({ queryKey: ['teams', drillId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Players" description="Add Red and Blue players, see who has joined, and place them in teams before launch." />
      <div className="mb-6 max-w-md">
        <Select aria-label="Exercise" value={drillId} onChange={(e) => setParams({ drill: e.target.value }, { replace: true })}>
          {list.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} #{d.id} · {d.status}
            </option>
          ))}
        </Select>
      </div>

      <Progress
        enrolled={people.length}
        max={selected.max_participants ?? 10}
        red={sideOf('red')}
        blue={sideOf('blue')}
        teams={teamList.map((t) => ({ id: t.id, name: t.name, color: t.color, members: t.member_count }))}
      />

      {scheduled ? (
        <AddPlayers
          key={drillId}
          drillId={drillId}
          isAdmin={String(me.data?.role).toLowerCase() === 'admin'}
          teams={targets}
          maxParticipants={selected.max_participants ?? 10}
          invitations={roster.data?.invitations ?? []}
        />
      ) : (
        <p className="mb-4 text-muted-foreground">Registration is closed for this {selected.status} exercise. Select a scheduled exercise above.</p>
      )}

      {teamList.length > 0 ? (
        <TeamRoster drillId={drillId} scheduled={scheduled} />
      ) : (
        <>
          <SideRoster drillId={drillId} scheduled={scheduled} />
          {scheduled && (
            <Card className="mt-4 max-w-lg">
              <CardHeader>
                <CardTitle>Run it as a team competition?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground">Create named teams. In a two-round swap, half the teams attack while the other half defend, then they switch.</p>
                <div className="flex gap-2">
                  <Select aria-label="Number of teams" value={teamCount} onChange={(e) => setTeamCount(e.target.value)} className="w-32">
                    {['2', '4', '6'].map((n) => (
                      <option key={n} value={n}>
                        {n} teams
                      </option>
                    ))}
                  </Select>
                  <Button disabled={busy} onClick={createTeams}>
                    Create teams
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}
