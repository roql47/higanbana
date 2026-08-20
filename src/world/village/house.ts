import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import type { Surface } from '@/audio/sfx';
import { makeHouseMaterials, type HouseMaterials } from './houseMaterials';

/**
 * 폐가(空き家) — 마을의 실내 구역.
 *
 * 전통 민가 한 채: 土間(흙바닥 봉당) · 廊下(툇복도) · 座敷 두 칸(다다미) · 押入れ(벽장).
 * 실내가 중요한 이유는 두 가지다.
 *  1) **장지문 실루엣** — 반투명 양면 패널이 그림자를 받는다. 초칭을 든 무언가가 장지문 뒤를
 *     지나가면 이쪽에서 실루엣이 보인다. 이 게임의 대표 연출이 여기서 나온다.
 *  2) **벽장(押入れ)** — 은신처(H3). 문틈으로 밖이 보여야 하므로 미닫이를 반쯤 열어 둔다.
 *
 * 좌표계: 로컬 원점 = 집 한가운데, 앞면(현관 쪽)은 −Z, 뒷면 +Z. 배치는 position + yaw.
 * 실제 민가 치수를 따른다 — 1칸(間) ≈ 1.82 m, 천장 2.4 m 로 낮게(낮은 천장이 압박감을 만든다).
 */

const W = 15.0;   // 정면 폭 (2026-08-19 확장: 11 → 15, "실내가 좁다" 피드백)
const D = 11.0;   // 안쪽 깊이 (8 → 11)
const FLOOR = 0.30;      // 봉당 → 마루 단차. 실제 민가는 40 cm 지만 오토스텝(0.35 m)이 못 올라간다
const CEIL = 2.75;       // 마루에서 천장까지 (2.42 → 2.75)
const WALL_T = 0.12;
const POST = 0.13;       // 기둥 반각

// 로컬 좌표: x ∈ [−W/2, W/2], z ∈ [−D/2, D/2]
const X0 = -W / 2, X1 = W / 2, Z0 = -D / 2, Z1 = D / 2;
const DOMA_X = X0 + 4.4;        // 봉당과 마루의 경계
const CORR_Z = Z0 + 2.1;        // 툇복도 안쪽 경계
const ROOM_SPLIT = X0 + 10.2;   // 座敷 A / B 경계 (A 가 큰 방 — 이로리가 있다)
const CLOSET_Z = Z1 - 1.1;      // 벽장 깊이
const IRORI_X = (DOMA_X + ROOM_SPLIT) / 2, IRORI_Z = (CORR_Z + CLOSET_Z) / 2;

/**
 * 정적 지오메트리 세분화 간격(m).
 * 버텍스 컬러로 구석 어둠·그을음을 구우려면 면 안쪽에 정점이 있어야 한다 —
 * 박스는 면당 정점이 4 개뿐이라 10 m 벽에 지수 감쇠를 표현할 수 없다.
 */
const SEG = 0.7;
const segs = (len: number) => Math.max(1, Math.min(22, Math.round(Math.abs(len) / SEG)));

export interface HouseOptions {
  position: THREE.Vector3;
  yaw?: number;
}

export class House {
  readonly group = new THREE.Group();
  /** 현관 앞 (월드) — 여기로 스폰하면 바로 들어갈 수 있다 */
  readonly entrance = new THREE.Vector3();
  /** 장지문 패널들 — H4 에서 실루엣 연출에 쓴다 */
  readonly shoji: THREE.Mesh[] = [];
  /** 이로리 화덕 중심(월드) — 불씨 연출용 */
  readonly irori = new THREE.Vector3();
  /** 정면 장지문 중앙(월드)과 바깥쪽 법선 — 로쿠로쿠비 실루엣용 */
  readonly frontShoji = new THREE.Vector3();
  readonly frontNormal = new THREE.Vector3();
  private worldBox = new THREE.Box3();
  private inv = new THREE.Matrix4();
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, physics: Physics, opts: HouseOptions) {
    const yaw = opts.yaw ?? 0;
    this.group.position.copy(opts.position);
    this.group.rotation.y = yaw;
    this.group.name = 'house';
    this.group.updateMatrixWorld(true);
    this.inv.copy(this.group.matrixWorld).invert();

    const tex: HouseMaterials = makeHouseMaterials();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const origin = opts.position;

    /** 로컬 박스 → 월드 고정 콜라이더 */
    const collide = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (y0 + y1) / 2;
      const off = new THREE.Vector3(cx, 0, cz).applyQuaternion(q);
      physics.addStaticBox(
        new THREE.Vector3(origin.x + off.x, origin.y + cy, origin.z + off.z),
        new THREE.Vector3(Math.max(0.02, (x1 - x0) / 2), Math.max(0.02, (y1 - y0) / 2), Math.max(0.02, (z1 - z0) / 2)),
        q,
      );
    };

    // ---------- 바닥 ----------
    const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    /**
     * 지오메트리 한 조각을 등록한다. UV 는 **월드(로컬) 스페이스로 다시 쓴다** —
     * BoxGeometry 의 기본 UV 는 면 크기와 무관하게 0..1 이라, 15 m 벽과 26 cm 기둥이
     * 같은 텍셀 밀도를 갖지 못하고 긴 면은 그대로 늘어난다(툇복도 널마루가 5:1 로 뭉개졌던 원인).
     */
    const push = (geo: THREE.BufferGeometry, mat: THREE.Material, uv: UVSpec, mode: GrungeMode = 'interior') => {
      projectUV(geo, uv);
      bakeGrunge(geo, mode);
      parts.push({ geo, mat });
    };
    const slab = (x0: number, z0: number, x1: number, z1: number, y: number, h: number, mat: THREE.Material, uv: UVSpec) => {
      const g = new THREE.BoxGeometry(x1 - x0, h, z1 - z0, segs(x1 - x0), segs(h), segs(z1 - z0));
      g.translate((x0 + x1) / 2, y - h / 2, (z0 + z1) / 2);
      push(g, mat, uv);
    };

    // 土間 — 다진 흙바닥 (마루보다 낮다)
    slab(X0, Z0, DOMA_X, Z1, 0, 0.3, tex.dirt, UV_DIRT);
    // 마루: 툇복도(널마루) + 좌식방 둘(다다미) + 벽장
    // 널은 복도 길이 방향(로컬 X)으로 깔린다 — UV_PLANK 의 v 가 널 폭(18 cm)이다
    slab(DOMA_X, Z0, X1, CORR_Z, FLOOR, 0.3, tex.plank, UV_PLANK);
    // 다다미는 타일 한 장 = 실제 한 장. 방에 정수 장이 들어가도록 눈금을 맞춘다(잘린 장이 안 생긴다)
    slab(DOMA_X, CORR_Z, ROOM_SPLIT, CLOSET_Z, FLOOR, 0.3, tex.tatami, matGrid(DOMA_X, CORR_Z, ROOM_SPLIT, CLOSET_Z, 6, 4));
    slab(ROOM_SPLIT, CORR_Z, X1, Z1, FLOOR, 0.3, tex.tatami, matGrid(ROOM_SPLIT, CORR_Z, X1, Z1, 5, 5));
    slab(DOMA_X, CLOSET_Z, ROOM_SPLIT, Z1, FLOOR + 0.5, 0.3, tex.plank, UV_PLANK); // 벽장 아래칸 선반
    collide(X0, Z0, X1, Z1, -0.35, 0);                 // 봉당 바닥
    collide(DOMA_X, Z0, X1, Z1, 0, FLOOR);             // 마루 단차(올라서는 턱)

    // ---------- 천장 ----------
    slab(DOMA_X, Z0, X1, Z1, FLOOR + CEIL + 0.06, 0.06, tex.plankDark, UV_CEIL);

    // ---------- 벽 ----------
    const wallTop = FLOOR + CEIL;
    /** 흙벽 한 장 (+ 콜라이더) */
    const wall = (x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = wallTop) => {
      const w = Math.max(x1 - x0, WALL_T), hgt = y1 - y0, d = Math.max(z1 - z0, WALL_T);
      const g = new THREE.BoxGeometry(w, hgt, d, segs(w), segs(hgt), segs(d));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      push(g, tex.mud, UV_MUD);
      collide(x0 - WALL_T / 2, z0 - WALL_T / 2, x1 + WALL_T / 2, z1 + WALL_T / 2, y0, y1);
    };

    // 정면(−Z): 봉당 쪽은 현관 개구부, 마루 쪽은 전부 바깥 장지문
    wall(X0, Z0, X0 + 1.0, Z0);                        // 현관 좌
    wall(X0 + 3.2, Z0, DOMA_X, Z0);                    // 현관 우
    wall(X0 + 1.0, Z0, X0 + 3.2, Z0, 2.15, wallTop + 0.6); // 현관 상인방
    // 배면(+Z) · 좌측(−X) · 우측(+X)
    wall(X0, Z1, X1, Z1);
    wall(X0, Z0, X0, Z1);
    wall(X1, Z0, X1, Z1);
    // 봉당 ↔ 마루 칸막이 (통로 하나만 남긴다)
    wall(DOMA_X, CORR_Z, DOMA_X, Z1);
    // 툇복도 ↔ 座敷 사이 기둥(장지문 틀)
    wall(ROOM_SPLIT, CORR_Z, ROOM_SPLIT, CLOSET_Z, 0, wallTop);        // 座敷 A/B 칸막이 아래쪽
    // 벽장 양 옆
    wall(DOMA_X, CLOSET_Z, DOMA_X, Z1, 0, wallTop);
    wall(ROOM_SPLIT, CLOSET_Z, ROOM_SPLIT, Z1, 0, wallTop);

    // ---------- 기둥·보 (민가는 구조재가 드러난다) ----------
    // 100 년 된 민가에 정확한 직각 모서리는 없다. 1.5 cm 모따기가 초칭 빛을 받아 만드는
    // 가는 하이라이트 선 — 이것이 "모델링된 물건"으로 읽히게 하는 시각적 서명이다.
    const postAt = (x: number, z: number, y1 = wallTop + 0.1) => {
      const g = beveledBar(POST * 2, POST * 2, y1, 0.018, segs(y1), 'y');
      g.translate(x, y1 / 2, z);
      push(g, tex.timber, UV_POST);
    };
    for (const x of [X0, DOMA_X, ROOM_SPLIT, X1]) for (const z of [Z0, CORR_Z, Z1]) postAt(x, z);
    // 보(梁): 정면·복도 안쪽을 가로지르는 굵은 재
    for (const z of [Z0, CORR_Z]) {
      const g = beveledBar(0.24, 0.20, W, 0.02, 4, 'x'); // 보는 길이 방향 그라디언트가 저주파뿐이라 링 4 개면 된다
      g.translate(0, wallTop + 0.02, z);
      push(g, tex.timber, UV_TIMBER);
    }

    // ---------- 지붕 ----------
    push(makeRoof(), tex.thatch, UV_THATCH, 'exterior');

    // ---------- 부뚜막(かまど) — 봉당의 랜드마크 ----------
    {
      const b = new THREE.BoxGeometry(1.5, 0.85, 0.95, segs(1.5), segs(0.85), segs(0.95));
      b.translate(X0 + 1.1, 0.42, Z1 - 1.2);
      push(b, tex.mud, UV_MUD);
      collide(X0 + 0.35, Z1 - 1.68, X0 + 1.85, Z1 - 0.72, 0, 0.85);
      const pot = new THREE.CylinderGeometry(0.34, 0.26, 0.3, 16, 2);
      pot.translate(X0 + 1.1, 1.0, Z1 - 1.2);
      push(pot, tex.timber, cylUV(0.34, 0.3, UV_TIMBER));
    }

    // ---------- 이로리(囲炉裏) — 큰 방의 랜드마크 ----------
    {
      const cx = (DOMA_X + ROOM_SPLIT) / 2, cz = (CORR_Z + CLOSET_Z) / 2;
      this.irori.set(cx, FLOOR + 0.1, cz).applyQuaternion(q).add(origin);
      const S = 1.5; // 화덕 틀 한 변
      // 나무 틀 4변
      for (const [dx, dz, w, dep] of [[0, -S/2, S + 0.24, 0.24], [0, S/2, S + 0.24, 0.24], [-S/2, 0, 0.24, S - 0.24], [S/2, 0, 0.24, S - 0.24]] as [number, number, number, number][]) {
        const long = Math.max(w, dep);
        const g = beveledBar(w > dep ? 0.14 : dep, w > dep ? dep : 0.14, long, 0.014, segs(long), w > dep ? 'x' : 'z');
        g.translate(cx + dx, FLOOR + 0.07, cz + dz);
        push(g, tex.timber, UV_TIMBER);
      }
      // 재(灰) 바닥 — 마루보다 낮게
      const ash = new THREE.BoxGeometry(S - 0.2, 0.05, S - 0.2, segs(S), 1, segs(S));
      ash.translate(cx, FLOOR + 0.02, cz);
      push(ash, tex.mud, UV_DIRT);
      // 자재걸이(自在鉤): 천장에서 내려온 막대 + 갈고리의 주전자 실루엣
      const rodH = CEIL - 0.9;
      const rod = new THREE.CylinderGeometry(0.03, 0.03, rodH, 8, segs(rodH));
      rod.translate(cx, FLOOR + CEIL - rodH / 2, cz);
      push(rod, tex.timber, cylUV(0.03, rodH, UV_TIMBER));
      const pot = new THREE.CylinderGeometry(0.2, 0.16, 0.22, 14, 2);
      pot.translate(cx, FLOOR + 0.95, cz);
      push(pot, tex.timber, cylUV(0.2, 0.22, UV_TIMBER));
      // 오토스텝(0.35 m)이 틀(0.15 m)을 밟고 넘어 화덕·주전자를 관통한다 → 보이지 않는 벽을 0.6 m 로 (2026-08-19)
      collide(cx - S/2 - 0.12, cz - S/2 - 0.12, cx + S/2 + 0.12, cz + S/2 + 0.12, FLOOR, FLOOR + 0.6);
    }

    // ---------- 병합(정적 지오메트리) ----------
    // 바닥·천장은 그림자를 **드리우지 않는다**. 유일한 그림자 광원인 초칭은 마루 위에 있어서
    // 바닥면이 큐브맵에 기여하는 게 사실상 없는데, 포인트라이트 그림자는 6 면을 다 그리므로
    // 비용만 6 배로 든다(실측: 폐가 castShadow 전부 끄면 42.6 → 45.7 fps).
    const noCast = new Set<THREE.Material>([tex.dirt, tex.plank, tex.tatami, tex.plankDark]);
    for (const grp of groupByMaterial(parts)) {
      const merged = mergeGeometries(grp.geos, false);
      if (!merged) continue;
      // computeVertexNormals() 를 여기서 부르면 안 된다 — 모따기 면의 평면 노멀이
      // 이웃 면과 평균돼 하이라이트 선이 사라진다. 원본 지오메트리 노멀을 그대로 쓴다.

      const mesh = new THREE.Mesh(merged, grp.mat);
      mesh.castShadow = !noCast.has(grp.mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // ---------- 장지문 / 맹장지 ----------
    // 얇은 **양면 반투명 평면**. 그림자를 받으므로, 뒤에서 빛이 오면 사이에 낀 것이 실루엣으로 뜬다.
    const panel = (x0: number, z0: number, x1: number, z1: number, opaque = false) => {
      const along = Math.hypot(x1 - x0, z1 - z0), tall = CEIL - 0.12;
      const g = new THREE.PlaneGeometry(along, tall, segs(along), segs(tall));
      // 살(桟) 눈금을 실치수에 맞춘다 — 한 짝 폭 0.95 m 에 세로살 4 개(≈24 cm 간격)
      const uv = g.attributes['uv'] as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (along / 0.95), uv.getY(i) * (tall / 1.05));
      // 아래쪽이 더 삭았다 — 종이는 바닥에서부터 얼룩지고 찢어진다
      const pos = g.attributes['position'] as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const yy = pos.getY(i) + tall / 2;                       // 패널 하단 기준 높이
        const k = Math.max(0.34, 1 - 0.5 * Math.exp(-yy / 0.42) - 0.10 * Math.exp(-(tall - yy) / 0.3));
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, opaque ? tex.fusuma : tex.shojiMat);
      m.position.set((x0 + x1) / 2, FLOOR + tall / 2, (z0 + z1) / 2);
      m.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      m.castShadow = false;   // 종이는 그림자를 만들지 않는다
      m.receiveShadow = true; // 뒤에서 오는 빛의 그림자를 받아야 실루엣이 생긴다
      m.name = opaque ? 'fusuma' : 'shoji';
      this.group.add(m);
      if (!opaque) this.shoji.push(m);
      // 종이 한 장이라도 닫힌 문은 문이다 — 콜라이더가 없으면 그냥 통과된다(2026-08-20 수정).
      // 두께는 벽과 같은 12 cm. 마루(FLOOR) 위부터 인방까지 세운다.
      const t = 0.06;
      collide(
        Math.min(x0, x1) - (x0 === x1 ? t : 0), Math.min(z0, z1) - (z0 === z1 ? t : 0),
        Math.max(x0, x1) + (x0 === x1 ? t : 0), Math.max(z0, z1) + (z0 === z1 ? t : 0),
        FLOOR, wallTop,
      );
      return m;
    };
    /**
     * 미닫이 열린 폭. 나브그리드 셀이 1.5 m 라 개구부가 그보다 좁으면
     * 셀 중심(캡슐 r=0.35)이 한 칸도 안 들어가 요괴가 방에 진입하지 못한다.
     * 1.5 + 0.35×2 = 2.2 m 가 격자 정렬과 무관하게 안전한 최소값.
     */
    const DOOR = 2.2;
    // 정면 바깥 장지문 (마당 쪽) — 실루엣 벽. 여기는 통로가 아니다(출입은 봉당 현관).
    panel(DOMA_X + 0.12, Z0, X1 - 0.12, Z0);
    // 툇복도 ↔ 座敷 A / B — 미닫이를 한쪽으로 몰아 열어 둔 상태(A 는 왼쪽, B 는 오른쪽이 열린다)
    panel(DOMA_X + 0.12 + DOOR, CORR_Z, ROOM_SPLIT - 0.12, CORR_Z);
    panel(ROOM_SPLIT + 0.12, CORR_Z, X1 - 0.12 - DOOR, CORR_Z);
    // 벽장 미닫이 — 한 짝은 열어 둔다(문틈으로 밖을 보는 은신처)
    panel(DOMA_X + 0.1, CLOSET_Z, DOMA_X + 1.0, CLOSET_Z, true);

    // ---------- 월드 AABB (실내 판정용) ----------
    this.worldBox.setFromCenterAndSize(
      opts.position.clone().add(new THREE.Vector3(0, (FLOOR + CEIL) / 2, 0)),
      new THREE.Vector3(Math.max(W, D) + 1.4, FLOOR + CEIL + 2.2, Math.max(W, D) + 1.4),
    );
    // 현관 앞 (로컬 −Z 방향 2 m)
    this.entrance.set(X0 + 1.75, 0, Z0 - 2.0).applyQuaternion(q).add(opts.position);
    // 정면 장지문 중앙(마루 쪽 개구부의 한가운데) + 바깥 법선
    this.frontShoji.set((DOMA_X + X1) / 2, FLOOR + CEIL / 2, Z0).applyQuaternion(q).add(opts.position);
    this.frontNormal.set(0, 0, -1).applyQuaternion(q).normalize();

    scene.add(this.group);
  }

  /** 집 안(또는 처마 아래)인가 — 발소리·안개·카메라 판정용 */
  contains(p: THREE.Vector3) {
    if (!this.worldBox.containsPoint(p)) return false;
    this.tmp.copy(p).applyMatrix4(this.inv);
    return this.tmp.x > X0 - 0.3 && this.tmp.x < X1 + 0.3 && this.tmp.z > Z0 - 0.3 && this.tmp.z < Z1 + 0.3;
  }

  /** 벽장(押入れ) 안인가 — 은신 판정 (기획 3.7) */
  isInCloset(p: THREE.Vector3) {
    if (!this.contains(p)) return false;
    this.tmp.copy(p).applyMatrix4(this.inv);
    return this.tmp.x > DOMA_X && this.tmp.x < ROOM_SPLIT && this.tmp.z > CLOSET_Z - 0.2;
  }

  /** 실내 발밑 재질 — 봉당은 흙, 나머지는 나무/다다미 */
  surfaceAt(p: THREE.Vector3): Surface | null {
    if (!this.contains(p)) return null;
    this.tmp.copy(p).applyMatrix4(this.inv);
    if (this.tmp.x < DOMA_X) return 'dirt';
    return 'wood';
  }
}

/** 급경사 맞배지붕 + 깊은 처마 (茅葺 민가 실루엣) */
function makeRoof(): THREE.BufferGeometry {
  const eave = 0.9;                 // 처마 내밀기
  const hw = W / 2 + eave, hd = D / 2 + eave;
  const base = FLOOR + CEIL + 0.15, peak = base + 3.9;
  const P: [number, number, number][] = [
    [-hw, base, -hd], [hw, base, -hd], [hw, base, hd], [-hw, base, hd], // 0..3 처마 끝
    [-hw + 0.6, peak, 0], [hw - 0.6, peak, 0],                          // 4,5 용마루
  ];
  const tris = [[0, 1, 5], [0, 5, 4], [2, 3, 4], [2, 4, 5], [0, 4, 3], [1, 2, 5]];
  // 삼각형마다 정점을 복제한다 — 정점을 공유하면 병합 후 용마루가 둥글게 뭉개진다
  const v: number[] = [], idx: number[] = [];
  for (const t of tris) for (const k of t) { const p = P[k]!; v.push(p[0], p[1], p[2]); }
  for (let k = 0; k < v.length / 3; k++) idx.push(k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((v.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 지붕은 면당 정점이 3 개뿐이라 그런지 그라디언트가 안 실린다 → 잘게 쪼갠다
  return subdivide(g, 1.1);
}

/** 긴 삼각형을 SEG 안팎으로 잘게 나눈다 (버텍스 컬러 그라디언트용) */
function subdivide(g: THREE.BufferGeometry, target: number): THREE.BufferGeometry {
  let cur = g;
  for (let pass = 0; pass < 4; pass++) {
    const pos = cur.attributes['position'] as THREE.BufferAttribute;
    const idx = cur.getIndex()!;
    let longest = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t)); b.fromBufferAttribute(pos, idx.getX(t + 1)); c.fromBufferAttribute(pos, idx.getX(t + 2));
      longest = Math.max(longest, a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    }
    if (longest <= target) break;
    const out: number[] = [];
    const m1 = new THREE.Vector3(), m2 = new THREE.Vector3(), m3 = new THREE.Vector3();
    const put = (...vs: THREE.Vector3[]) => { for (const p of vs) out.push(p.x, p.y, p.z); };
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t)); b.fromBufferAttribute(pos, idx.getX(t + 1)); c.fromBufferAttribute(pos, idx.getX(t + 2));
      m1.addVectors(a, b).multiplyScalar(0.5); m2.addVectors(b, c).multiplyScalar(0.5); m3.addVectors(c, a).multiplyScalar(0.5);
      put(a, m1, m3); put(m1, b, m2); put(m3, m2, c); put(m1, m2, m3);
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((out.length / 3) * 2).fill(0), 2));
    ng.setIndex([...Array(out.length / 3).keys()]);
    ng.computeVertexNormals();
    cur = ng;
  }
  return cur;
}

/**
 * 모따기한 각재 — 단면이 팔각형인 기둥/보.
 * 면마다 정점을 복제해 평면 셰이딩을 유지한다(모따기의 가는 하이라이트가 살아 있어야 한다).
 * `axis` 는 길이 방향, 길이 중심은 원점.
 */
function beveledBar(w: number, h: number, len: number, bevel: number, rings: number, axis: 'x' | 'y' | 'z') {
  const hw = w / 2, hh = h / 2, b = Math.min(bevel, Math.min(hw, hh) * 0.6);
  const prof: [number, number][] = [
    [-hw + b, -hh], [hw - b, -hh], [hw, -hh + b], [hw, hh - b],
    [hw - b, hh], [-hw + b, hh], [-hw, hh - b], [-hw, -hh + b],
  ];
  const N = prof.length, R = Math.max(1, rings);
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  // 로컬 (p, q, t) → 축에 맞춘 (x, y, z)
  const emit = (px: number, py: number, t: number, nx: number, ny: number) => {
    if (axis === 'y') { pos.push(px, t, py); nrm.push(nx, 0, ny); }
    else if (axis === 'x') { pos.push(t, py, px); nrm.push(0, ny, nx); }
    else { pos.push(px, py, t); nrm.push(nx, ny, 0); }
  };
  for (let f = 0; f < N; f++) {
    const p0 = prof[f]!, p1 = prof[(f + 1) % N]!;
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], el = Math.hypot(ex, ey) || 1;
    const nx = ey / el, ny = -ex / el;            // 바깥 법선
    const base = pos.length / 3;
    for (let r = 0; r <= R; r++) {
      const t = -len / 2 + (len * r) / R;
      emit(p0[0], p0[1], t, nx, ny);
      emit(p1[0], p1[1], t, nx, ny);
    }
    for (let r = 0; r < R; r++) {
      const o = base + r * 2;
      idx.push(o, o + 1, o + 3, o, o + 3, o + 2);
    }
  }
  // 양 끝 캡
  for (const [t, s] of [[-len / 2, -1], [len / 2, 1]] as [number, number][]) {
    const base = pos.length / 3;
    for (const pt of prof) {
      if (axis === 'y') { pos.push(pt[0], t, pt[1]); nrm.push(0, s, 0); }
      else if (axis === 'x') { pos.push(t, pt[1], pt[0]); nrm.push(s, 0, 0); }
      else { pos.push(pt[0], pt[1], t); nrm.push(0, 0, s); }
    }
    for (let k = 1; k < N - 1; k++) {
      if (s > 0) idx.push(base, base + k, base + k + 1);
      else idx.push(base, base + k + 1, base + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- UV / 그런지

/**
 * UV 사양. `su`/`sv` 는 **타일 한 장이 덮는 미터**다.
 * `mul` 이면 박스 투영 대신 기존 UV 에 배수를 건다(원통처럼 자체 UV 가 나은 경우).
 */
export interface UVSpec { su: number; sv: number; ou?: number; ov?: number; swap?: boolean; mul?: boolean }

const UV_DIRT: UVSpec = { su: 0.7, sv: 0.7 };
const UV_PLANK: UVSpec = { su: 2.4, sv: 0.9 };   // v 축에 널 5 장 → 폭 18 cm
const UV_CEIL: UVSpec = { su: 2.4, sv: 0.8 };
const UV_MUD: UVSpec = { su: 1.5, sv: 1.5 };
const UV_TIMBER: UVSpec = { su: 1.8, sv: 0.45 }; // 결이 u 를 따라 흐른다
const UV_POST: UVSpec = { su: 1.8, sv: 0.45, swap: true }; // 기둥은 결이 수직 → u/v 를 바꾼다
const UV_THATCH: UVSpec = { su: 1.6, sv: 2.6 };

/** 방에 다다미가 정수 장 들어가도록 눈금을 맞춘 UV (잘린 장이 안 생긴다) */
function matGrid(x0: number, z0: number, x1: number, z1: number, nx: number, nz: number): UVSpec {
  const su = (x1 - x0) / nx, sv = (z1 - z0) / nz;
  return { su, sv, ou: -x0 / su, ov: -z0 / sv };
}

/** 원통: 둘레·높이를 미터로 환산해 기존 UV 에 배수를 건다 */
function cylUV(radius: number, height: number, base: UVSpec): UVSpec {
  return { su: (2 * Math.PI * radius) / base.su, sv: height / base.sv, mul: true };
}

/** 박스 투영 — 정점 법선의 우세축을 빼고 남은 두 축을 미터 단위로 UV 에 쓴다 */
function projectUV(g: THREE.BufferGeometry, s: UVSpec) {
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const uv = g.attributes['uv'] as THREE.BufferAttribute;
  if (s.mul) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s.su, uv.getY(i) * s.sv);
    uv.needsUpdate = true;
    return;
  }
  const nrm = g.attributes['normal'] as THREE.BufferAttribute;
  const ou = s.ou ?? 0, ov = s.ov ?? 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = x; v = z; }        // 바닥·천장
    else if (ax >= az) { u = z; v = y; }               // ±X 면
    else { u = x; v = y; }                             // ±Z 면
    if (s.swap) { const t = u; u = v; v = t; }
    uv.setXY(i, u / s.su + ou, v / s.sv + ov);
  }
  uv.needsUpdate = true;
}

export type GrungeMode = 'interior' | 'exterior';

const XLINES = [X0, DOMA_X, ROOM_SPLIT, X1];
const ZLINES = [Z0, CORR_Z, CLOSET_Z, Z1];

/**
 * 접촉 그런지를 버텍스 컬러로 굽는다.
 *
 * aoMap 은 three 에서 **간접광에만** 곱해진다 — 이 게임의 광원은 초칭(직접광)이라 거의 안 먹는다.
 * 버텍스 컬러는 diffuseColor 자체에 곱해지므로 직접광에도 남는다. 그래서 구석 어둠·그을음은
 * 여기서 굽는다. 덤으로 저주파 얼룩이 타일 반복을 깨 준다(셰이더 안티타일링보다 싸다).
 */
function bakeGrunge(g: THREE.BufferGeometry, mode: GrungeMode) {
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const nrm = g.attributes['normal'] as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const ceil = FLOOR + CEIL;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let k = 1;
    if (mode === 'interior') {
      if (Math.abs(nrm.getY(i)) < 0.5) {
        // 수직면: 걸레받이 쪽과 천장 모서리가 어둡다
        k -= 0.44 * Math.exp(-Math.abs(y - FLOOR) / 0.22);
        k -= 0.28 * Math.exp(-Math.abs(y - ceil) / 0.30);
      } else {
        // 수평면: 벽·칸막이 선에 가까울수록 어둡다 (먼지가 구석에 쌓인다)
        let d = 99;
        for (const v of XLINES) d = Math.min(d, Math.abs(x - v));
        for (const v of ZLINES) d = Math.min(d, Math.abs(z - v));
        k -= 0.40 * Math.exp(-d / 0.26);
      }
      // 이로리 위 그을음 — 실내에서만, 천장에 가까울수록 짙다
      if (y < ceil + 0.2) {
        const up = Math.max(0, Math.min(1, (y - (FLOOR + CEIL * 0.4)) / (CEIL * 0.6)));
        k -= 0.58 * up * up * Math.exp(-Math.hypot(x - IRORI_X, z - IRORI_Z) / 1.6);
      }
    } else {
      // 지붕: 처마 끝이 어둡고 용마루가 밝다 (비바람에 씻긴 정도)
      k -= 0.34 * Math.exp(-Math.abs(y - (FLOOR + CEIL + 0.15)) / 0.9);
    }
    // 저주파 얼룩 — 같은 재질이 통짜로 보이지 않게 한다
    const n = Math.sin(x * 1.13 + z * 0.71) + Math.sin(x * 0.37 - z * 1.53 + 2.1) + Math.sin(y * 0.9 + x * 0.6);
    k *= 0.90 + 0.10 * (n / 3 * 0.5 + 0.5);
    k = Math.max(0.16, k);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function groupByMaterial(parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[]) {
  const map = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) {
    if (!map.has(p.mat)) map.set(p.mat, []);
    map.get(p.mat)!.push(p.geo);
  }
  return [...map.entries()].map(([mat, geos]) => ({ mat, geos }));
}
