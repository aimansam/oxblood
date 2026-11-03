import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Snowflake } from 'lucide-react';
import { useState } from 'react';
import { http } from '@/api/http';
import { cn } from '@/lib/utils';
import { formatElapsed, useNow } from '@/lib/useNow';
import { useMatchMode, useMyTeam, useScoreboard } from '../competition/api';

interface Objective {
  id: number;
  title: string;
  points: number;
  side: string | null;
}

/** What a player needs while playing: round clock, side and match, freeze notice, objectives. */
export function MissionPanel({ drillId, me, role }: { drillId: number; me: string; role?: string }) {
  const mine = useMyTeam(drillId);
  const board = useScoreboard(drillId);
  const matchMode = useMatchMode(drillId).data;
  const objectives = useQuery({
    queryKey: ['objectives', drillId],
    queryFn: async () => (await http.get<{ objectives: Objective[] }>(`/api/v2/drills/${drillId}/objectives`)).objectives,
    staleTime: 60_000,
  });
  const now = useNow();
  // Open on a wide screen; on a phone the objectives wait behind the header so the map keeps its room.
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const team = mine.data?.team;
  // With no round running the account's own side decides which objectives to show.
  const accountSide = ['red', 'blue'].includes(String(role).toLowerCase()) ? String(role).toLowerCase() : null;
  const side = mine.data?.side ?? accountSide;
  const round = mine.data?.round;
  const list = (objectives.data ?? []).filter((o) => !side || !o.side || o.side === side);
  const captain = team?.members.find((m) => m.user_id === team.captain_user_id)?.sub;

  return (
    <section
      aria-label="Mission"
      className="w-full rounded-lg border border-border bg-card text-sm"
    >
      <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="flex items-center gap-2 font-semibold">
          {round ? round.name : 'Mission'}
          {side && <span className={cn('text-xs uppercase', side === 'red' ? 'text-danger' : 'text-info')}>{side}</span>}
        </span>
        <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
          {round && <span aria-label="Round time">{formatElapsed(round.started_at, now)}</span>}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {team && (
            <p className="text-muted-foreground">
              {team.name}
              {matchMode === 'separate' && <> · Match {team.match_number}</>}
              {!round && ' · waiting for the next round'}
            </p>
          )}
          {board.data?.frozen && (
            <p role="status" className="flex items-center gap-1.5 text-info">
              <Snowflake className="h-3.5 w-3.5" /> Scoreboard frozen
            </p>
          )}
          {side === 'blue' && captain && captain !== me && <p className="text-muted-foreground">Your captain, {captain}, submits Blue answers.</p>}
          {list.length > 0 && (
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Objectives</div>
              <ul className="space-y-1">
                {list.map((o) => (
                  <li key={o.id} className="flex justify-between gap-3">
                    <span>{o.title}</span>
                    {o.points > 0 && <span className="tabular-nums text-muted-foreground">{o.points}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
