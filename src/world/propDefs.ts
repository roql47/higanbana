import type { PropDef } from './props';

/** Tripo 로 생성한 소품 (scripts/build-props.ts 산출물). 파일이 없으면 자동으로 건너뜀. */
export const PROP_DEFS: PropDef[] = [
  { name: 'tree-oak', url: '/models/props/tree-oak.glb', count: 34, height: [6.5, 9.5], collider: 'trunk', trunkRadius: 0.05, maxSlope: 0.45, minSpacing: 7, keepOut: 12 },
  { name: 'tree-birch', url: '/models/props/tree-birch.glb', count: 26, height: [6, 9], collider: 'trunk', trunkRadius: 0.035, maxSlope: 0.5, minSpacing: 6, keepOut: 12 },
  { name: 'rock-mossy', url: '/models/props/rock-mossy.glb', count: 22, height: [0.7, 2.2], collider: 'ball', minSpacing: 3, alignToGround: true, keepOut: 9 },
  { name: 'rock-sharp', url: '/models/props/rock-sharp.glb', count: 16, height: [0.8, 2.6], collider: 'ball', minSlope: 0.15, maxSlope: 0.9, minSpacing: 4, alignToGround: true, keepOut: 9 },
  { name: 'bush', url: '/models/props/bush.glb', count: 40, height: [0.9, 1.6], collider: 'none', maxSlope: 0.5, minSpacing: 2.5, keepOut: 6 },
];
