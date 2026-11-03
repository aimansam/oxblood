import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { http } from '@/api/http';
import { Button } from '@/components/ui/button';

interface FinalRow {
  username: string;
  side: string;
  team: string | null;
  points: number;
}

/** What happens to the accounts made for this exercise, and the record that outlives them. */
export function AccountsNotice({ drillId, status, env, isAdmin }: { drillId: number; status: string; env: Record<string, unknown>; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const keep = Boolean(env.keep_accounts);
  const finished = status === 'completed' || status === 'cancelled';
  const roster = (env.final_roster as FinalRow[] | undefined) ?? [];

  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      toast.success(await fn());
      await qc.invalidateQueries({ queryKey: ['drills'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Temporary accounts" className="mb-4 space-y-3 rounded-lg border border-border p-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={!keep}
          disabled={busy || finished}
          onChange={(e) =>
            act(async () => {
              await http.put(`/api/v2/drills/${drillId}/accounts`, { keep: !e.target.checked });
              return e.target.checked ? 'Accounts will be destroyed after cleanup' : 'Accounts will be kept after cleanup';
            })
          }
        />
        <span>
          <b className="font-medium">Destroy the accounts made for this exercise</b> when its range is cleaned up
          <span className="block text-xs text-muted-foreground">Covers invite links, pasted names and test players. Accounts picked from the existing list are never removed. Each player's points are saved in a final roster first.</span>
        </span>
      </label>
      {finished && isAdmin && !keep && roster.length === 0 && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(async () => `${(await http.post<{ destroyed: number }>(`/api/v2/drills/${drillId}/accounts/purge`)).destroyed} account(s) destroyed`)}>
          Destroy the accounts now
        </Button>
      )}
      {roster.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Final roster · {roster.length} accounts destroyed</h3>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th>Side</th>
                  <th>Team</th>
                  <th className="px-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {roster.map((r) => (
                  <tr key={r.username}>
                    <td className="px-3 py-1.5 font-mono">{r.username}</td>
                    <td className="capitalize">{r.side}</td>
                    <td>{r.team ?? '—'}</td>
                    <td className="px-3 text-right tabular-nums">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
