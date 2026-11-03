import { useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type CreatedPlayer, type Invitation, inviteUrl, teamsApi } from '../teams/api';
import { Credentials } from './Credentials';
import { addTestPlayers } from './testPlayers';

export interface TeamTarget {
  id: number;
  name: string;
  members: number;
  side: 'red' | 'blue';
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');

/** Everything for getting people in: a link to send, a pasted list of names, or test accounts. */
export function AddPlayers({
  drillId,
  isAdmin,
  teams,
  maxParticipants,
  invitations,
}: {
  drillId: number;
  isAdmin: boolean;
  teams: TeamTarget[];
  maxParticipants: number;
  invitations: Invitation[];
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [chosen, setTarget] = useState<string | null>(null);
  // Until the operator picks one, the first team (or Red when there are no teams). Teams may load after this mounts.
  const target = chosen ?? (teams.length ? `team:${teams[0].id}` : 'side:red');
  const [seats, setSeats] = useState('');
  const [hours, setHours] = useState('24');
  const [link, setLink] = useState<{ drillId: number; url: string; label: string } | null>(null);
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

  // The target is either a side (no teams) or one of the teams.
  const resolved = (() => {
    if (target.startsWith('team:')) {
      const team = teams.find((t) => t.id === Number(target.slice(5)));
      if (team) return { side: team.side, teamId: team.id, label: team.name, members: team.members };
    }
    const side = target === 'side:blue' ? 'blue' : 'red';
    return { side, teamId: undefined, label: side === 'red' ? 'Red' : 'Blue', members: 0 };
  })() as { side: 'red' | 'blue'; teamId: number | undefined; label: string; members: number };
  const suggested = resolved.teamId && teams.length ? Math.max(1, Math.ceil(maxParticipants / teams.length) - resolved.members) : 1;
  const seatCount = Math.max(1, Math.min(30, Number(seats) || suggested));
  const lines = names.split('\n').map((n) => n.trim()).filter(Boolean);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed. Select the link and copy it by hand.');
    }
  };

  const targetSelect = (
    <Select aria-label="Add to" value={target} onChange={(e) => { setTarget(e.target.value); setSeats(''); }}>
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
  );

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Add players</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="link">
          <TabsList className="mb-4">
            <TabsTrigger value="link">Invite link</TabsTrigger>
            {isAdmin && <TabsTrigger value="names">Paste names</TabsTrigger>}
            {isAdmin && <TabsTrigger value="test">Test players</TabsTrigger>}
          </TabsList>

          <TabsContent value="link" className="space-y-4">
            <p className="text-muted-foreground">Send one link. Each person who opens it picks a username and password and joins automatically. A team link works for several people, up to the seats you set.</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Add to</span>
                {targetSelect}
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Seats</span>
                <Input aria-label="Seats" type="number" min={1} max={30} className="w-24" value={seats} placeholder={String(suggested)} onChange={(e) => setSeats(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Valid for</span>
                <Select aria-label="Valid for" value={hours} onChange={(e) => setHours(e.target.value)}>
                  <option value="24">24 hours</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                </Select>
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const made = await teamsApi.invite(drillId, resolved.side, { teamId: resolved.teamId, maxUses: seatCount, hours: Number(hours) });
                    setLink({ drillId, url: inviteUrl(made.token), label: `${resolved.label} · ${seatCount} seat${seatCount === 1 ? '' : 's'}` });
                  })
                }
              >
                Create link
              </Button>
            </div>
            {link && link.drillId === drillId && (
              <div role="status" className="space-y-2 rounded-md border border-success/40 bg-success/10 p-3">
                <div className="font-medium text-success">Link ready: {link.label}</div>
                <div className="text-xs text-muted-foreground">Copy it now; it cannot be shown again after you leave this page.</div>
                <div className="flex gap-2">
                  <Input readOnly aria-label="Participant invitation link" value={link.url} onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="outline" onClick={() => copy(link.url)}>
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                </div>
              </div>
            )}
            {invitations.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Open links ({invitations.length})</h3>
                <ul className="divide-y divide-border">
                  {invitations.map((i) => {
                    const team = teams.find((t) => t.id === i.team_id);
                    return (
                      <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                        <span>
                          <span className="capitalize">{team ? team.name : `${i.side} link`}</span>
                          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                            {i.uses ?? 0} of {i.max_uses ?? 1} used
                          </span>
                        </span>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(async () => { await teamsApi.revoke(drillId, i.id); toast.success('Link revoked'); })}>
                          Revoke
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </TabsContent>

          {isAdmin && (
            <TabsContent value="names" className="space-y-3">
              <p className="text-muted-foreground">Paste one name per line. Each gets an account with a generated password, enrolled right away. Use this when nobody has an account yet.</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="space-y-1">
                  <span className="block text-xs text-muted-foreground">Add to</span>
                  {targetSelect}
                </label>
              </div>
              <Textarea aria-label="Player names" rows={6} value={names} placeholder={'Ana Smith\nBen Lee\nCara Jones'} onChange={(e) => setNames(e.target.value)} />
              <Button
                disabled={busy || lines.length === 0}
                onClick={() =>
                  act(async () => {
                    const made = await teamsApi.bulkCreate(drillId, { names: lines, side: resolved.side, team_id: resolved.teamId });
                    setCreated(made.players);
                    setNames('');
                  })
                }
              >
                Create {lines.length || ''} account{lines.length === 1 ? '' : 's'}
              </Button>
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="test" className="space-y-3">
              <p className="text-muted-foreground">For a dry run: one Red and one Blue test account, enrolled now. Disable them under Settings when you are done.</p>
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
          )}
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
