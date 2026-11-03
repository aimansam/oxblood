import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { http } from '@/api/http';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface StoryEvent {
  id: number;
  kind: string;
  title: string;
  detail: string | null;
  side: string | null;
  actor: string | null;
  created_at: string | null;
}

/** The recorded events of the exercise, oldest first, with a replay that walks the map through them. */
export function StoryFeed({ drillId, roles, onFocusRole, onNoMatch }: { drillId: number; roles: string[]; onFocusRole: (role: string) => void; onNoMatch: () => void }) {
  const query = useQuery({
    queryKey: ['timeline', drillId],
    refetchInterval: 12_000,
    queryFn: async () => (await http.get<{ events: StoryEvent[] }>(`/api/v2/drills/${drillId}/timeline?limit=50`)).events,
  });
  const events = [...(query.data ?? [])].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
  const [active, setActive] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0); // index of the next event the replay will show

  const select = (index: number) => {
    const event = events[index];
    if (!event) return;
    setActive(index);
    const text = [event.title, event.detail, event.actor].filter(Boolean).join(' ').toLowerCase();
    const role = roles.find((r) => text.includes(r.toLowerCase()) || text.includes(r.toLowerCase().replace(/_/g, ' ')));
    if (role) onFocusRole(role);
    else onNoMatch();
  };
  // Keep the timer pointing at the latest select() without restarting it on every render.
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });

  useEffect(() => {
    if (!playing) return;
    let i = position >= events.length ? 0 : position;
    const step = () => {
      if (i >= events.length) return setPlaying(false);
      selectRef.current(i);
      i += 1;
      setPosition(i);
      if (i >= events.length) setPlaying(false);
    };
    step();
    const timer = setInterval(step, 2400 / speed);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  return (
    <section aria-label="Mission record" className="max-h-[36vh] shrink-0 overflow-hidden border-t border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <span className="block text-xs uppercase tracking-widest text-muted-foreground">Mission record</span>
          <strong>Story feed</strong>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Replay speed" className="flex overflow-hidden rounded border border-border">
            {[1, 2, 4].map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} className={cn('px-2 py-1 text-xs', speed === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} onClick={() => setSpeed(s)}>
                {s}x
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!events.length) return void query.refetch();
              setPlaying((p) => !p);
            }}
          >
            {playing ? 'Pause story' : position > 0 && position < events.length ? 'Continue story' : 'Replay story'}
          </Button>
        </div>
      </header>
      <div role="log" aria-live="polite" className="max-h-[26vh] overflow-auto">
        {query.isLoading ? (
          <p className="p-3 text-muted-foreground">Syncing the operation record…</p>
        ) : query.isError ? (
          <p className="p-3 text-muted-foreground">Operation record is unavailable.</p>
        ) : events.length === 0 ? (
          <p className="p-3 text-muted-foreground">No recorded events yet. The feed fills as the exercise progresses.</p>
        ) : (
          events.map((event, index) => {
            const side = ['red', 'blue'].includes(String(event.side).toLowerCase()) ? String(event.side).toLowerCase() : 'range';
            return (
              <button
                key={event.id}
                type="button"
                aria-current={active === index}
                className={cn('flex w-full items-start gap-3 border-b border-border px-3 py-2 text-left hover:bg-muted', active === index && 'bg-muted')}
                onClick={() => {
                  setPlaying(false);
                  setPosition(index + 1);
                  select(index);
                }}
              >
                <time className="tabular-nums text-xs text-muted-foreground">{event.created_at ? new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}</time>
                <span className={cn('text-xs font-semibold uppercase', side === 'red' ? 'text-danger' : side === 'blue' ? 'text-info' : 'text-muted-foreground')}>{event.side || event.kind || 'range'}</span>
                <span className="min-w-0">
                  <b className="block truncate font-medium">{event.title || 'Range event'}</b>
                  <small className="block truncate text-muted-foreground">{event.detail || event.actor || ''}</small>
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
