import * as THREE from 'three';
import {roadWidth,roadSurface} from './roadGeometry';
import type {SurveyData} from './survey';

/**
 * Where the village walks, the turf is gone.
 *
 * The roads and yards are already drawn as their own gravel and earth meshes, but they end at a
 * clean edge — grass right up to the lane, which is the one thing no inhabited ground ever does.
 * This bakes a distance field of the mapped routes and house footprints so the ground shader can
 * wear a verge outwards from them: earth at the edge, thinning into turf a few metres out, with
 * the boundary chewed up by the same noise field the rest of the surface uses.
 *
 * A distance field rather than a coverage mask because it interpolates: at 1.5 m per texel the
 * *edge position* is still accurate to a few centimetres, which a painted mask would not be.
 */
export interface GroundWear {
  texture: THREE.DataTexture;
  /** World-space rect the field covers (square, metres). */
  minX: number; minZ: number; size: number;
  /** Distance the encoded 0…1 range spans. Anything further reads as unworn. */
  maxDistance: number;
}

const MAX_DISTANCE = 16;
/** Asphalt keeps its shoulder: the verge is measured from this far inside the carriageway. */
const PAVED_INSET = 1.4;

/** Two-pass chamfer transform. Exact enough for a band a noise field is about to make ragged. */
function distanceField(seed: Uint8Array, n: number) {
  const d = new Float32Array(n * n).fill(1e9), D = Math.SQRT2;
  for (let i = 0; i < seed.length; i++) if (seed[i]) d[i] = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x; let v = d[i]!;
    if (x > 0) v = Math.min(v, d[i - 1]! + 1);
    if (y > 0) v = Math.min(v, d[i - n]! + 1);
    if (x > 0 && y > 0) v = Math.min(v, d[i - n - 1]! + D);
    if (x < n - 1 && y > 0) v = Math.min(v, d[i - n + 1]! + D);
    d[i] = v;
  }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
    const i = y * n + x; let v = d[i]!;
    if (x < n - 1) v = Math.min(v, d[i + 1]! + 1);
    if (y < n - 1) v = Math.min(v, d[i + n]! + 1);
    if (x < n - 1 && y < n - 1) v = Math.min(v, d[i + n + 1]! + D);
    if (x > 0 && y < n - 1) v = Math.min(v, d[i + n - 1]! + D);
    d[i] = v;
  }
  return d;
}

export function bakeGroundWear(data: SurveyData, resolution = 1024): GroundWear {
  // The settlement, not the survey: roads run tens of kilometres out to the expressway.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of data.buildings) {
    const r = Math.hypot(b.width, b.depth) / 2;
    minX = Math.min(minX, b.x - r); maxX = Math.max(maxX, b.x + r);
    minZ = Math.min(minZ, b.z - r); maxZ = Math.max(maxZ, b.z + r);
  }
  if (!Number.isFinite(minX)) { minX = minZ = -256; maxX = maxZ = 256; }
  const pad = 64, size = Math.max(maxX - minX, maxZ - minZ) + pad * 2;
  const originX = (minX + maxX) / 2 - size / 2, originZ = (minZ + maxZ) / 2 - size / 2;
  const n = resolution, metresPerTexel = size / n;
  const route = new Uint8Array(n * n), yard = new Uint8Array(n * n);
  const toX = (x: number) => (x - originX) / metresPerTexel, toZ = (z: number) => (z - originZ) / metresPerTexel;

  for (const road of data.roads) {
    if (road.bridge) continue;
    const paved = ['asphalt', 'stone'].includes(roadSurface(road));
    // Floor the stamp at half a texel diagonal: a 1.5 m footway is thinner than one texel here, and
    // a ribbon narrower than that hits texel centres only now and then — the verge came out dashed.
    const half = Math.max(Math.max(0.6, roadWidth(road) / 2 - (paved ? PAVED_INSET : 0)) / metresPerTexel, 0.75);
    for (let i = 1; i < road.points.length; i++) {
      const ax = toX(road.points[i - 1]![0]), az = toZ(road.points[i - 1]![1]);
      const bx = toX(road.points[i]![0]), bz = toZ(road.points[i]![1]);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - half)), x1 = Math.min(n - 1, Math.ceil(Math.max(ax, bx) + half));
      const z0 = Math.max(0, Math.floor(Math.min(az, bz) - half)), z1 = Math.min(n - 1, Math.ceil(Math.max(az, bz) + half));
      if (x0 > x1 || z0 > z1) continue;
      const dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz;
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len)) : 0;
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= half) route[z * n + x] = 1;
      }
    }
  }
  for (const b of data.buildings) {
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    const hw = (b.width / 2 + 0.5) / metresPerTexel, hd = (b.depth / 2 + 0.5) / metresPerTexel;
    const cx = toX(b.x), cz = toZ(b.z), reach = Math.hypot(hw, hd);
    const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(n - 1, Math.ceil(cx + reach));
    const z0 = Math.max(0, Math.floor(cz - reach)), z1 = Math.min(n - 1, Math.ceil(cz + reach));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const px = x - cx, pz = z - cz;
      if (Math.abs(c * px - s * pz) <= hw && Math.abs(s * px + c * pz) <= hd) yard[z * n + x] = 1;
    }
  }

  const routeD = distanceField(route, n), yardD = distanceField(yard, n);
  const data8 = new Uint8Array(n * n * 4);
  const encode = (texels: number) => Math.round(Math.min(1, (texels * metresPerTexel) / MAX_DISTANCE) * 255);
  for (let i = 0; i < n * n; i++) { data8[i * 4] = encode(routeD[i]!); data8[i * 4 + 1] = encode(yardD[i]!); data8[i * 4 + 3] = 255; }

  const texture = new THREE.DataTexture(data8, n, n, THREE.RGBAFormat);
  // Clamped: outside the settlement every sample reads the rim, which is already "far from a path".
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { texture, minX: originX, minZ: originZ, size, maxDistance: MAX_DISTANCE };
}

let shared: { data: SurveyData; wear: GroundWear } | null = null;
/** One field per survey — every ground material in the world samples the same world-space rect. */
export function sharedGroundWear(data: SurveyData): GroundWear {
  if (shared?.data !== data) shared = { data, wear: bakeGroundWear(data) };
  return shared.wear;
}
