import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openAssetConsole } from '../console';
import { liveAsset } from './model';
import type { Layout, LiveAsset, MapNetwork } from './types';
import type { Selection } from './RangeMap';

/** Details for the selected machine or link, with the way into its console. */
export function Inspector({
  selection,
  layout,
  networks,
  live,
  drillId,
  onSelectNode,
  onClose,
}: {
  selection: Selection;
  layout: Layout;
  networks: MapNetwork[];
  live: LiveAsset[];
  drillId: number;
  onSelectNode: (role: string) => void;
  onClose: () => void;
}) {
  if (!selection) return null;
  let body: React.ReactNode = null;

  if (selection.kind === 'node') {
    const node = layout.nodes.find((n) => n.asset.role === selection.role);
    if (!node) return null;
    const liveNode = liveAsset(node.asset, live);
    const status = String(liveNode?.status ?? 'planned').replace(/_/g, ' ');
    const rows: [string, string][] = [
      ['Status', status],
      ['IP address', liveNode?.ip || 'Not assigned'],
      ['Network', (node.asset.networks ?? []).join(', ') || 'No VLAN declared'],
      ['Template', node.asset.template || node.asset.kind || 'Virtual machine'],
    ];
    body = (
      <>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Node inspection</span>
        <h3 className="mt-1 text-lg font-semibold">{node.label}</h3>
        <p className="text-muted-foreground">
          {node.meta.os} · {node.meta.kind}
        </p>
        <dl className="mt-3 divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        {liveNode?.error && <p className="mt-2 text-danger">{liveNode.error}</p>}
        {liveNode?.id && liveNode.console_available ? (
          <Button className="mt-3 w-full" size="sm" onClick={() => void openAssetConsole(drillId, liveNode.id as number)}>
            Enter workstation
          </Button>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Workstation access becomes available when the node is ready.</p>
        )}
      </>
    );
  } else {
    const network = networks.find((n) => n.name === selection.network) ?? ({ name: selection.network } as MapNetwork);
    const connected = layout.nodes.filter((n) => (n.asset.networks ?? []).includes(selection.network));
    body = (
      <>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Link inspection</span>
        <h3 className="mt-1 text-lg font-semibold">{selection.network}</h3>
        <p className="text-muted-foreground">
          VLAN {network.vlan_id ?? '—'} · {network.cidr || 'No CIDR declared'}
        </p>
        <dl className="mt-3 divide-y divide-border">
          {(
            [
              ['Isolation', network.isolation || 'Declared by scenario'],
              ['Egress', network.egress || 'Restricted'],
              ['Connected nodes', String(connected.length)],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {connected.map((n) => (
            <Button key={n.key} size="sm" variant="outline" onClick={() => onSelectNode(n.asset.role)}>
              {n.label}
            </Button>
          ))}
        </div>
      </>
    );
  }

  return (
    <aside aria-label="Details" className="map-overlay absolute bottom-16 right-3 top-24 z-20 w-[min(340px,calc(100%-1.5rem))] overflow-auto rounded-lg border border-border bg-card/90 p-4 text-sm shadow-xl backdrop-blur">
      <button type="button" className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close details" onClick={onClose}>
        <X className="h-4 w-4" />
      </button>
      {body}
    </aside>
  );
}
