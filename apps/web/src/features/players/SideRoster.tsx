import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { participantName, teamsApi, useRoster } from '../teams/api';

const SIDES = ['red', 'blue'] as const;

/** Red and Blue columns for an exercise without teams: who is enrolled, and adding existing accounts. */
export function SideRoster({ drillId, scheduled }: { drillId: number; scheduled: boolean }) {
  const queryClient = useQueryClient();
  const roster = useRoster(drillId);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await queryClient.invalidateQueries({ queryKey: ['roster', drillId] });
      await queryClient.invalidateQueries({ queryKey: ['range-health', drillId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  if (roster.isLoading) return <Skeleton className="h-48 w-full" />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {SIDES.map((side) => {
        const members = (roster.data?.participants ?? []).filter((p) => String(p.role).toLowerCase() === side);
        const available = (roster.data?.candidates ?? []).filter((c) => String(c.role).toLowerCase() === side);
        return (
          <Card key={side}>
            <CardHeader>
              <CardTitle className={cn(side === 'red' ? 'text-danger' : 'text-info')}>{side === 'red' ? 'Red team' : 'Blue team'}</CardTitle>
              <span className="text-xs text-muted-foreground">{members.length} assigned</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {members.length === 0 ? (
                <p className="text-muted-foreground">No player assigned</p>
              ) : (
                <ul className="divide-y divide-border">
                  {members.map((p) => (
                    <li key={p.user_id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        <b className="font-medium">{participantName(p)}</b>
                        <span className="ml-2 text-xs text-muted-foreground">{p.last_login_at ? 'signed in' : 'not signed in'}</span>
                      </span>
                      {scheduled && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => teamsApi.remove(drillId, p.user_id), 'Player removed')}>
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {scheduled && (
                <div className="flex gap-2">
                  <Select aria-label={`Choose ${side} player`} value={pick[side] ?? ''} onChange={(e) => setPick((s) => ({ ...s, [side]: e.target.value }))}>
                    <option value="">Add existing {side} account</option>
                    {available.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sub}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="outline"
                    disabled={busy || !pick[side]}
                    onClick={() => act(() => teamsApi.assign(drillId, Number(pick[side]), side), 'Player added').then(() => setPick((s) => ({ ...s, [side]: '' })))}
                  >
                    Add
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
