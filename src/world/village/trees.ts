import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Props } from '@/world/props';
import type { Physics } from '@/core/physics';
import { Simplex2D } from '../noise';
import { normalize } from './landmarks';
import type { VillageGround } from './ground';

/**
 * 산자락 삼나무(杉) 숲 — 마을을 감싸 지평선을 끌어당기는 실루엣.
 *
 * 원래는 원기둥 하나 + 원뿔 셋이었다. "밤이라 디테일이 안 보인다"가 근거였는데,
 * ACT 2 를 **오후 3시**로 옮기면서 그 전제가 깨졌다 — 대낮에 원뿔 700 개는 원뿔로 보인다.
 * 그래서 Tripo 로 삼나무를 만들어 얹는다.
 *
 * ## 왜 LOD 를 나누는가
 * Tripo 원본은 13,500 tris 다. 700 그루면 **950 만 삼각형** — 배경 실루엣에 쓸 수 있는 값이 아니다.
 * 그래서 두 층으로 나눈다:
 *  - **가까운 나무**(길에서 `NEAR_DIST` 안): 5,600 tris 두 종. 플레이어가 실제로 곁을 지나간다
 *  - **먼 나무**: 1,282 tris 한 종. 별도로 저폴리 생성했다 —
 *    잎이 전부 분리된 셸이라 심플리파이어가 5,580 tris 아래로 못 내려간다(실측: error 0.4 를 줘도 그대로).
 *    감축이 막히면 **다시 만드는 게 답이다.**
 *
 * **그림자는 만들지 않는다**: 인스턴스 메시는 부분 컬링이 안 돼서, 초칭(포인트 라이트)의
 * 큐브 그림자 6면에 숲 전체가 다시 그려진다. 배경 실루엣에 그 비용을 쓸 이유가 없다.
 */

/** 나무 한 그루의 기준 높이(m). 예전 절차적 삼나무와 같게 두면 배치·앉을자리 값이 그대로다 */
const TREE_H = 7.3;
/** 이 거리 안쪽의 나무는 고해상도. 플레이어가 다니는 길에서 잰다 */
const NEAR_DIST = 32;

/** 까마귀가 앉을 가지 자리. 나무 하나당 0~2 개, **참배로에서 가까운 나무만** 만든다 */
export interface Perch { x: number; y: number; z: number; yaw: number }

/** 배치 한 자리 — 메시는 GLB 가 온 뒤에 만든다 */
interface Slot { m: THREE.Matrix4; near: boolean; variant: 0 | 1 }

export class Cedars {
  readonly group = new THREE.Group();
  /** 앉을 자리 후보 — 까마귀(`crows.ts`)가 여기서 골라 앉는다 */
  readonly perches: Perch[] = [];
  count = 0;
  private slots: Slot[] = [];

  constructor(private scene: THREE.Scene, physics: Physics, ground: VillageGround, opts: { target?: number; minHeight?: number } = {}) {
    const target = opts.target ?? 700;
    const minHeight = opts.minHeight ?? 2.2; // 이 높이 위(= 산자락·계곡 사면)에만 심는다
    this.group.name = 'cedars';
    scene.add(this.group);

    const rng = seeded(9137);
    const noise = new Simplex2D(551);
    const dummy = new THREE.Object3D();
    const half = ground.size * 0.5 - 3;
    const placed: { x: number; z: number }[] = [];
    let tries = 0;
    while (this.slots.length < target && tries < target * 40) {
      tries++;
      const x = (rng() * 2 - 1) * half, z = (rng() * 2 - 1) * half;
      const h = ground.heightAt(x, z);
      if (h < minHeight) continue;
      if (ground.slopeAt(x, z) > 1.5) continue;          // 절벽은 제외
      const rd = ground.pathDist(x, z);
      if (rd < 4.2) continue;                             // 갈래길은 모두 비운다 (참배로·오솔길·대숲길)
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
      this.slots.push({ m: dummy.matrix.clone(), near: rd < NEAR_DIST, variant: rng() < 0.5 ? 0 : 1 });
      placed.push({ x, z });
      // 줄기 콜라이더 (플레이어가 숲으로 못 들어가게 하는 역할도 겸한다)
      physics.addStaticBox(new THREE.Vector3(x, h + 1.6 * sc, z), new THREE.Vector3(0.3 * sc, 1.6 * sc, 0.3 * sc));
      // 앉을 자리: 플레이어가 지나다니는 참배로 근처 나무에만. 아래 단(눈높이에 가깝다)과 위 단을 섞는다
      if (rd < 26 && this.perches.length < 360) {
        const k = rng() < 0.45 ? 2 : 1;
        for (let i = 0; i < k; i++) {
          const low = rng() < 0.55;
          const ly = low ? 3.3 + rng() * 0.9 : 5.2 + rng() * 1.1;   // 잎이 붙기 시작하는 높이대
          const lr = (low ? 1.05 : 0.62) * (0.75 + rng() * 0.4);
          const a = rng() * Math.PI * 2;
          this.perches.push({
            x: x + Math.cos(a) * lr * sc,
            y: h - 0.15 + ly * sc,
            z: z + Math.sin(a) * lr * sc,
            yaw: a + (rng() - 0.5) * 1.2,   // 대체로 줄기 바깥을 본다
          });
        }
      }
    }
    this.count = this.slots.length;
  }

  /**
   * Tripo GLB 세 벌을 올린다. 실패하면 **절차적 원뿔로 되돌아간다** —
   * 에셋 하나 때문에 마을이 민둥산이 되면 안 된다.
   */
  async load() {
    const loader = Props.loader();
    let kinds: { geo: THREE.BufferGeometry; mat: THREE.Material }[];
    try {
      const [a, b, far] = await Promise.all([
        loader.loadAsync('/models/props/cedar-a.glb'),
        loader.loadAsync('/models/props/cedar-b.glb'),
        loader.loadAsync('/models/props/cedar-far.glb'),
      ]);
      kinds = [bake(a.scene), bake(b.scene), bake(far.scene)];
    } catch (e) {
      console.warn('[cedars] GLB 로드 실패 → 절차적 원뿔로', e);
      const geo = makeCedarGeometry();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
      kinds = [{ geo, mat }, { geo, mat }, { geo, mat }];
    }

    // 가까운 나무는 두 종을 섞고, 먼 나무는 한 종으로 몰아 드로우콜을 아낀다
    const groups: Slot[][] = [[], [], []];
    for (const s of this.slots) groups[s.near ? s.variant : 2]!.push(s);
    let tris = 0;
    for (let i = 0; i < 3; i++) {
      const g = groups[i]!;
      if (g.length === 0) continue;
      const k = kinds[i]!;
      const mesh = new THREE.InstancedMesh(k.geo, k.mat, g.length);
      for (let j = 0; j < g.length; j++) mesh.setMatrixAt(j, g[j]!.m);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.name = `cedars-${i}`;
      this.group.add(mesh);
      tris += ((k.geo.index?.count ?? k.geo.attributes['position']!.count) / 3) * g.length;
    }
    console.info(`[cedars] ${this.count}그루 (가까이 ${groups[0]!.length + groups[1]!.length} · 멀리 ${groups[2]!.length}) ≈ ${(tris / 1e6).toFixed(2)}M tris`);
  }
}

/** GLB 한 벌 → 인스턴싱용 지오메트리 + 재질. 높이·원점을 예전 절차적 나무에 맞춘다 */
function bake(root: THREE.Object3D): { geo: THREE.BufferGeometry; mat: THREE.Material } {
  const norm = normalize(root, TREE_H);
  const geos: THREE.BufferGeometry[] = [];
  let mat: THREE.Material | null = null;
  norm.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    geos.push(m.geometry);
    mat ??= Array.isArray(m.material) ? m.material[0]! : m.material;
  });
  const geo = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
  if (!geo || !mat) throw new Error('삼나무 GLB 에서 메시를 찾지 못했다');
  // 잎이 얇은 판이라 뒷면이 보인다. 나뭇잎은 양면으로 그려야 구멍이 안 뚫린다
  const m2 = (mat as THREE.MeshStandardMaterial).clone();
  m2.side = THREE.DoubleSide;
  m2.roughness = 0.94;
  m2.metalness = 0;
  return { geo, mat: m2 };
}

/** 삼나무 하나: 줄기 + 3단 원뿔 (원점 = 밑동). GLB 로드 실패 시의 대체품 */
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
