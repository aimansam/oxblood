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

/** The interactive range map: SVG topology, layers, inspector, legend and story feed. */
export function ThreatMap({
  drillId,
  operator,
  payload,
  loading,
  error,
  onRetry,
}: {
  drillId: number;
  operator: boolean;
  payload: ThreatMapPayload | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
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
      camera.current?.intro();
    }
  }, [layout]);

  if (!layout) {
    if (error && !payload) {
      return (
        <div role="alert" className="grid h-full place-items-center p-6 text-center">
          <div className="space-y-3">
            <strong className="block text-lg">Range graph unavailable</strong>
            <p className="text-muted-foreground">{error.message || 'The live topology could not be loaded.'}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry map
            </Button>
          </div>
        </div>
      );
    }
    if (loading || !payload) {
      return (
        <div className="grid h-full place-items-center p-6" aria-busy="true">
          <div className="w-72 space-y-2 text-center">
            <Skeleton className="h-2 w-full" />
            <strong className="block">Loading range graph</strong>
            <small className="text-muted-foreground">Waiting for machines and VLAN telemetry.</small>
          </div>
        </div>
      );
    }
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <strong className="block text-lg">No topology is attached to this drill</strong>
          <p className="text-muted-foreground">Provisioning can continue, but the scenario graph is not available yet.</p>
        </div>
      </div>
    );
  }

  const live = payload?.assets ?? [];
  const selectNode = (role: string) => {
    const node = layout.nodes.find((n) => n.asset.role === role);
    if (!node) return;
    setSelected({ kind: 'node', role });
    camera.current?.focus({ x: node.x - 70, y: node.y - 70, w: 140, h: 150 });
  };
  const selectEdge = (network: string) => {
    const edge = layout.edges.find((e) => e.network === network);
    setSelected({ kind: 'edge', network });
    if (edge) camera.current?.focus({ x: edge.box.x - 40, y: edge.box.y - 40, w: edge.box.w + 80, h: edge.box.h + 80 }, 1.4);
  };
  const clear = () => setSelected(null);

  return (
    <div className="relative h-full w-full">
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
        <div role="region" aria-label="VLAN legend" className="map-overlay absolute bottom-16 left-3 z-10 flex max-w-[min(720px,calc(100%-1.5rem))] flex-wrap gap-2 rounded-lg border border-border bg-card/70 p-2 text-xs backdrop-blur">
          {spec.networks.map((n) => (
            <span key={n.name} className="rounded border border-border px-2 py-1">
              <strong>{n.name}</strong> <small className="text-muted-foreground">{[n.vlan_id ? `VLAN ${n.vlan_id}` : '', n.cidr].filter(Boolean).join(' | ')}</small>
            </span>
          ))}
        </div>
      )}
      <Inspector selection={selected} layout={layout} networks={spec.networks} live={live} drillId={drillId} onSelectNode={selectNode} onClose={clear} />
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
  );
}
