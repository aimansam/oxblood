import { forwardRef, useId, useImperativeHandle, useMemo, useRef } from 'react';
import { type Camera, useCamera } from './camera';
import { liveAsset, nodeState } from './model';
import './rangeMap.css';
import type { Box, DeviceMeta, Layout, LiveAsset } from './types';

export type Filter = 'all' | 'red' | 'blue' | 'shared';
export type Selection = { kind: 'node'; role: string } | { kind: 'edge'; network: string } | null;

/** Machine icon in local coordinates, centred on (0, 0). */
function DeviceIcon({ cls }: { cls: DeviceMeta['cls'] }) {
  if (cls === 'router')
    return (
      <>
        <circle className="rm-icon-shape" r="30" />
        <path className="rm-icon-line" d="M-18 0h36M0 -18v36M-13 -13l-10 -10M13 -13l10 -10M-13 13l-10 10M13 13l10 10" />
      </>
    );
  if (cls === 'server' || cls === 'log')
    return (
      <>
        <rect className="rm-icon-shape" x="-24" y="-36" width="48" height="72" rx="6" />
        <path className="rm-icon-line" d="M-14 -18h28M-14 0h28M-14 18h28" />
        <circle className="rm-led" cx="16" cy="-18" r="3" />
        <circle className="rm-led" cx="16" cy="18" r="3" />
      </>
    );
  const screen = <rect className="rm-icon-shape" x="-32" y="-30" width="64" height="42" rx="6" />;
  if (cls === 'windows')
    return (
      <>
        {screen}
        <path className="rm-icon-line" d="M-16 -18h13v13h-13zM3 -18h13v13H3zM-16 1h13v13h-13zM3 1h13v13H3zM0 12v18M-18 30h36" />
      </>
    );
  if (cls === 'kali' || cls === 'debian' || cls === 'ubuntu' || cls === 'linux')
    return (
      <>
        {screen}
        <path className="rm-icon-line" d="M-18 -9l8 7-8 7M-5 5h15M0 12v18M-18 30h36" />
      </>
    );
  return (
    <>
      {screen}
      <path className="rm-icon-line" d="M-18 -9h36M0 12v18M-18 30h36" />
    </>
  );
}

export interface RangeMapProps {
  layout: Layout;
  live: LiveAsset[];
  filter: Filter;
  selected: Selection;
  /** Wire packets animate only while "play flow" is on. */
  playing: boolean;
  /** Zones that hold nothing this viewer may see (a player sees only their own side). */
  fogged: Set<string>;
  onNode: (role: string) => void;
  onEdge: (network: string) => void;
}

export const RangeMap = forwardRef<Camera, RangeMapProps>(function RangeMap({ layout, live, filter, selected, playing, fogged, onNode, onEdge }, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, '');
  const full = useMemo<Box>(() => [0, 0, layout.width, layout.height], [layout.width, layout.height]);
  const camera = useCamera(svgRef, full);
  useImperativeHandle(ref, () => camera);
  const pick = (action: () => void) => () => {
    if (!camera.justDragged()) action();
  };
  const keys = (action: () => void) => (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className="rm" data-filter={filter}>
      <svg ref={svgRef} className="rm-svg" viewBox={full.join(' ')} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Range topology">
        <defs>
          <pattern id={`${id}-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" className="rm-grid-line" />
          </pattern>
          <radialGradient id={`${id}-glow`} cx="52%" cy="48%" r="74%">
            <stop offset="0%" stopColor="#1e3a5f" stopOpacity=".28" />
            <stop offset="56%" stopColor="#0b1320" stopOpacity=".12" />
            <stop offset="100%" stopColor="#05080d" stopOpacity=".72" />
          </radialGradient>
        </defs>
        <rect className="rm-bg" width={layout.width} height={layout.height} rx="8" />
        <rect fill={`url(#${id}-glow)`} width={layout.width} height={layout.height} rx="8" />
        <rect fill={`url(#${id}-grid)`} width={layout.width} height={layout.height} />

        {layout.zones.map((zone) => {
          const dim = fogged.has(zone.key);
          return (
            <g key={zone.key} className={dim ? 'rm-fog' : undefined} data-testid={`zone-${zone.key}`}>
              <rect className="rm-zone" data-zone={zone.key} x={zone.x} y={24} width={zone.w} height={layout.height - 48} rx="8" />
              <text className="rm-zone-title" data-zone={zone.key} textAnchor={zone.anchor} x={zone.textX} y={58}>
                {zone.title}
              </text>
              {zone.subtitle && (
                <text className="rm-zone-sub" textAnchor={zone.anchor} x={zone.textX} y={78}>
                  {zone.subtitle}
                </text>
              )}
              {dim && (
                <text className="rm-fog-note" x={zone.x + zone.w / 2} y={layout.height / 2}>
                  Not visible to your team
                </text>
              )}
            </g>
          );
        })}

        <g>
          {layout.edges.map((edge, index) => {
            const isSelected = selected?.kind === 'edge' && selected.network === edge.network;
            const activate = () => onEdge(edge.network);
            const duration = (2.6 + (index % 3) * 0.45).toFixed(2);
            const offset = (index * 0.61).toFixed(2);
            return (
              <g key={edge.key} className="rm-edge" data-side={edge.side}>
                <path className={`rm-wire${isSelected ? ' rm-selected' : ''}`} data-side={edge.side} data-network={edge.network} d={edge.path} aria-hidden="true">
                  <title>{edge.network}</title>
                </path>
                {playing && (
                  <circle className="rm-packet" data-side={edge.side} r="3.5" aria-hidden="true">
                    <animateMotion dur={`${duration}s`} begin={`-${offset}s`} repeatCount="indefinite" path={edge.path} />
                  </circle>
                )}
                <path className="rm-hit" d={edge.path} tabIndex={0} role="button" aria-label={`Inspect ${edge.network} link`} onClick={pick(activate)} onKeyDown={keys(activate)} />
              </g>
            );
          })}
        </g>

        {layout.nodes.map((node) => {
          const liveNode = liveAsset(node.asset, live);
          const state = nodeState(liveNode);
          const activate = () => onNode(node.asset.role);
          const isSelected = selected?.kind === 'node' && selected.role === node.asset.role;
          return (
            <g
              key={node.key}
              className={`rm-node${isSelected ? ' rm-selected' : ''}`}
              data-cls={node.meta.cls}
              data-side={node.side}
              data-state={state}
              data-role={node.asset.role}
              transform={`translate(${node.x} ${node.y})`}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${node.label}`}
              onClick={pick(activate)}
              onKeyDown={keys(activate)}
            >
              <title>{`${node.label} - ${node.meta.kind} (${state})`}</title>
              <circle className="rm-halo" cy="-12" r="43" />
              <circle className="rm-pulse" cy="-12" r="35" />
              <circle className="rm-status" cx="-58" cy="-44" r="5" />
              <g transform="translate(0 -12)">
                <DeviceIcon cls={node.meta.cls} />
              </g>
              <rect className="rm-badge" x="15" y="14" width="46" height="18" rx="9" />
              <text className="rm-badge-text" x="38" y="27">
                {node.meta.os}
              </text>
              <text className="rm-name" y="62">
                {node.label}
              </text>
              <text className="rm-kind" y="80">
                {node.meta.kind}
              </text>
            </g>
          );
        })}

        {layout.bridge.length > 0 && (
          <text className="rm-bridge" x={layout.width / 2} y={layout.height - 34}>
            bridge: {layout.bridge.join(', ')}
          </text>
        )}
      </svg>
    </div>
  );
});
