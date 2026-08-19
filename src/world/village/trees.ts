import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import { Simplex2D } from '../noise';
import type { VillageGround } from './ground';

/**
 * 산자락 삼나무(杉) 숲 — 마을을 감싸 지평선을 끌어당기는 실루엣.
 *
 * 밤이라 디테일이 안 보이므로 원기둥 하나 + 원뿔 셋으로 충분하다.
 * **그림자는 만들지 않는다**: 인스턴스 메시는 부분 컬링이 안 돼서, 초칭(포인트 라이트)의
 * 큐브 그림자 6면에 숲 전체가 다시 그려진다. 배경 실루엣에 그 비용을 쓸 이유가 없다.
 */
export class Cedars {
  readonly mesh: THREE.InstancedMesh;
  readonly count: number;

  constructor(scene: THREE.Scene, physics: Physics, ground: VillageGround, opts: { target?: number; minHeight?: number } = {}) {
    const target = opts.target ?? 700;
    const minHeight = opts.minHeight ?? 2.2; // 이 높이 위(= 산자락·계곡 사면)에만 심는다

    const geo = makeCedarGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.InstancedMesh(geo, mat, target);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'cedars';

    const rng = seeded(9137);
    const noise = new Simplex2D(551);
    const dummy = new THREE.Object3D();
    const half = ground.size * 0.5 - 3;
    const placed: { x: number; z: number }[] = [];
    let n = 0, tries = 0;
    while (n < target && tries < target * 40) {
      tries++;
      const x = (rng() * 2 - 1) * half, z = (rng() * 2 - 1) * half;
      const h = ground.heightAt(x, z);
      if (h < minHeight) continue;
      if (ground.slopeAt(x, z) > 1.5) continue;          // 절벽은 제외
      if (ground.roadDist(x, z) < 4.5) continue;          // 참배로는 비운다
      const density = noise.fbm(x / 22, z / 22, 2) * 0.5 + 0.5;
      if (rng() > 0.3 + density * 0.7) continue;
      // 최소 간격
      let tooClose = false;
      for (const p of placed) { if ((p.x - x) ** 2 + (p.z - z) ** 2 < 6.0) { tooClose = true; break; } }
      if (tooClose) continue;

      const sc = 0.72 + rng() * 0.7;
      dummy.position.set(x, h - 0.15, z);
      dummy.rotation.set((rng() - 0.5) * 0.06, rng() * Math.PI * 2, (rng() - 0.5) * 0.06);
      dummy.scale.set(sc * (0.9 + rng() * 0.2), sc, sc * (0.9 + rng() * 0.2));
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      placed.push({ x, z });
      // 줄기 콜라이더 (플레이어가 숲으로 못 들어가게 하는 역할도 겸한다)
      physics.addStaticBox(new THREE.Vector3(x, h + 1.6 * sc, z), new THREE.Vector3(0.3 * sc, 1.6 * sc, 0.3 * sc));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    this.count = n;
    this.mesh = mesh;
    scene.add(mesh);
  }
}

/** 삼나무 하나: 줄기 + 3단 원뿔 (원점 = 밑동) */
function makeCedarGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const TRUNK = new THREE.Color(0.10, 0.075, 0.06);
  const NEEDLE_LO = new THREE.Color(0.045, 0.075, 0.05);
  const NEEDLE_HI = new THREE.Color(0.10, 0.16, 0.10);

  const push = (g: THREE.BufferGeometry, fn: (y: number) => THREE.Color) => {
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = fn(pos.getY(i));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  };

  const trunk = new THREE.CylinderGeometry(0.10, 0.19, 2.4, 8);
  trunk.translate(0, 1.2, 0);
  push(trunk, () => TRUNK);

  const tmp = new THREE.Color();
  const tiers: [number, number, number][] = [[1.55, 3.3, 1.7], [1.18, 2.7, 3.5], [0.78, 2.2, 5.1]];
  for (const [r, h, y] of tiers) {
    const cone = new THREE.ConeGeometry(r, h, 9, 1, true);
    cone.translate(0, y + h / 2, 0);
    // 위로 갈수록 밝게 (달빛을 받는 쪽)
    push(cone, (vy) => tmp.copy(NEEDLE_LO).lerp(NEEDLE_HI, THREE.MathUtils.smoothstep(vy, 1.5, 7.5)));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('삼나무 지오메트리 병합 실패');
  merged.computeVertexNormals();
  return merged;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
