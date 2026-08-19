import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import type { VillageGround } from './ground';

/**
 * 명신(明神)형 토리이를 파라메트릭으로 만들고, 참배로를 따라 InstancedMesh 로 세운다.
 * 원작의 "좁은 복도"가 여기다 — 기둥 안쪽 간격 2.3 m, 간격 1.15 m 로 촘촘히 세워 터널이 되게 한다.
 *
 * 부재: 기둥(柱) · 관(貫) · 액속(額束) · 도목(島木) · 입목(笠木, 끝이 살짝 들리는 소리)
 */
export interface ToriiOptions {
  startS?: number;   // 참배로 시작점에서의 거리(m)
  count?: number;
  spacing?: number;  // 토리이 간격(m)
}

const VERMILION = new THREE.Color(0.78, 0.20, 0.13); // 주색(朱)
const BLACK_BASE = new THREE.Color(0.09, 0.08, 0.08); // 기둥 밑동
const DARK_TOP = new THREE.Color(0.13, 0.11, 0.11);   // 입목/도목 상단

export class ToriiPath {
  readonly mesh: THREE.InstancedMesh;
  readonly count: number;
  /** 각 토리이의 (x, z, yaw) — H2 에서 길찾기·시야 차폐에 쓴다 */
  readonly placements: { x: number; z: number; y: number; yaw: number }[] = [];

  constructor(scene: THREE.Scene, physics: Physics, ground: VillageGround, opts: ToriiOptions = {}) {
    const startS = opts.startS ?? 70;
    const count = opts.count ?? 60;
    const spacing = opts.spacing ?? 1.15;

    const geo = makeToriiGeometry();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'torii';
    // 인스턴스가 참배로 전체(약 70 m)에 흩어져 있으므로 컬링은 청크가 아니라 전체로
    mesh.frustumCulled = false;

    const dummy = new THREE.Object3D();
    const rp = { x: 0, z: 0, dirX: 0, dirZ: 0 };
    const rng = seeded(778);
    let n = 0;
    for (let i = 0; i < count; i++) {
      const s = startS + i * spacing;
      if (s > ground.roadLength - 2) break;
      ground.roadAt(s, rp);
      const y = ground.heightAt(rp.x, rp.z);
      // 토리이는 진행 방향에 직각으로 선다
      const yaw = Math.atan2(rp.dirX, rp.dirZ);
      dummy.position.set(rp.x, y - 0.05, rp.z);
      dummy.rotation.set(0, yaw, 0);
      const sc = 0.97 + rng() * 0.06;
      dummy.scale.set(sc, sc, sc);
      // 세월에 조금씩 기운다
      dummy.rotateZ((rng() - 0.5) * 0.016);
      dummy.rotateX((rng() - 0.5) * 0.012);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      this.placements.push({ x: rp.x, z: rp.z, y, yaw });

      // 기둥 콜라이더 2개
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const half = new THREE.Vector3(0.17 * sc, 1.5 * sc, 0.17 * sc);
      for (const sx of [-1, 1]) {
        const off = new THREE.Vector3(PILLAR_X * sx * sc, 0, 0).applyQuaternion(q);
        physics.addStaticBox(new THREE.Vector3(rp.x + off.x, y + 1.5 * sc, rp.z + off.z), half, q);
      }
      // 입목(笠木) 콜라이더만 둔다 — 카메라가 터널 위로 넘어가는 것을 막는 용도.
      // 관(貫, y≈2.0)에도 콜라이더를 달았더니 3인칭 스프링암이 매 프레임 걸려
      // 카메라가 최소거리(0.65 m)까지 무너졌다 → 통로에서는 콜라이더가 아니라
      // Village.inToriiCorridor + camera.constrainDistance 로 명시적으로 조인다 (2026-08-19)
      physics.addStaticBox(new THREE.Vector3(rp.x, y + 3.06 * sc, rp.z), new THREE.Vector3(1.95 * sc, 0.28 * sc, 0.20 * sc), q);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    this.count = n;
    this.mesh = mesh;
    // 근접 컬링용 원본 행렬 보관
    this.base = new Float32Array(n * 16);
    this.base.set(mesh.instanceMatrix.array.subarray(0, n * 16));
    this.hidden = new Uint8Array(n);
    scene.add(mesh);
  }

  private base!: Float32Array;
  private hidden!: Uint8Array;
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  /**
   * 카메라 코앞의 토리이를 숨긴다 — 안 그러면 기둥·관이 화면을 가로지른다.
   * 스케일 0 으로 접어 넣는 방식(인스턴스 하나짜리 draw 비용 없음).
   */
  update(cameraPos: THREE.Vector3, radius = 2.05) {
    let dirty = false;
    const r2 = radius * radius;
    for (let i = 0; i < this.count; i++) {
      const p = this.placements[i]!;
      const dx = p.x - cameraPos.x, dz = p.z - cameraPos.z, dy = p.y + 1.6 - cameraPos.y;
      const hide = dx * dx + dz * dz < r2 && Math.abs(dy) < 2.6 ? 1 : 0;
      if (hide === this.hidden[i]) continue;
      this.hidden[i] = hide;
      dirty = true;
      const arr = this.mesh.instanceMatrix.array as Float32Array;
      if (hide) arr.set(this.zero.elements, i * 16);
      else arr.set(this.base.subarray(i * 16, i * 16 + 16), i * 16);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const PILLAR_X = 1.30;      // 기둥 중심 간격의 절반
const PILLAR_H = 2.86;      // 기둥 높이(도목 밑까지)
const PILLAR_R0 = 0.165;    // 밑동 반지름
const PILLAR_R1 = 0.142;    // 윗동 반지름
const LEAN = 0.022;         // 기둥이 안쪽으로 기우는 정도(윗동 이동량, m)

/** 명신형 토리이 하나의 병합 지오메트리 (원점 = 지면 중앙, +X 가 좌우, −Z/+Z 가 참배 방향) */
function makeToriiGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const push = (g: THREE.BufferGeometry, color: THREE.Color, colorFn?: (y: number) => THREE.Color) => {
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(colorFn ? colorFn(pos.getY(i)) : color);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  };

  // --- 기둥 2개 (아래가 굵은 원기둥, 안쪽으로 살짝 기움, 밑동은 검게) ---
  const tmp = new THREE.Color();
  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(PILLAR_R1, PILLAR_R0, PILLAR_H, 12, 1, false);
    g.translate(0, PILLAR_H / 2, 0);
    // 안쪽으로 기울이기: 윗동을 중앙 쪽으로
    g.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, -sx * (LEAN / PILLAR_H), 0, 0, 0));
    g.translate(PILLAR_X * sx, 0, 0);
    push(g, VERMILION, (y) => tmp.copy(BLACK_BASE).lerp(VERMILION, THREE.MathUtils.smoothstep(y, 0.22, 0.42)));
  }

  // --- 관(貫): 기둥을 관통해 양쪽으로 튀어나온 각재 ---
  {
    const g = new THREE.BoxGeometry(PILLAR_X * 2 + 0.70, 0.20, 0.19);
    g.translate(0, 1.98, 0);
    push(g, VERMILION);
  }

  // --- 액속(額束): 관과 도목 사이 중앙 짧은 기둥 ---
  {
    const g = new THREE.BoxGeometry(0.17, PILLAR_H - 2.08, 0.15);
    g.translate(0, (PILLAR_H + 2.08) / 2, 0);
    push(g, VERMILION);
  }

  // --- 도목(島木) + 입목(笠木): 끝이 들리는 곡선(소리, 反り)을 세그먼트로 근사 ---
  {
    const SEG = 9;
    const halfW = PILLAR_X + 0.62;
    const shimakiY = PILLAR_H, shimakiH = 0.20;
    const kasagiH = 0.19;
    const sori = 0.20; // 양 끝이 들리는 높이
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG, t1 = (i + 1) / SEG;
      const x0 = (t0 * 2 - 1) * halfW, x1 = (t1 * 2 - 1) * halfW;
      const cx = (x0 + x1) / 2, w = x1 - x0;
      const k = Math.abs(cx / halfW);
      const lift = sori * k * k;
      // 도목
      const gs = new THREE.BoxGeometry(w * 1.02, shimakiH, 0.30);
      gs.translate(cx, shimakiY + shimakiH / 2 + lift, 0);
      push(gs, DARK_TOP);
      // 입목 (도목보다 조금 넓고 위로)
      const gk = new THREE.BoxGeometry(w * 1.02, kasagiH, 0.36);
      gk.translate(cx, shimakiY + shimakiH + kasagiH / 2 + lift * 1.12, 0);
      push(gk, DARK_TOP);
    }
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('토리이 지오메트리 병합 실패');
  merged.computeVertexNormals();
  return merged;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
