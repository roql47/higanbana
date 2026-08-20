import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import type { Surface } from '@/audio/sfx';

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

    const tex = makeTextures();
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
    const slab = (x0: number, z0: number, x1: number, z1: number, y: number, h: number, mat: THREE.Material) => {
      const g = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
      g.translate((x0 + x1) / 2, y - h / 2, (z0 + z1) / 2);
      parts.push({ geo: g, mat });
    };

    // 土間 — 다진 흙바닥 (마루보다 낮다)
    slab(X0, Z0, DOMA_X, Z1, 0, 0.3, tex.dirt);
    // 마루: 툇복도(널마루) + 좌식방 둘(다다미) + 벽장
    slab(DOMA_X, Z0, X1, CORR_Z, FLOOR, 0.3, tex.plank);
    slab(DOMA_X, CORR_Z, ROOM_SPLIT, CLOSET_Z, FLOOR, 0.3, tex.tatami);
    slab(ROOM_SPLIT, CORR_Z, X1, Z1, FLOOR, 0.3, tex.tatami);
    slab(DOMA_X, CLOSET_Z, ROOM_SPLIT, Z1, FLOOR + 0.5, 0.3, tex.plank); // 벽장 아래칸 선반
    collide(X0, Z0, X1, Z1, -0.35, 0);                 // 봉당 바닥
    collide(DOMA_X, Z0, X1, Z1, 0, FLOOR);             // 마루 단차(올라서는 턱)

    // ---------- 천장 ----------
    slab(DOMA_X, Z0, X1, Z1, FLOOR + CEIL + 0.06, 0.06, tex.plankDark);

    // ---------- 벽 ----------
    const wallTop = FLOOR + CEIL;
    /** 흙벽 한 장 (+ 콜라이더) */
    const wall = (x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = wallTop) => {
      const g = new THREE.BoxGeometry(Math.max(x1 - x0, WALL_T), y1 - y0, Math.max(z1 - z0, WALL_T));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      parts.push({ geo: g, mat: tex.mud });
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
    const postAt = (x: number, z: number, y1 = wallTop + 0.1) => {
      const g = new THREE.BoxGeometry(POST * 2, y1, POST * 2);
      g.translate(x, y1 / 2, z);
      parts.push({ geo: g, mat: tex.timber });
    };
    for (const x of [X0, DOMA_X, ROOM_SPLIT, X1]) for (const z of [Z0, CORR_Z, Z1]) postAt(x, z);
    // 보(梁): 정면·복도 안쪽을 가로지르는 굵은 재
    for (const z of [Z0, CORR_Z]) {
      const g = new THREE.BoxGeometry(W, 0.24, 0.20);
      g.translate(0, wallTop + 0.02, z);
      parts.push({ geo: g, mat: tex.timber });
    }

    // ---------- 지붕 ----------
    parts.push({ geo: makeRoof(), mat: tex.thatch });

    // ---------- 부뚜막(かまど) — 봉당의 랜드마크 ----------
    {
      const b = new THREE.BoxGeometry(1.5, 0.85, 0.95);
      b.translate(X0 + 1.1, 0.42, Z1 - 1.2);
      parts.push({ geo: b, mat: tex.mud });
      collide(X0 + 0.35, Z1 - 1.68, X0 + 1.85, Z1 - 0.72, 0, 0.85);
      const pot = new THREE.CylinderGeometry(0.34, 0.26, 0.3, 12);
      pot.translate(X0 + 1.1, 1.0, Z1 - 1.2);
      parts.push({ geo: pot, mat: tex.timber });
    }

    // ---------- 이로리(囲炉裏) — 큰 방의 랜드마크 ----------
    {
      const cx = (DOMA_X + ROOM_SPLIT) / 2, cz = (CORR_Z + CLOSET_Z) / 2;
      const S = 1.5; // 화덕 틀 한 변
      // 나무 틀 4변
      for (const [dx, dz, w, dep] of [[0, -S/2, S + 0.24, 0.24], [0, S/2, S + 0.24, 0.24], [-S/2, 0, 0.24, S - 0.24], [S/2, 0, 0.24, S - 0.24]] as [number, number, number, number][]) {
        const g = new THREE.BoxGeometry(w, 0.14, dep);
        g.translate(cx + dx, FLOOR + 0.07, cz + dz);
        parts.push({ geo: g, mat: tex.timber });
      }
      // 재(灰) 바닥 — 마루보다 낮게
      const ash = new THREE.BoxGeometry(S - 0.2, 0.05, S - 0.2);
      ash.translate(cx, FLOOR + 0.02, cz);
      parts.push({ geo: ash, mat: tex.mud });
      // 자재걸이(自在鉤): 천장에서 내려온 막대 + 갈고리의 주전자 실루엣
      const rod = new THREE.CylinderGeometry(0.03, 0.03, CEIL - 0.9, 6);
      rod.translate(cx, FLOOR + CEIL - (CEIL - 0.9) / 2, cz);
      parts.push({ geo: rod, mat: tex.timber });
      const pot = new THREE.CylinderGeometry(0.2, 0.16, 0.22, 10);
      pot.translate(cx, FLOOR + 0.95, cz);
      parts.push({ geo: pot, mat: tex.timber });
      // 오토스텝(0.35 m)이 틀(0.15 m)을 밟고 넘어 화덕·주전자를 관통한다 → 보이지 않는 벽을 0.6 m 로 (2026-08-19)
      collide(cx - S/2 - 0.12, cz - S/2 - 0.12, cx + S/2 + 0.12, cz + S/2 + 0.12, FLOOR, FLOOR + 0.6);
    }

    // ---------- 병합(정적 지오메트리) ----------
    for (const grp of groupByMaterial(parts)) {
      const merged = mergeGeometries(grp.geos, false);
      if (!merged) continue;
      merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, grp.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // ---------- 장지문 / 맹장지 ----------
    // 얇은 **양면 반투명 평면**. 그림자를 받으므로, 뒤에서 빛이 오면 사이에 낀 것이 실루엣으로 뜬다.
    const panel = (x0: number, z0: number, x1: number, z1: number, opaque = false) => {
      const along = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.PlaneGeometry(along, CEIL - 0.12);
      const m = new THREE.Mesh(g, opaque ? tex.fusuma : tex.shojiMat);
      m.position.set((x0 + x1) / 2, FLOOR + (CEIL - 0.12) / 2, (z0 + z1) / 2);
      m.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      m.castShadow = false;   // 종이는 그림자를 만들지 않는다
      m.receiveShadow = true; // 뒤에서 오는 빛의 그림자를 받아야 실루엣이 생긴다
      m.name = opaque ? 'fusuma' : 'shoji';
      this.group.add(m);
      if (!opaque) this.shoji.push(m);
      return m;
    };
    // 정면 바깥 장지문 (마당 쪽) — 실루엣 벽
    panel(DOMA_X + 0.12, Z0, X1 - 0.12, Z0);
    // 툇복도 ↔ 座敷 A / B
    panel(DOMA_X + 0.12, CORR_Z, ROOM_SPLIT - 0.12, CORR_Z);
    panel(ROOM_SPLIT + 0.12, CORR_Z, X1 - 0.12, CORR_Z);
    // 벽장 미닫이 — 한 짝은 열어 둔다(문틈으로 밖을 보는 은신처)
    panel(DOMA_X + 0.1, CLOSET_Z, DOMA_X + 1.0, CLOSET_Z, true);

    // ---------- 월드 AABB (실내 판정용) ----------
    this.worldBox.setFromCenterAndSize(
      opts.position.clone().add(new THREE.Vector3(0, (FLOOR + CEIL) / 2, 0)),
      new THREE.Vector3(Math.max(W, D) + 1.4, FLOOR + CEIL + 2.2, Math.max(W, D) + 1.4),
    );
    // 현관 앞 (로컬 −Z 방향 2 m)
    this.entrance.set(X0 + 1.75, 0, Z0 - 2.0).applyQuaternion(q).add(opts.position);

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
  const v: number[] = [], idx: number[] = [];
  // 용마루는 X 방향으로 뻗는다
  const P = [
    [-hw, base, -hd], [hw, base, -hd], [hw, base, hd], [-hw, base, hd], // 0..3 처마 끝
    [-hw + 0.6, peak, 0], [hw - 0.6, peak, 0],                          // 4,5 용마루
  ];
  for (const p of P) v.push(p[0]!, p[1]!, p[2]!);
  idx.push(0, 1, 5, 0, 5, 4);   // 앞면 경사
  idx.push(2, 3, 4, 2, 4, 5);   // 뒷면 경사
  idx.push(0, 4, 3);            // 좌 박공
  idx.push(1, 2, 5);            // 우 박공
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((v.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function groupByMaterial(parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[]) {
  const map = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) {
    if (!map.has(p.mat)) map.set(p.mat, []);
    map.get(p.mat)!.push(p.geo);
  }
  return [...map.entries()].map(([mat, geos]) => ({ mat, geos }));
}

// --- 재질: 전부 캔버스로 그린다 (외부 에셋 없음, 밤이라 1K 도 필요 없다) ---
interface HouseTextures {
  dirt: THREE.Material; plank: THREE.Material; plankDark: THREE.Material;
  tatami: THREE.Material; mud: THREE.Material; timber: THREE.Material;
  thatch: THREE.Material; shojiMat: THREE.Material; fusuma: THREE.Material;
}
let cached: HouseTextures | null = null;

function makeTextures(): HouseTextures {
  if (cached) return cached;
  const std = (map: THREE.Texture, rough: number, color = 0xffffff) =>
    new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0, color });

  cached = {
    dirt: std(canvasTex(64, (c) => {
      c.fillStyle = '#3a3128'; c.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 420; i++) { c.fillStyle = `rgba(${90 + Math.random() * 50},${74 + Math.random() * 40},${58 + Math.random() * 30},0.5)`; c.fillRect(Math.random() * 64, Math.random() * 64, 1.4, 1.4); }
    }, 8), 1.0),
    plank: std(plankCanvas('#4b3a28', '#3a2c1e'), 0.82),
    plankDark: std(plankCanvas('#2b211a', '#1e1712'), 0.9),
    tatami: std(tatamiCanvas(), 0.95),
    mud: std(canvasTex(64, (c) => {
      c.fillStyle = '#6b6250'; c.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${150 + Math.random() * 60},${140 + Math.random() * 50},${112 + Math.random() * 40},0.35)`; c.fillRect(Math.random() * 64, Math.random() * 64, 2.2, 1); } // 여물(짚) 흔적
    }, 4), 0.98),
    timber: std(plankCanvas('#33261b', '#241a12'), 0.85),
    thatch: std(canvasTex(64, (c) => {
      c.fillStyle = '#31291f'; c.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 500; i++) { c.strokeStyle = `rgba(${70 + Math.random() * 45},${60 + Math.random() * 38},${44 + Math.random() * 26},0.55)`; c.lineWidth = 1; const x = Math.random() * 64, y = Math.random() * 64; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 1.5, y + 7); c.stroke(); }
    }, 6), 1.0),
    // 장지문: **거의 불투명**한 양면 + 그림자 수신.
    // 사람이 종이 너머로 직접 보이면 안 된다 — 보이는 건 등불이 종이에 던진 **그림자 실루엣**뿐.
    // 종이는 빛을 투과하므로 디퓨즈 항의 saturate(dotNL) 을 abs(dotNL) 로 바꿔 **뒷면에서 온 빛도 밝힌다**.
    // 포인트라이트 그림자는 dotNL 이전에 directLight.color 에 곱해지므로 실루엣은 양면 모두에 남는다 (2026-08-19)
    shojiMat: (() => {
      const m = new THREE.MeshStandardMaterial({
        map: shojiCanvas(),
        color: 0xf2ead8, roughness: 1, metalness: 0,
        side: THREE.DoubleSide, transparent: true, opacity: 0.94, depthWrite: false,
      });
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_physical_pars_fragment>',
          THREE.ShaderChunk['lights_physical_pars_fragment']!
            .replace(/saturate\( dot\( geometryNormal, directLight\.direction \) \)/g,
                     'abs( dot( geometryNormal, directLight.direction ) ) * 0.85'),
        );
      };
      return m;
    })(),
    fusuma: new THREE.MeshStandardMaterial({
      map: canvasTex(64, (c) => {
        c.fillStyle = '#4a4335'; c.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(${120 + Math.random() * 40},${112 + Math.random() * 35},${92 + Math.random() * 30},0.25)`; c.fillRect(Math.random() * 64, Math.random() * 64, 3, 2); }
      }, 2),
      roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
    }),
  };
  return cached;
}

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D) => void, repeat = 1) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

function plankCanvas(base: string, dark: string) {
  return canvasTex(128, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 5; i++) { c.fillStyle = dark; c.fillRect(0, i * 26 + 24, 128, 1.6); } // 널 이음매
    for (let i = 0; i < 240; i++) { c.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`; c.lineWidth = 0.8; const y = Math.random() * 128; c.beginPath(); c.moveTo(0, y); c.lineTo(128, y + (Math.random() - 0.5) * 3); c.stroke(); }
  }, 3);
}

function tatamiCanvas() {
  return canvasTex(128, (c) => {
    c.fillStyle = '#6d6c41'; c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 2) { c.strokeStyle = `rgba(${150 + Math.random() * 30},${146 + Math.random() * 28},${96 + Math.random() * 24},0.30)`; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y); c.lineTo(128, y); c.stroke(); }
    c.fillStyle = '#20201a'; c.fillRect(0, 0, 128, 5); c.fillRect(0, 123, 128, 5); // 다다미 가장자리 천(縁)
  }, 2);
}

function shojiCanvas() {
  return canvasTex(128, (c) => {
    c.fillStyle = '#efe6d2'; c.fillRect(0, 0, 128, 128);
    c.strokeStyle = '#2e241a'; c.lineWidth = 3.2;              // 살(桟)
    for (let i = 0; i <= 4; i++) { const p = (i / 4) * 128; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, 128); c.stroke(); }
    for (let i = 0; i <= 6; i++) { const p = (i / 6) * 128; c.beginPath(); c.moveTo(0, p); c.lineTo(128, p); c.stroke(); }
    for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(60,48,34,${0.06 + Math.random() * 0.12})`; c.fillRect(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 12, 3 + Math.random() * 9); } // 얼룩·찢김
  }, 1);
}
