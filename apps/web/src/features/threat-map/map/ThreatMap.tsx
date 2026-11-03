import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Inspector } from './Inspector';
import { MapToolbar } from './MapToolbar';
import { type Filter, RangeMap, type Selection } from './RangeMap';
import { StoryFeed } from './StoryFeed';
import type { Camera } from './camera';
import { emptyZones, layoutTopology, runtimeSpec } from './model';
import type { ThreatMapPayload } from './types';

/** The interactive range map with its docked panels: details and context at the side, the story feed below. */
export function ThreatMap({
  drillId,
  operator,
  payload,
  loading,
  error,
  onRetry,
  dock,
}: {
  drillId: number;
  operator: boolean;
  payload: ThreatMapPayload | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Context panels for the side dock (player mission and flag form, referee status). */
  dock?: React.ReactNode;
}) {
  const camera = useRef<Camera>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Selection>(null);
  const [legend, setLegend] = useState(false);
  const [story, setStory] = useState(false);
  const [playing, setPlaying] = useState(false);

  const spec = runtimeSpec(payload);
  const signature = JSON.stringify([spec.assets, spec.networks]);
  // Only a changed topology re-lays-out the map; status and address refreshes just recolour it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => (spec.assets.length || spec.networks.length ? layoutTopology(spec.assets, spec.networks) : null), [signature]);
  const fogged = useMemo(() => (layout && !operator ? emptyZones(layout) : new Set<string>()), [layout, operator]);

  const introduced = useRef(false);
  useEffect(() => {
    if (layout && !introduced.current) {
      introduced.current = true;
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        // The whole range is unreadable at phone width: open on a machine and let the player pan.
        const target = (operator && layout.nodes.find((n) => n.meta.cls === 'router')) || layout.nodes[0];
        if (target) camera.current?.focus({ x: target.x - 90, y: target.y - 70, w: 180, h: 140 }, 3);
      } else camera.current?.intro();
    }
  }, [layout, operator]);

  if (!layout) {
    const message = error && !payload ? (
      <div role="alert" className="space-y-3">
        <strong className="block text-lg">Range graph unavailable</strong>
        <p className="text-muted-foreground">{error.message || 'The live topology could not be loaded.'}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry map
        </Button>
      </div>
    ) : loading || !payload ? (
      <div className="w-72 space-y-2" aria-busy="true">
        <Skeleton className="h-2 w-full" />
        <strong className="block">Loading range graph</strong>
        <small className="text-muted-foreground">Waiting for machines and VLAN telemetry.</small>
      </div>
    ) : (
      <div>
        <strong className="block text-lg">No topology is attached to this drill</strong>
        <p className="text-muted-foreground">Provisioning can continue, but the scenario graph is not available yet.</p>
      </div>
    );
    return (
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">{message}</div>
        {dock && <Dock>{dock}</Dock>}
      </div>
    );
  }

  const live = payload?.assets ?? [];
  const selectNode = (role: string) => {
    const node = layout.nodes.find((n) => n.asset.role === role);
    if (!node) return;
    setSelected({ kind: 'node', role });
    camera.current?.focus({ x: node.x - 90, y: node.y - 70, w: 180, h: 140 });
  };
  const selectEdge = (network: string) => {
    const edge = layout.edges.find((e) => e.network === network);
    setSelected({ kind: 'edge', network });
    if (edge) camera.current?.focus({ x: edge.box.x - 40, y: edge.box.y - 40, w: edge.box.w + 80, h: edge.box.h + 80 }, 1.4);
  };
  const clear = () => setSelected(null);

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <RangeMap ref={camera} layout={layout} live={live} filter={filter} selected={selected} playing={playing} fogged={fogged} onNode={selectNode} onEdge={selectEdge} />
          <MapToolbar
            operator={operator}
            filter={filter}
            onFilter={setFilter}
            legend={legend}
            onLegend={() => setLegend((v) => !v)}
            story={story}
            onStory={() => setStory((v) => !v)}
            playing={playing}
            onPlaying={() => setPlaying((v) => !v)}
            onFit={() => camera.current?.fit()}
            onReveal={() => camera.current?.intro()}
            onZoom={(factor) => camera.current?.zoomBy(factor)}
          />
          {legend && (
            <div role="region" aria-label="VLAN legend" className="absolute inset-x-3 top-14 z-10 flex flex-wrap gap-2 rounded-lg border border-border bg-card/95 p-2 text-xs shadow-sm backdrop-blur md:left-auto md:max-w-md">
              {spec.networks.map((n) => (
                <span key={n.name} className="rounded border border-border px-2 py-1">
                  <strong>{n.name}</strong> <small className="text-muted-foreground">{[n.vlan_id ? `VLAN ${n.vlan_id}` : '', n.cidr].filter(Boolean).join(' · ')}</small>
                </span>
              ))}
            </div>
          )}
        </div>
        {operator && story && (
          <StoryFeed
            drillId={drillId}
            roles={layout.nodes.map((n) => n.asset.role)}
            onFocusRole={selectNode}
            onNoMatch={() => {
              clear();
              camera.current?.fit();
            }}
          />
        )}
      </div>
      <Dock>
        {dock}
        <Inspector selection={selected} layout={layout} networks={spec.networks} live={live} drillId={drillId} onSelectNode={selectNode} onClose={clear} />
        {!selected && operator && <p className="px-1 text-xs text-muted-foreground">Select a machine or a link to inspect it.</p>}
      </Dock>
    </div>
  );
}

/** Side panel on wide screens, a panel under the map on narrow ones. The map shrinks to make room. */
function Dock({ children }: { children: React.ReactNode }) {
  return (
    <aside aria-label="Side panel" className="flex max-h-[42vh] w-full shrink-0 flex-col gap-3 overflow-auto border-t border-border bg-card/40 p-3 md:max-h-none md:w-80 md:border-l md:border-t-0">
      {children}
    </aside>
  );
}
