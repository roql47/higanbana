import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import type { VillageGround } from './ground';

/**
 * 신사 경내(境内) — 센본토리이 끝, 언덕 위.
 *   초즈야(手水舎)·배전(拝殿)·본전(本殿)·시메나와 삼나무. 전부 모듈러 지오메트리.
 * 봉납 지점은 배전 앞 새전함(賽銭箱) 위치. 본전은 배전 뒤에 더 높고 작게.
 */
export class Shrine {
  readonly group = new THREE.Group();
  /** 봉납 지점(월드) — 배전 앞 */
  readonly altar = new THREE.Vector3();
  /** 초즈야 수반 위치(월드) — 공물 "물" 자리 */
  readonly chozuya = new THREE.Vector3();
  /** 경내 중심 */
  readonly center = new THREE.Vector3();
  private candleMat: THREE.MeshStandardMaterial;
  private lights: THREE.PointLight[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, physics: Physics, ground: VillageGround) {
    // 경내 = 참배로 끝 + 8 m 북쪽
    const end = ground.roadAt(ground.roadLength - 1);
    const cx = end.x, cz = end.z - 9;
    const gy = ground.heightAt(cx, cz);
    this.center.set(cx, gy, cz);

    const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    const mat = (c: number, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 });
    const mVerm = mat(0xb3301f, 0.7), mTimber = mat(0x3a2a1c), mDark = mat(0x1c1512), mWhite = mat(0xe8e2d2, 0.95), mStone = mat(0x7a7a74, 1.0);
    this.candleMat = new THREE.MeshStandardMaterial({ color: 0xf6e3bf, emissive: new THREE.Color(0xffa040), emissiveIntensity: 0.9, roughness: 0.95 });
    const q = new THREE.Quaternion();
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, yaw = 0) => {
      const g = new THREE.BoxGeometry(w, h, d); if (yaw) g.rotateY(yaw); g.translate(x, y, z); parts.push({ geo: g, mat: m });
    };
    const collide = (x: number, z: number, hx: number, hy: number, hz: number, yBase = gy) => {
      physics.addStaticBox(new THREE.Vector3(x, yBase + hy, z), new THREE.Vector3(hx, hy, hz), q);
    };

    // ---------- 배전(拝殿): 정면 폭 7, 깊이 4.5, 마루 0.9 높이, 지붕 ----------
    const HW = 7, HD = 4.5, FL = 0.9, H = 2.8;
    const hz0 = cz - 3; // 배전 중심
    box(HW + 0.6, 0.25, HD + 0.6, cx, gy + FL, hz0, mTimber);                    // 마루
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.26, H + FL, 0.26, cx + sx * HW / 2, gy + (H + FL) / 2, hz0 + sz * HD / 2, mVerm); // 기둥
    box(HW, 0.18, 0.18, cx, gy + FL + H, hz0 - HD / 2, mVerm); box(HW, 0.18, 0.18, cx, gy + FL + H, hz0 + HD / 2, mVerm); // 도리
    box(HW - 0.4, H - 0.2, 0.12, cx, gy + FL + H / 2, hz0 - HD / 2 + 0.2, mWhite);   // 뒷벽(회벽)
    for (const sx of [-1, 1]) box(0.12, H - 0.2, HD - 0.4, cx + sx * (HW / 2 - 0.2), gy + FL + H / 2, hz0, mWhite); // 측벽
    // 정면 격자문(상단) + 난간
    box(HW - 0.6, 0.9, 0.06, cx, gy + FL + H - 0.5, hz0 + HD / 2 - 0.05, mDark);
    box(HW + 0.4, 0.08, 0.08, cx, gy + FL + 0.95, hz0 + HD / 2 + 0.35, mVerm);
    // 지붕: 급경사 맞배 + 깊은 처마
    {
      const rw = HW / 2 + 1.4, rd = HD / 2 + 1.2, base = gy + FL + H + 0.2, peak = base + 2.4;
      const v = [[-rw, base, -rd], [rw, base, -rd], [rw, base, rd], [-rw, base, rd], [-rw + 0.3, peak, 0], [rw - 0.3, peak, 0]].flat();
      parts.push({ geo: roofGeo(v, cx, hz0), mat: mDark });
      // 치기(千木) 두 쌍 — 용마루 양끝 X자
      for (const sx of [-1, 1]) for (const r of [-1, 1]) box(0.1, 1.4, 0.1, cx + sx * (rw - 0.4), peak + 0.5, hz0 + r * 0.18, mTimber, 0);
    }
    // 계단 3단 + 새전함
    for (let i = 0; i < 3; i++) box(2.4, 0.3, 0.4, cx, gy + 0.15 + i * 0.3, hz0 + HD / 2 + 1.0 - i * 0.4, mTimber);
    box(1.4, 0.7, 0.8, cx, gy + FL + 0.35, hz0 + HD / 2 - 0.6, mDark); // 새전함
    this.altar.set(cx, gy, hz0 + HD / 2 + 1.6); // 계단 아래, 새전함 정면
    collide(cx, hz0, HW / 2 + 0.3, (FL + H) / 2, HD / 2 + 0.3); // 배전 전체 블록 (계단은 별도)
    // 계단은 플레이어가 오를 필요 없음(봉납은 아래서) → 블록에 포함

    // ---------- 본전(本殿): 배전 뒤, 더 높은 단 위, 작고 높다 ----------
    const bz = hz0 - HD / 2 - 3.2;
    box(4, 1.4, 3, cx, gy + 0.7, bz, mStone);                              // 석단
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.2, 3.2, 0.2, cx + sx * 1.5, gy + 1.4 + 1.6, bz + sz * 1.1, mVerm);
    box(3.0, 2.6, 2.2, cx, gy + 1.4 + 1.5, bz, mWhite);
    {
      const rw = 2.6, rd = 1.9, base = gy + 1.4 + 3.0, peak = base + 1.9;
      const v = [[-rw, base, -rd], [rw, base, -rd], [rw, base, rd], [-rw, base, rd], [-rw + 0.2, peak, 0], [rw - 0.2, peak, 0]].flat();
      parts.push({ geo: roofGeo(v, cx, bz), mat: mDark });
    }
    collide(cx, bz, 2.2, 2.6, 1.7);
    // 옥담(玉垣): 본전 둘레 낮은 울타리
    for (const [w, d, ox, oz] of [[6, 0.08, 0, -2.2], [0.08, 4.4, -3, 0], [0.08, 4.4, 3, 0]] as [number, number, number, number][]) {
      box(w, 0.9, d, cx + ox, gy + 0.45, bz + oz, mVerm);
      collide(cx + ox, bz + oz, Math.max(w, 0.1) / 2, 0.45, Math.max(d, 0.1) / 2);
    }

    // ---------- 초즈야(手水舎): 경내 동쪽, 네 기둥 + 지붕 + 석조 수반 ----------
    {
      const tx = cx + 6.5, tz = hz0 + 2.5;
      const ty = ground.heightAt(tx, tz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.16, 2.4, 0.16, tx + sx * 1.2, ty + 1.2, tz + sz * 1.0, mTimber);
      const roof = new THREE.ConeGeometry(2.2, 0.9, 4); roof.rotateY(Math.PI / 4); roof.translate(tx, ty + 2.75, tz); parts.push({ geo: roof, mat: mDark });
      const basin = new THREE.CylinderGeometry(0.75, 0.65, 0.7, 12); basin.translate(tx, ty + 0.35, tz); parts.push({ geo: basin, mat: mStone });
      // 국자(柄杓) 막대
      box(0.9, 0.04, 0.04, tx + 0.1, ty + 0.75, tz - 0.5, mTimber, 0.4);
      this.chozuya.set(tx, ty, tz);
      physics.addStaticBox(new THREE.Vector3(tx, ty + 0.35, tz), new THREE.Vector3(0.75, 0.35, 0.75), q);
    }

    // ---------- 시메나와 삼나무(御神木): 경내 서쪽 거목 ----------
    {
      const kx = cx - 7, kz = hz0 + 1;
      const ky = ground.heightAt(kx, kz);
      const trunk = new THREE.CylinderGeometry(0.5, 0.75, 9, 12); trunk.translate(kx, ky + 4.5, kz); parts.push({ geo: trunk, mat: mTimber });
      // 시메나와(금줄): 토러스 + 시데(종이) 4장
      const rope = new THREE.TorusGeometry(0.78, 0.09, 8, 20); rope.rotateX(Math.PI / 2); rope.translate(kx, ky + 2.1, kz); parts.push({ geo: rope, mat: mat(0xc9b48a, 1.0) });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; box(0.16, 0.5, 0.02, kx + Math.cos(a) * 0.8, ky + 1.75, kz + Math.sin(a) * 0.8, mWhite, -a); }
      const crown = new THREE.ConeGeometry(3.2, 7, 9); crown.translate(kx, ky + 10.5, kz); parts.push({ geo: crown, mat: mat(0x0c1a10, 0.95) });
      physics.addStaticBox(new THREE.Vector3(kx, ky + 4.5, kz), new THREE.Vector3(0.7, 4.5, 0.7), q);
    }

    // ---------- 촛대 2: 배전 계단 좌우 ----------
    for (const sx of [-1, 1]) {
      const lx = cx + sx * 1.9, lz = hz0 + HD / 2 + 1.2;
      box(0.12, 1.1, 0.12, lx, gy + 0.55, lz, mDark);
      const c = new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8); c.translate(lx, gy + 1.2, lz); parts.push({ geo: c, mat: this.candleMat });
      const l = new THREE.PointLight(0xffa040, 1.4, 7, 2); l.position.set(lx, gy + 1.35, lz); l.castShadow = false;
      this.lights.push(l); this.group.add(l);
    }

    // ---------- 병합 (속성 세트를 맞추기 위해 전부 비인덱스로) ----------
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of parts) { if (!byMat.has(p.mat)) byMat.set(p.mat, []); byMat.get(p.mat)!.push(p.geo.index ? p.geo.toNonIndexed() : p.geo); }
    for (const [m, geos] of byMat) {
      const merged = mergeGeometries(geos, false); if (!merged) continue;
      merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, m); mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.group.name = 'shrine';
    scene.add(this.group);
  }

  update(dt: number) {
    this.t += dt;
    const f = 0.85 + 0.15 * Math.sin(this.t * 6.1) * Math.sin(this.t * 2.3);
    this.candleMat.emissiveIntensity = 0.9 * f;
    for (const l of this.lights) l.intensity = 1.4 * f;
  }
}

/** 맞배지붕: position/normal/uv 를 모두 갖춘 비인덱스 지오메트리 (BoxGeometry 와 병합 가능) */
function roofGeo(v: number[], x: number, z: number) {
  const idx = [0, 1, 5, 0, 5, 4, 2, 3, 4, 2, 4, 5, 0, 4, 3, 1, 2, 5];
  const pos: number[] = [], uv: number[] = [];
  for (const i of idx) { pos.push(v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!); uv.push(0, 0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.translate(x, 0, z);
  return g;
}
