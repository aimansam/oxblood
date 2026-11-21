import { useEffect, useState } from 'react';
import { useDrills } from '@/api/hooks';
import { useHealth } from '@/features/settings/api';
import { cn } from '@/lib/utils';

function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toISOString().slice(11, 19);
}

function Readout({ led, label, value }: { led: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={cn('led', led)} />
      <span className="hud-label">{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </span>
  );
}

function LiveCount() {
  const drills = useDrills();
  const live = (drills.data ?? []).filter((d) => d.status === 'active').length;
  return <Readout led={live > 0 ? 'led-ok led-pulse' : ''} label="Active" value={drills.isLoading ? '…' : String(live)} />;
}

/** Operations-center strip: exercise banner, live count, platform health, UTC clock. Read-only. */
export function StatusBar({ operator }: { operator: boolean }) {
  const clock = useUtcClock();
  const health = useHealth();
  const up = health.data?.health?.status === 'ok';
  const ready = health.data?.ready != null && up;
  return (
    <div role="group" aria-label="Platform status" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border bg-card/60 px-4 py-1.5 backdrop-blur md:px-8">
      <span className="hud-label !text-primary">Exercise environment · simulated targets only</span>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {operator && <LiveCount />}
        <Readout led={health.isLoading ? '' : up ? 'led-ok' : 'led-danger'} label="API" value={health.isLoading ? '…' : up ? 'online' : 'down'} />
        {operator && <Readout led={health.isLoading ? '' : ready ? 'led-ok' : 'led-warn'} label="Ready" value={health.isLoading ? '…' : ready ? 'yes' : 'no'} />}
        <span aria-hidden className="font-mono text-xs tabular-nums text-muted-foreground">{clock} UTC</span>
      </div>
    </div>
  );
}
