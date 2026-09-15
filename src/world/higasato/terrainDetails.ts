import * as THREE from 'three';
import { toFloatGeometry } from '@/core/geom';
import { Props } from '@/world/props';
import { type HigasatoGround, SITES, type Site } from './ground';

type Side = 'x-' | 'x+' | 'z-' | 'z+';

interface EdgeSpec {
  side: Side;
  /** Edge-local range in metres. X edges use local Z; Z edges use local X. */
  from: number;
  to: number;
  /** Gaps are edge-local ranges left open for paths and entrances. */
  gaps?: readonly (readonly [number, number])[];
}

interface Placement {
  variant: number;
  matrix: THREE.Matrix4;
}

const HOKORA_EDGES: readonly EdgeSpec[] = [
  { side: 'x-', from: -9.5, to: 9.5 },
  // The ridge route enters from the north-east and leaves to the south-east.
  // Keeping the east edge open prevents a decorative wall from crossing it.
  { side: 'z-', from: -11.5, to: 5.0 },
  { side: 'z+', from: -11.5, to: 5.0 },
];

const SHRINE_EDGES: readonly EdgeSpec[] = [
  { side: 'x-', from: -11.0, to: 11.0 },
  { side: 'x+', from: -11.0, to: 11.0 },
  { side: 'z-', from: -14.0, to: 14.0 },
  // The southern sando entrance is intentionally a broad break in the stones.
  { side: 'z+', from: -14.0, to: 14.0, gaps: [[-4.8, 4.8]] },
];

/** Deterministic 0..1 noise: the same wall layout is produced on every load. */
function random01(seed: number) {
  let n = seed | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function inGap(at: number, gaps?: EdgeSpec['gaps']) {
  return gaps?.some(([a, b]) => at >= a && at <= b) ?? false;
}

/**
 * Render-only terrain seams for the two sites where a flat shelf is most
 * visible. The analytic heightfield remains the sole physics/footstep source.
 */
export class TerrainDetails {
  readonly group = new THREE.Group();
  instanceCount = 0;

  constructor(private readonly ground: HigasatoGround) {
    this.group.name = 'terrain details — instanced retaining stones';
  }

  async load() {
    const gltf = await Props.loader().loadAsync('/models/terrain/retaining-stones.glb');
    gltf.scene.updateMatrixWorld(true);
    const modules: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      modules.push({
        geometry: toFloatGeometry(mesh.geometry, mesh.matrixWorld),
        material: Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material,
      });
    });
    modules.sort((a, b) => {
      a.geometry.computeBoundingBox();
      b.geometry.computeBoundingBox();
      return (a.geometry.boundingBox?.getSize(new THREE.Vector3()).x ?? 0)
        - (b.geometry.boundingBox?.getSize(new THREE.Vector3()).x ?? 0);
    });
    if (modules.length < 3) throw new Error(`retaining-stones.glb: expected 3 modules, got ${modules.length}`);

    const placements = [
      ...this.buildSite(SITES.hokora!, HOKORA_EDGES, 4100),
      ...this.buildSite(SITES.shrine!, SHRINE_EDGES, 7300),
    ];
    this.instanceCount = placements.length;

    // Exactly one InstancedMesh per variant. The complete kit therefore costs
    // at most three draw calls, regardless of how many stones are placed.
    for (let variant = 0; variant < 3; variant++) {
      const instances = placements.filter((placement) => placement.variant === variant);
      if (!instances.length) continue;
      const mesh = new THREE.InstancedMesh(
        modules[variant]!.geometry,
        modules[variant]!.material,
        instances.length,
      );
      mesh.name = `terrain-retaining-${variant}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      for (let i = 0; i < instances.length; i++) mesh.setMatrixAt(i, instances[i]!.matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  private buildSite(site: Site, edges: readonly EdgeSpec[], seedBase: number): Placement[] {
    const out: Placement[] = [];
    let sequence = 0;
    for (const edge of edges) {
      // Slight overlap is intentional. It conceals the analytic shelf seam even
      // when adjacent modules receive different deterministic scales.
      const spacing = 0.91;
      const count = Math.max(1, Math.floor((edge.to - edge.from) / spacing));
      for (let step = 0; step <= count; step++) {
        const along = THREE.MathUtils.lerp(edge.from, edge.to, step / count);
        if (inGap(along, edge.gaps)) continue;

        const seed = seedBase + sequence++ * 19;
        const sideX = edge.side === 'x-' ? -1 : edge.side === 'x+' ? 1 : 0;
        const sideZ = edge.side === 'z-' ? -1 : edge.side === 'z+' ? 1 : 0;
        const boundaryX = site.x + (sideX ? sideX * site.w * 0.5 : along);
        const boundaryZ = site.z + (sideZ ? sideZ * site.d * 0.5 : along);
        const outsideX = boundaryX + sideX * 1.25;
        const outsideZ = boundaryZ + sideZ * 1.25;
        const outsideY = this.ground.heightAt(outsideX, outsideZ);
        const drop = site.y - outsideY;

        // On an uphill edge there is no retaining face to explain. Sparse cap
        // stones would read as a fence and introduce a misleading obstruction.
        if (drop < 0.16) continue;
        const courses = THREE.MathUtils.clamp(Math.ceil((drop + 0.05) / 0.32), 1, 3);
        for (let course = 0; course < courses; course++) {
          const variant = (seed + course * 7) % 3;
          const stagger = course % 2 ? spacing * 0.46 : 0;
          const jitterAlong = (random01(seed + course * 31) - 0.5) * 0.10;
          const jitterOut = (random01(seed + course * 41) - 0.5) * 0.06;
          const localAlong = along + stagger + jitterAlong;
          if (localAlong > edge.to || inGap(localAlong, edge.gaps)) continue;

          const x = site.x + (sideX
            ? sideX * (site.w * 0.5 + 0.18 + jitterOut)
            : localAlong);
          const z = site.z + (sideZ
            ? sideZ * (site.d * 0.5 + 0.18 + jitterOut)
            : localAlong);
          const sx = 0.91 + random01(seed + course * 53) * 0.16;
          const sy = 0.86 + random01(seed + course * 61) * 0.15;
          const sz = 0.88 + random01(seed + course * 71) * 0.14;
          const yaw = (sideX ? Math.PI / 2 : 0) + (random01(seed + course * 83) - 0.5) * 0.08;
          const y = site.y - 0.18 - course * 0.30;
          const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
            new THREE.Vector3(sx, sy, sz),
          );
          out.push({ variant, matrix });
        }
      }
    }
    return out;
  }
}
