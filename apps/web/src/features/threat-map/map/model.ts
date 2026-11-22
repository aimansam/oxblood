import type { DeviceMeta, Edge, EdgeSide, Layout, LiveAsset, MapAsset, MapNetwork, NodeState, PlacedNode, Side, ThreatMapPayload, Zone } from './types';

/** The scenario's declared machines and networks, whichever way the spec is wrapped. */
export function runtimeSpec(payload: ThreatMapPayload | undefined): { assets: MapAsset[]; networks: MapNetwork[] } {
  const spec = payload?.scenario?.spec;
  const runtime = (spec && 'spec' in spec && spec.spec ? spec.spec : spec) as { assets?: MapAsset[]; networks?: MapNetwork[] } | undefined;
  return { assets: runtime?.assets ?? [], networks: runtime?.networks ?? [] };
}

export function vmLabel(asset: Pick<MapAsset, 'role' | 'vm_name' | 'count'>, instanceRole: string = asset.role): string {
  const code = String(asset.vm_name ?? '').trim();
  if (!code) return String(instanceRole || 'Machine').replace(/_/g, ' ');
  const count = Math.max(1, Number(asset.count ?? 1));
  if (count <= 1) return code;
  const match = String(instanceRole).match(/_(\d+)$/);
  if (match) return code + String(match[1]).padStart(2, '0');
  return `${code}01–${code}${String(count).padStart(2, '0')}`;
}

export function assetSide(asset: Pick<MapAsset, 'role'>): Side {
  const role = String(asset.role ?? '').toLowerCase();
  if (role.includes('red') || role.includes('attacker') || role.includes('kali')) return 'red';
  if (role.includes('blue') || role.includes('log') || role.includes('analyst') || role.includes('siem')) return 'blue';
  return 'shared';
}

export function deviceMeta(asset: Pick<MapAsset, 'role' | 'template' | 'kind'>): DeviceMeta {
  const role = String(asset.role ?? '').toLowerCase();
  const text = `${role} ${String(asset.template ?? asset.kind ?? '').toLowerCase()}`;
  if (text.includes('kali') || text.includes('attacker')) return { cls: 'kali', os: 'KALI', kind: 'Workstation' };
  if (text.includes('router') || text.includes('firewall') || text.includes('_fw') || text.includes('-fw')) return { cls: 'router', os: 'RTR', kind: 'Router' };
  if (/windows|win11|win10|win2022|winserver|ad-auto/.test(text)) return { cls: 'windows', os: 'WIN', kind: 'Windows' };
  if (text.includes('syslog') || text.includes('siem') || text.includes('log')) return { cls: 'log', os: 'LOG', kind: 'Log server' };
  if (text.includes('file') || text.includes('server')) return { cls: 'server', os: 'SRV', kind: 'Server' };
  if (text.includes('debian')) return { cls: 'debian', os: 'DEB', kind: 'Debian' };
  if (text.includes('ubuntu')) return { cls: 'ubuntu', os: 'UBU', kind: 'Ubuntu' };
  if (text.includes('linux')) return { cls: 'linux', os: 'LIN', kind: 'Linux' };
  return { cls: 'vm', os: 'VM', kind: 'Virtual machine' };
}

const baseRole = (value: string) => String(value ?? '').replace(/_\d+$/, '').toLowerCase();

export function liveAsset(asset: Pick<MapAsset, 'role'>, live: LiveAsset[] | undefined): LiveAsset | null {
  return (live ?? []).find((item) => baseRole(item.role) === baseRole(asset.role)) ?? null;
}

export function nodeState(live: LiveAsset | null): NodeState {
  if (!live) return 'planned';
  const status = String(live.status ?? '').toLowerCase();
  if (status === 'running') return 'running';
  if (status === 'failed') return 'failed';
  if (status === 'stopped') return 'stopped';
  return 'starting';
}

function laneSide(name: string): EdgeSide {
  const lower = String(name ?? '').toLowerCase();
  if (lower.includes('red')) return 'red';
  if (lower.includes('blue')) return 'blue';
  if (lower.includes('dmz') || lower.includes('public') || lower.includes('wan') || lower.includes('shared')) return 'shared';
  return 'neutral';
}

/** Size of a machine card on the map. Rows are spaced from it so cards can never overlap. */
export const NODE_W = 204;
export const NODE_H = 72;
export const ROW_GAP = NODE_H + 44;

type Row = { asset: MapAsset; key: string; x: number; y: number };

/** Port of the classic topology layout: columns of zones, machines stacked in them, a hub per network. */
export function layoutTopology(assets: MapAsset[], networks: MapNetwork[]): Layout {
  const enterprise = networks.length > 3 || networks.some((n) => /dmz|dc0[12]|backup|security/i.test(String(n?.name)));
  const rows: Row[] = assets.map((asset, index) => ({ asset, key: String(asset.role || `asset_${index}`), x: 0, y: 0 }));
  const groups: Record<string, Row[]> = enterprise ? { red: [], dmz: [], transit: [], identity: [], protected: [] } : { red: [], transit: [], blue: [] };
  const netNames = (asset: MapAsset) => (asset.networks ?? []).map((n) => String(n).toLowerCase());
  const groupFor = (asset: MapAsset): string => {
    const role = String(asset.role ?? '').toLowerCase();
    const nets = netNames(asset);
    const meta = deviceMeta(asset);
    if (meta.cls === 'router') return 'transit';
    // A web host with a leg on the public network and another inside (a dual-homed DMZ host) stays in the DMZ column.
    if (enterprise && (role.includes('dmz') || role.includes('web') || (nets.length > 1 && nets[0].includes('public')))) return 'dmz';
    if (nets.length > 1) return 'transit';
    if (role.includes('red') || role.includes('attacker') || meta.cls === 'kali') return 'red';
    if (!enterprise) return 'blue';
    if (nets.some((n) => n.includes('dmz')) || role.includes('dmz') || role.includes('web')) return 'dmz';
    if (role === 'dc01' || role === 'dc02' || nets.some((n) => n.includes('dc01') || n.includes('dc02') || n.includes('workstation'))) return 'identity';
    return 'protected';
  };
  rows.forEach((row) => groups[groupFor(row.asset)].push(row));

  const columns = enterprise
    ? [
        { key: 'red', zoneX: 20, zoneW: 235 },
        { key: 'dmz', zoneX: 285, zoneW: 235 },
        { key: 'transit', zoneX: 550, zoneW: 260 },
        { key: 'identity', zoneX: 830, zoneW: 235 },
        { key: 'protected', zoneX: 1095, zoneW: 245 },
      ]
    : [
        { key: 'red', zoneX: 20, zoneW: 310 },
        { key: 'transit', zoneX: 380, zoneW: 315 },
        { key: 'blue', zoneX: 750, zoneW: 330 },
      ];
  const width = enterprise ? 1360 : 1100;
  const maxRows = Math.max(...columns.map((c) => groups[c.key].length), 1);
  const height = Math.max(480, 190 + maxRows * ROW_GAP);
  const middle = Math.round(height / 2);
  for (const column of columns) {
    const list = groups[column.key];
    const start = list.length > 1 ? middle - ((list.length - 1) * ROW_GAP) / 2 : middle;
    list.forEach((row, idx) => {
      row.x = Math.round(column.zoneX + column.zoneW / 2);
      row.y = Math.round(start + idx * ROW_GAP);
    });
  }

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const wire = (a: Row, b: Row) => {
    if (a.x === b.x) return `M${a.x} ${a.y} V${b.y}`;
    const midX = Math.round((a.x + b.x) / 2);
    return `M${a.x} ${a.y} H${midX} V${b.y} H${b.x}`;
  };
  const addEdge = (from: Row | undefined, to: Row | undefined, network: string) => {
    if (!from || !to || from.key === to.key) return;
    const ids = [from.key, to.key].sort();
    const key = `${ids[0]}|${ids[1]}|${network}`;
    if (seen.has(key)) return;
    seen.add(key);
    const minX = Math.min(from.x, to.x);
    const minY = Math.min(from.y, to.y);
    edges.push({
      key,
      network,
      side: laneSide(network),
      path: wire(from, to),
      box: { x: minX, y: minY, w: Math.abs(from.x - to.x) || 1, h: Math.abs(from.y - to.y) || 1 },
      from: from.key,
      to: to.key,
    });
  };
  for (const network of networks) {
    const name = network?.name ?? '';
    const connected = rows.filter((r) => (r.asset.networks ?? []).includes(name));
    if (connected.length < 2) continue;
    const hub = connected.find((r) => (r.asset.networks ?? []).length > 1 || deviceMeta(r.asset).cls === 'router') ?? connected[0];
    connected.forEach((r) => addEdge(hub, r, name));
  }
  if (!edges.length && rows.length > 1) for (let i = 0; i < rows.length - 1; i += 1) addEdge(rows[i], rows[i + 1], 'link');
  void byKey;

  const findNet = (pattern: RegExp) => networks.find((n) => pattern.test(String(n?.name))) ?? ({} as Partial<MapNetwork>);
  const text = (network: Partial<MapNetwork>, fallback: string) => ({
    title: String(network?.name ?? fallback),
    subtitle: [network?.vlan_id ? `VLAN ${network.vlan_id}` : '', network?.cidr].filter(Boolean).join(' | '),
  });
  const vlans = (pattern: RegExp) =>
    networks
      .filter((n) => pattern.test(String(n?.name)))
      .map((n) => (n.vlan_id ? `VLAN ${n.vlan_id}` : n.name))
      .filter(Boolean)
      .join(' / ');
  const zoneText: Record<string, { title: string; subtitle: string }> = enterprise
    ? {
        red: text(findNet(/red|public/i), 'red access'),
        dmz: text(findNet(/dmz/i), 'dmz'),
        transit: text({}, 'transit'),
        identity: { title: 'identity', subtitle: vlans(/dc0[12]|workstation/i) },
        protected: { title: 'protected services', subtitle: vlans(/backup|security/i) },
      }
    : { red: text(findNet(/red/i), 'red segment'), transit: text(findNet(/dmz|wan|shared|transit/i), 'transit'), blue: text(findNet(/blue/i), 'blue segment') };
  const zones: Zone[] = columns.map((c) => ({ key: c.key, x: c.zoneX, w: c.zoneW, title: zoneText[c.key].title, subtitle: zoneText[c.key].subtitle }));
  const nodes: PlacedNode[] = rows.map((r) => ({ key: r.key, asset: r.asset, x: r.x, y: r.y, meta: deviceMeta(r.asset), side: assetSide(r.asset), label: vmLabel(r.asset) }));
  return {
    width,
    height,
    enterprise,
    zones,
    nodes,
    edges,
    bridge: groups.transit.map((r) => r.asset.role).filter(Boolean),
  };
}

/** The sides a viewer can see on screen: players get only their own range, so empty zones say so. */
export function emptyZones(layout: Layout): Set<string> {
  const used = new Set<string>();
  const columnOf = new Map(layout.zones.map((z) => [z.key, z]));
  for (const node of layout.nodes) {
    // a node belongs to the zone whose x range contains its x
    for (const zone of columnOf.values()) if (node.x >= zone.x && node.x <= zone.x + zone.w) used.add(zone.key);
  }
  return new Set(layout.zones.filter((z) => !used.has(z.key)).map((z) => z.key));
}
