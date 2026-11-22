import { describe, expect, it } from 'vitest';
import { NODE_H, NODE_W, assetSide, deviceMeta, emptyZones, layoutTopology, liveAsset, nodeState, runtimeSpec, vmLabel } from './model';
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
    expect(router?.x).toBe(Math.round(380 + 315 / 2)); // centred in its zone
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
  it('keeps a dual-homed web host in the DMZ column, not with the router', () => {
    const assets: MapAsset[] = [
      { role: 'red_workstation', template: 'tpl-kali-gui-xrdp', networks: ['public_vlan'] },
      { role: 'router_fw', template: 'tpl-opnsense', networks: ['public_vlan', 'dc01_vlan'] },
      { role: 'dmz_gateway', template: 'x', networks: ['public_vlan', 'dc01_vlan'] },
      { role: 'dc01', template: 'tpl-win2022', networks: ['dc01_vlan'] },
    ];
    const nets: MapNetwork[] = [{ name: 'public_vlan', vlan_id: 230 }, { name: 'dc01_vlan', vlan_id: 234 }];
    const layout = layoutTopology(assets, nets);
    const zoneOf = (role: string) => {
      const node = layout.nodes.find((n) => n.asset.role === role)!;
      return layout.zones.find((z) => node.x >= z.x && node.x <= z.x + z.w)?.key;
    };
    expect(zoneOf('dmz_gateway')).toBe('dmz');
    expect(zoneOf('router_fw')).toBe('transit');
    expect(layout.zones.find((z) => z.key === 'red')?.subtitle).toContain('VLAN 230');
  });
  it('keeps a dual-homed workstation on the public network in the DMZ column', () => {
    const assets: MapAsset[] = [
      { role: 'red_attacker', template: 'tpl-kali-gui-xrdp', networks: ['public_vlan'] },
      { role: 'router_fw', template: 'tpl-opnsense', networks: ['public_vlan', 'workstation_vlan', 'dc01_vlan'] },
      { role: 'entry_workstation', template: 'tpl-win11', networks: ['public_vlan', 'workstation_vlan'] },
      { role: 'victim_workstation', template: 'tpl-win11', networks: ['workstation_vlan'] },
      { role: 'dc_server', template: 'tpl-win2022', networks: ['dc01_vlan'] },
    ];
    const nets: MapNetwork[] = [{ name: 'public_vlan', vlan_id: 230 }, { name: 'workstation_vlan', vlan_id: 235 }, { name: 'dc01_vlan', vlan_id: 234 }];
    const layout = layoutTopology(assets, nets);
    const zoneOf = (role: string) => {
      const node = layout.nodes.find((n) => n.asset.role === role)!;
      return layout.zones.find((z) => node.x >= z.x && node.x <= z.x + z.w)?.key;
    };
    expect(zoneOf('entry_workstation')).toBe('dmz');
    expect(zoneOf('victim_workstation')).toBe('identity');
    expect(zoneOf('router_fw')).toBe('transit');
  });
  it('puts machines on an internal network in the identity column', () => {
    const assets: MapAsset[] = [
      { role: 'red_workstation', template: 'tpl-kali-gui-xrdp', networks: ['public_vlan'] },
      { role: 'router_fw', template: 'tpl-opnsense', networks: ['public_vlan', 'internal_vlan'] },
      { role: 'file_server', template: 'x', networks: ['internal_vlan'] },
    ];
    const layout = layoutTopology(assets, [{ name: 'public_vlan', vlan_id: 230 }, { name: 'internal_vlan', vlan_id: 234 }]);
    const node = layout.nodes.find((n) => n.asset.role === 'file_server')!;
    const zone = layout.zones.find((z) => node.x >= z.x && node.x <= z.x + z.w);
    expect(zone?.key).toBe('identity');
    expect(zone?.subtitle).toContain('VLAN 234');
  });
  it('never lets two machine cards overlap, however many share a zone', () => {
    const many: MapAsset[] = Array.from({ length: 6 }, (_, i) => ({ role: `web_${i}`, template: 'x', networks: ['blue_vlan'] }));
    const layout = layoutTopology([simpleAssets[0], simpleAssets[1], ...many], simpleNets);
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a === b) continue;
        const overlapX = Math.abs(a.x - b.x) < NODE_W;
        const overlapY = Math.abs(a.y - b.y) < NODE_H;
        expect(overlapX && overlapY).toBe(false);
      }
      // and every card sits fully inside its zone and the canvas
      const zone = layout.zones.find((z) => a.x >= z.x && a.x <= z.x + z.w);
      expect(zone).toBeTruthy();
      expect(a.x - NODE_W / 2).toBeGreaterThanOrEqual(zone!.x);
      expect(a.x + NODE_W / 2).toBeLessThanOrEqual(zone!.x + zone!.w);
      expect(a.y - NODE_H / 2).toBeGreaterThan(100); // below the zone header
      expect(a.y + NODE_H / 2).toBeLessThan(layout.height - 24);
    }
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
