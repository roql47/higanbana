import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import type { VillageGround } from './ground';
import { Props } from '@/world/props';

/**
 * 마츠리 광장 — 야구라(櫓, 축제 망루)·노점(屋台)·초칭 줄.
 * 전부 모듈러 지오메트리(박스·원기둥·평면). 밤이라 형태 + 등불 빛만 읽히면 된다.
 *
 * 사람이 없는 축제. 노점엔 불이 들어와 있고 야구라 북 앞엔 아무도 없다 — 그게 무서운 지점.
 */

export interface MatsuriOptions {
  center: THREE.Vector3;   // 광장 중심 (월드)
  radius?: number;         // 노점 배치 반경
}

const VERMILION = new THREE.Color(0.72, 0.18, 0.12);
const TIMBER = new THREE.Color(0.28, 0.20, 0.14);
const TIMBER_DARK = new THREE.Color(0.17, 0.12, 0.09);
const CLOTH_WHITE = new THREE.Color(0.86, 0.84, 0.78);
const CLOTH_INDIGO = new THREE.Color(0.16, 0.22, 0.42);
const PAPER = new THREE.Color(0.98, 0.86, 0.66);

export class MatsuriSquare {
  readonly group = new THREE.Group();
  /** 절차적 북·노점 — Tripo 모델이 도착하면 통째로 감춘다 */
  private procDrum = new THREE.Group();
  private procStalls = new THREE.Group();
  /** 초칭 줄의 등불 위치(월드) — 보조 PointLight 후보 */
  readonly lanternPoints: THREE.Vector3[] = [];
  /** 노점 위치(월드, yaw) — 놋페라보·은신 배치용 */
  readonly stalls: { pos: THREE.Vector3; yaw: number }[] = [];
  /** 야구라 북 위치(월드) — 자동 북소리 연출용 */
  readonly drumPos = new THREE.Vector3();
  private lights: THREE.PointLight[] = [];
  private paperMat: THREE.MeshStandardMaterial;
  private t = 0;

  constructor(scene: THREE.Scene, physics: Physics, ground: VillageGround, opts: MatsuriOptions) {
    const c = opts.center;
    const radius = opts.radius ?? 11;
    const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    const stallParts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    const mat = (color: THREE.Color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    const mTimber = mat(TIMBER), mTimberDark = mat(TIMBER_DARK), mVerm = mat(VERMILION, 0.7);
    const mClothW = new THREE.MeshStandardMaterial({ color: CLOTH_WHITE, roughness: 1, side: THREE.DoubleSide });
    const mClothI = new THREE.MeshStandardMaterial({ color: CLOTH_INDIGO, roughness: 1, side: THREE.DoubleSide });
    this.paperMat = new THREE.MeshStandardMaterial({ color: PAPER, emissive: new THREE.Color(0xffa040), emissiveIntensity: 0.7, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });

    const q = new THREE.Quaternion();
    const collide = (cx: number, cz: number, hx: number, hy: number, hz: number, yaw = 0) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const y = ground.heightAt(cx, cz);
      physics.addStaticBox(new THREE.Vector3(cx, y + hy, cz), new THREE.Vector3(hx, hy, hz), q);
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, yaw = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (yaw) g.rotateY(yaw);
      g.translate(x, y, z);
      parts.push({ geo: g, mat: m });
    };

    // ---------- 야구라(櫓): 2단 망루 + 난간 + 북 ----------
    {
      const gy = ground.heightAt(c.x, c.z);
      const S = 4.2, H1 = 2.2, POST = 0.16;
      // 기둥 4 + 대각 버팀
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        box(POST, H1 + 1.0, POST, c.x + sx * S / 2, gy + (H1 + 1.0) / 2, c.z + sz * S / 2, mTimber);
      }
      // 상단 마루
      box(S + 0.4, 0.16, S + 0.4, c.x, gy + H1, c.z, mTimberDark);
      // 난간 (4변)
      for (const [dx, dz, w, d] of [[0, -S/2, S, 0.08], [0, S/2, S, 0.08], [-S/2, 0, 0.08, S], [S/2, 0, 0.08, S]] as [number, number, number, number][]) {
        box(w, 0.08, d, c.x + dx, gy + H1 + 0.95, c.z + dz, mVerm);
        box(w, 0.06, d, c.x + dx, gy + H1 + 0.5, c.z + dz, mTimber);
      }
      // 홍백 막(幕) — 하단 둘레
      for (const [dx, dz, w, d, yaw] of [[0, -S/2 - 0.05, S, 0.02, 0], [0, S/2 + 0.05, S, 0.02, 0], [-S/2 - 0.05, 0, 0.02, S, 0], [S/2 + 0.05, 0, 0.02, S, 0]] as [number, number, number, number, number][]) {
        box(w, 0.9, d, c.x + dx, gy + H1 - 0.55, c.z + dz, mClothW, yaw);
      }
      // 지붕(사각 맞배) + 북
      const roof = new THREE.ConeGeometry(S * 0.85, 1.3, 4);
      roof.rotateY(Math.PI / 4);
      roof.translate(c.x, gy + H1 + 1.75, c.z);
      parts.push({ geo: roof, mat: mTimberDark });
      const drum = new THREE.CylinderGeometry(0.42, 0.42, 0.55, 16);
      drum.rotateZ(Math.PI / 2);
      drum.translate(c.x, gy + H1 + 0.45, c.z);
      this.procDrum.add(new THREE.Mesh(drum, mVerm));
      this.drumPos.set(c.x, gy + H1 + 0.45, c.z);
      // 북은 야구라 마루 위에 **선다** — 모델에 받침대가 딸려 있어 마루 높이에 바닥을 맞춘다.
      // 북소리 좌표(`drumPos`)는 절차적일 때 그대로다(ACT 4 의 자동 북소리가 여기서 난다)
      void Props.loadNormalized('/models/props/taiko.glb', 1.0, 0.55).then((m) => {
        m.position.set(c.x, gy + H1 + 0.08, c.z);
        m.rotation.y = Math.PI / 2;      // 북면이 참배로(남쪽)를 본다
        this.group.add(m);
        this.procDrum.visible = false;
      }).catch((e) => console.warn('[matsuri] 북 모델 로드 실패 — 절차적 원통 유지:', e));
      // 사다리
      for (let i = 0; i < 7; i++) box(0.5, 0.04, 0.05, c.x + S / 2 + 0.3, gy + 0.3 + i * 0.3, c.z, mTimber);
      // 콜라이더: 야구라 밑은 못 들어간다
      collide(c.x, c.z, S / 2 + 0.2, 1.6, S / 2 + 0.2);
      this.group.add(this.procDrum);
    }

    // ---------- 노점 6채: 광장 둘레 원형 배치, 전부 중앙을 본다 ----------
    const N = 6;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.35;
      const x = c.x + Math.cos(a) * radius, z = c.z + Math.sin(a) * radius;
      const yaw = Math.atan2(c.x - x, c.z - z); // 중앙을 향함
      const gy = ground.heightAt(x, z);
      const W = 2.6, D = 1.6, H = 2.3;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const local = (lx: number, lz: number): [number, number] => [x + lx * cy + lz * sy, z - lx * sy + lz * cy];
      // 카운터(앞) + 뒷판 + 기둥 4 + 천막 지붕 — **노점 몸체만** 따로 모은다.
      // Tripo 야타이가 도착하면 이 묶음만 감춘다(초칭·초칭 줄·콜라이더는 그대로 살아 있어야 한다)
      const sbox = (w: number, h: number, d: number, bx: number, by: number, bz: number, m: THREE.Material, ry = 0) => {
        const g = new THREE.BoxGeometry(w, h, d);
        if (ry) g.rotateY(ry);
        g.translate(bx, by, bz);
        stallParts.push({ geo: g, mat: m });
      };
      const [fx, fz] = local(0, D / 2 - 0.15);
      sbox(W, 0.9, 0.35, fx, gy + 0.45, fz, mTimber, yaw);
      for (const lx of [-W / 2, W / 2]) for (const lz of [-D / 2, D / 2]) {
        const [px, pz] = local(lx, lz);
        sbox(0.08, H, 0.08, px, gy + H / 2, pz, mTimber);
      }
      const [rx, rz] = local(0, 0);
      sbox(W + 0.5, 0.04, D + 0.7, rx, gy + H, rz, i % 2 ? mClothI : mClothW, yaw);
      // 노렌(천 가림막) 앞 윗단
      const [nx, nz] = local(0, D / 2 + 0.2);
      sbox(W + 0.1, 0.45, 0.02, nx, gy + H - 0.3, nz, i % 2 ? mClothW : mClothI, yaw);
      // 노점 초칭 1개 (앞 처마)
      const [lx2, lz2] = local(W / 2 - 0.3, D / 2 + 0.25);
      this.addLantern(parts, lx2, gy + H - 0.6, lz2, 0.28);
      collide(x, z, W / 2, 0.9, D / 2, yaw);
      this.stalls.push({ pos: new THREE.Vector3(x, gy, z), yaw });
    }

    // ---------- 노점 몸체 병합 + Tripo 야타이 교체 ----------
    {
      const byMatS = new Map<THREE.Material, THREE.BufferGeometry[]>();
      for (const q2 of stallParts) { if (!byMatS.has(q2.mat)) byMatS.set(q2.mat, []); byMatS.get(q2.mat)!.push(q2.geo); }
      for (const [m, geos] of byMatS) {
        const merged = mergeGeometries(geos, false);
        if (!merged) continue;
        merged.computeVertexNormals();
        const mesh = new THREE.Mesh(merged, m);
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.procStalls.add(mesh);
      }
      this.group.add(this.procStalls);
      /**
       * 야타이의 **카운터가 광장 중앙을 봐야** 한다. 이 모델은 정면이 로컬 −Z 라
       * (씬에서 세 각도를 돌려 보고 확인했다 — +X 규약을 따르지 않는다) `yaw` 에 180° 를 더한다.
       */
      void Props.loadNormalized('/models/props/yatai.glb', 2.3, 0.5).then((tpl) => {
        for (const st of this.stalls) {
          const m = tpl.clone(true);
          m.position.copy(st.pos);
          m.rotation.y = st.yaw + Math.PI;
          this.group.add(m);
        }
        this.procStalls.visible = false;
      }).catch((e) => console.warn('[matsuri] 야타이 모델 로드 실패 — 절차적 노점 유지:', e));
    }

    // ---------- 초칭 줄: 야구라 → 각 노점으로 방사형 ----------
    for (const s of this.stalls) {
      const from = new THREE.Vector3(c.x, ground.heightAt(c.x, c.z) + 3.2, c.z);
      const to = new THREE.Vector3(s.pos.x, s.pos.y + 2.6, s.pos.z);
      const n = 5;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const p = from.clone().lerp(to, t);
        p.y -= Math.sin(t * Math.PI) * 0.45; // 줄 처짐
        // 줄 자체(가는 원기둥 세그먼트)
        if (k < n) {
          const pn = from.clone().lerp(to, (k + 1) / n); pn.y -= Math.sin(((k + 1) / n) * Math.PI) * 0.45;
          const seg = new THREE.CylinderGeometry(0.01, 0.01, p.distanceTo(pn), 4);
          seg.translate(0, p.distanceTo(pn) / 2, 0);
          const m4 = new THREE.Matrix4().lookAt(p, pn, new THREE.Vector3(0, 1, 0));
          const rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
          seg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(m4, rotX));
          seg.translate(p.x, p.y, p.z);
          parts.push({ geo: seg, mat: mTimberDark });
        }
        this.addLantern(parts, p.x, p.y - 0.22, p.z, 0.26);
      }
    }

    // ---------- 병합 ----------
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of parts) { if (!byMat.has(p.mat)) byMat.set(p.mat, []); byMat.get(p.mat)!.push(p.geo); }
    for (const [m, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = m !== this.paperMat;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // ---------- 보조 광원: 그림자 없는 PointLight. 전체 초칭 중 8개만(성능) ----------
    const step = Math.max(1, Math.floor(this.lanternPoints.length / 8));
    for (let i = 0; i < this.lanternPoints.length; i += step) {
      const p = this.lanternPoints[i]!;
      const l = new THREE.PointLight(0xffa24a, 1.6, 7, 2);
      l.position.copy(p);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    }
    this.group.name = 'matsuri';
    scene.add(this.group);
  }

  private addLantern(parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[], x: number, y: number, z: number, size: number) {
    const g = new THREE.CylinderGeometry(size * 0.45, size * 0.45, size, 10, 1, false);
    // 살짝 배부르게: 스케일로 근사
    g.translate(x, y, z);
    parts.push({ geo: g, mat: this.paperMat });
    this.lanternPoints.push(new THREE.Vector3(x, y, z));
  }

  /** 초칭 줄 전체가 바람에 미세하게 호흡한다 */
  update(dt: number) {
    this.t += dt;
    const f = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 1.7)) + 0.05 * Math.sin(this.t * 9.3);
    this.paperMat.emissiveIntensity = f;
    for (let i = 0; i < this.lights.length; i++) {
      this.lights[i]!.intensity = 1.6 * (0.85 + 0.15 * Math.sin(this.t * 2.1 + i * 1.3));
    }
  }
}
