import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { Surface } from '@/audio/sfx';
import { Simplex2D } from '../noise';
import type { TerrainTextures } from '../terrain';
import { clamp, lerp, smoothstep } from '@/core/math';

/**
 * 히가사토(彼ヶ里) — **스토리 맵**. 기존 `world/village` 는 그대로 두고 새로 설계했다.
 *
 * 왜 새로 만들었나: 기존 맵은 "다섯 공물을 모아 신사로"라는 10~14분 루프에 맞춰 지형이 잡혀 있다.
 * 거기에 스토리 부지(폐교·여관·저택·사당·우물·종점)를 패드로 덧붙이면 산자락 한복판에 건물이 서고
 * (실측: 정류장 자리 경사 67°), 길과 부지의 높이가 어긋난다. **부지를 나중에 얹는 게 아니라
 * 처음부터 지형 설계에 넣어야 한다** — 그게 이 파일의 존재 이유다.
 *
 * 설계 원칙
 *  ① **사이트 우선**: `SITES` 가 한 곳의 진실이다. 지형 선반·논 제외·식재 제외·구조물 배치가 전부 여기서 나온다
 *  ② **선반 높이는 길에서 온다**: 각 부지의 y 는 "그 부지로 이어지는 길의 원지형 높이"로 정한다.
 *     길과 부지가 같은 높이라 진입로가 절벽이 되지 않는다 (기존 맵에 부지를 얹었을 때 깨진 지점)
 *  ③ **산은 부지를 피해 솟는다**: rim/hill 함수의 시작 거리를 부지 바깥으로 잡는다. 지형과 싸우지 않는다
 *  ④ 세 단(段) 구성 — 하단(논·들, z 40~) · 중단(마을, z −10~40) · 상단(신사 언덕, z −10~)
 *
 * 높이 함수는 해석적이다: 렌더 메시·Rapier 하이트필드·벼·토리이·식재가 모두 `heightAt` 하나를 본다.
 */

export const SIZE = 200;
export const RES = 200;

/** 논 수면 (지면 0 기준, 바닥 −0.78 → 수심 약 26 cm) */
export const PADDY_WATER = -0.52;

// --- 논: 서남쪽 한 덩어리. 참배로 서쪽에만 둬서 "길 옆이 통째로 은신처"가 되게 한다 ---
const PX0 = -46, PX1 = -8, PZ0 = 42, PZ1 = 88;
const CELL_X = 13.5, CELL_Z = 14.5, BUND = 2.2;
const PADDY_DEPTH = 0.78;   // 기존 맵에서 검증된 닫힌 논 수치 (단차 1.33 m ≈ 57°)
const BUND_H = 0.55;
const BANK_W = 0.35;
const BUND_BLEND = 0.5;
const GAP_R = 2.2;          // 끊긴 자리 반경 — 나브그리드 셀 1.5 m 가 들어가는 최소값

export interface PaddyRect { x0: number; z0: number; x1: number; z1: number }

/**
 * 스토리 부지 (PLAN-STORY §2). `flatten` 1 = 완전 평탄, 0 = 지형 그대로(논·식재만 제외).
 * `y` 는 생성 시 "길에서 온 높이"로 채워진다(원칙 ②) — 손으로 적지 않는다.
 */
export interface Site {
  id: string;
  x: number; z: number;
  w: number; d: number;
  flatten: number;
  /** 지형 블렌드 폭 — 넓을수록 부지가 지형에 부드럽게 잠긴다 */
  blend: number;
  y: number;
}
const site = (id: string, x: number, z: number, w: number, d: number, flatten = 1, blend = 3.5): Site =>
  ({ id, x, z, w, d, flatten, blend, y: 0 });

export const SITES: Record<string, Site> = {
  terminus: site('terminus', 0, 92, 22, 16),          // 버스 종점 — 남쪽 진입부
  house: site('house', -32, 31, 18, 14),              // 할머니의 집 — 논 남단 (논두렁길이 앞을 지난다)
  well: site('well', -10, 22, 9, 9),                  // 공동우물 — 마을 골목 서측
  square: site('square', 32, 30, 21, 18),             // 마츠리 광장 — 마을 동측 (야구라 반경 9.5 에 맞춘 최소 부지)
  inn: site('inn', 46, 47, 14, 12),                   // 폐여관 — 광장 남동 골목
  school: site('school', 62, 7, 22, 14),              // 폐교 — 동쪽 대숲 너머
  manor: site('manor', 35, -29, 16, 13),              // 촌장 저택 — 신사 동편 높은 곳
  hokora: site('hokora', -55, -13, 10, 10),           // 오래된 사당 — 서쪽 산중턱
  shrine: site('shrine', 0, -47, 32, 26),             // 신사 경내 — 북쪽 정점
  graveyard: site('graveyard', -40, 15, 28, 26, 0.55, 5), // 무연불 묘지 — 기울기를 남긴다
  flower: site('flower', -25, 29, 13, 12, 0, 3),      // 피안화 군락 — 지형은 그대로
  // 봉납 제단 — **마을 정 가운데**. 갈래길 5개의 목적지가 여기서 가장 가깝다(왕복 동선).
  // 참배로 동편으로 7 m 빼서 통행을 막지 않는다 — 길 위에 두면 받침대 콜라이더가 길을 끊는다
  altar: site('altar', 7, 24, 12, 11),
};
const SITE_LIST = Object.values(SITES);

// --- 길: 참배로(척추) 1 + 갈래길 4 ---
const ROAD: [number, number][] = [[0, 94], [0, 78], [-2, 60], [0, 42], [0, 24], [1.5, 6], [0, -12], [0, -28], [0, -40], [0, -50]];
const ROAD_W = 1.9;
const ROAD_BLEND = 2.4;

/** 길 한 줄기 — 갈래길과 골목이 공유하는 형태 */
export interface Path {
  id: string;
  name: string;
  pts: [number, number][];
  halfWidth: number;
  blend: number;
  surface: Surface;
  flatten: number;
}
/** 갈래길 다섯 — 요괴 순찰·길 선택의 단위라 id 를 좁게 고정한다 */
export interface Route extends Path { id: 'sando' | 'aze' | 'ridge' | 'stair' | 'bamboo' }

/**
 * 다섯 갈래길. 같은 두 지점을 잇되 성격이 반대여야 고르는 재미가 있다(기존 맵에서 검증된 원칙).
 * 스토리 맵에서는 여기에 **길마다 목적지 하나**가 더해진다 (PLAN-STORY §2.1).
 *   ① 참배로   자갈·넓다·밝다 → 빠르지만 노출          | 신사 · (중간에 우물 골목)
 *   ② 논두렁길 흙·폭 2 m·사람 키 벼 → 느리지만 안 보인다 | 할머니의 집
 *   ③ 뒷산길   낙엽·가장 길고 어둡다                    | 무연불 묘지 → 오래된 사당
 *   ④ 돌계단   광장 → 신사 뒤 지름길                    | 촌장 저택
 *   ⑤ 대숲길   시야 4 m                                | 폐여관 → 폐교
 * 논두렁길은 flatten 0 — 흙둑이 이미 길이라 평탄화하면 그걸 도로 깎는다.
 */
export const ROUTES: Route[] = [
  { id: 'sando', name: '참배로', pts: ROAD, halfWidth: ROAD_W, blend: ROAD_BLEND, surface: 'gravel', flatten: 1 },
  // 흙둑 위를 달린다 — 좌표가 배미 격자의 흙둑 중심선이다 (여기가 어긋나면 길이 논에 빠진다)
  { id: 'aze', name: '논두렁길', surface: 'dirt', halfWidth: 0.95, blend: 0.6, flatten: 0,
    pts: [[-1, 72], [-8, 72.1], [-17.9, 72.1], [-31.4, 72.1], [-31.4, 57.6], [-31.4, 44], [-32, 38], [-26, 32], [-16, 26], [-10, 22], [-3, 19]] },
  // 논 **바깥** 서쪽 산자락 — 묘지와 사당을 꿴다. 논 구역(x −46~−8)을 침범하면 배미가 잘려나간다
  { id: 'ridge', name: '뒷산 오솔길', surface: 'dirt', halfWidth: 1.1, blend: 1.6, flatten: 0.85,
    pts: [[-4, 90], [-30, 91], [-50, 82], [-58, 64], [-60, 44], [-54, 27], [-40, 15], [-47, 1], [-55, -13], [-42, -29], [-22, -41], [-6, -47]] },
  // 광장에서 저택을 지나 신사 뒤로
  { id: 'stair', name: '돌계단 뒷길', surface: 'gravel', halfWidth: 1.0, blend: 1.2, flatten: 0.9,
    pts: [[31, 24], [33, 8], [31, -10], [35, -29], [22, -40], [8, -47]] },
  // 동쪽 대숲 — 여관과 폐교로
  { id: 'bamboo', name: '대숲길', surface: 'dirt', halfWidth: 1.0, blend: 1.0, flatten: 0.75,
    pts: [[3, 64], [20, 58], [34, 52], [46, 47], [54, 34], [58, 20], [62, 7]] },
];

/**
 * 마을 골목(路地). 갈래길이 "구역과 구역을 잇는 길"이라면 골목은 **마을 안의 길**이다.
 * 폭 3 m(반폭 1.5) — 기획의 골목 규격. 민가가 이 폴리라인 양옆에 늘어선다(`minka.ts`).
 *
 * 갈래길과 따로 두는 이유: `ROUTES` 는 요괴 순찰·길 선택의 단위(다섯 갈래)라 게임 로직이 참조한다.
 * 골목을 거기 섞으면 "길이 아홉 개"가 되어 순찰 배분이 무너진다. 지형 평탄화·발밑 소리·식재
 * 제외에는 둘 다 필요하므로 `ALL_PATHS` 로 합쳐 쓴다.
 */
export const LANES: Path[] = [
  // 본거리 — 참배로에서 마츠리 광장으로. 마을에서 가장 넓고 집이 가장 빽빽하다
  { id: 'lane-main', name: '본거리', surface: 'dirt', halfWidth: 1.5, blend: 1.2, flatten: 0.95,
    pts: [[3, 38.6], [10, 37], [16, 35.4], [21, 34]] },
  // 우물 골목 — 참배로 서쪽으로 빠져 공동우물에서 끝난다 (막다른 골목)
  { id: 'lane-well', name: '우물 골목', surface: 'dirt', halfWidth: 1.3, blend: 1.0, flatten: 0.95,
    pts: [[-3.5, 27], [-5, 24.5], [-8, 22.6]] },
  // 뒷골목 — 본거리와 남쪽을 잇는 좁은 길. 폭이 좁아 요괴를 만나면 피할 곳이 없다
  { id: 'lane-back', name: '뒷골목', surface: 'dirt', halfWidth: 1.15, blend: 0.9, flatten: 0.95,
    pts: [[10.5, 36.4], [12, 30], [14, 24], [17, 19], [15, 14], [9, 11], [4.5, 10.5]] },
  // 막다른 골목 — 본거리에서 북으로 꺾여 아무 데도 가지 않는다. 도망치다 잘못 들면 끝이다
  { id: 'lane-dead', name: '막다른 골목', surface: 'dirt', halfWidth: 1.1, blend: 0.8, flatten: 0.95,
    pts: [[21, 33.8], [22, 39], [20.5, 44.5]] },
  // 서쪽 골목 — 참배로 서편, 우물 위쪽. 논으로 나가는 뒷길이라 마을과 논을 잇는다
  { id: 'lane-west', name: '서쪽 골목', surface: 'dirt', halfWidth: 1.2, blend: 1.0, flatten: 0.95,
    pts: [[-4, 36], [-9, 34], [-14, 31], [-17, 27]] },
  // 남쪽 골목 — 마을 남단을 가로지른다. 참배로에서 뒷골목 아래로 붙는다
  { id: 'lane-south', name: '남쪽 골목', surface: 'dirt', halfWidth: 1.2, blend: 1.0, flatten: 0.95,
    pts: [[-4.5, 15], [-1, 13.5], [4.5, 12.5], [9, 11.5]] },
];

/** 지형·발밑·식재가 보는 길 전체 (갈래길 + 골목) */
export const ALL_PATHS: Path[] = [...ROUTES, ...LANES];

const ROUTE_BOX = ALL_PATHS.map((r) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of r.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const m = r.halfWidth + r.blend + 1;
  return { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
});

/**
 * 지형 골격. **산은 부지를 피해 솟는다**(원칙 ③) — 아래 시작 거리는 전부 SITES 바깥이다.
 *   신사 언덕  z −20 → −56 에서 11 m (경내 z −47 은 언덕 위 평지)
 *   서쪽 산자락 x −62 밖 (사당 x −55 는 산이 솟기 직전 중턱)
 *   동쪽 산자락 x 76 밖 (폐교 x 62 는 분지 안)
 *   남쪽 산자락 z 102 밖 (종점 z 92 는 평지 — 기존 맵에 얹었을 때 67° 벼랑이던 바로 그 지점)
 */
function hillAt(z: number) { return smoothstep(-20, -56, z) * 11.0; }
function rimAt(x: number, z: number) {
  const west = smoothstep(62, 88, -x) * 17;
  const east = smoothstep(76, 96, x) * 17;
  // 남쪽만 **경계(z 100) 밖에서** 솟아 있었다 — 그래서 종점 뒤가 허공으로 끊겼다
  // (사용자 리포트 2026-08-22, 「맵 경계선」). 시작을 경계에 딱 붙여 앞치마(`buildApron`)가
  // 바로 오르막을 잇게 한다. z ≤ 100 에서는 여전히 0 이라 **플레이 지형은 한 점도 안 변한다**
  const south = smoothstep(100, 118, z) * 16;
  const north = smoothstep(-64, -92, z) * 18;
  return Math.max(west, east) + Math.max(south, north);
}
/** 참배로 양옆이 솟아 토리이 터널이 계곡을 거슬러 오르게 만든다 (신사 구간 한정) */
function valleyAt(x: number, z: number) {
  return smoothstep(7, 26, Math.abs(x)) * 9.0 * smoothstep(-4, -22, z);
}

function nearestOn(pts: [number, number][], x: number, z: number, out: { d: number; x: number; z: number; s: number }) {
  let best = Infinity, bx = 0, bz = 0, bs = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1]![0], az = pts[i - 1]![1], cx = pts[i]![0], cz = pts[i]![1];
    const dx = cx - ax, dz = cz - az;
    const len2 = dx * dx + dz * dz, len = Math.sqrt(len2);
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bx = px; bz = pz; bs = acc + len * t; }
    acc += len;
  }
  out.d = best; out.x = bx; out.z = bz; out.s = bs;
  return out;
}

/** 정수 좌표 → 0..1 결정적 해시 (끊긴 자리는 매판 같아야 한다) */
function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class HigasatoGround {
  readonly mesh: THREE.Mesh;
  /** 지도 밖 원경(산자락). 렌더 전용 — 물리·나브그리드에는 없다 */
  readonly apron: THREE.Mesh;
  readonly size = SIZE;
  readonly resolution = RES;
  readonly waterLevel = PADDY_WATER;
  private noise = new Simplex2D(20260820);
  private heights: Float32Array;
  private cells = new Map<string, PaddyRect>();
  /** 흙둑이 끊긴 자리 — 논에 드나드는 유일한 통로 */
  readonly gaps: { x: number; z: number }[] = [];
  readonly roadLength: number;
  private roadCum: number[] = [];

  constructor(scene: THREE.Scene, physics: Physics, textures: TerrainTextures) {
    let acc = 0;
    this.roadCum.push(0);
    for (let i = 1; i < ROAD.length; i++) {
      acc += Math.hypot(ROAD[i]![0] - ROAD[i - 1]![0], ROAD[i]![1] - ROAD[i - 1]![1]);
      this.roadCum.push(acc);
    }
    this.roadLength = acc;

    // 원칙 ②: 부지 높이 = 그 부지로 이어지는 **길의 원지형 높이**.
    // baseAt(길 위 최근접점)만 쓰므로 선반끼리 물고 물리는 순환이 없다.
    for (const s of SITE_LIST) {
      const n = this.nearestPathPoint(s.x, s.z);
      const roadY = this.baseAt(n.x, n.z);
      const selfY = this.baseAt(s.x, s.z);
      // 길이 멀면(> 26 m) 부지 자체 높이를 쓴다 — 억지로 길 높이에 맞추면 오히려 절벽이 된다
      s.y = n.d > 26 ? selfY : lerp(roadY, selfY, clamp((n.d - 6) / 20, 0, 1) * 0.5);
    }

    this.buildCells();
    this.buildBundWalls(physics);

    const N = RES, S = SIZE;
    this.heights = new Float32Array((N + 1) * (N + 1));
    for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) {
      const x = (ix / N - 0.5) * S, z = (iz / N - 0.5) * S;
      this.heights[iz * (N + 1) + ix] = this.heightAt(x, z);
    }

    // --- 렌더 메시 ---
    const geo = new THREE.PlaneGeometry(S, S, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heights[i]!);
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    // 월드 UV (4 m 타일) — 기존 지형과 같은 방식
    const uv = geo.attributes['uv'] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + S / 2) / 4, (pos.getZ(i) + S / 2) / 4);
    uv.needsUpdate = true;

    // 밤이라 정점색은 텍스처에 곱하는 어두운 틴트로만 쓴다
    const mud = new THREE.Color(0.34, 0.30, 0.26);
    const dirt = new THREE.Color(0.72, 0.62, 0.46);
    const gravel = new THREE.Color(0.86, 0.84, 0.80);
    const grass = new THREE.Color(0.48, 0.62, 0.40);
    const stone = new THREE.Color(0.62, 0.62, 0.60);
    const col = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const nr = this.nearestRoad(x, z);
      const roadW = 1 - smoothstep(ROAD_W, ROAD_W + ROAD_BLEND, nr.d);
      const np = this.nearestPathPoint(x, z);
      const pathW = 1 - smoothstep(np.route.halfWidth, np.route.halfWidth + np.route.blend, np.d);
      tmp.copy(grass);
      if (this.inPaddyRegion(x, z)) {
        const m = this.cellInset(x, z);
        tmp.lerp(m > 0 ? mud : dirt, m > 0 ? 0.85 : 0.6);
      }
      // 부지는 다져진 흙·돌
      for (const s of SITE_LIST) {
        if (s.flatten <= 0) continue;
        const inset = Math.min(s.w / 2 - Math.abs(x - s.x), s.d / 2 - Math.abs(z - s.z));
        if (inset > -1) tmp.lerp(s.id === 'shrine' || s.id === 'square' ? stone : dirt, clamp((inset + 1) / 2, 0, 1) * 0.75);
      }
      if (pathW > 0) tmp.lerp(np.route.surface === 'gravel' ? gravel : dirt, pathW * 0.8);
      if (roadW > 0) tmp.lerp(gravel, roadW * 0.9);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    geo.setAttribute('uv1', (geo.attributes['uv'] as THREE.BufferAttribute).clone());
    const mat = new THREE.MeshStandardMaterial({
      map: textures.map,
      normalMap: textures.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      aoMap: textures.armMap,
      aoMapIntensity: 0.5,
      roughnessMap: textures.armMap,
      metalness: 0,
      roughness: 1,
      vertexColors: true,
    });
    // 안티타일링 — 같은 타일이 반복되는 게 보이지 않게 두 스케일을 섞는다 (기존 지형과 같은 수법)
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 texA = texture2D( map, vMapUv );
          vec4 texB = texture2D( map, vMapUv * 0.29 + vec2( 0.41, 0.13 ) );
          diffuseColor *= mix( texA, texB, 0.45 );
        #endif`,
      );
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'higasato-ground';
    scene.add(this.mesh);

    // 지형 판이 끝나는 자리를 이어받는 원경 — 물리도 나브그리드도 없다 (눈에만 있는 땅)
    this.apron = this.buildApron(scene, mat, grass, stone);

    // --- Rapier 하이트필드 (column-major) ---
    const hf = new Float32Array((N + 1) * (N + 1));
    for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) hf[ix * (N + 1) + iz] = this.heights[iz * (N + 1) + ix]!;
    const R = physics.R;
    const body = physics.world.createRigidBody(R.RigidBodyDesc.fixed());
    physics.world.createCollider(R.ColliderDesc.heightfield(N, N, hf, { x: S, y: 1, z: S }).setFriction(1.0), body);
  }

  /**
   * **원경 앞치마** — 지형 판(200 m)이 끝나는 자리에서 바깥으로 이어 붙이는 산자락.
   *
   * 이 지도는 200 m 짜리 평면 한 장이다. 서·동·북은 산자락(`rimAt`)이 경계 **안에서** 솟아
   * 시야를 닫아 주는데 **남쪽만 열려 있었다** — 버스 종점 뒤로 땅이 칼로 자른 듯 끊기고 그 너머로
   * 하늘 돔의 바닥색이 그대로 보였다(사용자 리포트 2026-08-22 「맵 경계선」).
   * 저녁 안개는 밀도 0.0085 라 100 m 를 다 못 가린다 — 안개를 올리면 마을이 같이 잠긴다.
   *
   * 그래서 **지형을 키우지 않고 시야만 닫는다.** 물리 하이트필드·나브그리드·식재·논은 전부
   * 200 m 그대로 두고, 눈에만 보이는 껍데기를 두른다:
   *   · 가장 안쪽 고리는 지형 판의 **가장자리 정점과 같은 좌표**로 같은 `heightAt` 을 읽는다 → 이음매가 없다
   *   · 바깥으로 갈수록 고리 간격이 벌어지고(1.5 → 53 m) 높이에 원산(遠山) 능선이 더해진다
   *   · 재질은 지형과 **같은 인스턴스**다 — 다른 걸 쓰면 이음매에서 타일이 어긋나고 셰이더도 하나 더 컴파일된다
   */
  private buildApron(scene: THREE.Scene, mat: THREE.Material, grass: THREE.Color, stone: THREE.Color): THREE.Mesh {
    const N = RES, S = SIZE, H = S / 2;
    // 고리의 체비쇼프 반경(m). **첫 값은 지형 판의 경계와 정확히 같아야 한다**
    const RINGS = [H, H + 1.5, H + 5, H + 12, H + 26, H + 52, H + 92, H + 145];
    const PER = N;        // 변마다 세그먼트 수 = 지형 판과 같다 → 이음매 정점이 1:1 로 맞는다
    const M = PER * 4;    // 닫힌 고리 하나의 정점 수
    const R = RINGS.length;

    const pos = new Float32Array(R * M * 3);
    const col = new Float32Array(R * M * 3);
    const uv = new Float32Array(R * M * 2);
    const tmp = new THREE.Color();
    for (let r = 0; r < R; r++) {
      const h = RINGS[r]!, step = (2 * h) / PER;
      for (let j = 0; j < M; j++) {
        const side = (j / PER) | 0, i = j % PER, t = -h + i * step;
        // 위에서 봤을 때 시계방향(북 +x → 동 +z → 남 −x → 서 −z) — 바깥이 항상 진행 방향 왼쪽이다
        const x = side === 0 ? t : side === 1 ? h : side === 2 ? -t : -h;
        const z = side === 0 ? -h : side === 1 ? t : side === 2 ? h : -t;
        const y = this.heightAt(x, z) + this.farLift(x, z);
        const k = (r * M + j) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        // 높이가 올라갈수록 풀에서 바위로 — 원경은 실루엣과 명도만 있으면 된다
        tmp.copy(grass).lerp(stone, clamp((y - 10) / 26, 0, 0.8));
        col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
        const u = (r * M + j) * 2;
        uv[u] = (x + H) / 4; uv[u + 1] = (z + H) / 4;   // 월드 UV — 지형 판과 같은 4 m 타일
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < R - 1; r++) {
      for (let j = 0; j < M; j++) {
        const a = r * M + j, b = r * M + ((j + 1) % M);
        const c = (r + 1) * M + ((j + 1) % M), d = (r + 1) * M + j;
        idx.push(a, b, c, a, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv.slice(), 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    // 그림자 프러스텀은 캐릭터 둘레 20 m 남짓이라 여기까지 오지 않는다 — 둘 다 끄면 draw 가 싸다.
    // (`receiveShadow` 는 재질을 공유해도 오브젝트 단위라 셰이더가 갈리지 않는다)
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'higasato-apron';
    scene.add(mesh);
    return mesh;
  }

  /** 지도 밖에서만 더해지는 원산 높이. 경계(체비쇼프 100 m)에서는 정확히 0 이라 이음매가 안 생긴다 */
  private farLift(x: number, z: number) {
    const cheb = Math.max(Math.abs(x), Math.abs(z));
    const t = smoothstep(SIZE / 2 + 3, SIZE / 2 + 130, cheb);
    if (t <= 0) return 0;
    // 능선 하나면 충분하다 — 안개가 나머지를 지운다
    const ridge = 0.6 + 0.4 * this.noise.fbm(x / 150, z / 150, 2);
    return t * (8 + 30 * ridge);
  }

  // ---------- 높이 ----------
  private baseAt(x: number, z: number) {
    const n = this.noise.fbm(x / 26, z / 26, 2) * 0.35 + this.noise.fbm(x / 7 + 5, z / 7 - 3, 2) * 0.07;
    const relief = hillAt(z) + rimAt(x, z) + valleyAt(x, z);
    return n * (0.45 + relief * 0.14) + relief;
  }

  heightAt(x: number, z: number): number {
    let h = this.baseAt(x, z);
    // 참배로 평탄화
    const near = this.nearestRoad(x, z);
    const nd = near.d, nx = near.x, nz = near.z;
    const w = 1 - smoothstep(ROAD_W, ROAD_W + ROAD_BLEND, nd);
    if (w > 0) h = lerp(h, this.baseAt(nx, nz) + 0.05, w);
    // 갈래길·골목 평탄화 (논두렁길은 flatten 0 이라 건너뛴다)
    for (let i = 1; i < ALL_PATHS.length; i++) {
      const r = ALL_PATHS[i]!;
      if (r.flatten <= 0) continue;
      const b = ROUTE_BOX[i]!;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      const n2 = nearestOn(r.pts, x, z, this.tmpNear);
      const w2 = (1 - smoothstep(r.halfWidth, r.halfWidth + r.blend, n2.d)) * r.flatten;
      if (w2 > 0) h = lerp(h, this.baseAt(n2.x, n2.z) + 0.05, w2);
    }
    // 논
    if (this.inPaddyRegion(x, z) && !this.inSiteZone(x, z)) {
      const cut = this.gapMask(x, z);
      const m = this.cellInset(x, z);
      if (m > 0) h -= PADDY_DEPTH * clamp(m / BANK_W, 0, 1) * (1 - cut);
      else if (m > -BUND) h += BUND_H * clamp(-m / BUND_BLEND, 0, 1) * (1 - w) * (1 - cut * 0.9);
    }
    // 부지 선반 — 마지막에 적용한다 (길·논보다 우선)
    for (const s of SITE_LIST) {
      if (s.flatten <= 0) continue;
      const mx = s.w / 2 - Math.abs(x - s.x), mz = s.d / 2 - Math.abs(z - s.z);
      const inset = Math.min(mx, mz);
      if (inset < -s.blend) continue;
      const k = clamp((inset + s.blend) / s.blend, 0, 1) * s.flatten;
      if (k > 0) h = lerp(h, s.y, smoothstep(0, 1, k));
    }
    return h;
  }

  private inPaddyRegion(x: number, z: number) { return x > PX0 && x < PX1 && z > PZ0 && z < PZ1; }
  /** 부지 안(+여유)인가 — 논·식재를 비우는 판정 */
  inSiteZone(x: number, z: number, margin = 2): boolean {
    for (const s of SITE_LIST) {
      if (Math.abs(x - s.x) < s.w / 2 + margin && Math.abs(z - s.z) < s.d / 2 + margin) return true;
    }
    return false;
  }

  /**
   * 배미를 만든다. 기존 맵은 참배로만 피했지만, 여기서는 **평탄화되는 길 전부**와 **부지 전부**를 피한다
   * (스토리 맵은 길과 부지가 훨씬 많다 — 안 피하면 지형만 파이고 물·벼가 남는 웅덩이가 생긴다).
   */
  private buildCells() {
    for (let cz = 0; ; cz++) {
      const z0 = PZ0 + cz * CELL_Z + BUND, z1r = PZ0 + (cz + 1) * CELL_Z;
      if (z0 >= PZ1) break;
      const z1 = Math.min(z1r, PZ1 - 0.4);
      if (z1 - z0 < 3) continue;
      for (let cx = 0; ; cx++) {
        const x0r = PX0 + cx * CELL_X + BUND, x1r = PX0 + (cx + 1) * CELL_X;
        if (x0r >= PX1) break;
        const x0 = x0r, x1 = Math.min(x1r, PX1 - 0.4);
        if (x1 - x0 < 3) continue;
        // 부지와 겹치면 버린다
        if (this.rectHitsSite(x0, z0, x1, z1)) continue;
        // 평탄화 길이 관통하면 버린다 (논두렁길은 흙둑 위를 달리므로 예외)
        if (this.rectHitsRoute(x0, z0, x1, z1)) continue;
        this.cells.set(`${cx},${cz}`, { x0, z0, x1, z1 });
        this.gaps.push({ x: lerp(x0 + 2.8, x1 - 2.8, hash(cx, cz)), z: z0 });
        if (hash(cx + 977, cz) < 0.55) this.gaps.push({ x: x0, z: lerp(z0 + 2.8, z1 - 2.8, hash(cx, cz + 977)) });
      }
    }
  }
  private rectHitsSite(x0: number, z0: number, x1: number, z1: number) {
    for (const s of SITE_LIST) {
      if (x0 < s.x + s.w / 2 + 2 && x1 > s.x - s.w / 2 - 2 && z0 < s.z + s.d / 2 + 2 && z1 > s.z - s.d / 2 - 2) return true;
    }
    return false;
  }
  private rectHitsRoute(x0: number, z0: number, x1: number, z1: number) {
    const probe = { d: 0, x: 0, z: 0, s: 0 };
    for (const r of ALL_PATHS) {
      if (r.flatten <= 0) continue;
      const keep = r.halfWidth + r.blend + 2.0;
      // 배미 둘레를 훑어 길이 스치는지 본다 (중심만 보면 관통을 놓친다)
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        for (const [px, pz] of [[lerp(x0, x1, t), z0], [lerp(x0, x1, t), z1], [x0, lerp(z0, z1, t)], [x1, lerp(z0, z1, t)]] as [number, number][]) {
          if (nearestOn(r.pts, px, pz, probe).d < keep) return true;
        }
      }
    }
    return false;
  }

  /** 배미 안쪽 깊이(+) / 흙둑까지 거리(−) */
  private cellInset(x: number, z: number): number {
    let best = -Infinity;
    for (const [, c] of this.cells) {
      const m = Math.min(x - c.x0, c.x1 - x, z - c.z0, c.z1 - z);
      if (m > best) best = m;
    }
    return best === -Infinity ? -BUND * 2 : best;
  }
  private gapMask(x: number, z: number): number {
    let m = 0;
    for (const g of this.gaps) {
      const d = Math.hypot(x - g.x, z - g.z);
      if (d < GAP_R) m = Math.max(m, 1 - smoothstep(GAP_R * 0.45, GAP_R, d));
    }
    return m;
  }

  /**
   * 논두렁 안쪽면에 **수직 벽**. 하이트필드는 1 m 격자라 57° 비탈이 두 계단으로 뭉개져
   * 걸어 올라와지는 지점이 생긴다(기존 맵에서 실측·확인된 문제). 윗면을 흙둑 마루와 같게 맞춰
   * 내려가는 건 되고(허용) 올라오는 건 막는다(차단).
   */
  private buildBundWalls(physics: Physics) {
    const T = 0.12, STEP = 0.5;
    for (const [, c] of this.cells) {
      const top = BUND_H, hy = (top + PADDY_DEPTH) / 2;
      const edges: [number, number, number, number][] = [
        [c.x0, c.z0, c.x1, c.z0], [c.x0, c.z1, c.x1, c.z1],
        [c.x0, c.z0, c.x0, c.z1], [c.x1, c.z0, c.x1, c.z1],
      ];
      for (const [ax, az, bx, bz] of edges) {
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(len / STEP));
        let runStart = -1;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const px = lerp(ax, bx, t), pz = lerp(az, bz, t);
          const open = this.gapMask(px, pz) > 0.25 || i === n;
          if (!open && runStart < 0) runStart = i;
          if ((open || i === n) && runStart >= 0) {
            const t0 = runStart / n, t1 = (open ? i : i + 1) / n;
            const sx = lerp(ax, bx, t0), sz = lerp(az, bz, t0);
            const ex = lerp(ax, bx, t1), ez = lerp(az, bz, t1);
            const cxm = (sx + ex) / 2, czm = (sz + ez) / 2;
            const wlen = Math.hypot(ex - sx, ez - sz);
            if (wlen > 0.3) {
              const gy = this.baseAt(cxm, czm);
              const horizontal = Math.abs(ex - sx) > Math.abs(ez - sz);
              physics.addStaticBox(
                new THREE.Vector3(cxm, gy + top - hy, czm),
                new THREE.Vector3(horizontal ? wlen / 2 : T, hy, horizontal ? T : wlen / 2),
              );
            }
            runStart = -1;
          }
        }
      }
    }
  }

  // ---------- 조회 ----------
  private nr = { d: 0, x: 0, z: 0, s: 0 };
  private tmpNear = { d: 0, x: 0, z: 0, s: 0 };
  nearestRoad(x: number, z: number) { return nearestOn(ROAD, x, z, this.nr); }

  private npRes: { route: Path; d: number; x: number; z: number } = { route: ROUTES[0]!, d: Infinity, x: 0, z: 0 };
  /** 모든 갈래길 중 가장 가까운 점 */
  nearestPathPoint(x: number, z: number) {
    let best = Infinity, bi = 0, bx = 0, bz = 0;
    for (let i = 0; i < ALL_PATHS.length; i++) {
      const b = ROUTE_BOX[i]!;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      const n = nearestOn(ALL_PATHS[i]!.pts, x, z, this.tmpNear);
      if (n.d < best) { best = n.d; bi = i; bx = n.x; bz = n.z; }
    }
    if (best === Infinity) { const n = nearestOn(ROAD, x, z, this.tmpNear); best = n.d; bi = 0; bx = n.x; bz = n.z; }
    this.npRes.route = ALL_PATHS[bi]!; this.npRes.d = best; this.npRes.x = bx; this.npRes.z = bz;
    return this.npRes;
  }
  /** 가장 가까운 길까지 거리 (식재 제외 판정) */
  pathDist(x: number, z: number) { return this.nearestPathPoint(x, z).d; }

  /**
   * 참배로 위 호길이 s 지점.
   * ⚠️ `out` 파라미터를 **반드시 받아야 한다** — 구 `VillageGround.roadAt(s, out)` 과 시그니처를
   * 맞추기 위해서다. 이걸 빼먹어서 `ToriiPath` 가 넘긴 out 이 조용히 무시됐고,
   * **센본토리이 30개가 전부 원점(0,0)에 겹쳐 서 있었다**(rp 가 0 인 채로 배치됨).
   * 사진 로케 촬영에서 도리이가 안 찍혀서야 발견했다.
   */
  roadAt(s: number, out = { x: 0, z: 0, dirX: 0, dirZ: 0 }) {
    const t = clamp(s, 0, this.roadLength);
    let i = 1;
    while (i < this.roadCum.length - 1 && this.roadCum[i]! < t) i++;
    const a = this.roadCum[i - 1]!, b = this.roadCum[i]!;
    const k = b > a ? (t - a) / (b - a) : 0;
    const ax = ROAD[i - 1]![0], az = ROAD[i - 1]![1], bx = ROAD[i]![0], bz = ROAD[i]![1];
    const len = Math.max(1e-4, Math.hypot(bx - ax, bz - az));
    out.x = lerp(ax, bx, k);
    out.z = lerp(az, bz, k);
    out.dirX = (bx - ax) / len;
    out.dirZ = (bz - az) / len;
    return out;
  }
  /** z 좌표 → 참배로 호길이 (구조물 배치용) */
  sAtZ(z: number) {
    let acc = 0;
    for (let i = 1; i < ROAD.length; i++) {
      const az = ROAD[i - 1]![1], bz = ROAD[i]![1];
      const len = Math.hypot(ROAD[i]![0] - ROAD[i - 1]![0], bz - az);
      if ((z - az) * (z - bz) <= 0 && Math.abs(bz - az) > 1e-6) return acc + len * ((z - az) / (bz - az));
      acc += len;
    }
    return z > ROAD[0]![1] ? 0 : this.roadLength;
  }

  slopeAt(x: number, z: number) {
    const e = 1.0;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  paddyCells(): PaddyRect[] { return [...this.cells.values()]; }
  /** 배미 안이면 1 (물·벼 판정) */
  paddyMask(x: number, z: number): number {
    if (!this.inPaddyRegion(x, z)) return 0;
    for (const [, c] of this.cells) {
      if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return 1;
    }
    return 0;
  }

  surfaceAt(p: THREE.Vector3): Surface {
    if (this.paddyMask(p.x, p.z) > 0 && p.y < PADDY_WATER + 0.35) return 'water';
    const np = this.nearestPathPoint(p.x, p.z);
    if (np.d < np.route.halfWidth + 0.5) return np.route.surface;
    // 부지 안은 다져진 흙 (신사·광장은 돌)
    for (const s of SITE_LIST) {
      if (s.flatten <= 0) continue;
      if (Math.abs(p.x - s.x) < s.w / 2 && Math.abs(p.z - s.z) < s.d / 2) {
        return s.id === 'shrine' || s.id === 'square' ? 'gravel' : 'dirt';
      }
    }
    return 'grass';
  }
}
