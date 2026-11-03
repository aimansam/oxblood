import { useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useMe } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTeams } from '../competition/api';
import { AddPlayers, type TeamTarget } from '../players/AddPlayers';
import { Progress } from '../players/Progress';
import { inviteUrl, teamsApi, useRoster } from '../teams/api';

/** The range takes minutes to build; that is the time to get people in. Same tools as the Players page. */
export function ProvisionPlayers({ drillId, maxParticipants, destroyAccounts }: { drillId: number; maxParticipants: number; destroyAccounts: boolean }) {
  const qc = useQueryClient();
  const me = useMe();
  const roster = useRoster(drillId);
  const teams = useTeams(drillId);
  const [links, setLinks] = useState<{ team: string; url: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const teamList = teams.data ?? [];
  const people = roster.data?.participants ?? [];
  const sideCount = (side: string) => people.filter((p) => String(p.role).toLowerCase() === side).length;
  const targets: TeamTarget[] = teamList.map((t, i) => ({ id: t.id, name: t.name, members: t.member_count, side: i < teamList.length / 2 ? 'red' : 'blue' }));

  const allTeamLinks = async () => {
    setBusy(true);
    try {
      const made = [];
      for (const t of targets) {
        const seats = Math.max(1, Math.ceil(maxParticipants / targets.length) - t.members);
        const invite = await teamsApi.invite(drillId, t.side, { teamId: t.id, maxUses: seats, hours: 72 });
        made.push({ team: `${t.name} · ${seats} seat${seats === 1 ? '' : 's'}`, url: inviteUrl(invite.token) });
      }
      setLinks(made);
      await qc.invalidateQueries({ queryKey: ['roster', drillId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the links');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed. Select the link and copy it by hand.');
    }
  };

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
      {targets.length > 0 && (
        <div className="space-y-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={allTeamLinks}>
            Create one link for every team
          </Button>
          {links && (
            <ul aria-label="Team links" className="space-y-2">
              {links.map((l) => (
                <li key={l.url} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 text-xs text-muted-foreground">{l.team}</span>
                  <Input readOnly aria-label={`Link for ${l.team}`} value={l.url} onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="outline" size="sm" onClick={() => copy(l.url)}>
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <AddPlayers key={drillId} drillId={drillId} isAdmin={String(me.data?.role).toLowerCase() === 'admin'} teams={targets} maxParticipants={maxParticipants} invitations={roster.data?.invitations ?? []} />
    </section>
  );
}
