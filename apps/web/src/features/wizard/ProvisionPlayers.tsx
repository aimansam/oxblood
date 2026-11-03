import { useTeams } from '../competition/api';
import { AddPlayers, type TeamTarget } from '../players/AddPlayers';
import { Progress } from '../players/Progress';
import { useRoster } from '../teams/api';

/** The range takes minutes to build; that is the time to get people in. Same tools as the Players page. */
export function ProvisionPlayers({ drillId, maxParticipants, destroyAccounts }: { drillId: number; maxParticipants: number; destroyAccounts: boolean }) {
  const roster = useRoster(drillId);
  const teams = useTeams(drillId);
  const teamList = teams.data ?? [];
  const people = roster.data?.participants ?? [];
  const sideCount = (side: string) => people.filter((p) => String(p.role).toLowerCase() === side).length;
  const targets: TeamTarget[] = teamList.map((t, i) => ({ id: t.id, name: t.name, members: t.member_count, side: i < teamList.length / 2 ? 'red' : 'blue' }));

  return (
    <section aria-label="Add players while the range builds" className="mt-6 space-y-3 border-t border-border pt-4">
      <div>
        <h3 className="font-semibold">Add players while the range builds</h3>
        <p className="text-xs text-muted-foreground">
          {destroyAccounts ? 'Accounts created here are destroyed when the range is cleaned up.' : 'Accounts created here are kept after the range is cleaned up.'} You can also do this later on the Players page.
        </p>
      </div>
      <Progress
        enrolled={people.length}
        max={maxParticipants}
        red={sideCount('red')}
        blue={sideCount('blue')}
        teams={teamList.map((t) => ({ id: t.id, name: t.name, color: t.color, members: t.member_count }))}
      />
      <AddPlayers key={drillId} drillId={drillId} teams={targets} maxParticipants={maxParticipants} enrolled={people.length} />
    </section>
  );
}
