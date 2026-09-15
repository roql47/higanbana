/** Authored house lots: shared by terrain, planting exclusions and the visible village. */
export interface SettlementLot {
  id: string; x: number; z: number; yaw: number; w: number; d: number;
  use: 'shop' | 'home' | 'farm';
}
export const SETTLEMENT_LOTS: SettlementLot[] = [
  { id: 'provisions', x: 12, z: 52, yaw: Math.PI, w: 5.2, d: 4.8, use: 'shop' },
  { id: 'east-home', x: 26, z: 6.5, yaw: Math.PI / 2, w: 4.0, d: 4.0, use: 'home' },
  { id: 'east-workshop', x: 41, z: 9, yaw: -Math.PI / 2, w: 5.2, d: 4.8, use: 'shop' },
  { id: 'north-home', x: 37, z: -7, yaw: 0, w: 5.4, d: 5, use: 'home' },
  { id: 'north-yard', x: 22, z: -5, yaw: 0, w: 5.1, d: 4.8, use: 'home' },
  { id: 'north-west-home', x: 12, z: -5, yaw: 0, w: 5.2, d: 4.8, use: 'home' },
  { id: 'well-home', x: -10, z: 9, yaw: -Math.PI / 2, w: 5.0, d: 4.8, use: 'home' },
  { id: 'south-farm', x: 25, z: 66, yaw: Math.PI, w: 6, d: 5, use: 'farm' },
  { id: 'south-barn', x: 34, z: 66, yaw: Math.PI, w: 5, d: 4.5, use: 'farm' },
  { id: 'west-farm', x: -51, z: 53, yaw: 0, w: 8, d: 10, use: 'farm' },
  { id: 'east-farm', x: 52, z: 77, yaw: Math.PI, w: 8, d: 10, use: 'farm' },
];

export function lotLocal(lot: SettlementLot, x: number, z: number) {
  const dx = x - lot.x, dz = z - lot.z, c = Math.cos(lot.yaw), s = Math.sin(lot.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

export function inSettlementLot(x: number, z: number, margin = 0) {
  return SETTLEMENT_LOTS.some(lot => {
    const p = lotLocal(lot, x, z);
    return Math.abs(p.x) < lot.w / 2 + margin && Math.abs(p.z) < lot.d / 2 + margin;
  });
}

/** Shallow cultivated plots between the southern farms and the village approach. */
export const SETTLEMENT_FIELDS = [
  {id:'south-west-paddy',x:22,z:78.5,w:10,d:7},
  {id:'south-east-paddy',x:36,z:78,w:10,d:8},
  {id:'west-farm-paddy',x:-50.5,z:40,w:7,d:8},
];
export function inSettlementField(x:number,z:number,margin=0) {
  return SETTLEMENT_FIELDS.some(f=>Math.abs(x-f.x)<f.w/2+margin && Math.abs(z-f.z)<f.d/2+margin);
}
