import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { Surface } from '@/audio/sfx';
import { Simplex2D } from '../noise';
import type { TerrainTextures } from '../terrain';
import { clamp, lerp, smoothstep } from '@/core/math';

/**
 * 마을 지형: 거의 평탄한 논 지대 + 북쪽 신사 언덕 + 그 사이를 잇는 참배로.
 *
 * 높이 함수는 해석적이다 — 렌더 메시·Rapier 하이트필드·벼 심기·토리이 배치가 모두 같은 함수를 쓴다.
 *   base(잔노이즈) + hill(북쪽 언덕) → 참배로 근처는 중심선 높이로 평탄화 → 논 격자는 파냄
 */

export const SIZE = 190;   // 140 → 190 (2026-08-19 확장). 1 m 격자 유지 → 지형 정점 19,881 → 36,481
export const RES = 190;

// --- 논 격자 (남쪽) — 구역을 넓혀 배미 수를 늘린다 ---
const PX0 = -38, PX1 = 38, PZ0 = 6, PZ1 = 74;
const CELL_X = 17.6, CELL_Z = 14.2, BUND = 2.2; // 한 배미 15.4×12 m, 논두렁 2.2 m

/**
 * 논을 **닫힌 공간**으로 만드는 세 값 (2026-08-20 개편).
 *
 * 예전엔 논 바닥이 −0.45, 논두렁이 지면 높이(0)였다. 단차 45 cm 는 오토스텝(35 cm)에 가깝고
 * 비탈이 완만해 어디서든 넘어 다닐 수 있었다 — 76×68 m 논이 통째로 개활지였다는 뜻이다.
 *
 * 지금은 논두렁을 **흙둑(畦)** 으로 55 cm 올리고 바닥을 78 cm 파, 단차 1.33 m 를 만든다.
 * 비탈은 0.85 m 안에서 떨어지므로 약 57° — `maxSlopeClimb` 48° 를 넘어 **못 올라간다**.
 * 대신 배미마다 **끊긴 자리(切れ目)** 를 1~2 곳 두어 거기서만 드나든다.
 *   · 플레이어에게: 논은 "들어가면 나가는 곳이 정해진" 위험한 지름길
 *   · 요괴에게: 나브그리드도 같은 경사 판정(0.85 ≈ 40°)을 쓰므로 같은 자리로만 따라 들어온다
 */
const PADDY_DEPTH = 0.78;
const BUND_H = 0.55;        // 흙둑 마루가 지면보다 이만큼 높다
const BANK_W = 0.35;        // 논 안쪽 비탈 폭 — 좁을수록 못 올라온다
const BUND_BLEND = 0.5;     // 흙둑 바깥쪽 어깨
const GAP_R = 2.2;          // 끊긴 자리 반경. 나브그리드 셀 1.5 m 가 들어가야 하므로 이보다 좁히면 안 된다
/** 논 수면 높이 (지면 0 기준) — 바닥 −0.78 이므로 물 깊이 약 26 cm */
export const PADDY_WATER = -0.52;

export interface PaddyRect { x0: number; z0: number; x1: number; z1: number }

// --- 참배로: 남(스폰) → 북(신사 언덕) ---
const ROAD: [number, number][] = [[0, 88], [-1.5, 72], [0, 58], [0, 40], [-2, 26], [0, 10], [1.5, -6], [0, -20], [0, -34], [0, -46]];
const ROAD_W = 1.9; // 반폭
const ROAD_BLEND = 2.4; // 가장자리 블렌드 폭

/** 폐가 터: 이 사각형 안은 평탄하게 고른다 (집이 지형에 파묻히지 않도록) */
export const HOUSE_PAD = { x0: -26.0, z0: 16.4, x1: -11.0, z1: 33.8, y: 0.06 }; // 집 15×11 확장에 맞춤 (2026-08-19)
/** 마츠리 광장 터 (참배로 동쪽, 논두렁 너머) — 평탄화 + 논 제외 */
export const SQUARE_PAD = { x0: 44.0, z0: 12.0, x1: 68.0, z1: 36.0, y: 0.10 };
/** 피안화 군락 터 — 배미 하나를 꽃밭이 삼켰다. 평탄화 없이 배미만 제외 */
export const FLOWER_FIELD = { x0: -24.0, z0: 37.0, x1: -13.0, z1: 47.5 }; // 논(x≤26) 동쪽 바깥. 처음 x 9~35 로 잡았다가 배미 7→1 로 잡아먹혀 이동 (2026-08-19)

/** 신사 언덕: z 가 −16 → −42 로 갈수록 8 m 상승 (평균 경사 17°) */
function hillAt(z: number) { return smoothstep(-16, -42, z) * 8.0; }

/**
 * 마을을 감싸는 지형. **개활지는 공포가 안 된다** — 지평선을 가깝게 끌어당기는 게 목적이다.
 *  · rim   : 좌우·남쪽 산자락이 분지를 만든다
 *  · valley: 참배로 양옆이 솟아올라 토리이 터널이 계곡을 거슬러 오르게 된다
 */
function rimAt(x: number, z: number) {
  // 동쪽(x>0)은 마츠리 광장 자리를 비우기 위해 산자락을 뒤로 민다
  const west = smoothstep(40, 64, -x) * 16;
  const east = smoothstep(70, 88, x) * 16;   // 동쪽은 마츠리 광장 자리를 비운다
  return Math.max(west, east) + smoothstep(80, 94, z) * 14;
}
/** 정수 좌표 → 0..1 결정적 해시 (끊긴 자리 배치용 — 시드 없이 매판 같아야 한다) */
function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valleyAt(x: number, z: number) {
  return smoothstep(5, 21, Math.abs(x)) * 9.5 * smoothstep(-2, -18, z);
}

export class VillageGround {
  readonly mesh: THREE.Mesh;
  readonly size = SIZE;
  readonly resolution = RES;
  readonly waterLevel = PADDY_WATER;
  private noise = new Simplex2D(20260819);
  private heights: Float32Array;
  /** 배미 사각형 — 지형 파내기·수면·벼가 모두 이 하나를 본다 (키: "cx,cz") */
  private cells = new Map<string, PaddyRect>();
  /** 흙둑이 끊긴 자리 — 논에 드나드는 **유일한** 통로. 배미마다 1~2 곳 */
  readonly gaps: { x: number; z: number }[] = [];
  /** 참배로 폴리라인 누적 길이 (토리이 배치용) */
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
    const uv = geo.attributes['uv'] as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // 밤이라 정점색은 텍스처에 곱하는 어두운 틴트로만 쓴다
    const mud = new THREE.Color(0.34, 0.30, 0.26);      // 논바닥 진흙
    const dirt = new THREE.Color(0.72, 0.62, 0.46);     // 논두렁 마른 흙
    const gravel = new THREE.Color(0.86, 0.84, 0.80);   // 참배로 자갈
    const grass = new THREE.Color(0.48, 0.62, 0.40);    // 들풀
    const grassHill = new THREE.Color(0.40, 0.52, 0.34);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const rd = this.roadDist(x, z);
      const pm = this.paddyMask(x, z);
      c.copy(grass).lerp(grassHill, smoothstep(0.5, 6, hillAt(z)));
      // 논두렁(논 격자 안이지만 파이지 않은 곳) → 마른 흙
      if (this.inPaddyRegion(x, z)) c.lerp(dirt, 1 - smoothstep(0.0, 0.6, pm));
      c.lerp(mud, pm);
      c.lerp(gravel, 1 - smoothstep(ROAD_W * 0.7, ROAD_W + 1.2, rd));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      uv.setXY(i, (x + S / 2) / 4, (z + S / 2) / 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.setAttribute('uv1', uv.clone());

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
    // 안티타일링 (초원 지형과 같은 수법)
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
    this.mesh.name = 'village-ground';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    scene.add(this.mesh);

    // --- Rapier heightfield (column-major) ---
    const hf = new Float32Array((N + 1) * (N + 1));
    for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) hf[ix * (N + 1) + iz] = this.heights[iz * (N + 1) + ix]!;
    const R = physics.R;
    const body = physics.world.createRigidBody(R.RigidBodyDesc.fixed());
    physics.world.createCollider(R.ColliderDesc.heightfield(N, N, hf, { x: S, y: 1, z: S }).setFriction(1.0), body);
  }

  // --- 높이 ---
  private baseAt(x: number, z: number) {
    const n = this.noise.fbm(x / 26, z / 26, 2) * 0.35 + this.noise.fbm(x / 7 + 5, z / 7 - 3, 2) * 0.07;
    const relief = hillAt(z) + rimAt(x, z) + valleyAt(x, z);
    // 굴곡은 지대가 높을수록 크게 (산자락은 울퉁불퉁, 논은 평평)
    return n * (0.45 + relief * 0.14) + relief;
  }

  /** 평탄화 패드 안이면 1, 밖으로 2 m 에 걸쳐 0 (폐가 터·광장 터 중 큰 값) */
  private padMask(x: number, z: number) {
    let best = 0;
    for (const p of [HOUSE_PAD, SQUARE_PAD]) {
      const m = Math.min(x - p.x0, p.x1 - x, z - p.z0, p.z1 - z);
      best = Math.max(best, clamp((m + 2) / 2, 0, 1));
    }
    return best;
  }
  private padY(x: number, z: number) {
    // 가장 가까운(안쪽 깊이가 큰) 패드의 y
    let bestM = -Infinity, y = HOUSE_PAD.y;
    for (const p of [HOUSE_PAD, SQUARE_PAD]) {
      const m = Math.min(x - p.x0, p.x1 - x, z - p.z0, p.z1 - z);
      if (m > bestM) { bestM = m; y = p.y; }
    }
    return y;
  }

  heightAt(x: number, z: number): number {
    let h = this.baseAt(x, z);
    // nearestRoad 는 공유 객체를 돌려주므로 값을 즉시 복사한다 (paddyMask 가 같은 객체를 덮어쓴다)
    const near = this.nearestRoad(x, z);
    const nd = near.d, nx = near.x, nz = near.z;
    // 참배로 평탄화: 중심선 높이로 끌어당긴다
    const w = 1 - smoothstep(ROAD_W, ROAD_W + ROAD_BLEND, nd);
    if (w > 0) h = lerp(h, this.baseAt(nx, nz) + 0.05, w);
    // 논: 안쪽은 파내고 논두렁은 흙둑으로 올린다. 끊긴 자리에서는 둘 다 풀어 경사로가 된다
    if (this.inPaddyRegion(x, z) && !this.inFlatZone(x, z)) {
      const cut = this.gapMask(x, z);
      const m = this.cellInset(x, z);
      if (m > 0) {
        // 배미 안쪽 — 좁은 비탈로 뚝 떨어진다
        h -= PADDY_DEPTH * clamp(m / BANK_W, 0, 1) * (1 - cut);
      } else if (m > -BUND) {
        // 흙둑 — 참배로가 지나는 자리는 올리지 않는다(길이 둔덕을 타고 넘으면 안 된다)
        h += BUND_H * clamp(-m / BUND_BLEND, 0, 1) * (1 - w) * (1 - cut * 0.9);
      }
    }
    // 폐가 터 평탄화
    const pad = this.padMask(x, z);
    if (pad > 0) h = lerp(h, this.padY(x, z), pad);
    return h;
  }

  private inPaddyRegion(x: number, z: number) { return x > PX0 && x < PX1 && z > PZ0 && z < PZ1; }

  /**
   * 배미 목록을 한 번만 만든다. 참배로가 지나는 배미는 **버리지 않고 x 방향으로 잘라낸다** —
   * 버리면 지형만 파이고 물·벼가 없는 빈 웅덩이가 생긴다(2026-08-19 버그).
   */
  private buildCells() {
    const KEEP = ROAD_W + 2.6; // 참배로에서 이만큼 떨어져야 논
    for (let cz = 0; ; cz++) {
      const z0 = PZ0 + cz * CELL_Z + BUND, z1r = PZ0 + (cz + 1) * CELL_Z;
      if (z0 >= PZ1) break;
      const z1 = Math.min(z1r, PZ1 - 0.4);
      if (z1 - z0 < 3) continue;
      for (let cx = 0; ; cx++) {
        const x0r = PX0 + cx * CELL_X + BUND, x1r = PX0 + (cx + 1) * CELL_X;
        if (x0r >= PX1) break;
        let x0 = x0r, x1 = Math.min(x1r, PX1 - 0.4);
        // 이 배미의 z 범위에서 참배로가 지나는 x 대역을 구해 잘라낸다
        let roadLo = Infinity, roadHi = -Infinity;
        for (let i = 0; i <= 6; i++) {
          const z = z0 + ((z1 - z0) * i) / 6;
          const rx = this.roadXAt(z);
          if (rx !== null) { roadLo = Math.min(roadLo, rx); roadHi = Math.max(roadHi, rx); }
        }
        if (roadLo < Infinity) {
          const lo = roadLo - KEEP, hi = roadHi + KEEP;
          if (x0 < hi && x1 > lo) {
            // 도로가 배미를 관통하면 넓은 쪽만 남긴다
            const leftW = lo - x0, rightW = x1 - hi;
            if (leftW <= 0 && rightW <= 0) continue;
            if (leftW >= rightW) x1 = lo; else x0 = hi;
          }
        }
        if (x1 - x0 < 3) continue;
        // 폐가 터와 겹치는 배미는 만들지 않는다 (지형은 평탄한데 물·벼만 남으면 깨진다)
        let overlap = false;
        for (const P of [HOUSE_PAD, SQUARE_PAD, FLOWER_FIELD]) {
          if (x0 < P.x1 + 2 && x1 > P.x0 - 2 && z0 < P.z1 + 2 && z1 > P.z0 - 2) overlap = true;
        }
        if (overlap) continue;
        this.cells.set(`${cx},${cz}`, { x0, z0, x1, z1 });
        // 끊긴 자리: 남쪽 변에 하나, 절반 정도는 서쪽 변에도. 배미 인덱스로 결정 → 매판 같다
        this.gaps.push({ x: lerp(x0 + 2.8, x1 - 2.8, hash(cx, cz)), z: z0 });
        if (hash(cx + 977, cz) < 0.55) this.gaps.push({ x: x0, z: lerp(z0 + 2.8, z1 - 2.8, hash(cx, cz + 977)) });
      }
    }
  }

  /** 주어진 z 에서 참배로 중심선의 x (해당 z 를 지나지 않으면 null) */
  private roadXAt(z: number): number | null {
    for (let i = 1; i < ROAD.length; i++) {
      const az = ROAD[i - 1]![1], bz = ROAD[i]![1];
      if ((z - az) * (z - bz) > 0) continue;
      const t = Math.abs(bz - az) < 1e-6 ? 0 : (z - az) / (bz - az);
      return lerp(ROAD[i - 1]![0], ROAD[i]![0], t);
    }
    return null;
  }

  /**
   * 논두렁 안쪽면에 **수직 벽**을 세운다.
   *
   * 지형만으로는 못 막는다 — 하이트필드 격자가 1 m 인데 비탈이 0.85 m 라, 정점이 비탈
   * 한복판에 걸리면 1.32 m 낙차가 두 계단(각 33°)으로 뭉개져 그냥 걸어 올라와진다.
   * 해석적 경사는 49° 로 나오지만 실제 충돌면은 격자가 정한다(실측).
   *
   * 벽 윗면을 **흙둑 마루와 같은 높이**로 맞춘 게 핵심이다 —
   *   · 흙둑에서 논으로: 걸어서 떨어진다(허용). 내려가는 건 막지 않는다
   *   · 논에서 흙둑으로: 수직면이라 못 올라온다 → 끊긴 자리로 돌아가야 한다
   */
  private buildBundWalls(physics: Physics) {
    const T = 0.12;          // 벽 반두께
    const STEP = 0.5;        // 끊긴 자리 판정 간격
    let n = 0;
    const emit = (ax: 'x' | 'z', fixed: number, a: number, b: number, inward: number) => {
      if (b - a < 0.8) return;
      const mx = ax === 'x' ? fixed : (a + b) / 2;
      const mz = ax === 'x' ? (a + b) / 2 : fixed;
      const top = this.baseAt(mx, mz) + BUND_H;
      const bottom = this.baseAt(mx + (ax === 'x' ? inward * 2 : 0), mz + (ax === 'z' ? inward * 2 : 0)) - PADDY_DEPTH - 0.5;
      const half = ax === 'x'
        ? new THREE.Vector3(T, (top - bottom) / 2, (b - a) / 2)
        : new THREE.Vector3((b - a) / 2, (top - bottom) / 2, T);
      physics.addStaticBox(new THREE.Vector3(mx, (top + bottom) / 2, mz), half);
      n++;
    };
    /** 한 변을 훑으며 끊긴 자리를 빼고 남은 구간만 벽으로 세운다 */
    const edge = (ax: 'x' | 'z', fixed: number, from: number, to: number, inward: number) => {
      let run = -1;
      for (let t = from; t <= to + 1e-6; t += STEP) {
        const x = ax === 'x' ? fixed : t;
        const z = ax === 'x' ? t : fixed;
        const open = this.gapMask(x, z) > 0.12;
        if (open) { if (run >= 0) { emit(ax, fixed, run, t - STEP, inward); run = -1; } }
        else if (run < 0) run = t;
      }
      if (run >= 0) emit(ax, fixed, run, to, inward);
    };
    for (const r of this.cells.values()) {
      if (this.inFlatZone((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)) continue;
      edge('x', r.x0, r.z0, r.z1, +1);
      edge('x', r.x1, r.z0, r.z1, -1);
      edge('z', r.z0, r.x0, r.x1, +1);
      edge('z', r.z1, r.x0, r.x1, -1);
    }
    console.info(`[ground] 논두렁 벽 ${n} 개 · 끊긴 자리 ${this.gaps.length} 곳`);
  }

  /** 논 내부일수록 1, 논두렁·참배로는 0 (물·벼·색 칠하기에 쓴다) */
  paddyMask(x: number, z: number): number {
    if (!this.inPaddyRegion(x, z) || this.inFlatZone(x, z)) return 0;
    const m = this.cellInset(x, z);
    if (m <= 0) return 0;
    return clamp(m / BANK_W, 0, 1) * (1 - this.gapMask(x, z));
  }

  /**
   * 배미 경계에서 안쪽으로 들어간 거리. 양수 = 논 안, 음수 = 논두렁 쪽으로 나간 거리.
   * 격자 인덱스로 배미를 찾으므로 논두렁 위의 점은 **그 다음 배미**의 음수 인셋으로 나온다.
   */
  private cellInset(x: number, z: number): number {
    const cx = Math.floor((x - PX0) / CELL_X), cz = Math.floor((z - PZ0) / CELL_Z);
    const r = this.cells.get(`${cx},${cz}`);
    if (!r) return -99;
    return Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
  }

  /** 흙둑이 끊긴 자리(논 출입구)에 얼마나 가까운가 — 1 이면 한복판 */
  private gapMask(x: number, z: number): number {
    let best = 0;
    for (const g of this.gaps) {
      const dx = x - g.x, dz = z - g.z;
      if (Math.abs(dx) > GAP_R || Math.abs(dz) > GAP_R) continue;
      const d = Math.hypot(dx, dz);
      if (d >= GAP_R) continue;
      const v = 1 - smoothstep(GAP_R * 0.3, GAP_R, d);
      if (v > best) best = v;
    }
    return best;
  }

  /** 평탄화 구역(폐가 터·광장·꽃밭) 안인가 — 여기엔 흙둑을 세우지 않는다 */
  private inFlatZone(x: number, z: number): boolean {
    for (const P of [HOUSE_PAD, SQUARE_PAD, FLOWER_FIELD]) {
      if (x > P.x0 - 2 && x < P.x1 + 2 && z > P.z0 - 2 && z < P.z1 + 2) return true;
    }
    return false;
  }

  /** 참배로 중심선 위 최근접점 */
  private nr = { d: 0, x: 0, z: 0, s: 0 };
  nearestRoad(x: number, z: number) {
    let best = Infinity, bx = 0, bz = 0, bs = 0;
    for (let i = 1; i < ROAD.length; i++) {
      const ax = ROAD[i - 1]![0], az = ROAD[i - 1]![1], bx2 = ROAD[i]![0], bz2 = ROAD[i]![1];
      const dx = bx2 - ax, dz = bz2 - az;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t, pz = az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bx = px; bz = pz; bs = this.roadCum[i - 1]! + Math.sqrt(len2) * t; }
    }
    this.nr.d = best; this.nr.x = bx; this.nr.z = bz; this.nr.s = bs;
    return this.nr;
  }

  roadDist(x: number, z: number) { return this.nearestRoad(x, z).d; }

  /** 참배로에서 주어진 월드 z 에 해당하는 s(시작점부터의 거리). 맵을 늘려도 배치가 안 밀린다 */
  sAtZ(z: number): number {
    let acc = 0;
    for (let i = 1; i < ROAD.length; i++) {
      const az = ROAD[i - 1]![1], bz = ROAD[i]![1];
      const len = Math.hypot(ROAD[i]![0] - ROAD[i - 1]![0], bz - az);
      if ((z - az) * (z - bz) <= 0 && Math.abs(bz - az) > 1e-6) {
        return acc + len * ((z - az) / (bz - az));
      }
      acc += len;
    }
    return clamp(acc, 0, this.roadLength);
  }

  /** 참배로 시작(s=0, 남쪽)에서 s 미터 지점의 좌표와 진행 방향 */
  roadAt(s: number, out = { x: 0, z: 0, dirX: 0, dirZ: 0 }) {
    const t = clamp(s, 0, this.roadLength);
    let i = 1;
    while (i < this.roadCum.length - 1 && this.roadCum[i]! < t) i++;
    const s0 = this.roadCum[i - 1]!, s1 = this.roadCum[i]!;
    const k = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
    const ax = ROAD[i - 1]![0], az = ROAD[i - 1]![1], bx = ROAD[i]![0], bz = ROAD[i]![1];
    out.x = lerp(ax, bx, k); out.z = lerp(az, bz, k);
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    out.dirX = dx / len; out.dirZ = dz / len;
    return out;
  }

  slopeAt(x: number, z: number) {
    const e = 0.5;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()) {
    const e = 0.5;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out.set(-dx, 1, -dz).normalize();
  }

  /** 발밑 표면 — 발소리에 쓴다 */
  surfaceAt(p: THREE.Vector3): Surface {
    if (this.roadDist(p.x, p.z) < ROAD_W + 0.5) return 'gravel';
    if (p.y < PADDY_WATER + 0.08 && this.paddyMask(p.x, p.z) > 0.2) return 'water';
    if (this.inPaddyRegion(p.x, p.z)) return 'dirt';
    return 'grass';
  }

  /** 논 배미 사각형 목록 (수면·벼 배치용) — paddyMask 와 같은 자료를 쓴다 */
  paddyCells(): PaddyRect[] { return [...this.cells.values()]; }
}
