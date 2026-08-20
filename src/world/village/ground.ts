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

export const SIZE = 140;
export const RES = 140; // 1 m 격자

// --- 논 격자 (남쪽) ---
const PX0 = -26, PX1 = 26, PZ0 = 6, PZ1 = 48;
const CELL_X = 17.6, CELL_Z = 14.2, BUND = 2.2; // 한 배미 15.4×12 m, 논두렁 2.2 m
const PADDY_DEPTH = 0.45;
/** 논 수면 높이 (지면 0 기준) — 바닥 −0.45 이므로 물 깊이 약 23 cm */
export const PADDY_WATER = -0.22;

export interface PaddyRect { x0: number; z0: number; x1: number; z1: number }

// --- 참배로: 남(스폰) → 북(신사 언덕) ---
const ROAD: [number, number][] = [[0, 58], [0, 40], [-2, 26], [0, 10], [1.5, -6], [0, -20], [0, -34], [0, -46]];
const ROAD_W = 1.9; // 반폭
const ROAD_BLEND = 2.4; // 가장자리 블렌드 폭

/** 폐가 터: 이 사각형 안은 평탄하게 고른다 (집이 지형에 파묻히지 않도록) */
export const HOUSE_PAD = { x0: -26.0, z0: 16.4, x1: -11.0, z1: 33.8, y: 0.06 }; // 집 15×11 확장에 맞춤 (2026-08-19)
/** 마츠리 광장 터 (참배로 동쪽, 논두렁 너머) — 평탄화 + 논 제외 */
export const SQUARE_PAD = { x0: 28.0, z0: 12.0, x1: 52.0, z1: 36.0, y: 0.10 };
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
  const west = smoothstep(26, 48, -x) * 16;
  const east = smoothstep(52, 66, x) * 16;
  return Math.max(west, east) + smoothstep(42, 58, z) * 14;
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
    // 논 파내기 (참배로 근처는 제외)
    const pm = this.paddyMask(x, z);
    if (pm > 0) h -= PADDY_DEPTH * pm;
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

  /** 논 내부일수록 1, 논두렁·참배로는 0 */
  paddyMask(x: number, z: number): number {
    if (!this.inPaddyRegion(x, z)) return 0;
    const cx = Math.floor((x - PX0) / CELL_X), cz = Math.floor((z - PZ0) / CELL_Z);
    const r = this.cells.get(`${cx},${cz}`);
    if (!r) return 0;
    const m = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
    if (m <= 0) return 0;
    return clamp(m / 0.9, 0, 1);
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
