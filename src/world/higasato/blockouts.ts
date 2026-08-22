import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { Props } from '@/world/props';
import { SITES, type HigasatoGround, type Site } from './ground';
import { PartsBuilder, textCanvas } from './kit';

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
  private b: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number };

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround, def: ShellDef) {
    const cx = def.site.x, cz = def.site.z;
    const w = def.site.w - 5, d = def.site.d - 5, h = def.h ?? 3.4;
    const gy = ground.heightAt(cx, cz);
    const k = new PartsBuilder(physics);
    const mWall = k.mat(0x2c241a, 0.95);
    const mTrim = k.mat(0x1f1811, 0.95);
    const mRoof = k.mat(0x15110e, 0.95);
    const mStone = k.mat(0x474b44, 1.0);
    const T = 0.14, DOOR_W = 1.6, DOOR_H = 2.2;

    this.b = { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, y0: gy, y1: gy + h + 0.4 };
    this.inner = new THREE.Vector3(cx, gy + 0.12, cz);

    // 기초 + 바닥
    k.box(w + 0.5, 0.24, d + 0.5, cx, gy + 0.12, cz, mStone);
    k.box(w, 0.1, d, cx, gy + 0.28, cz, mTrim);

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

    // 지붕 — 용마루는 긴 축 방향
    const ridgeAlongX = w >= d;
    k.gable(cx, cz, (ridgeAlongX ? w : d) / 2 + 0.7, (ridgeAlongX ? d : w) / 2 + 0.6, gy + h + 0.3, Math.min(2.2, h * 0.55), mRoof, ridgeAlongX ? 0 : Math.PI / 2);

    // 문 밖 지점 + 디딤돌
    const dir = def.door === 'x+' ? [1, 0] : def.door === 'x-' ? [-1, 0] : def.door === 'z+' ? [0, 1] : [0, -1];
    const ddx = dir[0]! * (w / 2), ddz = dir[1]! * (d / 2);
    this.doorPos = new THREE.Vector3(cx + ddx + dir[0]! * 1.5, gy, cz + ddz + dir[1]! * 1.5);
    k.box(1.4, 0.14, 0.9, cx + ddx + dir[0]! * 0.6, gy + 0.14, cz + ddz + dir[1]! * 0.6, mStone, Math.atan2(dir[0]!, dir[1]!));

    this.group.add(k.build(`shell-${def.id}`));

    // 문패
    if (def.name) {
      const tex = textCanvas(256, 64, (ctx) => {
        ctx.fillStyle = 'rgba(28, 22, 14, 0.92)'; ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = 'rgba(214, 202, 176, 0.85)';
        ctx.font = '600 34px "Noto Serif KR", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
}

/** 공동우물 — 지상부만 (수직 샤프트는 S2). 끊어진 금줄이 둘러져 있다 */
export class Well {
  readonly group = new THREE.Group();
  readonly pos: THREE.Vector3;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.well!;
    const cx = s.x, cz = s.z;
    const gy = ground.heightAt(cx, cz);
    this.pos = new THREE.Vector3(cx, gy, cz);
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
    const proc = k.build('well');
    this.group.add(proc);
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
}

/** 버스 종점 — 남쪽 금줄 게이트 너머, 닿을 수 없는 "온 길" (ACT 2 연출 무대) */
export class BusStop {
  readonly group = new THREE.Group();
  readonly pos: THREE.Vector3;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.terminus!;
    const cx = s.x + 4.2, cz = s.z + 2.0;
    const gy = ground.heightAt(cx, cz);
    this.pos = new THREE.Vector3(cx, gy, cz);
    const k = new PartsBuilder(physics);
    const mPole = k.mat(0x3a3d40, 0.6);
    const mWood = k.mat(0x2c2115, 0.9);
    // 표지 기둥 + 원판
    k.cyl(0.04, 0.05, 2.5, cx, gy + 1.25, cz, mPole, 8);
    const tex = textCanvas(192, 192, (ctx) => {
      ctx.fillStyle = '#2a2e33'; ctx.beginPath(); ctx.arc(96, 96, 92, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(210,200,180,0.7)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(96, 96, 84, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(220,210,190,0.9)'; ctx.textAlign = 'center';
      ctx.font = '700 30px "Noto Serif KR", serif'; ctx.fillText('彼ヶ里', 96, 84);
      ctx.font = '500 22px "Noto Serif KR", serif'; ctx.fillText('종 점', 96, 124);
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
    disc.position.set(cx, gy + 2.35, cz);
    // 글자면이 **남쪽(+z)** 을 본다 — 버스가 오는 쪽이자 내린 사람이 서는 쪽.
    // 뒤로 돌리면(π) 플레이어가 뒷면을 보게 되어 글자가 좌우로 뒤집힌다
    this.group.add(disc);
    // 벤치
    k.box(1.7, 0.09, 0.42, cx + 1.2, gy + 0.46, cz + 0.4, mWood, 0.1);
    for (const s of [-0.7, 0.7]) k.box(0.1, 0.44, 0.4, cx + 1.2 + s, gy + 0.22, cz + 0.4, mWood, 0.1);
    k.collide(cx + 1.2, gy + 0.3, cz + 0.4, 0.9, 0.3, 0.3);

    // 금줄 게이트 — 마을과 종점 사이. 항상 닫혀 있다 (온 길로는 돌아갈 수 없다, ACT 2)
    {
      const rp = ground.roadAt(4);
      const nx = -rp.dirZ, nz = rp.dirX;      // 게이트 선 = 길의 수직 방향
      const yawN = Math.atan2(-nz, nx);       // Ry(ψ): +x → (cosψ, 0, −sinψ) 이므로 ψ = atan2(−nz, nx)
      const gy2 = ground.heightAt(rp.x, rp.z);
      const mRope2 = k.mat(0xc9b48a, 1.0);
      for (const s of [-1, 1]) k.box(0.2, 2.3, 0.2, rp.x + nx * s * 2.2, gy2 + 1.15, rp.z + nz * s * 2.2, mWood);
      const rope3 = new THREE.CylinderGeometry(0.07, 0.07, 4.4, 8);
      rope3.rotateZ(Math.PI / 2);
      rope3.rotateY(yawN);
      rope3.translate(rp.x, gy2 + 2.0, rp.z);
      k.add(rope3, mRope2);
      for (const s of [-1, 0, 1]) k.box(0.18, 0.55, 0.02, rp.x + nx * s * 1.3, gy2 + 1.62, rp.z + nz * s * 1.3, k.mat(0xf2ede0, 0.95), Math.atan2(rp.dirX, rp.dirZ));
      k.collide(rp.x, gy2 + 1.2, rp.z, 2.4, 1.2, 0.15, yawN);
    }
    this.group.add(k.build('bus-stop'));
    scene.add(this.group);
  }
}
