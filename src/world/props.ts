import * as THREE from 'three';
import { toFloatGeometry } from '@/core/geom';
import type RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Physics } from '@/core/physics';
import type { Island } from './terrain';
import { Simplex2D } from './noise';

export interface PropDef {
  name: string;
  url: string;
  count: number;
  /** 목표 높이(m) 범위 */
  height: [number, number];
  /** 콜라이더: 나무=원기둥(트렁크), 바위=구, 없음 */
  collider: 'trunk' | 'ball' | 'none';
  trunkRadius?: number; // height 대비 비율
  minSlope?: number; maxSlope?: number;
  minSpacing: number; // 같은/다른 소품과 최소 간격(m)
  alignToGround?: boolean; // 지형 노멀에 기울이기(바위)
  keepOut?: number; // 스폰 반경(m)
}

interface LoadedProp {
  def: PropDef;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  baseHeight: number; // 원본 바운딩 높이
  baseRadius: number; // 원본 XZ 반경
}

/**
 * Tripo 소품을 InstancedMesh 로 섬에 흩뿌리고 Rapier 콜라이더를 만든다.
 * 밀 수 있는 바위(다이내믹)도 여기서 만든다.
 */
export class Props {
  readonly group = new THREE.Group();
  private dynamics: { body: RAPIER.RigidBody; mesh: THREE.Object3D }[] = [];
  private placed: { x: number; z: number; r: number }[] = [];
  private rng: () => number;

  constructor(private scene: THREE.Scene, private physics: Physics, private island: Island, seed = 7) {
    this.group.name = 'props';
    scene.add(this.group);
    let s = seed >>> 0 || 1;
    this.rng = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  static loader() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
  }

  async load(defs: PropDef[]) {
    const loader = Props.loader();
    const results = await Promise.allSettled(defs.map((d) => loader.loadAsync(d.url)));
    const loaded: LoadedProp[] = [];
    results.forEach((r, i) => {
      const def = defs[i]!;
      if (r.status !== 'fulfilled') { console.warn(`[props] ${def.name} 로드 실패(건너뜀):`, (r.reason as Error)?.message ?? r.reason); return; }
      const geos: THREE.BufferGeometry[] = [];
      let material: THREE.Material | null = null;
      r.value.scene.updateMatrixWorld(true);
      r.value.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const g = toFloatGeometry(m.geometry, m.matrixWorld);
          geos.push(g);
          material ??= Array.isArray(m.material) ? m.material[0]! : m.material;
        }
      });
      if (!geos.length || !material) return;
      // 프리미티브가 여러 개면 첫 번째만(트리포 소품은 보통 1개)
      const geometry = geos[0]!;
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox!;
      const size = bb.getSize(new THREE.Vector3());
      const center = bb.getCenter(new THREE.Vector3());
      // 발바닥 원점·XZ 중심 정렬
      geometry.translate(-center.x, -bb.min.y, -center.z);
      const std = material as THREE.MeshStandardMaterial;
      if (std.isMeshStandardMaterial) { std.envMapIntensity = 0.9; }
      loaded.push({ def, geometry, material, baseHeight: size.y, baseRadius: Math.max(size.x, size.z) / 2 });
    });
    for (const lp of loaded) this.scatter(lp);
    console.info('[props] placed', this.placed.length, 'instances from', loaded.map((l) => l.def.name).join(', '));
  }

  private scatter(lp: LoadedProp) {
    const { def } = lp;
    const S = this.island.size, half = S * 0.5;
    const mesh = new THREE.InstancedMesh(lp.geometry, lp.material, def.count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = def.name;
    const dummy = new THREE.Object3D();
    const normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0, tries = 0;
    while (n < def.count && tries < def.count * 60) {
      tries++;
      const x = (this.rng() * 2 - 1) * half * 0.92, z = (this.rng() * 2 - 1) * half * 0.92;
      const h = this.island.heightAt(x, z);
      if (h < this.island.waterLevel + 0.7) continue;
      const slope = this.island.slopeAt(x, z);
      if (slope < (def.minSlope ?? 0) || slope > (def.maxSlope ?? 0.6)) continue;
      if (Math.hypot(x, z) < (def.keepOut ?? 10)) continue;
      const scaleH = def.height[0] + this.rng() * (def.height[1] - def.height[0]);
      const s = scaleH / lp.baseHeight;
      const r = lp.baseRadius * s;
      let ok = true;
      for (const p of this.placed) { if (Math.hypot(p.x - x, p.z - z) < Math.max(def.minSpacing, p.r + r * 0.6)) { ok = false; break; } }
      if (!ok) continue;

      dummy.position.set(x, h - (def.alignToGround ? 0.15 * s : 0.05), z);
      dummy.rotation.set(0, this.rng() * Math.PI * 2, 0);
      dummy.scale.setScalar(s);
      if (def.alignToGround) {
        this.island.normalAt(x, z, normal);
        const q = new THREE.Quaternion().setFromUnitVectors(up, normal);
        dummy.quaternion.premultiply(q);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      this.placed.push({ x, z, r: def.collider === 'trunk' ? (def.trunkRadius ?? 0.06) * scaleH : r });
      this.addCollider(def, x, h, z, scaleH, r);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  private addCollider(def: PropDef, x: number, y: number, z: number, height: number, radius: number) {
    const R = this.physics.R;
    if (def.collider === 'trunk') {
      const tr = (def.trunkRadius ?? 0.06) * height;
      const hh = height * 0.5;
      const body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y + hh, z));
      this.physics.world.createCollider(R.ColliderDesc.cylinder(hh, tr).setFriction(0.8), body);
    } else if (def.collider === 'ball') {
      const rr = radius * 0.85;
      const body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y + rr * 0.8, z));
      this.physics.world.createCollider(R.ColliderDesc.ball(rr).setFriction(0.9), body);
    }
  }

  /** 밀 수 있는 다이내믹 바위 몇 개 (스폰 근처) */
  addPushables(url: string, positions: [number, number][], size = 0.9) {
    return Props.loader().loadAsync(url).then((gltf) => {
      let geometry: THREE.BufferGeometry | null = null, material: THREE.Material | null = null;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !geometry) { geometry = toFloatGeometry(m.geometry, m.matrixWorld); material = Array.isArray(m.material) ? m.material[0]! : m.material; } });
      if (!geometry || !material) return;
      const g = geometry as THREE.BufferGeometry;
      g.computeBoundingBox();
      const bb = g.boundingBox!, sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
      const s = size / Math.max(sz.x, sz.y, sz.z);
      const R = this.physics.R;
      for (const [x, z] of positions) {
        const y = this.island.heightAt(x, z) + size * 0.6;
        const mesh = new THREE.Mesh(g, material as THREE.Material);
        mesh.scale.setScalar(s);
        mesh.castShadow = mesh.receiveShadow = true;
        this.group.add(mesh);
        const body = this.physics.world.createRigidBody(
          R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(1.2).setAngularDamping(3.0),
        );
        // 둥근 육면체: 밀면 굴러가되 공처럼 경사를 타고 끝없이 굴러가진 않음
        const hs = size * 0.36;
        this.physics.world.createCollider(R.ColliderDesc.roundCuboid(hs, hs * 0.85, hs, size * 0.1).setDensity(0.3).setFriction(1.0).setRestitution(0.02), body);
        this.dynamics.push({ body, mesh });
      }
    }).catch((e) => console.warn('[props] pushables 실패:', e));
  }

  update() {
    for (const d of this.dynamics) {
      const t = d.body.translation(), q = d.body.rotation();
      d.mesh.position.set(t.x, t.y, t.z);
      d.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }
}
