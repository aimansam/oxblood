import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type CreatedPlayer, teamsApi } from '../teams/api';
import { Credentials } from './Credentials';
import { groupRoster, parseRoster } from './parseRoster';
import { addTestPlayers } from './testPlayers';

export interface TeamTarget {
  id: number;
  name: string;
  members: number;
  side: 'red' | 'blue';
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');

/** Getting people in: a pasted list of names (accounts with generated passwords), or test accounts for a dry run. */
export function AddPlayers({ drillId, teams, maxParticipants, enrolled }: { drillId: number; teams: TeamTarget[]; maxParticipants: number; enrolled: number }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [chosen, setTarget] = useState<string | null>(null);
  // Until the operator picks one, the first team (or Red when there are no teams). Teams may load after this mounts.
  const target = chosen ?? (teams.length ? `team:${teams[0].id}` : 'side:red');
  const [names, setNames] = useState('');
  const [created, setCreated] = useState<CreatedPlayer[] | null>(null);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['roster', drillId] }), qc.invalidateQueries({ queryKey: ['teams', drillId] }), qc.invalidateQueries({ queryKey: ['range-health', drillId] })]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const fallback = (() => {
    if (target.startsWith('team:')) {
      const team = teams.find((t) => t.id === Number(target.slice(5)));
      if (team) return { side: team.side, teamId: team.id };
    }
    return { side: target === 'side:blue' ? ('blue' as const) : ('red' as const), teamId: undefined };
  })();
  const parsed = parseRoster(names, teams, fallback);
  const free = Math.max(0, maxParticipants - enrolled);
  const tooMany = parsed.rows.length > free;
  const perTeam = teams.map((t) => ({ name: t.name, count: parsed.rows.filter((r) => r.teamId === t.id).length })).filter((t) => t.count > 0);

  const create = () =>
    act(async () => {
      const made: CreatedPlayer[] = [];
      for (const group of groupRoster(parsed.rows)) {
        made.push(...(await teamsApi.bulkCreate(drillId, { names: group.names, side: group.side, team_id: group.teamId })).players);
      }
      setCreated(made);
      setNames('');
    });

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Add players</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="names">
          <TabsList className="mb-4">
            <TabsTrigger value="names">Paste names</TabsTrigger>
            <TabsTrigger value="test">Test players</TabsTrigger>
          </TabsList>

          <TabsContent value="names" className="space-y-3">
            <p className="text-muted-foreground">
              One name per line. Each person gets an account with a generated password, enrolled right away. You hand them the username and password; <b className="font-medium">they must choose their own password the first time they sign in</b>.
              {teams.length > 0 ? ' Put a team after a comma to place people, like "Ana Smith, Bravo".' : ' Put red or blue after a comma to choose a side, like "Ana Smith, blue".'}
            </p>
            <label className="block space-y-1">
              <span className="block text-xs text-muted-foreground">Lines without a place go to</span>
              <Select aria-label="Add to" value={target} onChange={(e) => setTarget(e.target.value)} className="w-60">
                {teams.length > 0 ? (
                  teams.map((t) => (
                    <option key={t.id} value={`team:${t.id}`}>
                      {t.name} ({t.side})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="side:red">Red team</option>
                    <option value="side:blue">Blue team</option>
                  </>
                )}
              </Select>
            </label>
            <Textarea aria-label="Player names" rows={8} value={names} placeholder={teams.length ? 'Ana Smith, Alpha\nBen Lee, Alpha\nCara Jones, Bravo' : 'Ana Smith\nBen Lee, blue\nCara Jones'} onChange={(e) => setNames(e.target.value)} />
            {parsed.errors.length > 0 && (
              <ul role="alert" className="space-y-0.5 text-xs text-danger">
                {parsed.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {parsed.rows.length > 0 && (
              <p className={tooMany ? 'text-xs text-danger' : 'text-xs text-muted-foreground'} aria-live="polite">
                {parsed.rows.length} player{parsed.rows.length === 1 ? '' : 's'}
                {perTeam.length > 0 && ` (${perTeam.map((t) => `${t.name} ${t.count}`).join(', ')})`}
                {tooMany ? `. Only ${free} seat${free === 1 ? '' : 's'} left.` : ''}
              </p>
            )}
            <Button disabled={busy || parsed.rows.length === 0 || parsed.errors.length > 0 || tooMany} onClick={create}>
              Create {parsed.rows.length || ''} account{parsed.rows.length === 1 ? '' : 's'}
            </Button>
          </TabsContent>

          <TabsContent value="test" className="space-y-3">
            <p className="text-muted-foreground">For a dry run: one Red and one Blue test account, enrolled now. They keep the password shown. Disable them under Settings when you are done.</p>
            <Button
              disabled={busy}
              onClick={() =>
                act(async () => {
                  setCreated(await addTestPlayers(drillId));
                })
              }
            >
              Add test players
            </Button>
          </TabsContent>
        </Tabs>
        {created && (
          <div className="mt-4">
            <Credentials players={created} onDone={() => setCreated(null)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
