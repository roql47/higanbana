import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import { makeHouseMaterials, type HouseMaterials } from '../village/houseMaterials';
import { LANES, ROUTES, type HigasatoGround, type Path } from './ground';
import { makeHiganbanaFlower } from '@/world/village/higanbana';
import { makeLantern } from '@/light/chochin';

/**
 * 민가(民家) — 골목에 늘어선 마을 집들.
 *
 * 폐가(`village/house.ts`)는 **들어가는 집** 한 채라 실내·장지문 실루엣·벽장까지 만든다.
 * 여기 집들은 **지나가는 집**이다. 들어갈 수 없고, 초칭 반경 3 m 안에서 벽면과 처마만 보인다.
 * 그래서 실내를 만들지 않는 대신 **바깥에 전부를 건다**:
 *
 *   · 石場建て  주춧돌 위에 뜬 마루 — 마루 밑 어둠이 집을 땅에서 떼어 놓는다
 *   · 下見板張り 아래는 널판, 위는 흙벽. 두 재질이 만나는 수평선이 집의 허리를 만든다
 *   · 縁側      골목을 향한 툇마루 + 장지문. 몇 칸은 문이 빠져 **검은 구멍**이다
 *   · 深い庇    깊은 처마(0.9 m) — 초칭을 들면 처마 밑만 밝고 위는 어둡다
 *   · 茅葺 / 板葺石置 두 지붕형을 섞는다. 억새는 두껍고 둥글고, 널지붕은 얇고 각지다
 *
 * 재질은 폐가의 절차적 PBR 세트를 **그대로 재사용**한다(`makeHouseMaterials` 는 캐시된다).
 * 알베도 한 장이 아니라 노멀·ARM 까지 있어야 점광원 하나가 요철을 스칠 때 실물로 읽힌다.
 *
 * 성능: 집마다 Mesh 를 만들면 24채 × 6재질 = 144 드로우콜이다. **재질별로 전부 병합**해
 * 마을 전체가 6 드로우콜이 된다. 그림자는 받기만 하고 만들지는 않는다(초칭 큐브맵 6면 비용).
 */

const rnd = (rng: () => number, a: number, b: number) => a + rng() * (b - a);
const SEG = 0.8;
const segs = (len: number) => Math.max(1, Math.min(14, Math.round(Math.abs(len) / SEG)));

export interface MinkaSpec {
  x: number; z: number;
  /** 정면이 향하는 방향 (골목 쪽). +Z 가 정면인 로컬을 이 각도로 돌린다 */
  yaw: number;
  w: number;      // 정면 폭
  d: number;      // 깊이
  roof: 'thatch' | 'board';
  /** 툇마루가 있는가 (없으면 판벽만 — 창고·헛간처럼 읽힌다) */
  engawa: boolean;
  /** 장지문이 빠져 검은 구멍이 된 칸 수 */
  missing: number;
  seed: number;
  // --- buildMinka 가 되돌려 적는 실측치 (ACT 4 의 생활 흔적이 이 위에 놓인다) ---
  /** 마루 높이(지면 기준) */
  floor?: number;
  /** 마루에서 처마 도리까지 */
  wall?: number;
  /** 처마 내밀기 */
  eave?: number;
  /** 부지 지면 높이 */
  gy?: number;
}

interface Part { geo: THREE.BufferGeometry; mat: THREE.Material }

export class Hamlet {
  readonly group = new THREE.Group();
  readonly houses: MinkaSpec[] = [];
  /**
   * 처마에 상시 등불이 걸린 집.
   *
   * 획득용 초칭(`eaveChochin.ts`)이 **이 중 하나를 골라 자리를 물려받는다** —
   * 한 처마에 등불이 둘이면 「하나를 떼어 든다」가 아니라 「둘 중 하나가 사라졌다」가 된다.
   * 물려받은 자리의 상시 등불은 `dropLantern()` 으로 걷는다.
   */
  readonly lanternHosts = new Map<MinkaSpec, { body: THREE.Group; light: THREE.PointLight }>();

  /** 상시 등불을 걷는다 (그 자리에 획득용 초칭이 걸린다) */
  dropLantern(h: MinkaSpec) {
    const e = this.lanternHosts.get(h);
    if (!e) return null;
    this.group.remove(e.body, e.light);
    e.light.dispose();
    const i = this.lights.indexOf(e.light);
    if (i >= 0) this.lights.splice(i, 1);
    this.lanternHosts.delete(h);
    return e.light.position.clone();
  }
  /** 처마 밑 등불 (몇 채만) */
  private lights: THREE.PointLight[] = [];
  private lanternMat: THREE.MeshStandardMaterial;
  private corruptLanternMat: THREE.MeshStandardMaterial;
  private breachFlowers: THREE.InstancedMesh;
  private breachFlowerData: { x: number; y: number; z: number; yaw: number; scale: number }[] = [];
  private breachDummy = new THREE.Object3D();
  private breachStarted = Number.POSITIVE_INFINITY;
  private storyStage = 0;
  private t = 0;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround, opts: { lanterns?: number } = {}) {
    const tex = makeHouseMaterials();
    const parts: Part[] = [];
    const rng = seeded(77149);

    // --- 골목 양옆에 집을 앉힌다 ---
    // 참배로의 마을 구간(z 41~10)도 포함한다 — 실제 마을은 큰길에도 집이 늘어선다.
    // 여기를 빼면 마을 한복판을 관통하는 대로 양쪽이 텅 빈 들판이 된다
    const sandoStretch: Path = {
      id: 'sando-village', name: '참배로(마을)', surface: 'gravel', halfWidth: 1.9, blend: 2.4, flatten: 1,
      pts: [[0, 41], [0, 30], [0, 24], [0.8, 16], [1.2, 10]],
    };
    const placementLanes = [sandoStretch, ...LANES];
    const rej = { site: 0, paddy: 0, slope: 0, road: 0, clash: 0 };
    for (const lane of placementLanes) {
      placeAlongLane(lane, rng, ground, this.houses, placementLanes, rej);
    }
    console.info(`[minka] ${this.houses.length}채 · 거절 부지${rej.site} 논${rej.paddy} 경사${rej.slope} 길${rej.road} 충돌${rej.clash}`);
    for (const h of this.houses) buildMinka(h, tex, parts, physics, ground);

    // --- 골목 소품: 판담·돌담·장작더미 ---
    buildLaneProps(this.houses, tex, parts, physics, ground, rng);

    // --- 병합 ---
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of parts) {
      if (!byMat.has(p.mat)) byMat.set(p.mat, []);
      byMat.get(p.mat)!.push(p.geo.index ? p.geo.toNonIndexed() : p.geo);
    }
    for (const [m, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = false;   // 초칭 큐브 그림자 6면에 마을 전체가 다시 그려진다
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // --- 처마 등불: 골목에 "여기가 마을이다"를 알리는 앵커. 그림자 없는 포인트라이트 소수 ---
    this.lanternMat = new THREE.MeshStandardMaterial({
      color: 0xf0d8a8, emissive: new THREE.Color(0xffb060), emissiveIntensity: 1.1, roughness: 0.9,
    });
    this.corruptLanternMat = new THREE.MeshStandardMaterial({
      color: 0x7a1115, emissive: new THREE.Color(0xff1018), emissiveIntensity: 1.35, roughness: 0.82,
    });
    const want = opts.lanterns ?? 5;
    const step = Math.max(1, Math.floor(this.houses.length / want));
    for (let i = 0; i < this.houses.length && this.lights.length < want; i += step) {
      const h = this.houses[i]!;
      const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
      const gx = h.x + fx * (h.d / 2 + 0.35), gz = h.z + fz * (h.d / 2 + 0.35);
      const gy = ground.heightAt(h.x, h.z) + 2.25;
      // 처마 등불도 플레이어가 떼어 드는 것과 같은 Tripo 초칭. 로드 전에는 절차 모델이 폴백한다.
      const { paper: body } = makeLantern(0.34, this.lanternMat, [this.corruptLanternMat]);
      body.position.set(gx, gy, gz);
      this.group.add(body);
      const l = new THREE.PointLight(0xffb060, 1.25, 7.5, 2);
      l.position.set(gx, gy - 0.05, gz);
      l.castShadow = false;
      this.lights.push(l);
      this.lanternHosts.set(h, { body, light: l });
      this.group.add(l);
    }

    // ACT 11의 「벽과 다다미 사이」를 외부에서도 읽을 수 있도록, 민가 문지방과 벽 하단의
    // 틈마다 피안화를 미리 심어 두고 세 번째 봉납 순간에만 자라게 한다.
    for (let i = 0; i < Math.min(20, this.houses.length); i++) {
      const h = this.houses[i]!;
      const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
      const rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
      const side = ((i % 5) - 2) * 0.31;
      // 툇마루는 정면으로 약 1.03 m 나온다. 예전 0.28 m 는 마루판 **안쪽**이라 꽃이
      // 찻잔·게다와 같은 생활 소품을 뚫었다. 마루가 있는 집은 바깥 모서리의 흙 틈에 심는다.
      const front = h.d / 2 + (h.engawa ? 1.18 : 0.28);
      const x = h.x + fx * front + rx * side;
      const z = h.z + fz * front + rz * side;
      this.breachFlowerData.push({ x, y: ground.heightAt(x, z) - 0.03, z, yaw: h.yaw + i * 1.73, scale: 0.75 + (i % 4) * 0.08 });
    }
    this.breachFlowers = new THREE.InstancedMesh(
      makeHiganbanaFlower(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, emissive: new THREE.Color(0xff1f32), emissiveIntensity: 0.85, roughness: 0.66, side: THREE.DoubleSide }),
      this.breachFlowerData.length,
    );
    this.breachFlowers.name = 'hamlet-breach-higanbana';
    this.breachFlowers.frustumCulled = false;
    this.group.add(this.breachFlowers);
    this.updateBreachFlowers();

    this.group.name = 'hamlet';
    scene.add(this.group);
  }

  update(dt: number) {
    this.t += dt;
    const f = 0.86 + 0.14 * Math.sin(this.t * 5.7) * Math.sin(this.t * 2.1);
    this.lanternMat.emissiveIntensity = 1.1 * f;
    this.corruptLanternMat.emissiveIntensity = 1.35 * (0.82 + 0.18 * Math.sin(this.t * 7.1));
    for (let i = 0; i < this.lights.length; i++) {
      this.lights[i]!.intensity = 1.25 * (0.88 + 0.12 * Math.sin(this.t * 4.3 + i * 1.7));
    }
    this.updateBreachFlowers();
  }

  /** 봉납 2: 일부 등불이 붉게 변함 / 봉납 3: 민가 틈에서 피안화가 자람. */
  setStoryStage(stage: number) {
    const prev = this.storyStage;
    this.storyStage = Math.max(0, stage);
    if (prev < 3 && this.storyStage >= 3) this.breachStarted = this.t;
    if (this.storyStage < 3) this.breachStarted = Number.POSITIVE_INFINITY;
    let i = 0;
    for (const { body, light } of this.lanternHosts.values()) {
      const corrupted = this.storyStage >= 3 || (this.storyStage >= 2 && i % 2 === 0);
      body.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = corrupted ? this.corruptLanternMat : this.lanternMat;
      });
      light.color.setHex(corrupted ? 0xff1820 : 0xffb060);
      i++;
    }
    this.updateBreachFlowers();
  }

  private updateBreachFlowers() {
    // 봉납 3 전에는 세로 스케일만 0.001인 꽃을 계속 제출하지 않는다. 완전히 숨기면
    // 드로우콜뿐 아니라 20개 인스턴스 행렬 갱신도 사라지고, 성장 시작 프레임부터 다시 켜진다.
    const active = Number.isFinite(this.breachStarted);
    this.breachFlowers.visible = active;
    if (!active) return;
    for (let i = 0; i < this.breachFlowerData.length; i++) {
      const d = this.breachFlowerData[i]!;
      const elapsed = this.t - this.breachStarted - i * 0.055;
      const u = Number.isFinite(elapsed) ? THREE.MathUtils.clamp(elapsed / 1.6, 0, 1) : 0;
      const grow = u * u * (3 - 2 * u);
      this.breachDummy.position.set(d.x, d.y, d.z);
      this.breachDummy.rotation.set(0, d.yaw, 0);
      this.breachDummy.scale.set(d.scale * (0.18 + 0.82 * grow), Math.max(0.001, d.scale * grow), d.scale * (0.18 + 0.82 * grow));
      this.breachDummy.updateMatrix();
      this.breachFlowers.setMatrixAt(i, this.breachDummy.matrix);
    }
    this.breachFlowers.instanceMatrix.needsUpdate = true;
  }

  /** 로딩 프리워밍 동안만 숨은 재질을 컴파일한다. 종료 시 실제 서사 상태로 되돌린다. */
  setHiddenEffectPrewarm(on: boolean) {
    this.breachFlowers.visible = on || Number.isFinite(this.breachStarted);
  }

  get count() { return this.houses.length; }
}

// ---------------------------------------------------------------- 배치

/**
 * 골목 폴리라인 **양옆**에 집을 늘어놓는다. 집은 골목을 바라본다.
 *
 * 한 쪽씩 번갈아 놓으면 같은 쪽 이웃 간격이 두 배로 벌어져 마을이 아니라 띄엄띄엄한 농가가 된다.
 * 그래서 좌우를 **따로 훑는다** — 쪽마다 "직전 집 반폭 + 틈 + 이번 집 반폭"으로 간격을 잡는다.
 * 틈 1.2~2.6 m 가 골목을 골목으로 만든다: 틈이 없으면 벽이고, 넓으면 들판이다.
 */
function placeAlongLane(lane: Path, rng: () => number, ground: HigasatoGround, out: MinkaSpec[], allLanes: Path[], rej: Record<string, number>) {
  const pts = lane.pts;
  const total = polyLength(pts);
  for (const side of [1, -1] as const) {
    let s = rnd(rng, 1.8, 3.2);
    let prevHalf = 0;
    let guard = 0;
    while (s < total - 1.5 && guard++ < 30) {
      const w = rnd(rng, 4.4, 6.6);
      const d = rnd(rng, 4.4, 6.2);
      // 직전 집과 겹치지 않는 최소 위치까지 민다
      s += prevHalf + w / 2 + rnd(rng, 0.7, 1.5);
      if (s >= total - 1.5) break;
      // 거절되면 prevHalf 를 남기지 않는다 — 거절된 자리가 다음 집까지 밀어내면
      // 부지 하나 스칠 때마다 골목 한 구간이 통째로 비어 마을이 성기어진다
      prevHalf = 0;
      const p = pointAt(pts, s);
      // 골목 중심에서 (반폭 + 깊이/2 + 여유) 만큼 물러나 앉는다
      const off = lane.halfWidth + d / 2 + rnd(rng, 0.4, 1.1);
      const x = p.x + p.nx * side * off;
      const z = p.z + p.nz * side * off;
      // 정면(+Z 로컬)이 골목 중심을 향하도록
      const yaw = Math.atan2(-p.nx * side, -p.nz * side);
      // 부지·논과 겹치면 건너뛴다 (건물이 배미나 광장·신사 경내에 서면 안 된다)
      if (ground.inSiteZone(x, z, 1.5)) { rej['site']!++; continue; }
      if (ground.paddyMask(x, z) > 0) { rej['paddy']!++; continue; }
      if (ground.slopeAt(x, z) > 0.7) { rej['slope']!++; continue; }
      // **길을 막으면 안 된다** — 집 모서리가 길 가장자리에서 0.4 m 는 떨어져야 지나갈 수 있다.
      // 자기 골목은 이미 (반폭 + 깊이/2 + 여유)로 물러나 앉았으니 건너뛰고, **다른 길 전부**를 본다.
      // 이걸 빼면 골목이 교차하는 자리에서 옆 골목으로 집이 튀어나와 길을 막는다(실측: 골목 2곳 막힘).
      // 거리는 **회전된 사각형** 기준이다 — 바운딩 박스 최대변으로 재면(7 m 집이 사방 3.5 m)
      // 실제로는 비켜 서 있는 집까지 거절해 마을이 절반으로 줄어든다
      let onRoad = false;
      for (const r of [...ROUTES, ...allLanes]) {
        if (r === lane) continue;
        if (rectToPoly(r.pts, x, z, yaw, w, d) < r.halfWidth + 0.4) { onRoad = true; break; }
      }
      if (onRoad) { rej['road']!++; continue; }
      // 다른 골목의 집과 겹치는지 (골목이 교차하는 모퉁이에서 생긴다)
      let clash = false;
      for (const o of out) if (Math.hypot(o.x - x, o.z - z) < (o.w + w) * 0.42) { clash = true; break; }
      if (clash) { rej['clash']!++; continue; }
      prevHalf = w / 2;
      out.push({
        x, z, yaw, w, d,
        roof: rng() < 0.45 ? 'thatch' : 'board',
        engawa: rng() < 0.78,
        missing: rng() < 0.5 ? (rng() < 0.4 ? 2 : 1) : 0,
        seed: (rng() * 1e9) | 0,
      });
    }
  }
}

/**
 * 회전된 사각형(집 바닥)에서 폴리라인(길)까지 최단 거리.
 * 길을 1 m 간격으로 훑으며 각 점을 집 로컬 좌표로 옮겨 사각형까지의 거리를 잰다.
 */
function rectToPoly(pts: [number, number][], cx: number, cz: number, yaw: number, w: number, d: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const hw = w / 2, hd = d / 2;
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1]![0], az = pts[i - 1]![1], bx = pts[i]![0], bz = pts[i]![1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const px = ax + (bx - ax) * t - cx, pz = az + (bz - az) * t - cz;
      // 월드 → 집 로컬 (yaw 의 역회전)
      const lx = px * c - pz * s, lz = px * s + pz * c;
      const ox = Math.max(Math.abs(lx) - hw, 0), oz = Math.max(Math.abs(lz) - hd, 0);
      const dist = Math.hypot(ox, oz);
      if (dist < best) best = dist;
      if (best === 0) return 0;
    }
  }
  return best;
}

function polyLength(pts: [number, number][]) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return t;
}
/** 호길이 s 지점의 좌표 + 좌측 법선 */
function pointAt(pts: [number, number][], s: number) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1]![0], az = pts[i - 1]![1], bx = pts[i]![0], bz = pts[i]![1];
    const len = Math.hypot(bx - ax, bz - az);
    if (acc + len >= s) {
      const t = len > 0 ? (s - acc) / len : 0;
      const dx = (bx - ax) / (len || 1), dz = (bz - az) / (len || 1);
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, nx: -dz, nz: dx };
    }
    acc += len;
  }
  const last = pts[pts.length - 1]!;
  return { x: last[0], z: last[1], nx: 1, nz: 0 };
}

// ---------------------------------------------------------------- 집 한 채

function buildMinka(m: MinkaSpec, tex: HouseMaterials, parts: Part[], physics: Physics, ground: HigasatoGround) {
  const rng = seeded(m.seed);
  const gy = ground.heightAt(m.x, m.z);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.yaw);
  const hw = m.w / 2, hd = m.d / 2;
  const FLOOR = rnd(rng, 0.42, 0.58);    // 주춧돌 위로 뜬 마루 높이
  const WALL = rnd(rng, 2.25, 2.55);     // 마루에서 처마 도리까지
  const SILL = 1.02;                     // 널판(下見板)과 흙벽이 만나는 허리선
  const EAVE = rnd(rng, 0.78, 1.0);      // 처마 내밀기
  // 생활 흔적(ACT 4)은 이 집의 툇마루·처마에 정확히 얹혀야 한다. 값을 밖에서 다시 뽑으면
  // 같은 시드라도 호출 순서가 어긋나는 순간 소품이 공중에 뜬다 — 그래서 여기서 되돌려 적는다
  m.floor = FLOOR; m.wall = WALL; m.eave = EAVE; m.gy = gy;

  /** 로컬 → 월드 변환을 적용해 등록 */
  const put = (g: THREE.BufferGeometry, mat: THREE.Material, su: number, sv: number, swap = false) => {
    projectUV(g, su, sv, swap);
    grunge(g, FLOOR + WALL, mat === tex.mud, m.seed);
    g.applyQuaternion(q);
    g.translate(m.x, gy, m.z);
    parts.push({ geo: g, mat });
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d, segs(w), segs(h), segs(d));
    g.translate(x, y, z);
    return g;
  };
  // 처마·장지 살처럼 가는 모듈은 세분화하지 않는다. 집 수십 채에서 작은 박스를 잘게 나누면
  // 버텍스만 늘고 실루엣은 같기 때문이다. 최종 메시 병합은 put()이 그대로 맡는다.
  const simpleBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  const collide = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => {
    const off = new THREE.Vector3(x, 0, z).applyQuaternion(q);
    physics.addStaticBox(new THREE.Vector3(m.x + off.x, gy + y, m.z + off.z), new THREE.Vector3(hx, hy, hz), q);
  };

  // ---------- 주춧돌 + 마루 밑 어둠 ----------
  // 집을 땅에서 떼어 놓는 30 cm — 이게 없으면 상자가 땅에 박힌 것처럼 보인다
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(box(0.44, FLOOR + 0.1, 0.44, sx * (hw - 0.35), (FLOOR + 0.1) / 2 - 0.1, sz * (hd - 0.35)), tex.dirt, 1.4, 1.4);
  }
  // 마루 밑 (어두운 판 — 안이 비지 않게)
  put(box(m.w - 0.5, FLOOR * 0.7, m.d - 0.5, 0, FLOOR * 0.35, 0), tex.plankDark, 1.2, 1.2);
  // 마루판
  put(box(m.w, 0.14, m.d, 0, FLOOR, 0), tex.plank, 2.2, 0.9);
  collide(0, (FLOOR + WALL) / 2, 0, hw, (FLOOR + WALL) / 2, hd);

  // ---------- 벽 ----------
  const wallY0 = FLOOR, wallY1 = FLOOR + WALL;
  // 정면(+Z): 툇마루가 있으면 개구부, 없으면 판벽 + 작은 문
  const bays = Math.max(2, Math.round(m.w / 1.9));   // 칸(間) 수
  const bayW = m.w / bays;
  if (m.engawa) {
    // 툇마루 널 + 처마 기둥
    put(box(m.w + 0.3, 0.12, 1.05, 0, FLOOR + 0.02, hd + 0.5), tex.plank, 2.6, 1.0);
    // 장지문 칸 — missing 개는 비운다(검은 구멍)
    const skip = new Set<number>();
    while (skip.size < m.missing) skip.add(Math.floor(rng() * bays));
    for (let i = 0; i < bays; i++) {
      const cx = -hw + bayW * (i + 0.5);
      if (skip.has(i)) {
        // 문이 빠진 칸: 안쪽의 어둠 (판을 뒤로 물려 그림자 상자를 만든다)
        put(box(bayW - 0.14, WALL - 0.55, 0.1, cx, wallY0 + (WALL - 0.55) / 2 + 0.1, hd - 0.55), tex.plankDark, 1.4, 1.2);
      } else {
        const panelW = bayW - 0.16, panelH = WALL - 0.6;
        // 집 다섯 칸 중 한 칸만 찢는다. RNG 호출을 추가하지 않아 기존 누름돌·소품 배치 시드는 보존한다.
        const damaged = ((m.seed >>> 2) + i * 7) % 5 === 0;
        if (!damaged) {
          const g = new THREE.PlaneGeometry(panelW, panelH, 2, 2);
          g.translate(cx, wallY0 + panelH / 2 + 0.1, hd - 0.03);
          put(g, tex.shojiMat, 1.0, 1.0);
        } else {
          const variant = ((m.seed >>> 5) + i) & 3;
          // 종이 뒤 32 cm에 검은 면을 물린다. 구멍 너머로 반대편 지형이 보이는 것을 막으면서
          // 실제 종이와 백킹 사이에는 깊이가 남아 초칭을 비추면 찢어진 가장자리가 읽힌다.
          put(simpleBox(panelW, panelH, 0.055, cx, wallY0 + panelH / 2 + 0.1, hd - 0.35), tex.plankDark, 0.7, 0.7);
          const paper = tornShojiPaper(panelW, panelH, variant);
          paper.translate(cx, wallY0 + panelH / 2 + 0.1, hd - 0.025);
          put(paper, tex.shojiMat, 1.0, 1.0);

          // 찢어진 칸만 얇은 나무 살을 실제 지오메트리로 세운다. 한 세로살은 중간이 부러져
          // 위·아래 조각이 어긋나고, 가로살 하나도 빠져 네모난 텍스처 구멍처럼 보이지 않는다.
          const cols = 4, rows = 6;
          const brokenV = 1 + variant % (cols - 1);
          const missingH = 1 + (variant * 2) % (rows - 1);
          for (let c = 1; c < cols; c++) {
            const x = cx - panelW / 2 + panelW * c / cols;
            if (c !== brokenV) {
              put(simpleBox(0.028, panelH, 0.038, x, wallY0 + panelH / 2 + 0.1, hd - 0.004), tex.timber, 1.2, 0.42, true);
              continue;
            }
            const lowerH = panelH * 0.36, upperH = panelH * 0.42;
            const lower = simpleBox(0.028, lowerH, 0.038, 0, 0, 0);
            lower.rotateZ((variant & 1 ? -1 : 1) * 0.07);
            lower.translate(x + (variant & 1 ? -0.025 : 0.025), wallY0 + lowerH / 2 + 0.1, hd - 0.004);
            put(lower, tex.timber, 1.2, 0.42, true);
            put(simpleBox(0.028, upperH, 0.038, x, wallY0 + panelH - upperH / 2 + 0.1, hd - 0.004), tex.timber, 1.2, 0.42, true);
          }
          for (let r = 1; r < rows; r++) {
            if (r === missingH) continue;
            const y = wallY0 + 0.1 + panelH * r / rows;
            put(simpleBox(panelW, 0.026, 0.038, cx, y, hd - 0.004), tex.timber, 1.2, 0.42);
          }
        }
      }
      // 칸을 나누는 기둥
      if (i > 0) put(box(0.11, WALL, 0.13, -hw + bayW * i, wallY0 + WALL / 2, hd - 0.03), tex.timber, 1.6, 0.5, true);
    }
    // 문지방·상인방
    put(box(m.w, 0.11, 0.16, 0, wallY0 + 0.06, hd - 0.03), tex.timber, 1.8, 0.45);
    put(box(m.w, 0.16, 0.16, 0, wallY0 + WALL - 0.08, hd - 0.03), tex.timber, 1.8, 0.45);
  } else {
    // 판벽 창고형: 아래 널판 + 위 흙벽 + 작은 격자창
    put(box(m.w, SILL, 0.13, 0, wallY0 + SILL / 2, hd), tex.plank, 2.2, 1.0);
    put(box(m.w, WALL - SILL, 0.13, 0, wallY0 + SILL + (WALL - SILL) / 2, hd), tex.mud, 1.5, 1.5);
    // 격자창 (세로살)
    const wx = rnd(rng, -hw * 0.4, hw * 0.4);
    put(box(1.15, 0.75, 0.06, wx, wallY0 + 1.55, hd + 0.05), tex.plankDark, 1.4, 1.4);
    for (let i = 0; i < 5; i++) put(box(0.045, 0.72, 0.05, wx - 0.46 + i * 0.23, wallY0 + 1.55, hd + 0.09), tex.timber, 1.6, 0.5, true);
  }
  // 좌·우·뒤: 아래 널판 + 위 흙벽 (이 수평선이 집의 허리다)
  for (const sx of [-1, 1]) {
    put(box(0.13, SILL, m.d, sx * hw, wallY0 + SILL / 2, 0), tex.plank, 2.2, 1.0);
    put(box(0.13, WALL - SILL, m.d, sx * hw, wallY0 + SILL + (WALL - SILL) / 2, 0), tex.mud, 1.5, 1.5);
  }
  put(box(m.w, SILL, 0.13, 0, wallY0 + SILL / 2, -hd), tex.plank, 2.2, 1.0);
  put(box(m.w, WALL - SILL, 0.13, 0, wallY0 + SILL + (WALL - SILL) / 2, -hd), tex.mud, 1.5, 1.5);

  // ---------- 기둥 (민가는 구조재가 드러난다) ----------
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(box(0.16, FLOOR + WALL, 0.16, sx * hw, (FLOOR + WALL) / 2, sz * hd), tex.timber, 1.6, 0.5, true);
  }
  if (m.engawa) for (const sx of [-1, 1]) {
    put(box(0.12, FLOOR + WALL + 0.1, 0.12, sx * (hw - 0.1), (FLOOR + WALL) / 2, hd + 0.95), tex.timber, 1.6, 0.5, true);
  }
  // 처마 도리(桁)
  put(box(m.w + EAVE * 2, 0.17, 0.15, 0, wallY1 + 0.08, hd + EAVE - 0.1), tex.timber, 1.8, 0.45);
  put(box(m.w + EAVE * 2, 0.17, 0.15, 0, wallY1 + 0.08, -hd - EAVE + 0.1), tex.timber, 1.8, 0.45);

  // ---------- 지붕 ----------
  const ra = hw + EAVE, rb = hd + EAVE;
  /** 처마 밑에 드러나는 서까래. 모든 조각은 timber 배치로 병합되므로 드로우콜은 늘지 않는다. */
  const exposedRafters = (rise: number, roofBase: number) => {
    const run = EAVE + 0.36;
    const liftAtWall = rise * Math.min(1, EAVE / rb);
    const angle = Math.atan2(liftAtWall, run);
    const count = Math.max(5, Math.ceil(m.w / 0.72));
    for (let i = 0; i <= count; i++) {
      const x = -hw + m.w * i / count;
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.07, 0.065, run);
        g.rotateX(side * angle);
        g.translate(x, roofBase + liftAtWall * 0.5 - 0.045, side * (hd + run * 0.5 - 0.08));
        put(g, tex.timber, 1.5, 0.42, true);
      }
    }
  };
  if (m.roof === 'thatch') {
    // 茅葺 — 두껍고 가파르다(45°+). 억새는 모서리가 둥글어 처마 끝이 두껍다
    const rise = Math.min(rb, 3.4) * 1.15;
    const rg = hipRoof(ra, rb, rise, 0.34);
    rg.translate(0, wallY1 + 0.3, 0);
    put(rg, tex.thatch, 1.5, 2.4);
    // 처마 끝 두께 (억새 단면)
    put(box(ra * 2, 0.34, rb * 2, 0, wallY1 + 0.3, 0), tex.thatch, 1.6, 1.6);
    exposedRafters(rise, wallY1 + 0.3);
    // 억새 처마의 아래 선을 한 장의 반듯한 박스로 두지 않는다. 35~48 cm 다발을 따라
    // 길이와 기울기가 조금씩 다른 얇은 조각을 덧대 실루엣만 불규칙하게 만든다.
    const bundleCount = Math.max(10, Math.ceil(ra * 2 / 0.42));
    const bundleW = ra * 2 / bundleCount;
    for (const side of [-1, 1]) for (let i = 0; i < bundleCount; i++) {
      const h = hash01(m.seed * 97 + i * 17 + (side > 0 ? 13 : 0));
      if (h < 0.055) continue; // 드문 빈 틈
      const drop = 0.19 + h * 0.18;
      const x = -ra + bundleW * (i + 0.5);
      const g = new THREE.BoxGeometry(bundleW * 1.04, drop, 0.13);
      g.rotateZ((h - 0.5) * 0.075);
      g.translate(x, wallY1 + 0.32 - drop / 2, side * (rb - 0.015));
      put(g, tex.thatch, 1.25, 1.3);
    }
    const sideBundles = Math.max(7, Math.ceil(rb * 2 / 0.48));
    const sideW = rb * 2 / sideBundles;
    for (const side of [-1, 1]) for (let i = 0; i < sideBundles; i++) {
      const h = hash01(m.seed * 131 + i * 23 + (side > 0 ? 19 : 0));
      if (h < 0.06) continue;
      const drop = 0.18 + h * 0.16;
      const z = -rb + sideW * (i + 0.5);
      const g = new THREE.BoxGeometry(0.13, drop, sideW * 1.04);
      g.rotateX((h - 0.5) * 0.065);
      g.translate(side * (ra - 0.015), wallY1 + 0.32 - drop / 2, z);
      put(g, tex.thatch, 1.25, 1.3);
    }
    // 용마루 (棟) — 억새 지붕의 서명. 마루 위에 얹은 누름대
    put(box(ra * 0.9, 0.3, 0.5, 0, wallY1 + 0.3 + rise, 0), tex.plankDark, 1.6, 1.2);
  } else {
    // 板葺石置 — 얕은 널지붕에 돌을 얹어 바람에 날아가지 않게 눌렀다
    const rise = Math.min(rb, 2.6) * 0.55;
    const rg = gableRoof(ra, rb, rise);
    rg.translate(0, wallY1 + 0.22, 0);
    put(rg, tex.plankDark, 2.4, 1.4);
    put(box(ra * 2, 0.16, rb * 2, 0, wallY1 + 0.22, 0), tex.plankDark, 2.2, 1.4);
    exposedRafters(rise, wallY1 + 0.22);
    // 누름돌
    for (let i = 0; i < 9; i++) {
      const sx = rnd(rng, -ra * 0.8, ra * 0.8), sz = rnd(rng, -rb * 0.75, rb * 0.75);
      const t = 1 - Math.abs(sz) / rb;
      const g = new THREE.BoxGeometry(rnd(rng, 0.22, 0.4), 0.14, rnd(rng, 0.2, 0.34));
      g.rotateY(rng() * 3.14);
      g.translate(sx, wallY1 + 0.3 + rise * t, sz);
      put(g, tex.dirt, 1.6, 1.6);
    }
  }
  // 지붕 콜라이더 (처마 밑으로 들어가되 지붕은 못 넘게)
  collide(0, wallY1 + 0.4, 0, ra, 0.3, rb);
}

// ---------------------------------------------------------------- 골목 소품

function buildLaneProps(houses: MinkaSpec[], tex: HouseMaterials, parts: Part[], physics: Physics, ground: HigasatoGround, rng: () => number) {
  for (const h of houses) {
    const gy = ground.heightAt(h.x, h.z);
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);   // 정면 방향
    const rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);  // 오른쪽 방향
    const put = (g: THREE.BufferGeometry, mat: THREE.Material, su: number, sv: number) => {
      projectUV(g, su, sv);
      grunge(g, 2.2);
      parts.push({ geo: g, mat });
    };
    // 집 옆 판담(板塀) — 집과 집 사이를 막아 골목을 **복도로** 만든다
    if (rng() < 0.55) {
      const side = rng() < 0.5 ? 1 : -1;
      const bx = h.x + rx * side * (h.w / 2 + 0.9) + fx * 0.6;
      const bz = h.z + rz * side * (h.w / 2 + 0.9) + fz * 0.6;
      const len = rnd(rng, 1.6, 2.8), hgt = rnd(rng, 1.5, 1.9);
      const g = new THREE.BoxGeometry(0.1, hgt, len, 1, segs(hgt), segs(len));
      g.rotateY(h.yaw);
      g.translate(bx, gy + hgt / 2, bz);
      put(g, tex.plank, 2.0, 1.1);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.yaw);
      physics.addStaticBox(new THREE.Vector3(bx, gy + hgt / 2, bz), new THREE.Vector3(0.1, hgt / 2, len / 2), q);
    }
    // 장작더미 — 처마 밑에 쌓는다
    if (rng() < 0.42) {
      const side = rng() < 0.5 ? 1 : -1;
      const wx = h.x + rx * side * (h.w / 2 - 0.5) + fx * (h.d / 2 + 0.7);
      const wz = h.z + rz * side * (h.w / 2 - 0.5) + fz * (h.d / 2 + 0.7);
      const rows = 3 + Math.floor(rng() * 2);
      for (let r = 0; r < rows; r++) for (let i = 0; i < 4 - Math.floor(r / 2); i++) {
        const g = new THREE.CylinderGeometry(0.075, 0.08, rnd(rng, 0.9, 1.2), 6);
        g.rotateZ(Math.PI / 2);
        g.rotateY(h.yaw + rnd(rng, -0.06, 0.06));
        g.translate(wx + rx * (i - 1.5) * 0.17, gy + 0.1 + r * 0.15, wz + rz * (i - 1.5) * 0.17);
        put(g, tex.timber, 1.4, 0.5);
      }
    }
    // 물확(水桶) — 처마 아래 빗물받이
    if (rng() < 0.3) {
      const bx = h.x + fx * (h.d / 2 + 1.0) + rx * rnd(rng, -1.5, 1.5);
      const bz = h.z + fz * (h.d / 2 + 1.0) + rz * rnd(rng, -1.5, 1.5);
      const g = new THREE.CylinderGeometry(0.3, 0.26, 0.42, 10);
      g.translate(bx, gy + 0.21, bz);
      put(g, tex.plankDark, 1.4, 1.0);
    }
  }
}

// ---------------------------------------------------------------- 지오메트리

/**
 * 장지 4×6 칸 중 몇 칸을 완전히 비우고 주변 칸은 삼각 종이 조각만 남긴다.
 * 알파 텍스처나 별도 셰이더 없이 실제 구멍을 내므로 오버드로와 새 재질이 없다.
 */
function tornShojiPaper(w: number, h: number, variant: number): THREE.BufferGeometry {
  const COLS = 4, ROWS = 6;
  const holes = [
    [9, 10, 14],
    [6, 10, 11],
    [12, 16, 17],
    [3, 6, 7],
  ][variant & 3]!;
  const partials = [
    [8, 13, 15],
    [5, 7, 14],
    [8, 13, 18],
    [2, 10, 11],
  ][variant & 3]!;
  const holeSet = new Set(holes), partialSet = new Set(partials);
  const pos: number[] = [];
  const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
    pos.push(a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0);
  };
  const quad = (bl: [number, number], br: [number, number], tr: [number, number], tl: [number, number]) => {
    tri(bl, br, tr); tri(bl, tr, tl);
  };
  const cw = w / COLS, rh = h / ROWS, inset = 0.006;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const index = r * COLS + c;
    if (holeSet.has(index)) continue;
    const x0 = -w / 2 + c * cw + inset, x1 = -w / 2 + (c + 1) * cw - inset;
    const y0 = -h / 2 + r * rh + inset, y1 = -h / 2 + (r + 1) * rh - inset;
    const bl: [number, number] = [x0, y0], br: [number, number] = [x1, y0];
    const tr: [number, number] = [x1, y1], tl: [number, number] = [x0, y1];
    if (!partialSet.has(index)) { quad(bl, br, tr, tl); continue; }
    // 네 방향으로 다른 삼각 조각을 남겨 찢어진 가장자리가 격자에 딱 맞지 않게 한다.
    switch ((index + variant) & 3) {
      case 0: tri(bl, br, tl); break;
      case 1: tri(bl, br, tr); break;
      case 2: tri(bl, tr, tl); break;
      default: tri(br, tr, tl); break;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

/** RNG 소비 순서를 건드리지 않는 위치별 0..1 해시. */
function hash01(seed: number) {
  const v = Math.sin(seed * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/** 우진각(寄棟) 지붕 — 억새 지붕의 실루엣. 용마루가 x 축을 따른다 */
function hipRoof(a: number, b: number, h: number, ridgeFrac: number): THREE.BufferGeometry {
  const r = a * ridgeFrac;
  const V: [number, number, number][] = [
    [-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b],   // 0..3 처마
    [-r, h, 0], [r, h, 0],                             // 4,5 용마루
  ];
  // 감김은 **바깥(위)을 향하도록** 시계 반대 방향. 뒤집히면 법선이 아래를 봐서 지붕이 새까매진다
  const tris = [
    [0, 5, 1], [0, 4, 5],   // 뒤 사면 (−z)
    [2, 4, 3], [2, 5, 4],   // 앞 사면 (+z)
    [1, 5, 2],              // 우 사면 (+x)
    [3, 4, 0],              // 좌 사면 (−x)
  ];
  return fromTris(V, tris);
}

/** 맞배(切妻) 지붕 — 널지붕. 용마루가 x 축을 따른다 */
function gableRoof(a: number, b: number, h: number): THREE.BufferGeometry {
  const V: [number, number, number][] = [
    [-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b],
    [-a, h, 0], [a, h, 0],
  ];
  const tris = [
    [0, 5, 1], [0, 4, 5],
    [2, 4, 3], [2, 5, 4],
    [1, 5, 2],
    [3, 4, 0],
  ];
  return fromTris(V, tris);
}

function fromTris(V: [number, number, number][], tris: number[][]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const t of tris) for (const k of t) { const p = V[k]!; pos.push(p[0], p[1], p[2]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return subdivide(g, 1.0);
}

/** 큰 삼각형을 잘게 나눈다 — 버텍스 컬러 그런지가 면 안쪽에도 실리도록 */
function subdivide(g: THREE.BufferGeometry, target: number): THREE.BufferGeometry {
  let pos = Array.from(g.attributes['position']!.array as Float32Array);
  for (let pass = 0; pass < 3; pass++) {
    const out: number[] = [];
    let split = false;
    for (let i = 0; i < pos.length; i += 9) {
      const p = [0, 1, 2].map((k) => [pos[i + k * 3]!, pos[i + k * 3 + 1]!, pos[i + k * 3 + 2]!] as [number, number, number]);
      const e = [0, 1, 2].map((k) => Math.hypot(p[(k + 1) % 3]![0] - p[k]![0], p[(k + 1) % 3]![1] - p[k]![1], p[(k + 1) % 3]![2] - p[k]![2]));
      if (Math.max(...e) < target) { out.push(...pos.slice(i, i + 9)); continue; }
      split = true;
      const mid = (u: [number, number, number], v: [number, number, number]): [number, number, number] =>
        [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
      const m01 = mid(p[0]!, p[1]!), m12 = mid(p[1]!, p[2]!), m20 = mid(p[2]!, p[0]!);
      for (const t of [[p[0]!, m01, m20], [m01, p[1]!, m12], [m20, m12, p[2]!], [m01, m12, m20]]) {
        for (const v of t) out.push(v[0], v[1], v[2]);
      }
    }
    pos = out;
    if (!split) break;
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  ng.computeVertexNormals();
  return ng;
}

/**
 * UV 를 로컬 스페이스로 다시 쓴다. BoxGeometry 기본 UV 는 면 크기와 무관하게 0..1 이라
 * 8 m 벽과 16 cm 기둥이 같은 텍셀 밀도를 못 갖는다 — 긴 면이 그대로 늘어난다.
 */
export function projectUV(g: THREE.BufferGeometry, su: number, sv: number, swap = false) {
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const nrm = g.attributes['normal'] as THREE.BufferAttribute | undefined;
  if (!nrm) g.computeVertexNormals();
  const n = g.attributes['normal'] as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let a: number, b: number;
    if (ny >= nx && ny >= nz) { a = x; b = z; }        // 수평면
    else if (nx >= nz) { a = z; b = y; }               // x 를 향한 면
    else { a = x; b = y; }                             // z 를 향한 면
    uv[i * 2] = (swap ? b : a) * su;
    uv[i * 2 + 1] = (swap ? a : b) * sv;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * 버텍스 컬러 그런지. 재질이 `vertexColors: true` 라 **색 속성이 반드시 있어야 한다**.
 * 아래로 갈수록 흙이 튄 자국, 위로 갈수록 그을음, 저주파 얼룩 — 타일 반복을 깨는 것도 이 역할이다.
 */
export function grunge(g: THREE.BufferGeometry, top: number, dampWall = false, seed = 0) {
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const phase = (Math.abs(seed) % 997) * 0.0137;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // 지면 근처 = 흙탕물 자국 → 허리 위로 회복. 밤 + 점광원 하나라 여기서 더 깎으면 그냥 검은 덩어리가 된다
    const ground = 0.72 + 0.28 * Math.min(1, Math.max(0, y / 0.9));
    // 벽 위쪽(처마 밑)이 살짝 그늘진다 — 지붕까지 어둡게 하면 실루엣이 사라진다
    const under = 1 - 0.12 * Math.min(1, Math.max(0, (y - top * 0.65) / (top * 0.5)));
    // 저주파 얼룩 — 타일 반복을 깨는 역할도 겸한다
    const blot = 0.92 + 0.08 * Math.sin(x * 1.7 + z * 2.3 + phase) * Math.cos(z * 1.1 - y * 0.7 - phase * 0.37);
    const v = ground * under * blot;
    if (dampWall) {
      // 흙벽만 하단 습기와 처마 밑 냉기를 더한다. 별도 데칼·셰이더 없이 기존 버텍스 컬러에
      // 얹으므로 민가 전체 드로우콜과 텍스처 샘플 수는 그대로다.
      const baseWet = 1 - Math.min(1, Math.max(0, (y - 0.18) / 1.15));
      const drip = 0.5 + 0.5 * Math.sin(x * 2.7 + z * 1.9 + Math.sin(x * 0.8 + phase) * 1.4 + phase);
      const wet = baseWet * (0.35 + drip * 0.65);
      col[i * 3] = v * (1 - wet * 0.16);
      col[i * 3 + 1] = v * (0.985 - wet * 0.035);
      col[i * 3 + 2] = v * (0.96 - wet * 0.015);
    } else {
      col[i * 3] = v; col[i * 3 + 1] = v * 0.985; col[i * 3 + 2] = v * 0.96;  // 살짝 따뜻하게
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
