import { describe, expect, it } from 'vitest';
import { assetSide, deviceMeta, emptyZones, layoutTopology, liveAsset, nodeState, runtimeSpec, vmLabel } from './model';
import type { MapAsset, MapNetwork } from './types';

const simpleAssets: MapAsset[] = [
  { role: 'red_workstation', template: 'tpl-kali-gui-xrdp', networks: ['red_vlan'] },
  { role: 'router_fw', template: 'tpl-opnsense', networks: ['red_vlan', 'blue_vlan'] },
  { role: 'blue_workstation', template: 'tpl-debian-blue', networks: ['blue_vlan'] },
];
const simpleNets: MapNetwork[] = [
  { name: 'red_vlan', vlan_id: 230, cidr: '10.0.1.0/24' },
  { name: 'blue_vlan', vlan_id: 234, cidr: '10.0.2.0/24' },
];

describe('labels and meta', () => {
  it('uses the short name, a counted instance, or the role', () => {
    expect(vmLabel({ role: 'dc01', vm_name: 'DC01' })).toBe('DC01');
    expect(vmLabel({ role: 'victim_2', vm_name: 'PC', count: 3 }, 'victim_2')).toBe('PC02');
    expect(vmLabel({ role: 'victim', vm_name: 'PC', count: 3 })).toBe('PC01–PC03');
    expect(vmLabel({ role: 'red_workstation' })).toBe('red workstation');
  });
  it('classifies devices and sides', () => {
    expect(deviceMeta({ role: 'router_fw', template: 'tpl-opnsense' }).cls).toBe('router');
    expect(deviceMeta({ role: 'dc01', template: 'tpl-win2022-ad-auto' }).cls).toBe('windows');
    expect(deviceMeta({ role: 'file_server', template: 'x' }).cls).toBe('server');
    expect(assetSide({ role: 'red_workstation' })).toBe('red');
    expect(assetSide({ role: 'log_aggregator' })).toBe('blue');
    expect(assetSide({ role: 'dc01' })).toBe('shared');
  });
  it('matches live machines by role without a count suffix and derives the state', () => {
    const live = [{ role: 'victim_1', status: 'running', id: 4 }];
    expect(liveAsset({ role: 'victim' }, live)?.id).toBe(4);
    expect(nodeState(liveAsset({ role: 'victim' }, live))).toBe('running');
    expect(nodeState(null)).toBe('planned');
    expect(nodeState({ role: 'x', status: 'failed' })).toBe('failed');
    expect(nodeState({ role: 'x', status: 'booting' })).toBe('starting');
  });
  it('reads the spec whether or not it is wrapped', () => {
    const wrapped = { drill_id: 1, status: 'x', scenario: { spec: { spec: { assets: simpleAssets, networks: simpleNets } } } };
    expect(runtimeSpec(wrapped).assets).toHaveLength(3);
    expect(runtimeSpec({ drill_id: 1, status: 'x', scenario: null })).toEqual({ assets: [], networks: [] });
  });
});

describe('layout', () => {
  it('lays a small range out in three zones with the router in the middle', () => {
    const layout = layoutTopology(simpleAssets, simpleNets);
    expect(layout.enterprise).toBe(false);
    expect(layout.zones.map((z) => z.key)).toEqual(['red', 'transit', 'blue']);
    const router = layout.nodes.find((n) => n.key === 'router_fw');
    expect(router?.x).toBe(540);
    expect(layout.bridge).toEqual(['router_fw']);
    // each network gets a wire from the router (the hub) to its machines
    expect(layout.edges.map((e) => e.network).sort()).toEqual(['blue_vlan', 'red_vlan']);
    expect(layout.edges.every((e) => e.path.startsWith('M'))).toBe(true);
  });
  it('switches to the five-zone enterprise layout when there are DMZ / identity networks', () => {
    const assets: MapAsset[] = [
      ...simpleAssets,
      { role: 'dmz_gateway', template: 'x', networks: ['dmz_vlan'] },
      { role: 'dc01', template: 'tpl-win2022', networks: ['dc01_vlan'] },
      { role: 'backup_server', template: 'x', networks: ['backup_vlan'] },
    ];
    const nets: MapNetwork[] = [...simpleNets, { name: 'dmz_vlan', vlan_id: 231 }, { name: 'dc01_vlan', vlan_id: 234 }, { name: 'backup_vlan', vlan_id: 236 }];
    const layout = layoutTopology(assets, nets);
    expect(layout.enterprise).toBe(true);
    expect(layout.zones.map((z) => z.key)).toEqual(['red', 'dmz', 'transit', 'identity', 'protected']);
    expect(layout.width).toBe(1360);
    expect(layout.zones.find((z) => z.key === 'identity')?.subtitle).toContain('VLAN 234');
  });
  it('reports zones with no machine in them (a player sees only their own side)', () => {
    const onlyRed = layoutTopology([simpleAssets[0]], simpleNets);
    expect(emptyZones(onlyRed)).toEqual(new Set(['transit', 'blue']));
  });
  it('chains machines when no network connects them', () => {
    const layout = layoutTopology([{ role: 'a' }, { role: 'b' }], []);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].network).toBe('link');
  });
});
