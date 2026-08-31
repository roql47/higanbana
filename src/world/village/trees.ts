import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Props } from '@/world/props';
import type { Physics } from '@/core/physics';
import { settings } from '@/core/settings';
import { createSpatialInstancedMeshes, fogCullDistance, updateChunkDistanceVisibility } from '@/world/instancing';
import { makeAxialBillboardMaterial, makeBillboardPlane, makeCedarBillboardTexture } from '@/world/billboard';
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
 * 그래서 세 층으로 나눈다:
 *  - **근경**: 5,600 tris 두 종. 플레이어가 실제로 곁을 지나간다
 *  - **중경**: 약 2,400 tris. 가지의 입체감이 아직 보이는 거리다
 *  - **원경**: 2 tris 카메라 지향 8방향 임포스터. 실제 GLB의 실루엣·재질을 유지한다
 * 원본 잎은 분리된 셸이라 심플리파이어 감축이 일찍 막히므로, 원경은 메시를 더 깎지 않고
 * 텍스처 카드로 바꾸는 편이 효과가 크다.
 *
 * **그림자는 만들지 않는다**: 공간 청크 컬링을 해도 초칭(포인트 라이트)의 큐브 그림자 6면에는
 * 주변 숲 청크가 반복해서 그려진다. 배경 실루엣에 그 비용을 쓸 이유가 없다.
 */

/**
 * 나무 한 그루의 기준 높이(m). 인스턴스 스케일 `SC_MIN~SC_MAX` 를 받는다.
 *
 * ⚠️ 7.3 이었다 — **절차적 원뿔 시절의 값을 그대로 물려받은 것**이다(그때는 "배치·앉을자리
 * 값이 그대로다"가 이유였다). 그 결과 숲이 5.3~10.3 m 라 **민가 용마루 7.48 m 와 키가 같았고**,
 * "마을을 감싸 지평선을 끌어당기는 실루엣"이 아니라 덤불로 읽혔다 (2026-08-26 실측).
 * 실제 스기(Cryptomeria japonica)는 20~40 m, 마을 어귀 조림은 15~25 m 다.
 *
 * 12.5 는 **타협값**이다: 실물보다 낮지만 지붕을 확실히 넘고(9.6~17.5 m), 700 그루의
 * 화면 채움(오버드로)을 실물 높이만큼 키우지 않는다. 삼각형 수는 그대로다 — 키만 바뀐다.
 */
const TREE_H = 12.5;
const SC_MIN = 0.77, SC_MAX = 1.4;
/**
 * XZ 를 이만큼 눌러 **가늘게** 만든다. Tripo 원본은 높이:폭이 약 1:2 라, 키만 올리면
 * 14 m 짜리에 6 m 폭 왕관이 달린다. 실제 스기는 1:4~1:6 이다.
 * (임포스터 카드도 같은 인스턴스 행렬을 받으므로 근경·원경이 함께 가늘어진다)
 */
const SLENDER = 0.66;
/**
 * LOD 경계 — **플레이어가 다니는 길에서 잰 거리**다(나무가 카메라에서 얼마나 떨어지느냐가 아니라).
 * 플레이어는 길 위에만 있으므로 이 거리가 곧 「가장 가까워질 수 있는 거리」다.
 *
 *   ~12 m   근경: 곁을 스쳐 지나간다        → cedar-a/b (5,582 tris, 감축 벽)
 *   12~32 m 중경: 길에서 보이지만 멀다      → cedar-mid (약 2,400 tris)
 *   32 m~   원경: 숲의 실루엣               → 카메라 지향 임포스터 (2 tris)
 *
 * ⚠️ 근경 모델은 **더 못 줄인다** — 잎이 전부 분리된 셸이라 심플리파이어가 5,582 에서 멈춘다
 * (error 0.6 까지 실측). 그래서 「줄이는」 대신 **경계를 좁혀 그루 수를 줄이는** 것이 답이었다.
 */
const NEAR_DIST = 12;
const MID_DIST = 32;

/** 까마귀가 앉을 가지 자리. 나무 하나당 0~2 개, **참배로에서 가까운 나무만** 만든다 */
export interface Perch { x: number; y: number; z: number; yaw: number }

/** 배치 한 자리 — 메시는 GLB 가 온 뒤에 만든다 */
interface Slot { m: THREE.Matrix4; tier: 0 | 1 | 2; variant: 0 | 1 }   // tier 0 근경 · 1 중경 · 2 원경

export class Cedars {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[] = [];
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
      // 최소 간격 — 나무가 커진 만큼 넓힌다(2.45 m 는 14 m 짜리끼리 왕관이 겹친다)
      let tooClose = false;
      for (const p of placed) { if ((p.x - x) ** 2 + (p.z - z) ** 2 < 12.0) { tooClose = true; break; } }
      if (tooClose) continue;

      const sc = SC_MIN + rng() * (SC_MAX - SC_MIN);
      const scXZ = sc * SLENDER * (0.9 + rng() * 0.2);
      dummy.position.set(x, h - 0.15, z);
      dummy.rotation.set((rng() - 0.5) * 0.06, rng() * Math.PI * 2, (rng() - 0.5) * 0.06);
      dummy.scale.set(scXZ, sc, scXZ);
      dummy.updateMatrix();
      this.slots.push({ m: dummy.matrix.clone(), tier: rd < NEAR_DIST ? 0 : rd < MID_DIST ? 1 : 2, variant: rng() < 0.5 ? 0 : 1 });
      placed.push({ x, z });
      /**
       * 줄기 콜라이더 (플레이어가 숲으로 못 들어가게 하는 역할도 겸한다).
       * 반지름·높이를 **실제 인스턴스 스케일에서** 뽑는다 — 예전엔 `0.3·sc`·`1.6·sc` 로 박아 둬서
       * `TREE_H` 를 바꾸면 나무만 커지고 콜라이더는 그대로 남았을 자리다.
       */
      const trunkR = TREE_H * 0.041 * (scXZ / sc), trunkH = TREE_H * 0.22 * sc;
      physics.addStaticBox(new THREE.Vector3(x, h + trunkH, z), new THREE.Vector3(trunkR, trunkH, trunkR));
      /**
       * 앉을 자리: 플레이어가 지나다니는 참배로 근처 나무에만. 아래 단·위 단을 섞는다.
       * 높이·반경을 **`TREE_H` 비율로** 적는다 — 예전엔 3.3~6.3 m 를 절대값으로 박아 둬서,
       * 나무를 키우면 까마귀가 잎도 없는 밑동에 앉게 된다. 아래 단은 잎이 시작되는 언저리(0.32),
       * 위 단은 왕관 중간(0.58) 이다.
       */
      if (rd < 26 && this.perches.length < 360) {
        const k = rng() < 0.45 ? 2 : 1;
        for (let i = 0; i < k; i++) {
          const low = rng() < 0.55;
          const ly = TREE_H * (low ? 0.32 + rng() * 0.07 : 0.58 + rng() * 0.09);
          const lr = TREE_H * (low ? 0.144 : 0.085) * (0.75 + rng() * 0.4) * SLENDER;
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
   * Tripo GLB 세 벌과 원거리 임포스터를 올린다. 실패하면 **절차적 원뿔로 되돌아간다** —
   * 에셋 하나 때문에 마을이 민둥산이 되면 안 된다.
   */
  async load() {
    const loader = Props.loader();
    let kinds: { geo: THREE.BufferGeometry; mat: THREE.Material }[];
    /**
     * 임포스터 카드의 **가로세로비는 텍스처가 정한다** — 아틀라스 셀도 절차 폴백도 512×1024
     * (`build-impostors.ts` · `makeCedarBillboardTexture`)라 정확히 1:2 다. 여기 폭을 상수
     * 3.8 로 박아 두면 `TREE_H` 를 바꾼 순간 원경 나무만 가로로 늘어난다 — 옛 3.8 은 마침
     * `7.3 × 1.04 × 0.5` 였을 뿐이다. 높이에서 다시 뽑아 그 결합을 끊는다.
     */
    const billboardGeo = makeBillboardPlane(TREE_H * 1.04 * 0.5, TREE_H * 1.04);
    const fallbackBillboard = {
      geo: billboardGeo,
      mat: makeAxialBillboardMaterial(makeCedarBillboardTexture(), { alphaTest: 0.28, color: 0xd5ddd2 }),
    };
    try {
      const [a, b, mid] = await Promise.all([
        loader.loadAsync('/models/props/cedar-a.glb'),
        loader.loadAsync('/models/props/cedar-b.glb'),
        loader.loadAsync('/models/props/cedar-mid.glb'),
      ]);
      kinds = [bake(a.scene), bake(b.scene), bake(mid.scene)];
    } catch (e) {
      console.warn('[cedars] GLB 로드 실패 → 절차적 원뿔로', e);
      const geo = makeCedarGeometry();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
      kinds = [{ geo, mat }, { geo, mat }, { geo, mat }];
    }

    // 원경은 실제 cedar-a/b 를 45° 간격으로 렌더링한 8방향 아틀라스다. 에셋이 없거나
    // 브라우저가 WebP 를 읽지 못하면 기존 절차 이미지 한 장으로 조용히 폴백한다.
    let farKinds = [fallbackBillboard, fallbackBillboard];
    try {
      const textureLoader = new THREE.TextureLoader();
      const [farA, farB] = await Promise.all([
        textureLoader.loadAsync('/textures/impostors/cedar-a-8.webp'),
        textureLoader.loadAsync('/textures/impostors/cedar-b-8.webp'),
      ]);
      for (const tex of [farA, farB]) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      }
      // 임포스터는 MeshBasic이라 실제 조명을 받지 않는다. 원본 렌더를 그대로 쓰면 밤 산자락에서
      // 잎이 흰 종이처럼 뜨므로, 중경 삼나무와 같은 어두운 청록으로 곱해 시간대 톤을 맞춘다.
      const atlasOpts = { alphaTest: 0.3, color: 0x435847, atlas: { frames: 8, columns: 4, rows: 2 } } as const;
      farKinds = [
        { geo: billboardGeo, mat: makeAxialBillboardMaterial(farA, atlasOpts) },
        { geo: billboardGeo, mat: makeAxialBillboardMaterial(farB, atlasOpts) },
      ];
    } catch (e) {
      console.warn('[cedars] 8방향 임포스터 로드 실패 → 절차 빌보드로', e);
    }
    kinds.push(...farKinds);

    // 가까운 나무는 두 종을 섞고, 먼 나무는 한 종으로 몰린다. 각 종류를 다시 공간 청크로
    // 나눠 화면 밖 숲은 드로우콜과 정점 처리가 모두 생기지 않게 한다.
    // 0·1 = 근경 두 종(섞어 쓴다) · 2 = 중경 · 3·4 = 원경 8방향 두 종
    const groups: Slot[][] = [[], [], [], [], []];
    for (const s of this.slots) groups[s.tier === 0 ? s.variant : s.tier === 1 ? 2 : 3 + s.variant]!.push(s);
    let tris = 0;
    for (let i = 0; i < 5; i++) {
      const g = groups[i]!;
      if (g.length === 0) continue;
      const k = kinds[i]!;
      const made = createSpatialInstancedMeshes(
        this.group,
        k.geo,
        k.mat,
        g.map((slot) => ({ matrix: slot.m })),
        // 전체 숲이 약 0.12 M tris라 작은 청크의 정점 절약보다 61개 제출 비용이 더 컸다.
        // 48 m 셀은 맵 사분면 컬링은 유지하면서, 마을 진입 회전 때 한꺼번에 보이는
        // 청크 수를 줄인다. LOD 배치와 모델 자체는 그대로다.
        { cellSize: 48, name: `cedars-${i}`, receiveShadow: i < 3, boundsPadding: i >= 3 ? 0.6 : 0 },
      );
      this.meshes.push(...made.meshes);
      tris += ((k.geo.index?.count ?? k.geo.attributes['position']!.count) / 3) * g.length;
    }
    console.info(`[cedars] ${this.count}그루 · ${this.meshes.length} 청크 (근경 ${groups[0]!.length + groups[1]!.length} · 중경 ${groups[2]!.length} · 원경 ${groups[3]!.length + groups[4]!.length}) ≈ ${(tris / 1e6).toFixed(2)}M tris`);
  }

  update(center: THREE.Vector3, maxDistance = fogCullDistance(settings.night.fogDensity)) {
    if (this.meshes.length) updateChunkDistanceVisibility(this.meshes, center, maxDistance);
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
