import { AppWindow, Box as BoxIcon, Network, ScrollText, Server, Terminal } from 'lucide-react';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { type Camera, useCamera } from './camera';
import { NODE_H, NODE_W, liveAsset, nodeState } from './model';
import './rangeMap.css';
import type { Box, Layout, LiveAsset, NodeState } from './types';

export type Filter = 'all' | 'red' | 'blue' | 'shared';
export type Selection = { kind: 'node'; role: string } | { kind: 'edge'; network: string } | null;

const ICONS = { kali: Terminal, debian: Terminal, ubuntu: Terminal, linux: Terminal, windows: AppWindow, router: Network, server: Server, log: ScrollText, vm: BoxIcon } as const;

const STATE_TEXT: Record<NodeState, string> = { running: 'Running', starting: 'Starting…', failed: 'Needs attention', stopped: 'Stopped', planned: 'Not started' };

/** Status mark at (cx, cy). Shape differs per state, so it never relies on colour alone. */
function StatusMark({ state, cx, cy }: { state: NodeState; cx: number; cy: number }) {
  if (state === 'failed')
    return (
      <g>
        <path className="rm-st-failed" d={`M${cx} ${cy - 7} L${cx + 7} ${cy + 6} H${cx - 7} Z`} />
        <text className="rm-st-bang" x={cx} y={cy + 4.5}>
          !
        </text>
      </g>
    );
  if (state === 'stopped') return <rect className="rm-st-stopped" x={cx - 5} y={cy - 5} width="10" height="10" rx="2" />;
  return <circle className={`rm-st-${state}`} cx={cx} cy={cy} r={state === 'running' ? 5 : 4.5} />;
}

const ACRONYMS = /^(vlan|dmz|dc\d*|wan|lan|dns|sdn|vm)$/i;
/** "red_vlan" -> "Red VLAN": capitalise words, keep network acronyms upper case. */
const titleCase = (text: string) =>
  text
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (ACRONYMS.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

const shorten = (text: string, max = 16) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

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
        {layout.zones.map((zone) => {
          const dim = fogged.has(zone.key);
          return (
            <g key={zone.key} className={dim ? 'rm-fog' : undefined} data-testid={`zone-${zone.key}`}>
              <rect className="rm-zone" x={zone.x} y={24} width={zone.w} height={layout.height - 48} rx="12" />
              <circle className="rm-zone-dot" data-zone={zone.key} cx={zone.x + 22} cy={53} r="4.5" />
              <text className="rm-zone-title" x={zone.x + 34} y={58}>
                {titleCase(zone.title)}
              </text>
              {zone.subtitle && (
                <text className="rm-zone-sub" x={zone.x + 18} y={80}>
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
                  <circle className="rm-packet" r="3.5" aria-hidden="true">
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
          const Icon = ICONS[node.meta.cls];
          const detail = state === 'failed' ? STATE_TEXT.failed : liveNode?.ip || STATE_TEXT[state];
          return (
            <g
              key={node.key}
              className={`rm-node${isSelected ? ' rm-selected' : ''}`}
              data-cls={node.meta.cls}
              data-side={node.side}
              data-state={state}
              data-role={node.asset.role}
              transform={`translate(${node.x - NODE_W / 2} ${node.y - NODE_H / 2})`}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${node.label}`}
              onClick={pick(activate)}
              onKeyDown={keys(activate)}
            >
              <title>{`${node.label} · ${node.meta.kind} · ${STATE_TEXT[state]}${liveNode?.ip ? ` · ${liveNode.ip}` : ''}`}</title>
              <rect className="rm-card" width={NODE_W} height={NODE_H} rx="12" />
              <rect className="rm-tile" x="12" y="18" width="36" height="36" rx="9" />
              <Icon className="rm-icon" x={18} y={24} width={24} height={24} strokeWidth={1.8} />
              <text className="rm-name" x="60" y="32">
                {shorten(node.label)}
              </text>
              <text className="rm-sub" x="60" y="52">
                {detail}
              </text>
              <StatusMark state={state} cx={NODE_W - 18} cy={20} />
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
