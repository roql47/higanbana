import * as THREE from 'three';
import { L, serifFamily } from '@/core/i18n';
import type { Physics } from '@/core/physics';
import { Props } from '@/world/props';
import { SITES, type HigasatoGround, type Site } from './ground';
import { MIO_CLEAR_DOOR_HEIGHT, PartsBuilder, textCanvas } from './kit';

/**
 * 스토리 구역 블록아웃 (PLAN-STORY §2.3) — 폐교·폐여관·촌장 저택 셸 + 공동우물 + 버스 정류장.
 *
 * S1 시점의 목적: **맵이 스토리 맵으로 읽히게** 부지·매스·출입구·동선을 먼저 확정한다.
 * 실내 디테일(교실·거울 이중 상태·기록실)은 S2~S3 에서 각 셸을 전용 모듈로 승격하며 채운다.
 * 밤 + 초칭 반경에서는 실루엣과 개구부가 전부다 — 벽 널판·문패 정도만 얹는다.
 */

export interface ShellDef {
  id: 'school' | 'inn' | 'manor';
  name: string;        // 문패 (없으면 생략)
  /** 지형 설계에 들어 있는 부지 — 건물은 부지 안에 3 m 여유를 두고 앉는다 */
  site: Site;
  h?: number;
  /** 문이 나는 면 */
  door: 'x+' | 'x-' | 'z+' | 'z-';
}

export class Shell {
  readonly group = new THREE.Group();
  /** 실내 중심 바닥(월드) — 공물 임시 배치 지점 */
  readonly inner: THREE.Vector3;
  /** 문 밖 1.5 m 지점(월드) */
  readonly doorPos: THREE.Vector3;
  /** 공물 실물이 놓이는 전용 가구 위치. */
  readonly featurePos: THREE.Vector3;
  /** 폐여관 큰 거울 조사 지점. 다른 셸은 null. */
  readonly mirrorPos: THREE.Vector3 | null;
  /** 촌장 저택의 세 기록물. 다른 셸은 빈 배열. */
  readonly recordPositions: THREE.Vector3[] = [];
  private b: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number };
  private mirrorMat: THREE.MeshStandardMaterial | null = null;
  private mirrorGhostMat: THREE.MeshBasicMaterial | null = null;
  private mirrorHandMat: THREE.MeshBasicMaterial | null = null;
  private mirrorVision = 0;
  private manorGhostMat: THREE.MeshBasicMaterial | null = null;
  private manorEchoLight: THREE.PointLight | null = null;
  private manorEcho = 0;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround, def: ShellDef) {
    const cx = def.site.x, cz = def.site.z;
    const w = def.site.w - 5, d = def.site.d - 5, h = def.h ?? 3.4;
    const gy = ground.heightAt(cx, cz);
    const k = new PartsBuilder(physics);
    const mWall = k.mat(0x2c241a, 0.95);
    const mTrim = k.mat(0x1f1811, 0.95);
    const mRoof = k.mat(0x15110e, 0.95);
    const mStone = k.mat(0x474b44, 1.0);
    const T = 0.14, DOOR_W = 1.6, DOOR_H = MIO_CLEAR_DOOR_HEIGHT;

    this.b = { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, y0: gy, y1: gy + h + 0.4 };
    this.inner = new THREE.Vector3(cx, gy + 0.12, cz);
    this.featurePos = this.inner.clone();
    let mirrorPos: THREE.Vector3 | null = null;

    // 기초 + 바닥
    k.box(w + 0.5, 0.24, d + 0.5, cx, gy + 0.12, cz, mStone);
    k.box(w, 0.1, d, cx, gy + 0.28, cz, mTrim);
    /**
     * ⚠️ 마루를 **그리기만 하고 콜라이더를 안 달았다** — 플레이어가 지형(gy)에 서고 마루 윗면은
     * gy+0.33 이라, 실내에 들어서면 **가구가 33 cm 떠 보이고 본인은 마루에 잠긴다**(실측: 여관).
     * 폐교만 자기 모듈에서 따로 바닥 콜라이더를 달아 두어 이 버그를 피해 갔었다 —
     * 그래서 여관·저택 둘만 조용히 잠겨 있었다. 셸이 그린 바닥은 셸이 책임진다.
     */
    if (def.id !== 'school') k.collide(cx, gy + 0.28, cz, w / 2, 0.05, d / 2);

    // 스토리 가구는 별도 빌더 — Tripo 실물 도착 시 **가구만** 감춘다 (종이·앵커·좌표는 불변)
    const kFeat = new PartsBuilder(physics);
    if (def.id === 'inn') {
      // 불탄 객실의 화장대와 큰 거울. 손거울은 같은 방이지만 한 걸음 떨어진 상판에 둔다.
      const mx = cx + w / 2 - 0.24;
      kFeat.box(0.62, 0.76, 2.25, mx - 0.34, gy + 0.3 + 0.38, cz, mTrim);
      kFeat.collide(mx - 0.34, gy + 0.3 + 0.38, cz, 0.31, 0.38, 1.12);
      kFeat.box(0.82, 0.68, 0.82, mx - 1.55, gy + 0.3 + 0.34, cz + 1.85, mTrim);
      kFeat.collide(mx - 1.55, gy + 0.3 + 0.34, cz + 1.85, 0.41, 0.34, 0.41);
      mirrorPos = new THREE.Vector3(mx - 0.42, gy + 1.42, cz);
      this.featurePos.set(mx - 1.55, gy + 1.06, cz + 1.85);
    } else if (def.id === 'manor') {
      // 회의록·대체 의식·수색 명령을 한 덩어리 텍스트로 줍지 않고 방 안 세 책상으로 분산한다.
      const zs = [-2.1, 0, 2.1];
      for (let i = 0; i < zs.length; i++) {
        const px = cx - 1.25 + (i % 2) * 0.45, pz = cz + zs[i]!;
        kFeat.box(1.55, 0.72, 0.72, px, gy + 0.3 + 0.36, pz, mTrim);
        kFeat.collide(px, gy + 0.3 + 0.36, pz, 0.78, 0.36, 0.36);
        k.box(0.78, 0.025, 0.5, px, gy + 0.3 + 0.74, pz, mPaperForStory(k));
        this.recordPositions.push(new THREE.Vector3(px, gy + 1.1, pz));
      }
      kFeat.box(1.25, 0.86, 1.25, cx + 2.0, gy + 0.3 + 0.43, cz, mTrim);
      kFeat.collide(cx + 2.0, gy + 0.3 + 0.43, cz, 0.63, 0.43, 0.63);
      this.featurePos.set(cx + 2.0, gy + 1.22, cz);
    }
    this.mirrorPos = mirrorPos;

    // 벽 4면 — 문이 나는 면은 두 조각 + 인방
    const wall = (axis: 'x' | 'z', side: 1 | -1, hasDoor: boolean) => {
      const along = axis === 'x' ? d : w;           // 벽이 뻗는 길이
      const px = axis === 'x' ? cx + side * (w / 2 - T / 2) : cx;
      const pz = axis === 'x' ? cz : cz + side * (d / 2 - T / 2);
      const put = (len: number, off: number, y: number, hh: number) => {
        const ox = axis === 'x' ? px : cx + off;
        const oz = axis === 'x' ? cz + off : pz;
        const bw = axis === 'x' ? T : len;
        const bd = axis === 'x' ? len : T;
        k.box(bw, hh, bd, ox, y, oz, mWall);
        k.collide(ox, y, oz, bw / 2, hh / 2, bd / 2);
      };
      if (!hasDoor) { put(along, 0, gy + h / 2 + 0.3, h); return; }
      const seg = (along - DOOR_W) / 2;
      put(seg, -(DOOR_W / 2 + seg / 2), gy + h / 2 + 0.3, h);
      put(seg, DOOR_W / 2 + seg / 2, gy + h / 2 + 0.3, h);
      put(DOOR_W, 0, gy + 0.3 + DOOR_H + (h - DOOR_H) / 2, h - DOOR_H); // 인방
    };
    wall('x', 1, def.door === 'x+');
    wall('x', -1, def.door === 'x-');
    wall('z', 1, def.door === 'z+');
    wall('z', -1, def.door === 'z-');

    // 판자로 막은 창 (앞뒤 벽에 두 쌍) — 폐허의 문법
    for (const sz of [-1, 1]) for (const ox of [-w / 4, w / 4]) {
      k.box(1.1, 0.16, 0.06, cx + ox, gy + 1.7, cz + sz * (d / 2 + 0.02), mTrim, 0.06);
      k.box(1.1, 0.16, 0.06, cx + ox, gy + 1.35, cz + sz * (d / 2 + 0.02), mTrim, -0.08);
    }
    /**
     * 2층 셸 (h ≥ 5) — 높은 벽만으로는 "키 큰 창고"다. 층이 있다는 증거 둘을 얹는다:
     *   · **2층 바닥 슬래브** — 실내(1층 모듈)의 천장이 되고, 위의 검은 허공을 막는다.
     *     콜라이더는 없다 — 올라가는 동선 자체가 없고, 내브그리드에 영향을 주지 않기 위해
     *   · **위층 판자창 한 줄** — 밤 실루엣에서 층을 세게 하는 건 벽 높이가 아니라 창 줄이다
     */
    if (h >= 5) {
      k.box(w - 0.1, 0.14, d - 0.1, cx, gy + 3.1, cz, mTrim);
      for (const sz of [-1, 1]) for (const ox of [-w / 4, w / 4]) {
        k.box(1.1, 0.16, 0.06, cx + ox, gy + 4.65, cz + sz * (d / 2 + 0.02), mTrim, -0.05);
        k.box(1.1, 0.16, 0.06, cx + ox, gy + 4.3, cz + sz * (d / 2 + 0.02), mTrim, 0.07);
      }
    }

    // 지붕 — 용마루는 긴 축 방향
    const ridgeAlongX = w >= d;
    k.gable(cx, cz, (ridgeAlongX ? w : d) / 2 + 0.7, (ridgeAlongX ? d : w) / 2 + 0.6, gy + h + 0.3, Math.min(2.2, h * 0.55), mRoof, ridgeAlongX ? 0 : Math.PI / 2);

    // 문 밖 지점 + 디딤돌
    const dir = def.door === 'x+' ? [1, 0] : def.door === 'x-' ? [-1, 0] : def.door === 'z+' ? [0, 1] : [0, -1];
    const ddx = dir[0]! * (w / 2), ddz = dir[1]! * (d / 2);
    this.doorPos = new THREE.Vector3(cx + ddx + dir[0]! * 1.5, gy, cz + ddz + dir[1]! * 1.5);
    k.box(1.4, 0.14, 0.9, cx + ddx + dir[0]! * 0.6, gy + 0.14, cz + ddz + dir[1]! * 0.6, mStone, Math.atan2(dir[0]!, dir[1]!));

    // 외피는 방 단위보다 크게 묶는다. 7 m 셀은 마을 전경에서 지붕·벽을 지나치게 잘게
    // 쪼개 드로우콜이 늘었다. 14 m면 건물 면 단위 컬링은 남고 실루엣은 완전히 동일하다.
    this.group.add(k.build(`shell-${def.id}`, { spatialCellSize: 14 }));

    /**
     * 스토리 가구 실물화 — 화장대·손거울 받침(여관) = 단스 2벌, 기록 책상 3(저택) = 서안,
     * 봉인패 장(저택) = 불단. **상판 높이를 절차 박스와 정확히 맞춰** 정규화한다 —
     * 종이 평면·featurePos·recordPositions 가 그 높이에 굳어 있다 (main.ts 가 초기화 때 읽는다).
     */
    if (def.id === 'inn' || def.id === 'manor') {
      const featProc = kFeat.build(`shell-${def.id}-feat`);
      this.group.add(featProc);
      const longToZ = (m: THREE.Group) => {
        const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
        if (s.x > s.z) m.rotation.y = Math.PI / 2;
        return m;
      };
      if (def.id === 'inn') {
        const mx = cx + w / 2 - 0.24;
        void Props.loadNormalized('/models/props/tansu.glb', 0.76, 0.5).then((t) => {
          const vanity = longToZ(t.clone(true));
          vanity.position.set(mx - 0.34, gy + 0.31, cz);
          this.group.add(vanity);
          const stand = t.clone(true);
          stand.scale.multiplyScalar(0.68 / 0.76);
          stand.position.set(mx - 1.55, gy + 0.31, cz + 1.85);
          this.group.add(stand);
          featProc.visible = false;
        }).catch(() => { /* 모델 없으면 박스 유지 */ });
      } else {
        void Promise.all([
          Props.loadNormalized('/models/props/writing-desk.glb', 0.72, 0.5),
          Props.loadNormalized('/models/props/butsudan.glb', 1.42, 0.55),
        ]).then(([deskT, butsu]) => {
          const zs = [-2.1, 0, 2.1];
          for (let i = 0; i < zs.length; i++) {
            const m = deskT.clone(true);
            const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
            if (s.z > s.x) m.rotation.y = Math.PI / 2;   // 긴 변을 x 로 (절차 박스 1.55 방향)
            m.position.set(cx - 1.25 + (i % 2) * 0.45, gy + 0.31, cz + zs[i]!);
            this.group.add(m);
          }
          const bs = new THREE.Box3().setFromObject(butsu).getSize(new THREE.Vector3());
          butsu.scale.multiplyScalar(Math.min(1, 1.35 / Math.max(bs.x, bs.z)));
          butsu.position.set(cx + 2.0, gy + 0.31, cz);
          butsu.rotation.y = -Math.PI / 2;               // 문이 서쪽(대청)을 본다
          this.group.add(butsu);
          featProc.visible = false;
        }).catch(() => { /* 모델 없으면 박스 유지 */ });
      }
    }

    if (mirrorPos) {
      this.mirrorMat = new THREE.MeshStandardMaterial({
        color: 0x11171b,
        emissive: new THREE.Color(0xffad75),
        emissiveIntensity: 0,
        roughness: 0.22,
        metalness: 0.55,
      });
      const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.75), this.mirrorMat);
      mirror.position.set(cx + w / 2 - 0.16, gy + 1.48, cz);
      mirror.rotation.y = -Math.PI / 2;
      this.group.add(mirror);
      for (const z of [cz - 1.27, cz + 1.27]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.08, 0.12), mTrim);
        rail.position.set(cx + w / 2 - 0.10, gy + 1.48, z); this.group.add(rail);
      }
      for (const y of [gy + 0.48, gy + 2.48]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.66), mTrim);
        rail.position.set(cx + w / 2 - 0.10, y, cz); this.group.add(rail);
      }

      this.mirrorGhostMat = new THREE.MeshBasicMaterial({ color: 0xf3bd83, transparent: true, opacity: 0, depthWrite: false });
      for (let i = 0; i < 5; i++) {
        const child = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.58, 8), this.mirrorGhostMat);
        body.position.y = 0.29; child.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 7), this.mirrorGhostMat);
        head.position.y = 0.7; child.add(head);
        child.position.set(cx + w / 2 - 0.23, gy + 0.78 + (i % 2) * 0.17, cz - 0.78 + i * 0.38);
        child.rotation.y = -Math.PI / 2;
        this.group.add(child);
      }
      // 어린 미오가 유리 너머에 남기는 손바닥 자국: 손바닥 1 + 손가락 5.
      this.mirrorHandMat = new THREE.MeshBasicMaterial({ color: 0x7a2224, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const palm = new THREE.Mesh(new THREE.CircleGeometry(0.105, 14), this.mirrorHandMat);
      palm.scale.set(0.8, 1, 1); palm.position.set(cx + w / 2 - 0.245, gy + 1.43, cz - 0.27); palm.rotation.y = -Math.PI / 2; this.group.add(palm);
      for (let i = 0; i < 5; i++) {
        const finger = new THREE.Mesh(new THREE.CircleGeometry(0.032, 10), this.mirrorHandMat);
        finger.scale.set(0.7, 1.5, 1);
        finger.position.set(cx + w / 2 - 0.25, gy + 1.53 + Math.abs(i - 2) * -0.015, cz - 0.39 + i * 0.055);
        finger.rotation.y = -Math.PI / 2; this.group.add(finger);
      }
    }

    if (def.id === 'manor') {
      this.manorGhostMat = new THREE.MeshBasicMaterial({ color: 0xe5b078, transparent: true, opacity: 0, depthWrite: false });
      for (let i = 0; i < 6; i++) {
        const ghost = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.72, 4, 8), this.manorGhostMat);
        ghost.position.set(cx - 2.5 + i, gy + 1.05, cz + (i % 2 ? 2.6 : -2.6));
        this.group.add(ghost);
      }
      this.manorEchoLight = new THREE.PointLight(0xffa45d, 0, 11, 1.8);
      this.manorEchoLight.position.set(cx, gy + 2.2, cz);
      this.group.add(this.manorEchoLight);
    }

    // 문패
    if (def.name) {
      const tex = textCanvas(256, 64, (ctx) => {
        ctx.fillStyle = 'rgba(28, 22, 14, 0.92)'; ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = 'rgba(214, 202, 176, 0.85)';
        ctx.font = `600 34px ${serifFamily()}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(def.name, 128, 34);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      sign.position.set(cx + ddx + dir[0]! * 0.09, gy + 0.3 + DOOR_H + 0.35, cz + ddz + dir[1]! * 0.09);
      sign.rotation.y = Math.atan2(dir[0]!, dir[1]!);
      this.group.add(sign);
    }
    scene.add(this.group);
  }

  contains(p: THREE.Vector3): boolean {
    return p.x > this.b.x0 && p.x < this.b.x1 && p.z > this.b.z0 && p.z < this.b.z1 && p.y > this.b.y0 - 1 && p.y < this.b.y1;
  }

  showMirrorMemory(seconds = 10) { if (this.mirrorMat) this.mirrorVision = Math.max(this.mirrorVision, seconds); }

  showPastEcho(seconds = 10) { if (this.manorGhostMat) this.manorEcho = Math.max(this.manorEcho, seconds); }

  update(dt: number) {
    if (this.mirrorMat && this.mirrorGhostMat && this.mirrorHandMat) {
      this.mirrorVision = Math.max(0, this.mirrorVision - dt);
      const on = this.mirrorVision > 0 ? 1 : 0;
      this.mirrorMat.emissiveIntensity += (on * 0.72 - this.mirrorMat.emissiveIntensity) * (1 - Math.exp(-dt * 4));
      this.mirrorGhostMat.opacity += (on * 0.42 - this.mirrorGhostMat.opacity) * (1 - Math.exp(-dt * 3));
      this.mirrorHandMat.opacity += (on * 0.58 - this.mirrorHandMat.opacity) * (1 - Math.exp(-dt * 5));
    }
    if (this.manorGhostMat && this.manorEchoLight) {
      this.manorEcho = Math.max(0, this.manorEcho - dt);
      const on = this.manorEcho > 0 ? 1 : 0;
      this.manorGhostMat.opacity += (on * 0.34 - this.manorGhostMat.opacity) * (1 - Math.exp(-dt * 2.6));
      this.manorEchoLight.intensity += (on * 2.4 - this.manorEchoLight.intensity) * (1 - Math.exp(-dt * 3));
    }
  }
}

/** 기록지 한 장만을 위한 저채도 종이 재질. PartsBuilder 캐시에 섞지 않아도 세 장뿐이다. */
function mPaperForStory(k: PartsBuilder) { return k.mat(0xaba28f, 0.96); }

/** 공동우물 — 지상부만 (수직 샤프트는 S2). 끊어진 금줄이 둘러져 있다 */
export class Well {
  readonly group = new THREE.Group();
  readonly pos: THREE.Vector3;
  /** 끊어진 금줄 말뚝에 남은 구조용 매듭 — 선택 복선 조사점. */
  readonly ropeKnotPos: THREE.Vector3;
  private face: THREE.Group;
  private faceMat: THREE.MeshBasicMaterial;
  private eyeMat: THREE.MeshBasicMaterial;
  private faceFlash = 0;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.well!;
    const cx = s.x, cz = s.z;
    const gy = ground.heightAt(cx, cz);
    this.pos = new THREE.Vector3(cx, gy, cz);
    this.ropeKnotPos = new THREE.Vector3(cx + 1.9, gy + 0.78, cz + 0.9);
    const k = new PartsBuilder(physics);
    const mStone = k.mat(0x4b4f48, 1.0);
    const mTimber = k.mat(0x2c2115, 0.9);
    const mRope = k.mat(0xb5a074, 1.0);
    // 우물통(석조 링) — 8각 낮은 벽
    k.cyl(0.95, 1.05, 0.85, cx, gy + 0.42, cz, mStone, 8);
    k.cyl(0.78, 0.78, 0.9, cx, gy + 0.46, cz, k.mat(0x0a0c0e, 1.0), 8); // 어두운 구멍
    k.collide(cx, gy + 0.45, cz, 1.0, 0.45, 1.0);
    // 두레박틀: 기둥 2 + 도리 + 지붕
    for (const sx of [-1, 1]) k.box(0.14, 2.2, 0.14, cx + sx * 1.15, gy + 1.1, cz, mTimber);
    k.box(2.5, 0.12, 0.12, cx, gy + 2.2, cz, mTimber);
    k.gable(cx, cz, 1.7, 1.1, gy + 2.28, 0.7, k.mat(0x171310, 0.95), 0);
    // 늘어진 두레박줄
    const rope = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6); rope.translate(cx, gy + 1.55, cz); k.add(rope, mRope);
    // 끊어진 금줄: 말뚝 둘 + 쳐진 줄 반쪽
    for (const [ox, oz] of [[-1.9, 0.9], [1.9, 0.9]] as [number, number][]) k.box(0.1, 1.0, 0.1, cx + ox, gy + 0.5, cz + oz, mTimber);
    const r2 = new THREE.CylinderGeometry(0.035, 0.035, 1.7, 6); r2.rotateZ(Math.PI / 2 - 0.35); r2.translate(cx - 1.0, gy + 0.75, cz + 0.9); k.add(r2, mRope);
    // 반대쪽 말뚝에는 매듭만 남았다. 손목을 조이는 올가미가 아니라 몸 아래를 받치는 이중 고리다.
    const rescueLoop = new THREE.TorusGeometry(0.12, 0.026, 6, 14);
    rescueLoop.rotateY(0.18);
    rescueLoop.translate(this.ropeKnotPos.x, this.ropeKnotPos.y, this.ropeKnotPos.z + 0.04);
    k.add(rescueLoop, mRope);
    for (const sx of [-1, 1]) {
      const tail = new THREE.BoxGeometry(0.035, 0.38, 0.028);
      tail.rotateZ(sx * 0.18);
      tail.translate(this.ropeKnotPos.x + sx * 0.055, this.ropeKnotPos.y - 0.19, this.ropeKnotPos.z + 0.04);
      k.add(tail, mRope);
    }
    const proc = k.build('well');
    this.group.add(proc);

    // ACT 10 선행 징후 — 자막 속 얼굴이 아니라, 우물 안에서 실제로 한 번 떠오르는 아이 얼굴.
    // 수면과 같은 수평면에 놓아 플레이어가 우물 가장자리에서 내려다볼 때만 읽힌다.
    this.face = new THREE.Group();
    this.face.position.set(cx, gy + 0.56, cz);
    this.face.rotation.x = -Math.PI / 2;
    this.faceMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c4, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x090909, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const oval = new THREE.Mesh(new THREE.CircleGeometry(0.25, 24), this.faceMat);
    oval.scale.set(0.72, 1, 1); this.face.add(oval);
    for (const x of [-0.075, 0.075]) {
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.027, 10), this.eyeMat);
      eye.position.set(x, 0.045, 0.006); this.face.add(eye);
    }
    this.face.visible = false;
    this.group.add(this.face);
    /**
     * **우물은 들여다보는 물건이다** — 조사 지점이라 카메라가 1 m 앞까지 온다.
     * 그래서 지상부는 Tripo 모델로 바꾼다. 절차적 우물을 먼저 세워 두고 도착하면 감춘다:
     * 콜라이더(`k.collide`)는 이미 물리에 들어갔고 둘의 발자국이 같으므로 그대로 둔다.
     * 어두운 구멍만은 절차적 원기둥을 남긴다 — 모델의 안쪽은 막혀 있어 「깊이」가 없다.
     */
    void Props.loadNormalized('/models/props/well.glb', 2.5, 0.5).then((m) => {
      m.position.set(cx, gy - 0.02, cz);
      this.group.add(m);
      proc.visible = false;
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 1.2, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x05070a, side: THREE.BackSide }),
      );
      hole.position.set(cx, gy + 0.35, cz);
      this.group.add(hole);
    }).catch((e) => console.warn('[well] 모델 로드 실패 — 절차적 우물 유지:', e));
    scene.add(this.group);
  }

  flashFace() {
    this.faceFlash = 1.25;
    this.face.visible = true;
  }

  update(dt: number) {
    if (this.faceFlash <= 0) return;
    this.faceFlash = Math.max(0, this.faceFlash - dt);
    const u = 1 - this.faceFlash / 1.25;
    const a = Math.sin(u * Math.PI) * (1 - u * 0.35);
    this.faceMat.opacity = a * 0.58;
    this.eyeMat.opacity = a * 0.78;
    this.face.scale.setScalar(0.92 + u * 0.14);
    if (this.faceFlash === 0) this.face.visible = false;
  }
}

/** 버스 종점 — 남쪽 금줄 게이트 너머, 닿을 수 없는 "온 길" (ACT 2 연출 무대) */
export class BusStop {
  readonly group = new THREE.Group();
  readonly pos: THREE.Vector3;
  /** 표지 기둥 아래 빛바랜 운행표 — 선택 복선 조사점. */
  readonly schedulePos: THREE.Vector3;
  private readonly assetsReady: Promise<void>;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.terminus!;
    const cx = s.x + 4.2, cz = s.z + 2.0;
    const gy = ground.heightAt(cx, cz);
    this.pos = new THREE.Vector3(cx, gy, cz);
    this.schedulePos = new THREE.Vector3(cx, gy + 1.38, cz + 0.026);
    const k = new PartsBuilder(physics);
    // 표지·벤치는 Tripo 모델이 도착하면 각각만 감춰야 한다. 게이트까지 한 메시에 병합하면
    // 어느 하나의 로드 성공이 나머지 폴백까지 지워 버리므로 빌더를 분리한다.
    const kMarker = new PartsBuilder(physics);
    const kBench = new PartsBuilder(physics);
    const kGatePaper = new PartsBuilder(physics, { ghost: true });
    const mPole = k.mat(0x3a3d40, 0.6);
    const mWood = k.mat(0x2c2115, 0.9);
    // 표지 기둥 + 원판. 기둥은 원판의 아래 테두리까지만 올라가고 뒤쪽 브래킷이 받친다.
    // 예전 2.5 m 통기둥은 원판 한가운데를 관통해 「종점」 글자를 세로로 가렸다.
    kMarker.cyl(0.04, 0.05, 1.94, cx, gy + 0.97, cz - 0.055, mPole, 8);
    const tex = textCanvas(192, 192, (ctx) => {
      ctx.fillStyle = '#2a2e33'; ctx.beginPath(); ctx.arc(96, 96, 92, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(210,200,180,0.7)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(96, 96, 84, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(220,210,190,0.9)'; ctx.textAlign = 'center';
      ctx.font = `700 30px ${serifFamily()}`; ctx.fillText(L('히가사토', '彼ヶ里'), 96, 84);
      ctx.font = `500 22px ${serifFamily()}`; ctx.fillText(L('종 점', '終 点'), 96, 124);
    });
    // 얇은 판 한 장 대신 금속 뒷통과 테두리를 둔다. 앞면이 기둥보다 6cm 앞으로 나와 글자가 가려지지 않는다.
    const discBack = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.055, 32), mPole);
    discBack.rotation.x = Math.PI / 2;
    discBack.position.set(cx, gy + 2.35, cz - 0.035);
    this.group.add(discBack);
    kMarker.box(0.09, 0.48, 0.07, cx, gy + 2.06, cz - 0.065, mPole);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.FrontSide }));
    disc.position.set(cx, gy + 2.35, cz + 0.004);
    // 글자면이 **남쪽(+z)** 을 본다 — 버스가 오는 쪽이자 내린 사람이 서는 쪽.
    // 뒤로 돌리면(π) 플레이어가 뒷면을 보게 되어 글자가 좌우로 뒤집힌다
    this.group.add(disc);
    // 운행표. 멀리서는 시간표로만 읽히고, 문구의 의미는 조사 대사가 완성한다.
    kMarker.box(0.62, 0.78, 0.045, cx, gy + 1.38, cz, mPole);
    const scheduleTex = textCanvas(320, 420, (ctx) => {
      ctx.fillStyle = '#b9b19d'; ctx.fillRect(0, 0, 320, 420);
      ctx.fillStyle = 'rgba(54,45,36,0.18)';
      for (let i = 0; i < 18; i++) ctx.fillRect((i * 83) % 300, (i * 47) % 400, 20 + (i % 4) * 12, 3);
      ctx.strokeStyle = 'rgba(47,40,32,0.72)'; ctx.lineWidth = 3;
      ctx.strokeRect(16, 15, 288, 390);
      ctx.fillStyle = '#28241e'; ctx.textAlign = 'center';
      ctx.font = `700 30px ${serifFamily()}`;
      ctx.fillText(L('히가사토 종점', '彼ヶ里 終点'), 160, 56);
      ctx.font = `500 22px ${serifFamily()}`;
      for (const [i, t] of ['16:40', '17:20', '17:55'].entries()) {
        ctx.globalAlpha = 0.35;
        ctx.fillText(`—  ${t}  —`, 160, 118 + i * 58);
        ctx.beginPath(); ctx.moveTo(38, 136 + i * 58); ctx.lineTo(282, 136 + i * 58); ctx.stroke();
      }
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = '#5c1717';
      ctx.font = `700 24px ${serifFamily()}`;
      ctx.fillText(L('9/23  18:12  편도', '9/23  18:12  片道'), 160, 326);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(36,30,24,0.72)';
      ctx.font = `500 18px ${serifFamily()}`;
      ctx.fillText(L('승객  1', '乗客  一名'), 160, 370);
    });
    const schedule = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.7),
      new THREE.MeshStandardMaterial({ map: scheduleTex, roughness: 0.96, side: THREE.DoubleSide }),
    );
    schedule.position.copy(this.schedulePos);
    this.group.add(schedule);
    // 벤치
    kBench.box(1.7, 0.09, 0.42, cx + 1.2, gy + 0.46, cz + 0.4, mWood, 0.1);
    for (const s of [-0.7, 0.7]) kBench.box(0.1, 0.44, 0.4, cx + 1.2 + s, gy + 0.22, cz + 0.4, mWood, 0.1);
    k.collide(cx + 1.2, gy + 0.3, cz + 0.4, 0.9, 0.3, 0.3);

    // 금줄 게이트 — 마을과 종점 사이. 항상 닫혀 있다 (온 길로는 돌아갈 수 없다, ACT 2)
    const gatePose = { x: 0, y: 0, z: 0, yaw: 0 };
    {
      const rp = ground.roadAt(4);
      const nx = -rp.dirZ, nz = rp.dirX;      // 게이트 선 = 길의 수직 방향
      const yawN = Math.atan2(-nz, nx);       // Ry(ψ): +x → (cosψ, 0, −sinψ) 이므로 ψ = atan2(−nz, nx)
      const gy2 = ground.heightAt(rp.x, rp.z);
      Object.assign(gatePose, { x: rp.x, y: gy2, z: rp.z, yaw: yawN });
      const mRope2 = k.mat(0xc9b48a, 1.0);
      for (const s of [-1, 1]) k.box(0.2, 2.3, 0.2, rp.x + nx * s * 2.2, gy2 + 1.15, rp.z + nz * s * 2.2, mWood);
      const rope3 = new THREE.CylinderGeometry(0.07, 0.07, 4.4, 8);
      rope3.rotateZ(Math.PI / 2);
      rope3.rotateY(yawN);
      rope3.translate(rp.x, gy2 + 2.0, rp.z);
      k.add(rope3, mRope2);
      // 흰 시데는 밤에도 경계의 의미가 즉시 읽혀야 한다. 생성본의 얇은 종이는 조명 각도에 따라
      // 거의 검게 사라지므로, 기존 저비용 양면 실루엣을 Tripo 금줄 위에 계속 유지한다.
      for (const s of [-1, 0, 1]) kGatePaper.box(0.18, 0.55, 0.02, rp.x + nx * s * 1.3, gy2 + 1.62, rp.z + nz * s * 1.3, k.mat(0xf2ede0, 0.95), Math.atan2(rp.dirX, rp.dirZ));
      k.collide(rp.x, gy2 + 1.2, rp.z, 2.4, 1.2, 0.15, yawN);
    }
    const markerFallback = kMarker.build('bus-stop-marker-fallback');
    markerFallback.add(discBack);
    this.group.add(markerFallback);
    const benchFallback = kBench.build('bus-stop-bench-fallback');
    this.group.add(benchFallback);
    const gateFallback = k.build('bus-stop-gate-fallback');
    this.group.add(gateFallback);
    this.group.add(kGatePaper.build('bus-stop-gate-shide'));

    const markerLoad = Props.loadNormalized('/models/props/bus-stop-marker.glb', 2.82, 0.82).then((marker) => {
      marker.name = 'bus-stop-marker-tripo';
      marker.position.set(cx, gy, cz - 0.035);
      marker.updateMatrixWorld(true);
      const depth = new THREE.Box3().setFromObject(marker).getSize(new THREE.Vector3()).z;
      // Tripo 외형 위에 기존 캔버스 글자만 얹는다. 생성형 모델에 글자를 맡기면 한·일문이 깨진다.
      const faceZ = cz - 0.035 + depth / 2 + 0.008;
      disc.position.set(cx, gy + 2.47, faceZ);
      disc.scale.setScalar(0.84);
      schedule.position.set(cx, gy + 1.57, faceZ + 0.003);
      this.schedulePos.copy(schedule.position);
      this.group.add(marker);
      markerFallback.visible = false;
    }).catch((e) => console.warn('[bus-stop] Tripo 표지 로드 실패 — 절차 폴백 유지:', e));

    const benchLoad = Props.loadNormalized('/models/props/bus-stop-bench.glb', 1.02, 0.78).then((bench) => {
      bench.name = 'bus-stop-bench-tripo';
      // 생성본은 2인용 폭이 조금 짧다. 높이·착석면은 유지하고 가로만 종점 규격(약 1.7 m)에 맞춘다.
      bench.scale.x *= 1.2;
      bench.rotation.y = 0.1;
      bench.position.set(cx + 1.2, gy, cz + 0.4);
      this.group.add(bench);
      benchFallback.visible = false;
    }).catch((e) => console.warn('[bus-stop] Tripo 벤치 로드 실패 — 절차 폴백 유지:', e));

    // 금줄은 아래 `loadAssets()` 에서 세 번째 모델로 교체한다. 위치·회전은 게이트 빌드 때
    // 저장한 userData 를 사용하므로 길이 바뀌어도 collider와 플레이 경계는 그대로다.
    const gateLoad = Props.loadNormalized('/models/props/shimenawa-gate.glb', 2.55, 0.96).then((gate) => {
      gate.name = 'bus-stop-shimenawa-gate-tripo';
      // Tripo 생성본의 흰 시데는 얇은 단면이다. 플레이어는 게이트 양쪽을 모두 보므로
      // 뒷면 컬링을 끄고, 생성 정면(-z)을 버스가 서는 남쪽(+z)으로 돌린다.
      gate.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) { mat.side = THREE.DoubleSide; mat.needsUpdate = true; }
      });
      gate.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(gate).getSize(new THREE.Vector3());
      // 이 생성본의 가로축은 로컬 Z다(source X 0.15 / Z 1.0). X로 늘리면 얇은 깊이가
      // 11배 부풀어 검은 벽이 된다. Z를 4.4 m로 맞추고, 기존 X축 게이트 yaw에 90°를 더한다.
      if (size.z > 0.01) gate.scale.z *= 4.4 / size.z;
      gate.rotation.y = gatePose.yaw + Math.PI / 2;
      gate.position.set(gatePose.x, gatePose.y, gatePose.z);
      this.group.add(gate);
      gateFallback.visible = false;
    }).catch((e) => console.warn('[bus-stop] Tripo 금줄 로드 실패 — 절차 폴백 유지:', e));

    this.assetsReady = Promise.all([markerLoad, benchLoad, gateLoad]).then(() => undefined);
    scene.add(this.group);
  }

  /** 로딩 화면 안에서 종점 실물을 전부 준비해, 하차 카메라가 처음 볼 때 업로드 히치가 없게 한다. */
  loadAssets() { return this.assetsReady; }
}
