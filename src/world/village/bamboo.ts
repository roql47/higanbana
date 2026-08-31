import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toFloatGeometry } from '@/core/geom';
import type { Physics } from '@/core/physics';
import { settings } from '@/core/settings';
import {
  createSpatialInstancedMeshes,
  fogCullDistance,
  updateChunkDistanceVisibility,
  updateTripleChunkLodVisibility,
  type SpatialInstance,
} from '@/world/instancing';
import { Props } from '@/world/props';
import type { VillageGround } from './ground';

/**
 * 대나무 숲(竹林) — 동쪽 대숲길을 감싸는 구역.
 *
 * 이 맵에서 **시야를 가장 확실히 끊는 장치**다. 삼나무는 줄기가 굵고 드문드문이라
 * 사이로 멀리까지 보이지만, 대나무는 가늘고 촘촘해서 3~4 m 앞이 벽처럼 막힌다.
 * 일본 공포에서 대숲이 반복해서 나오는 이유이기도 하다 — 바람 소리와 함께 방향 감각을 지운다.
 *
 * 구현 — 같은 배치 행렬을 공유하는 3단 LOD. **잎은 세 단 모두 알파 카드**이고 줄기만 갈린다
 *  · 근경: Tripo 줄기 원본 (2,886 tris) + 잎 카드
 *  · 중경: meshopt 로 14 %까지 줄인 Tripo 줄기 (404 tris) + 잎 카드
 *  · 원경: 원기둥 8각 + 잎 카드. Tripo 로딩 실패 때도 이 벌로 숲 전체를 유지한다
 *  · 공간 청크별 InstancedMesh 로 묶어 화면 밖 숲은 그리지 않는다
 *  · **콜라이더는 굵은 줄기에만** 단다. 전부 달면 정적 콜라이더가 2,000 개를 넘어
 *    나브그리드 굽는 시간이 크게 늘고, 어차피 가는 대는 밀고 지나가는 게 자연스럽다
 *  · 그림자는 만들지 않는다 (삼나무·까마귀와 같은 이유)
 *
 * Tripo 원본을 900대 전부 그리면 천만 단위 삼각형이 되므로, 가까운 청크에만 원본을 쓴다.
 * 청크 경계는 중심이 아니라 플레이어와 맞닿는 면까지의 거리로 판정해 눈앞에서 튀지 않는다.
 */

/** 잎 카드에 텍스처가 붙었을 때 쓰는 알파 문턱. 블렌딩을 안 써서 정렬 비용이 없다 */
const LEAF_ALPHA_TEST = 0.4;
/** 줄기 표피 타일을 세로로 몇 번 반복하는가 — 타일당 마디 3개라 12 마디 ≈ 52 cm 간격 */
const CULM_TILE_REPEAT = 4;
const BAMBOO_HEIGHT = 6.2;
/** 줄기 하나에 붙는 잎 뭉치 수 (뭉치마다 교차 카드 2장) */
const LEAF_CLUSTERS = 5;
const CHUNK_SIZE = 10;
const NEAR_LOD_DISTANCE = 5.5;
const MID_LOD_DISTANCE = 27;
const TRIPO_CULM = '/models/props/bamboo-culm.glb';
const TRIPO_CULM_MID = '/models/props/bamboo-culm-mid.glb';

export class BambooGrove {
  readonly group = new THREE.Group();
  /** 디버그·통계용 전체 LOD 청크 목록. */
  readonly meshes: THREE.InstancedMesh[] = [];
  readonly count: number;
  private culmMat: THREE.MeshStandardMaterial;
  private leafMat: THREE.MeshStandardMaterial;
  private readonly instances: SpatialInstance[];
  private readonly farMeshes: THREE.InstancedMesh[];
  private nearMeshes: THREE.InstancedMesh[] = [];
  private midMeshes: THREE.InstancedMesh[] = [];
  private modelLodsReady = false;

  constructor(scene: THREE.Scene, physics: Physics, ground: VillageGround, opts: {
    /** 구역 사각형 (월드) */
    area: { x0: number; z0: number; x1: number; z1: number };
    target?: number;
    /** 길에서 이 거리 안은 비운다 */
    clear?: number;
    /** 굵은 대나무에만 붙이는 정적 콜라이더 상한. */
    colliderLimit?: number;
  }) {
    const target = opts.target ?? 900;
    const clear = opts.clear ?? 1.8;
    const colliderLimit = Math.max(0, opts.colliderLimit ?? 260);
    const A = opts.area;
    this.group.name = 'bamboo';

    const geo = makeFarCulm();
    // 텍스처가 오기 전(혹은 실패했을 때)의 모습 = 정점색만 쓰던 옛 룩. 숲이 사라지지는 않는다.
    // roughness 0.62 는 밤인데 줄기에 광택을 만들어 "연회색 파이프"로 보이게 하던 값이다
    this.culmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    this.culmMat.envMapIntensity = 0.5;
    this.leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    this.leafMat.envMapIntensity = 0.5;
    const mat = [this.culmMat, this.leafMat];

    const rng = seeded(31337);
    const dummy = new THREE.Object3D();
    const matrices: THREE.Matrix4[] = [];
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
      matrices.push(dummy.matrix.clone());
      // 굵은 것만 콜라이더 — 가는 대는 밀고 지나간다
      if (sc > 1.15 && colliders < colliderLimit) {
        physics.addStaticBox(new THREE.Vector3(x, h + 1.5, z), new THREE.Vector3(0.08, 1.5, 0.08));
        colliders++;
      }
      n++;
    }
    this.count = n;
    this.instances = matrices.map((matrix) => ({ matrix }));
    this.farMeshes = createSpatialInstancedMeshes(
      this.group,
      geo,
      mat,
      this.instances,
      { cellSize: CHUNK_SIZE, name: 'bamboo-far', receiveShadow: true, boundsPadding: 1.2 },
    ).meshes;
    this.meshes.push(...this.farMeshes);
    scene.add(this.group);
    console.info(`[bamboo] ${n} 대 · 원경 ${this.farMeshes.length} 청크 · 콜라이더 ${colliders}`);
  }

  /**
   * Tripo 근경/중경 모델과 원경 텍스처를 읽는다. 어느 쪽이 실패해도 생성자에서 만든
   * 절차적 원경 벌은 남는다 — 비동기 에셋 하나 때문에 대숲이 통째로 사라지지 않는다.
   */
  async load() {
    const textureLoader = new THREE.TextureLoader();
    const modelLoader = Props.loader();
    const [culmTex, leafTex, nearCulm, midCulm] = await Promise.allSettled([
      textureLoader.loadAsync('/textures/impostors/bamboo-culm-1.webp'),
      textureLoader.loadAsync('/textures/impostors/sasa-leaf-1.webp'),
      modelLoader.loadAsync(TRIPO_CULM),
      modelLoader.loadAsync(TRIPO_CULM_MID),
    ]);

    if (culmTex.status === 'fulfilled') {
      const tex = culmTex.value;
      tex.colorSpace = THREE.SRGBColorSpace;
      // v 는 지오메트리 UV 에서 이미 CULM_TILE_REPEAT 배로 늘려 뒀다 → 반복 감싸기가 필수
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      this.culmMat.map = tex;
      this.culmMat.vertexColors = false;       // 표피 색은 이제 텍스처가 정한다
      this.culmMat.color.setHex(0xa8ac96);     // 밤 톤으로 눌러 둔다 (원본은 낮 기준으로 구워졌다)
      this.culmMat.needsUpdate = true;
    } else {
      console.warn('[bamboo] 줄기 표피 텍스처 실패 → 정점색 유지:', culmTex.reason);
    }

    if (leafTex.status === 'fulfilled') {
      const tex = leafTex.value;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      this.leafMat.map = tex;
      this.leafMat.vertexColors = false;
      this.leafMat.alphaTest = LEAF_ALPHA_TEST;  // 이게 없으면 카드가 불투명 판때기로 남는다
      this.leafMat.color.setHex(0x8a9a72);
      this.leafMat.needsUpdate = true;
    } else {
      console.warn('[bamboo] 잎 텍스처 실패 → 불투명 잎판 유지:', leafTex.reason);
    }

    if (nearCulm.status !== 'fulfilled' || midCulm.status !== 'fulfilled') {
      console.warn('[bamboo] Tripo 줄기 LOD 로드 실패 → 절차적 벌 유지', {
        nearCulm: nearCulm.status === 'rejected' ? nearCulm.reason : undefined,
        midCulm: midCulm.status === 'rejected' ? midCulm.reason : undefined,
      });
      return;
    }

    try {
      // 잎 카드는 세 티어가 재질을 공유한다. 잎 텍스처가 실패했다면 정점색을 볼 수 없는
      // (색 속성이 없는) 카드가 되므로, 그때만 불투명 폴백 재질을 따로 만든다
      const leafMat = this.leafMat.map
        ? this.leafMat
        : new THREE.MeshStandardMaterial({ color: 0x24331d, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
      const near = makeTripoCulm(nearCulm.value.scene, 0.7, leafMat);
      const mid = makeTripoCulm(midCulm.value.scene, 0.64, leafMat);
      this.nearMeshes = createSpatialInstancedMeshes(
        this.group, near.geometry, near.materials, this.instances,
        { cellSize: CHUNK_SIZE, name: 'bamboo-near', receiveShadow: true, boundsPadding: 1.2 },
      ).meshes;
      this.midMeshes = createSpatialInstancedMeshes(
        this.group, mid.geometry, mid.materials, this.instances,
        { cellSize: CHUNK_SIZE, name: 'bamboo-mid', receiveShadow: true, boundsPadding: 1.2 },
      ).meshes;
      // 다음 update 전 한 프레임 동안 세 벌이 겹치지 않게 먼저 감춘다.
      for (const mesh of [...this.nearMeshes, ...this.midMeshes]) mesh.visible = false;
      this.meshes.push(...this.nearMeshes, ...this.midMeshes);
      this.modelLodsReady = true;
      console.info(`[bamboo] Tripo 3단 LOD 준비 · 근 ${this.nearMeshes.length} / 중 ${this.midMeshes.length} / 원 ${this.farMeshes.length} 청크`);
    } catch (e) {
      console.warn('[bamboo] Tripo 지오메트리 조립 실패 → 절차적 벌 유지:', e);
    }
  }

  update(center: THREE.Vector3, maxDistance = fogCullDistance(settings.night.fogDensity)) {
    if (!this.modelLodsReady) {
      updateChunkDistanceVisibility(this.farMeshes, center, maxDistance);
      return;
    }
    updateTripleChunkLodVisibility(
      this.nearMeshes,
      this.midMeshes,
      this.farMeshes,
      center,
      NEAR_LOD_DISTANCE,
      MID_LOD_DISTANCE,
      maxDistance,
    );
  }
}

interface TripoBamboo {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
}

/** GLB 안 첫 메시를 월드 변환까지 구운 일반 Float32 지오메트리로 꺼낸다. */
function firstModelPart(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  let part: { geometry: THREE.BufferGeometry; material: THREE.Material } | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!part && mesh.isMesh) {
      part = {
        geometry: toFloatGeometry(mesh.geometry, mesh.matrixWorld),
        material: (Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material).clone(),
      };
    }
  });
  if (!part) throw new Error('GLB에 메시가 없습니다');
  return part as { geometry: THREE.BufferGeometry; material: THREE.Material };
}

/**
 * 제각각인 Tripo 원점·크기를 게임 대나무 규격으로 바꾸고, **줄기(Tripo 메시) + 잎(알파 카드)** 을
 * 재질 그룹 하나로 합친다.
 *
 * ## 왜 잎만 카드인가 (2026-08-26 실측)
 * Tripo 잎 스프레이는 잎날 하나하나가 닫힌 셸이라 **7,783 tris** — 근경 한 대(10,669)의 **73 %** 를
 * 잎 **한 뭉치**가 먹었다. 그래서 근경일수록 잎이 오히려 적어지고(원경은 5뭉치) 그 한 뭉치마저
 * 줄기에서 떠 보였다. 카드로 바꾸면 뭉치 5개를 붙이고도 잎이 20 tris 다:
 *   근경 10,669 → 2,906 tris/대 (줄기 2,886 + 잎 20)
 * 잎은 지상 2.8~8 m 에 있어서 근경 경계(5.5 m)에서도 올려다보는 거리라 카드로 충분하다.
 * 줄기는 눈높이에서 스쳐 지나가므로 Tripo 원본을 그대로 쓴다.
 */
function makeTripoCulm(culmRoot: THREE.Object3D, tint: number, leafMat: THREE.Material): TripoBamboo {
  const culm = firstModelPart(culmRoot);

  culm.geometry.computeBoundingBox();
  const cb = culm.geometry.boundingBox!;
  const cs = cb.getSize(new THREE.Vector3());
  const cc = cb.getCenter(new THREE.Vector3());
  culm.geometry.translate(-cc.x, -cb.min.y, -cc.z);
  // 원본 장대 비율과 무관하게 기존 충돌 반경(약 5 cm)에 맞춘다.
  culm.geometry.scale(0.11 / Math.max(0.001, cs.x), BAMBOO_HEIGHT / Math.max(0.001, cs.y), 0.11 / Math.max(0.001, cs.z));
  // 카드와 속성 구성을 맞춘다 — Tripo 가 탄젠트 등을 얹어 오면 병합이 실패한다
  for (const name of Object.keys(culm.geometry.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') culm.geometry.deleteAttribute(name);
  }

  const geometry = mergeGeometries([culm.geometry, makeLeafCards(BAMBOO_HEIGHT)], true);
  if (!geometry) throw new Error('Tripo 줄기·잎 병합 실패');
  geometry.computeBoundingSphere();

  return { geometry, materials: [nightMaterial(culm.material, tint, false), leafMat] };
}

function nightMaterial(source: THREE.Material, tint: number, doubleSided: boolean) {
  const mat = source.clone();
  const std = mat as THREE.MeshStandardMaterial;
  if (std.isMeshStandardMaterial) {
    std.color.multiplyScalar(tint);
    std.roughness = Math.max(0.86, std.roughness);
    std.metalness = 0;
    std.envMapIntensity = 0.5;
  }
  if (doubleSided) mat.side = THREE.DoubleSide;
  return mat;
}

/**
 * 대나무 한 대 (원점 = 밑동). **재질 그룹 2개** — 0 = 줄기, 1 = 잎 카드.
 * 그래서 줄기(불투명 표피 타일)와 잎(알파 카드)이 서로 다른 텍스처를 쓰면서도
 * 인스턴스는 한 벌로 유지된다.
 */
function makeFarCulm(): THREE.BufferGeometry {
  const LOW = new THREE.Color(0.16, 0.22, 0.12);
  const HIGH = new THREE.Color(0.30, 0.40, 0.20);
  const LEAF = new THREE.Color(0.10, 0.17, 0.09);
  const tmp = new THREE.Color();

  const tint = (g: THREE.BufferGeometry, fn: (y: number) => THREE.Color) => {
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = fn(pos.getY(i));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };

  const H = BAMBOO_HEIGHT;
  // 8각 — 6각은 1.8 m 거리(대숲길 폭)에서 실루엣의 각이 보였다
  const culm = new THREE.CylinderGeometry(0.038, 0.058, H, 8, 1, true);
  culm.translate(0, H / 2, 0);
  // v 를 늘려 표피 타일이 세로로 반복되게 한다. 마디는 여기서 나온다(지오메트리 링 없음)
  const culmUv = culm.attributes['uv'] as THREE.BufferAttribute;
  for (let i = 0; i < culmUv.count; i++) culmUv.setY(i, culmUv.getY(i) * CULM_TILE_REPEAT);
  culmUv.needsUpdate = true;
  tint(culm, (y) => tmp.copy(LOW).lerp(HIGH, THREE.MathUtils.smoothstep(y, 0.4, H)));

  /**
   * 잎 — 뭉치 5개를 **위쪽 45 % 에 걸쳐** 흩는다. 옛 코드는 5장을 전부 꼭대기 1.1 m 안에
   * 몰아넣어서, 모든 대의 잎이 같은 높이에서 시작하는 **평평한 천장**이 생겼다.
   * 뭉치마다 90° 교차한 카드 2장 — 한 장은 옆에서 보면 사라진다.
   */
  const leaves = makeLeafCards(H, LEAF);

  // useGroups: 입력 지오메트리 하나당 그룹 하나 → [줄기, 잎] 두 그룹이 재질 0·1 에 대응한다
  const merged = mergeGeometries([culm, leaves], true);
  if (!merged) throw new Error('대나무 지오메트리 병합 실패');
  merged.computeVertexNormals();
  return merged;
}

/**
 * 笹 잎 카드 — 뭉치 `LEAF_CLUSTERS` 개를 줄기 **위쪽 45 %** 에 흩는다.
 * 뭉치마다 90° 교차한 카드 2장 — 한 장은 옆에서 보면 사라진다.
 *
 * ⚠️ **밑동(잎자루)은 줄기 축 위에 둔다.** 축에서 띄우면 잎이 공중에 뜬 것으로 보인다 —
 * 실제로 그랬다: 옛 근경은 잎을 x 0.12 m 에 놓았는데 줄기 반경이 0.055 라 6.5 cm 가 떴다.
 * 회전축을 카드 밑동에 두고 `rotateZ` 로 기울이면, 밑동은 줄기 안에 남고 잎만 바깥으로 뻗는다.
 * (잎 텍스처의 잎자루가 줄기에 가려지면서 "줄기에서 자란" 것으로 읽힌다)
 *
 * @param vertexColor 주면 정점색을 넣는다 — 텍스처가 실패했을 때만 쓰이는 폴백 색이다.
 *   Tripo 줄기와 합칠 때는 **주지 않는다**: 속성 구성이 다르면 `mergeGeometries` 가 실패한다.
 */
function makeLeafCards(height: number, vertexColor?: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < LEAF_CLUSTERS; k++) {
    const t = k / (LEAF_CLUSTERS - 1);               // 0 → 1
    const y = height * (0.56 + t * 0.42);
    const a = k * 2.399;                             // 황금각 — 뭉치가 한 방향으로 몰리지 않게
    const tilt = 0.34 + (k % 2) * 0.13;              // 층마다 처진 각을 달리한다
    const w = 1.25 - t * 0.35, h = 1.0 - t * 0.28;   // 위로 갈수록 작게
    for (const cross of [0, Math.PI / 2]) {
      const card = new THREE.PlaneGeometry(w, h);
      card.translate(0, h * 0.5, 0);                 // 회전축 = 카드 밑동. 이 점이 줄기 안에 남는다
      card.rotateZ(-tilt);                           // 밑동을 축에 둔 채 바깥으로 처진다
      card.rotateY(a + cross);
      card.translate(0, y, 0);                       // 반경 방향 오프셋 없음 (위 주석)
      if (vertexColor) {
        const pos = card.attributes['position'] as THREE.BufferAttribute;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          col[i * 3] = vertexColor.r; col[i * 3 + 1] = vertexColor.g; col[i * 3 + 2] = vertexColor.b;
        }
        card.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      parts.push(card);
    }
  }
  const leaves = mergeGeometries(parts, false);
  if (!leaves) throw new Error('대나무 잎 병합 실패');
  return leaves;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
