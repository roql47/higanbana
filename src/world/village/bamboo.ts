import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import type { VillageGround } from './ground';

/**
 * 대나무 숲(竹林) — 동쪽 대숲길을 감싸는 구역.
 *
 * 이 맵에서 **시야를 가장 확실히 끊는 장치**다. 삼나무는 줄기가 굵고 드문드문이라
 * 사이로 멀리까지 보이지만, 대나무는 가늘고 촘촘해서 3~4 m 앞이 벽처럼 막힌다.
 * 일본 공포에서 대숲이 반복해서 나오는 이유이기도 하다 — 바람 소리와 함께 방향 감각을 지운다.
 *
 * 구현
 *  · 줄기 하나 = 원기둥 6각 + 마디 링 4개. InstancedMesh 하나로 전부 (드로우콜 1)
 *  · **콜라이더는 굵은 줄기에만** 단다. 전부 달면 정적 콜라이더가 2,000 개를 넘어
 *    나브그리드 굽는 시간이 크게 늘고, 어차피 가는 대는 밀고 지나가는 게 자연스럽다
 *  · 그림자는 만들지 않는다 (삼나무·까마귀와 같은 이유)
 */
export class BambooGrove {
  readonly mesh: THREE.InstancedMesh;
  readonly count: number;

  constructor(scene: THREE.Scene, physics: Physics, ground: VillageGround, opts: {
    /** 구역 사각형 (월드) */
    area: { x0: number; z0: number; x1: number; z1: number };
    target?: number;
    /** 길에서 이 거리 안은 비운다 */
    clear?: number;
  }) {
    const target = opts.target ?? 900;
    const clear = opts.clear ?? 1.8;
    const A = opts.area;

    const geo = makeCulm();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
    const mesh = new THREE.InstancedMesh(geo, mat, target);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'bamboo';

    const rng = seeded(31337);
    const dummy = new THREE.Object3D();
    let n = 0, tries = 0, colliders = 0;
    while (n < target && tries < target * 30) {
      tries++;
      const x = A.x0 + rng() * (A.x1 - A.x0);
      const z = A.z0 + rng() * (A.z1 - A.z0);
      const h = ground.heightAt(x, z);
      if (h < -0.2) continue;                       // 물·논은 제외
      if (ground.slopeAt(x, z) > 0.9) continue;
      const pd = ground.pathDist(x, z);
      if (pd < clear) continue;                     // 길은 비운다
      // 길에서 멀어질수록 성기게 — 길가가 가장 빽빽해야 "복도"로 읽힌다
      if (rng() > 1.15 - Math.min(0.85, pd / 26)) continue;

      const sc = 0.8 + rng() * 0.55;
      const lean = 0.05 + rng() * 0.10;
      const dir = rng() * Math.PI * 2;
      dummy.position.set(x, h - 0.1, z);
      dummy.rotation.set(Math.cos(dir) * lean, rng() * Math.PI * 2, Math.sin(dir) * lean);
      dummy.scale.set(0.85 + rng() * 0.3, sc, 0.85 + rng() * 0.3);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      // 굵은 것만 콜라이더 — 가는 대는 밀고 지나간다
      if (sc > 1.15 && colliders < 260) {
        physics.addStaticBox(new THREE.Vector3(x, h + 1.5, z), new THREE.Vector3(0.08, 1.5, 0.08));
        colliders++;
      }
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    this.count = n;
    this.mesh = mesh;
    scene.add(mesh);
    console.info(`[bamboo] ${n} 대 · 콜라이더 ${colliders}`);
  }
}

/** 대나무 한 대: 마디로 나뉜 원기둥 + 위쪽 잎 뭉치 (원점 = 밑동) */
function makeCulm(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const LOW = new THREE.Color(0.16, 0.22, 0.12);
  const HIGH = new THREE.Color(0.30, 0.40, 0.20);
  const NODE = new THREE.Color(0.34, 0.36, 0.24);
  const LEAF = new THREE.Color(0.10, 0.17, 0.09);
  const tmp = new THREE.Color();

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

  const H = 6.2;
  const culm = new THREE.CylinderGeometry(0.038, 0.058, H, 6, 1, true);
  culm.translate(0, H / 2, 0);
  push(culm, (y) => tmp.copy(LOW).lerp(HIGH, THREE.MathUtils.smoothstep(y, 0.4, H)));
  // 마디(節) — 살짝 부푼 링. 이게 있어야 대나무로 보인다
  for (const y of [1.15, 2.35, 3.5, 4.55]) {
    const r = new THREE.CylinderGeometry(0.052, 0.052, 0.055, 6, 1, true);
    r.translate(0, y, 0);
    push(r, () => NODE);
  }
  // 위쪽 잎 — 얇은 판 몇 장이면 실루엣이 산다
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.7;
    const leaf = new THREE.PlaneGeometry(1.5, 0.42);
    leaf.rotateZ(-0.35 + (k % 2) * 0.2);
    leaf.rotateY(a);
    leaf.translate(Math.cos(a) * 0.55, H - 0.5 - k * 0.28, Math.sin(a) * 0.55);
    push(leaf, () => LEAF);
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('대나무 지오메트리 병합 실패');
  merged.computeVertexNormals();
  return merged;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
