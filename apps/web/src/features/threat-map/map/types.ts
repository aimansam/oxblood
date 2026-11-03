export type Side = 'red' | 'blue' | 'shared';
export type EdgeSide = Side | 'neutral';
export type NodeState = 'running' | 'failed' | 'stopped' | 'starting' | 'planned';

export interface MapNetwork {
  name: string;
  cidr?: string;
  vlan_id?: number | null;
  isolation?: string;
  egress?: string;
}

/** A machine as the scenario declares it. */
export interface MapAsset {
  role: string;
  kind?: string;
  template?: string;
  networks?: string[];
  vm_name?: string;
  count?: number;
}

/** A machine as the running range reports it. */
export interface LiveAsset {
  id?: number;
  role: string;
  status?: string;
  ip?: string | null;
  error?: string | null;
  console_available?: boolean;
}

export interface ThreatMapPayload {
  drill_id: number;
  status: string;
  scenario: { spec?: { spec?: { assets?: MapAsset[]; networks?: MapNetwork[] } } } | null;
  networks?: MapNetwork[];
  assets?: LiveAsset[];
  role?: string | null;
}

export interface DeviceMeta {
  cls: 'kali' | 'router' | 'windows' | 'log' | 'server' | 'debian' | 'ubuntu' | 'linux' | 'vm';
  os: string;
  kind: string;
}

export interface PlacedNode {
  key: string;
  asset: MapAsset;
  x: number;
  y: number;
  meta: DeviceMeta;
  side: Side;
  label: string;
}

export interface Zone {
  key: string;
  x: number;
  w: number;
  title: string;
  subtitle: string;
}

export interface Edge {
  key: string;
  network: string;
  side: EdgeSide;
  path: string;
  /** Bounding box of the wire, for focusing the camera on it. */
  box: { x: number; y: number; w: number; h: number };
  from: string;
  to: string;
}

export interface Layout {
  width: number;
  height: number;
  enterprise: boolean;
  zones: Zone[];
  nodes: PlacedNode[];
  edges: Edge[];
  bridge: string[];
}

export type Box = [number, number, number, number];
