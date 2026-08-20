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
    // 정점색이 확산·발광을 모두 이끈다: 줄기(어두운 녹색)는 안 빛나고 꽃술 끝(밝은 분홍)이 가장 빛난다
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive: new THREE.Color(0xff3040),
      emissiveIntensity: 0.85,
      roughness: 0.62,
      side: THREE.DoubleSide,
    });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = u.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float hk = clamp(position.y / 0.45, 0.0, 1.25);
          float ph = dot(wp.xz, vec2(0.4, 0.31));
          float sway = (sin(uTime * 1.4 + ph) * 0.7 + sin(uTime * 2.9 + ph * 1.7) * 0.3) * 0.045 * hk;
          transformed.x += sway; transformed.z += sway * 0.6;`);
      // 발광이 정점색을 따르게 — 붉은 부위만 빛난다 (줄기의 채도 낮은 녹색은 거의 0)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_COLOR
          totalEmissiveRadiance *= vColor.rgb * vColor.rgb; // 제곱 — 밝은 끝만 확실히
        #endif`);
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

    // --- 길 표식: 균일한 줄이 아니라 **덤불(clump)** — 실제 피안화는 알뿌리가 뭉쳐 군데군데 핀다.
    //     토리이 터널 구간(s 46~100, 계곡 사면)은 비운다 — 거기선 붉은 기둥이 색을 맡는다.
    const clump = (cx: number, cz: number, n: number, r: number) => {
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r;
        place(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr);
      }
    };
    let sPos = 7;
    while (sPos < ground.roadLength - 3) {
      if (sPos > 44 && sPos < 101) { sPos = 101; continue; } // 터널 건너뜀
      const p = ground.roadAt(sPos);
      const nx = -p.dirZ, nz = p.dirX;
      const side = rng() < 0.5 ? -1 : 1;
      const off = 2.7 + rng() * 1.3;
      clump(p.x + nx * side * off, p.z + nz * side * off, 4 + Math.floor(rng() * 5), 0.55 + rng() * 0.35);
      // 가끔 반대편에도 작은 덤불
      if (rng() < 0.35) clump(p.x - nx * side * (2.7 + rng()), p.z - nz * side * (2.7 + rng()), 2 + Math.floor(rng() * 3), 0.4);
      sPos += 6 + rng() * 9;
    }
    // 여섯 지장 곁 — 피안화와 지장은 같은 곳에 핀다
    const jz = ground.roadAt(36);
    clump(jz.x - 4.6, jz.z + 4.5, 6, 0.7);
    clump(jz.x - 4.4, jz.z - 2.5, 5, 0.6);
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

/**
 * 피안화 한 그루 — 실제 구조를 따른다:
 *   잎 없는 꽃대 하나 → 끝에 작은 꽃 5송이가 우산형(산형화서) →
 *   꽃마다 뒤로 강하게 말리는 꽃잎 6장 + 꽃잎보다 훨씬 길게 활처럼 뻗는 수술 6가닥.
 * 정점색: 줄기 어두운 녹색(발광 X) → 꽃잎 심홍→진홍 → 수술 밝은 분홍, 꽃밥(끝점)이 제일 밝다.
 * 약 550 tri — InstancedMesh 하나라 323그루여도 드로우콜 1.
 */
function makeFlower(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3();
  const P = new THREE.Vector3(), SIDE = new THREE.Vector3(), N = new THREE.Vector3();

  /** 호를 그리는 리본: dir 이 axis→out 평면에서 startA→startA+curl 로 감긴다 */
  const ribbonArc = (
    base: THREE.Vector3, axis: THREE.Vector3, out: THREE.Vector3,
    startA: number, curl: number, len: number, segs: number,
    widthFn: (t: number) => number, colorFn: (t: number) => [number, number, number],
  ) => {
    N.crossVectors(out, axis).normalize(); // 리본이 놓인 평면의 법선
    P.copy(base);
    let prevL = -1, prevR = -1;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const th = startA + curl * t;
      D.copy(axis).multiplyScalar(Math.cos(th)).addScaledVector(out, Math.sin(th)); // 진행 방향
      if (i > 0) P.addScaledVector(D, len / segs);
      SIDE.crossVectors(N, D).normalize();
      const w = widthFn(t);
      const c = colorFn(t);
      const vl = pos.length / 3;
      pos.push(P.x - SIDE.x * w, P.y - SIDE.y * w, P.z - SIDE.z * w,
               P.x + SIDE.x * w, P.y + SIDE.y * w, P.z + SIDE.z * w);
      col.push(...c, ...c);
      if (prevL >= 0) idx.push(prevL, prevR, vl + 1, prevL, vl + 1, vl);
      prevL = vl; prevR = vl + 1;
    }
    return P.clone(); // 끝점 (꽃밥용)
  };

  const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  const STALK: [number, number, number] = [0.07, 0.12, 0.05];
  const RED_DEEP: [number, number, number] = [0.42, 0.015, 0.05];
  const RED_HOT: [number, number, number] = [0.95, 0.10, 0.16];
  const PINK: [number, number, number] = [0.9, 0.22, 0.3];
  const ANTHER: [number, number, number] = [1.0, 0.62, 0.66];

  // --- 꽃대: 거의 수직, 살짝 휨 ---
  const H = 0.46;
  const top = ribbonArc(
    A.set(0, 0, 0), B.set(0, 1, 0).normalize(), D.set(1, 0, 0),
    0.04, 0.06, H, 3,
    (t) => 0.011 * (1 - t * 0.35),
    (t) => lerp3(STALK, [0.2, 0.06, 0.06], t * t),
  );

  // --- 우산형 꽃 5송이 ---
  const FLORETS = 5;
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < FLORETS; k++) {
    const a = (k / FLORETS) * Math.PI * 2 + 0.5;
    const outH = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // 꽃 축: 수직에서 바깥으로 62° 기움
    const tilt = 1.08;
    const fAxis = new THREE.Vector3().copy(outH).multiplyScalar(Math.sin(tilt)).addScaledVector(up, Math.cos(tilt)).normalize();
    // 꽃 기부: 꽃대 끝에서 축 방향으로 1.5 cm
    const fBase = top.clone().addScaledVector(fAxis, 0.015);
    // 축에 수직인 기저 (u, v)
    const u = new THREE.Vector3().crossVectors(fAxis, up).normalize();
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    const v = new THREE.Vector3().crossVectors(fAxis, u).normalize();

    // 꽃잎 6장: 축 따라 나가다 뒤로 말린다 (recurve — 피안화의 특징)
    for (let j = 0; j < 6; j++) {
      const b = (j / 6) * Math.PI * 2;
      const pOut = new THREE.Vector3().copy(u).multiplyScalar(Math.cos(b)).addScaledVector(v, Math.sin(b));
      ribbonArc(
        fBase, fAxis, pOut,
        0.32, 3.1, 0.145, 5, // 18° 에서 시작해 195° 까지 말림
        (t) => 0.013 * (0.45 + Math.pow(Math.sin(Math.min(t * 1.12, 1) * Math.PI), 0.7)) * (1 - t * t * 0.85),
        (t) => lerp3(RED_DEEP, RED_HOT, Math.pow(t, 1.3)),
      );
    }
    // 수술 6가닥: 꽃잎 사이에서, 덜 말리고 훨씬 길게 — "거미 다리"
    for (let j = 0; j < 6; j++) {
      const b = (j / 6) * Math.PI * 2 + Math.PI / 6;
      const pOut = new THREE.Vector3().copy(u).multiplyScalar(Math.cos(b)).addScaledVector(v, Math.sin(b));
      const tip = ribbonArc(
        fBase, fAxis, pOut,
        0.14, 1.35, 0.24, 4,
        () => 0.0022,
        (t) => lerp3([0.6, 0.06, 0.1], PINK, t),
      );
      // 꽃밥: 끝의 작은 마름모 — 가장 밝은 점
      const vl = pos.length / 3;
      const s2 = 0.006;
      pos.push(tip.x - s2, tip.y, tip.z, tip.x, tip.y + s2, tip.z, tip.x + s2, tip.y, tip.z, tip.x, tip.y - s2, tip.z);
      col.push(...ANTHER, ...ANTHER, ...ANTHER, ...ANTHER);
      idx.push(vl, vl + 1, vl + 2, vl, vl + 2, vl + 3);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
