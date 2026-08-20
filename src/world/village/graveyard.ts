import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import type { VillageGround } from './ground';

/**
 * 무연불 묘지(無縁仏) — 뒷산 오솔길 옆, 돌보는 이가 없어 기운 묘석들.
 *
 * 뒷산길은 가장 길고 어두운 길이다. 그 길을 고를 **이유**가 없으면 아무도 안 간다.
 * 여기에 랜드마크를 두어 "저기까지 가면 절반은 온 것"이라는 좌표를 준다.
 *
 * 동시에 **시야를 무릎 높이에서 끊는다** — 대숲이 서서 막는다면 묘석은 웅크렸을 때 막는다.
 * 웅크려 이동하면 묘석 사이로 몸이 가려지지만, 그만큼 느리다.
 *
 * 지오메트리는 전부 절차적이다. 밤에 30 m 밖에서 보는 돌덩이에 생성 모델을 쓸 이유가 없다
 * (지장보살은 참배로 옆 1.5 m 에서 보므로 Tripo 를 썼다 — 기준은 거리다).
 */
export class Graveyard {
  readonly group = new THREE.Group();
  readonly center = new THREE.Vector3();
  readonly count: number;

  constructor(scene: THREE.Scene, physics: Physics, ground: VillageGround, opts: {
    center: THREE.Vector3; radius?: number; target?: number;
  }) {
    const R = opts.radius ?? 13;
    const target = opts.target ?? 46;
    this.center.copy(opts.center);
    this.group.name = 'graveyard';

    const rng = seeded(6931);
    // 밤에 초칭을 받으면 돌은 금방 하얗게 뜬다 — 화강암 반사율(0.35 안팎)보다 훨씬 낮게 깎아 둔다
    const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });

    // --- 묘석: 세 종류를 인스턴싱 (기둥형 각塔婆 / 판형 / 뭉툭한 자연석) ---
    const kinds = [slabGeo(0.28, 1.05, 0.18), slabGeo(0.42, 0.62, 0.22), boulderGeo(0.36)];
    const picks: THREE.Matrix4[][] = [[], [], []];
    const dummy = new THREE.Object3D();
    let n = 0, tries = 0;
    while (n < target && tries < target * 40) {
      tries++;
      // 줄을 맞추되 흐트러뜨린다 — 완전 랜덤은 묘지로 안 보이고, 완전 격자는 인공적이다
      const row = Math.floor(rng() * 6) - 2.5, col = Math.floor(rng() * 7) - 3;
      const x = this.center.x + col * 2.6 + (rng() - 0.5) * 1.1;
      const z = this.center.z + row * 2.9 + (rng() - 0.5) * 1.1;
      if (Math.hypot(x - this.center.x, z - this.center.z) > R) continue;
      if (ground.pathDist(x, z) < 2.0) continue;       // 길은 비운다
      if (ground.slopeAt(x, z) > 0.7) continue;
      const h = ground.heightAt(x, z);
      const k = rng() < 0.5 ? 0 : rng() < 0.6 ? 1 : 2;
      const sc = 0.8 + rng() * 0.6;
      // 오래 방치돼 기운다 — 이 기울기가 "돌보는 이가 없다"를 말한다
      const tilt = (rng() - 0.5) * 0.42;
      dummy.position.set(x, h - 0.08, z);
      dummy.rotation.set(tilt, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      picks[k]!.push(dummy.matrix.clone());
      if (sc > 1.0) physics.addStaticBox(new THREE.Vector3(x, h + 0.45 * sc, z), new THREE.Vector3(0.22 * sc, 0.45 * sc, 0.18 * sc));
      n++;
    }
    kinds.forEach((geo, i) => {
      const list = picks[i]!;
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, stoneMat, list.length);
      list.forEach((m, j) => im.setMatrixAt(j, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false;       // 삼나무·대나무와 같은 이유 (초칭 큐브 그림자 6면)
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
    });

    // --- 한가운데 무연불 석탑: 주인 없는 묘석을 쌓아 올린 무더기 ---
    const stack: THREE.BufferGeometry[] = [];
    let y = 0;
    for (let i = 0; i < 7; i++) {
      const w = 1.05 - i * 0.12, hh = 0.26 - i * 0.015;
      const b = new THREE.BoxGeometry(w, hh, w * 0.85);
      b.rotateY(rng() * 0.5);
      b.translate((rng() - 0.5) * 0.12, y + hh / 2, (rng() - 0.5) * 0.12);
      stack.push(b);
      y += hh;
    }
    const cap = new THREE.SphereGeometry(0.24, 8, 6);
    cap.scale(1, 0.8, 1);
    cap.translate(0, y + 0.18, 0);
    stack.push(cap);
    const merged = mergeGeometries(stack, false)!;
    paint(merged, new THREE.Color(0.055, 0.058, 0.052), new THREE.Color(0.155, 0.163, 0.142));
    const tower = new THREE.Mesh(merged, stoneMat);
    const ch = ground.heightAt(this.center.x, this.center.z);
    tower.position.set(this.center.x, ch - 0.05, this.center.z);
    tower.castShadow = false;
    tower.receiveShadow = true;
    this.group.add(tower);
    physics.addStaticBox(new THREE.Vector3(this.center.x, ch + 0.9, this.center.z), new THREE.Vector3(0.6, 0.9, 0.55));
    this.center.y = ch;

    this.count = n;
    scene.add(this.group);
    console.info(`[graveyard] 묘석 ${n} 기`);
  }

  /** 묘지 안인가 — 앰비언스·요괴 앵커 판정용 */
  contains(p: THREE.Vector3, r = 15) {
    return (p.x - this.center.x) ** 2 + (p.z - this.center.z) ** 2 < r * r;
  }
}

/** 판형 묘석 — 위가 살짝 좁고 모서리가 닳았다 */
function slabGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 1, 3, 1);
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + h / 2) / h;                 // 0 = 밑, 1 = 위
    const taper = 1 - t * 0.18;
    pos.setX(i, pos.getX(i) * taper);
    pos.setZ(i, pos.getZ(i) * taper);
    if (t > 0.9) pos.setY(i, y - h * 0.03);    // 꼭대기를 살짝 뭉갠다
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  paint(g, new THREE.Color(0.048, 0.052, 0.048), new THREE.Color(0.150, 0.158, 0.135));
  return g;
}

/** 자연석 — 구를 찌그러뜨린다 */
function boulderGeo(r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 7, 5);
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const s = 0.75 + ((Math.sin(pos.getX(i) * 9.1) + Math.cos(pos.getZ(i) * 7.7)) * 0.5 + 0.5) * 0.45;
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.72, pos.getZ(i) * s);
  }
  g.translate(0, r * 0.55, 0);
  g.computeVertexNormals();
  paint(g, new THREE.Color(0.042, 0.046, 0.040), new THREE.Color(0.128, 0.140, 0.118));
  return g;
}

/** 아래는 이끼·흙으로 어둡게, 위는 달빛을 받아 밝게 */
function paint(g: THREE.BufferGeometry, lo: THREE.Color, hi: THREE.Color) {
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.smoothstep(pos.getY(i), bb.min.y, bb.max.y);
    tmp.copy(lo).lerp(hi, t);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
