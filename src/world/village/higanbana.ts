import * as THREE from 'three';
import type { VillageGround } from './ground';
import { Simplex2D } from '../noise';

/**
 * 피안화(彼岸花) — 이 게임의 이름이자 시그니처 색.
 *
 *  - **길 표식**: 참배로 양옆을 따라 드문드문 핀다. 채도를 뺀 밤 화면에서 유일하게 붉게 빛나는 선 —
 *    어디로 가야 하는지 꽃이 알려준다 (기획 1절 "피안화가 길이다")
 *  - **군락(임시 안전지대)**: 남쪽 들판의 붉은 꽃밭. 요괴가 들어오기를 꺼린다 — 안에 있으면
 *    시야 판정이 무효(은신과 같은 규칙: 추격 중 시야가 이어져 있으면 소용없다)
 */
export class Higanbana {
  readonly mesh: THREE.InstancedMesh;
  readonly count: number;
  /** 군락 중심·반경 (안전지대 판정) */
  readonly cluster = { x: -18.5, z: 42.2, r: 5.0 }; // FLOWER_FIELD(배미 하나를 비운 자리) 중앙
  private uniforms = { uTime: { value: 0 } };

  constructor(scene: THREE.Scene, ground: VillageGround) {
    const geo = makeFlower();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc41e2a,
      emissive: new THREE.Color(0xa01020),
      emissiveIntensity: 0.55, // 밤에 스스로 붉게 — 블룸이 살짝 문다
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = u.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.4 + dot(wp.xz, vec2(0.4, 0.31))) * 0.05 * position.y;
          transformed.x += sway; transformed.z += sway * 0.6;`);
    };

    const rng = seeded(20260819);
    const noise = new Simplex2D(77);
    const mats: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    const place = (x: number, z: number, sMin = 0.8, sMax = 1.15) => {
      const y = ground.heightAt(x, z);
      if (ground.paddyMask(x, z) > 0.05) return; // 논 안에는 안 핀다
      dummy.position.set(x, y - 0.02, z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.setScalar(sMin + rng() * (sMax - sMin));
      dummy.updateMatrix();
      mats.push(dummy.matrix.clone());
    };

    // --- 길 표식: 참배로 양옆 2.4~3.4 m, 노이즈로 끊겼다 이어진다 ---
    for (let s = 6; s < ground.roadLength - 2; s += 0.9) {
      const p = ground.roadAt(s);
      const nx = -p.dirZ, nz = p.dirX;
      for (const side of [-1, 1]) {
        const density = noise.fbm(s / 9 + side * 40, side * 3.3, 2) * 0.5 + 0.5;
        if (rng() > density * 0.85) continue;
        const off = 2.4 + rng() * 1.0;
        place(p.x + nx * side * off + (rng() - 0.5) * 0.5, p.z + nz * side * off + (rng() - 0.5) * 0.5);
      }
    }
    // --- 군락: 남쪽 들판 — 붉은 안전지대 ---
    const c = this.cluster;
    const target = 240;
    let n = 0, tries = 0;
    while (n < target && tries++ < target * 4) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * c.r;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (ground.slopeAt(x, z) > 0.6) continue;
      place(x, z, 0.9, 1.3);
      n++;
    }

    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.name = 'higanbana';
    this.count = mats.length;
    this.mesh = mesh;
    scene.add(mesh);
  }

  inCluster(p: THREE.Vector3) {
    const dx = p.x - this.cluster.x, dz = p.z - this.cluster.z;
    return dx * dx + dz * dz < this.cluster.r * this.cluster.r;
  }

  update(dt: number) { this.uniforms.uTime.value += dt; }
}

/** 피안화 한 송이: 줄기 + 위로 말려 올라가는 가는 꽃술 8가닥 (방사형) */
function makeFlower(): THREE.BufferGeometry {
  const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
  const H = 0.42; // 줄기 높이
  // 줄기: 얇은 교차 리본 2장
  const stemW = 0.008;
  for (const rot of [0, Math.PI / 2]) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const b = verts.length / 3;
    for (const [x, y] of [[-stemW, 0], [stemW, 0], [-stemW, H], [stemW, H]] as [number, number][]) {
      verts.push(x * c, y, x * s); uvs.push(0, y / H);
    }
    idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  // 꽃술 8가닥: 꼭대기에서 바깥·위로 휘어 오르는 곡선 리본 (세그먼트 3)
  const N = 8, SEG = 3, W = 0.006, R = 0.11;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    let px = 0, py = H, pz = 0;
    for (let sgm = 0; sgm < SEG; sgm++) {
      const t0 = sgm / SEG, t1 = (sgm + 1) / SEG;
      const r0 = R * Math.sin(t0 * 1.9), r1 = R * Math.sin(t1 * 1.9);
      const y0 = H + t0 * 0.10 + t0 * t0 * 0.05, y1 = H + t1 * 0.10 + t1 * t1 * 0.05;
      const b = verts.length / 3;
      // 리본 폭은 진행 방향과 수직(수평)
      const wx = -dz * W, wz = dx * W;
      verts.push(dx * r0 - wx, y0, dz * r0 - wz, dx * r0 + wx, y0, dz * r0 + wz,
                 dx * r1 - wx, y1, dz * r1 - wz, dx * r1 + wx, y1, dz * r1 + wz);
      uvs.push(0, t0, 1, t0, 0, t1, 1, t1);
      idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
      px = dx * r1; py = y1; pz = dz * r1;
    }
    // 끝에 작은 술머리(점 같은 삼각)
    const b = verts.length / 3;
    verts.push(px - 0.008, py, pz, px + 0.008, py, pz, px, py + 0.02, pz);
    uvs.push(0, 1, 1, 1, 0.5, 1);
    idx.push(b, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
