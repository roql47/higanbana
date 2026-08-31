import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { Props } from '@/world/props';
import { SITES, type HigasatoGround } from './ground';
import { makePartitions, PartsBuilder } from './kit';

/**
 * 촌장 저택 실내 — 제문과 봉인패(공물 6)·기록의 무대 (PLAN-STORY §2.3, ACT 14~16)
 *
 * 셸(`blockouts.ts`)이 외피·기록 책상 3·봉인패 장(→불단)을 맡고, 이 모듈이 방을 채운다.
 * 셸의 스토리 가구는 전부 **대청**(가운데 큰 방)에 있으므로, 칸막이는 그 둘레로만 두른다:
 *
 *   서재(북) — 서가·서안
 *   현관 | 대청 (기록 책상 3 + 불단) | 지하 계단실(동)
 *   안방(남) — 장롱·이불
 *
 * 지하 기록실 자체는 후속 공정(ACT 16 문서 열람) — 여기는 **닫힌 마루 뚜껑**만 놓는다.
 * 조명은 없다. 저택의 빛도 플레이어의 초칭뿐이다 (불단의 메아리 빛은 셸이 관리).
 */
export class ManorInterior {
  readonly group = new THREE.Group();
  /** 지하 기록실 마루 뚜껑 — ACT 15~16 개방 지점 (조사 지문 자리) */
  readonly hatchPos: THREE.Vector3;
  /** 지하 기록실 — 사다리 발치(하강 연출 텔레포트 도착점, 우물 `landing` 문법) */
  readonly archiveEnter: THREE.Vector3;
  /** 기록 열람 지점 셋 — [0] 명부 수첩 · [1] 회의록 책더미 · [2] 봉인표 열 (ACT 15 선택 조사) */
  readonly archivePositions: THREE.Vector3[] = [];
  /** 기록실 바닥 y — killY 가드 산정용 */
  readonly archiveFloorY: number;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.manor!;
    const cx = s.x, cz = s.z;
    const w = s.w - 5, d = s.d - 5;            // 셸과 같은 산식 (14 × 10)
    const gy = ground.heightAt(cx, cz);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const floorY = gy + 0.33;

    const k = new PartsBuilder(physics);
    const mWall = k.mat(0x3a3129, 0.95);
    const mWood = k.mat(0x2a211a, 0.9);
    const mDark = k.mat(0x1b150f, 0.9);
    const { partX, partZ } = makePartitions(k, mWall, floorY);

    // ---------- 평면 — 셸의 기록 책상(cx−1.25±0.45, cz±2.1)·불단(cx+2)이 대청에 남게 두른다 ----------
    const genkan = x0 + 2.6;                   // 현관 | 대청
    const stairE = x0 + 10.8;                  // 대청 | 지하 계단실
    const studyZ = cz - 2.6;                   // 서재 남벽
    const roomZ = cz + 2.6;                    // 안방 북벽
    partX(genkan, z0, z1, cz);                 // 현관 → 대청 (정문과 같은 축)
    partX(stairE, z0, z1, cz);                 // 대청 → 계단실
    partZ(studyZ, genkan, stairE, genkan + 0.9);   // 서재 문 — 서쪽 끝(책상 열을 피한다)
    partZ(roomZ, genkan, stairE, stairE - 1.2);    // 안방 문 — 동쪽 끝
    /**
     * 1층 천장 — 칸막이 위 검은 허공을 막는다. 저택이 2층(h 6.6)이 된 뒤로 셸도 gy+3.1 에
     * 2층 바닥 슬래브를 깔지만, **이 천장은 그대로 둔다**: 실내가 보는 면은 실내가 책임진다는
     * 규칙이고(셸의 마루 콜라이더 사고와 같은 교훈), 셸의 슬래브는 `h ≥ 5` 분기에 묶여 있어
     * 높이를 되돌리면 조용히 사라진다. 15 cm 떨어져 있어 겹침도 없다.
     */
    k.box(w - 0.1, 0.12, d - 0.1, cx, gy + 2.95, cz, mDark);

    // ---------- 가구 (kFurn — 실물 도착 시 통째로 감춘다) ----------
    const kFurn = new PartsBuilder(physics);
    // 서재: 북벽에 서가 셋 + 서안 하나
    const shelfSpots: { x: number; z: number; yaw: number; y?: number }[] = [];
    for (const sx of [genkan + 1.6, genkan + 3.5, genkan + 5.4]) {
      kFurn.box(1.5, 1.8, 0.45, sx, floorY + 0.9, z0 + 0.33, mWood);
      kFurn.collide(sx, floorY + 0.9, z0 + 0.33, 0.75, 0.9, 0.23);
      shelfSpots.push({ x: sx, z: z0 + 0.33, yaw: 0 });
    }
    const wdX = stairE - 1.3, wdZ = z0 + 0.85;
    kFurn.box(1.1, 0.4, 0.55, wdX, floorY + 0.2, wdZ, mWood);
    kFurn.collide(wdX, floorY + 0.2, wdZ, 0.55, 0.2, 0.28);
    // 안방: 남벽 장롱 + 이불
    const tanX = genkan + 1.4, tanZ = z1 - 0.62;
    kFurn.box(1.3, 1.1, 0.55, tanX, floorY + 0.55, tanZ, mWood);
    kFurn.collide(tanX, floorY + 0.55, tanZ, 0.65, 0.55, 0.28);
    const fuX = genkan + 4.2, fuZ = z1 - 1.15;
    kFurn.box(0.72, 0.4, 0.95, fuX, floorY + 0.2, fuZ, mWall, 0.2);
    kFurn.collide(fuX, floorY + 0.2, fuZ, 0.36, 0.2, 0.48, 0.2);
    // 계단실: 마루 뚜껑(닫힘) + 서가 하나
    const haX = (stairE + x1) / 2, haZ = cz + 0.4;
    k.box(1.35, 0.09, 1.35, haX, floorY + 0.045, haZ, mDark);
    for (const dz of [-0.38, 0, 0.38]) k.box(1.2, 0.035, 0.3, haX, floorY + 0.1, haZ + dz, mWood);
    this.hatchPos = new THREE.Vector3(haX, floorY + 0.1, haZ);
    kFurn.box(1.5, 1.8, 0.45, x1 - 0.33, floorY + 0.9, cz - 1.9, mWood, Math.PI / 2);
    kFurn.collide(x1 - 0.33, floorY + 0.9, cz - 1.9, 0.23, 0.9, 0.75);
    shelfSpots.push({ x: x1 - 0.33, z: cz - 1.9, yaw: Math.PI / 2 });

    // ---------- 지하 기록실 (ACT 16 「기록」의 무대) ----------
    // 마루 뚜껑(hatchPos) 바로 아래. 개방·하강 연출은 스토리 공정 — 여기는 **공간·앵커**만 세운다
    // (우물 지하 석실과 같은 분업: wellShaft 가 방을, story 가 하강을 맡았다).
    const bF = gy - 3.0;                                  // 기록실 바닥
    const bx0 = x0 + 8.4, bx1 = x1 - 0.4, bz0 = cz - 2.4, bz1 = cz + 2.4;
    const bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2;
    const mStone = k.mat(0x353a34, 1.0);
    // 바닥·천장(위층 마루 밑)·벽 4면 — 흙벽을 돌로 두른 반지하 곳간의 문법
    k.box(bx1 - bx0 + 1.0, 0.3, bz1 - bz0 + 1.0, bcx, bF - 0.15, bcz, mStone);
    k.collide(bcx, bF - 0.15, bcz, (bx1 - bx0) / 2 + 0.5, 0.15, (bz1 - bz0) / 2 + 0.5);
    k.box(bx1 - bx0 + 1.0, 0.2, bz1 - bz0 + 1.0, bcx, gy + 0.05, bcz, mDark);
    const bH = gy + 0.05 - bF;                            // 천장고 ~3.0
    const bwall = (w2: number, d2: number, px: number, pz: number) => {
      k.box(w2, bH, d2, px, bF + bH / 2, pz, mStone);
      k.collide(px, bF + bH / 2, pz, w2 / 2, bH / 2, d2 / 2);
    };
    bwall(0.4, bz1 - bz0 + 1.0, bx0 - 0.2, bcz);
    bwall(0.4, bz1 - bz0 + 1.0, bx1 + 0.2, bcz);
    bwall(bx1 - bx0 + 1.0, 0.4, bcx, bz0 - 0.2);
    bwall(bx1 - bx0 + 1.0, 0.4, bcx, bz1 + 0.2);
    this.archiveFloorY = bF;
    this.archiveEnter = new THREE.Vector3(haX - 0.9, bF, haZ);
    // 사다리 — 뚜껑 밑에서 바닥까지. 오르내림은 연출 텔레포트라 콜라이더는 없다
    for (let i = 0; i < 7; i++) k.box(0.55, 0.045, 0.045, haX - 0.35, bF + 0.35 + i * 0.42, haZ, mWood);
    for (const dz of [-0.28, 0.28]) {
      const rail = new THREE.BoxGeometry(0.06, bH - 0.1, 0.06);
      rail.translate(haX - 0.35, bF + bH / 2 - 0.05, haZ + dz);
      k.add(rail, mWood);
    }
    // 기록 열람 지점 셋 — 방 안 세 자리로 분산 (대청 기록 책상과 같은 원칙)
    const tblX = bcx - 0.9, tblZ = bz0 + 1.1;             // 열람 탁자 (수첩·책더미가 올라간다)
    kFurn.box(1.5, 0.72, 0.7, tblX, bF + 0.36, tblZ, mWood);
    kFurn.collide(tblX, bF + 0.36, tblZ, 0.75, 0.36, 0.35);
    this.archivePositions.push(
      new THREE.Vector3(tblX - 0.35, bF + 1.05, tblZ),    // [0] 명부 수첩
      new THREE.Vector3(tblX + 0.42, bF + 1.05, tblZ),    // [1] 회의록 책더미
      new THREE.Vector3(bx0 + 0.75, bF + 1.35, bz1 - 0.75),  // [2] 봉인표 열 (선반 위)
    );
    // 봉인표 선반 — 남서 구석. 사람 제물 명단이 아니라 여섯 봉인표와 비어 있는 일곱 번째 홈이다.
    // 조사 문구가 이것을 「이름을 찾지 못했을 때만 쓰는 불완전한 대체 의식」의 기록으로 밝힌다.
    kFurn.box(1.7, 0.09, 0.5, bx0 + 0.9, bF + 1.18, bz1 - 0.7, mWood);
    kFurn.box(1.7, 0.09, 0.5, bx0 + 0.9, bF + 0.62, bz1 - 0.7, mWood);
    kFurn.collide(bx0 + 0.9, bF + 0.9, bz1 - 0.7, 0.85, 0.9, 0.3);
    // 서가 둘 — 동벽. 지상 서재와 같은 모델이 내려와 있다(같은 집의 살림)
    const bShelf: { x: number; z: number; yaw: number }[] = [
      { x: bx1 - 0.35, z: bcz - 1.2, yaw: Math.PI / 2 },
      { x: bx1 - 0.35, z: bcz + 1.0, yaw: Math.PI / 2 },
    ];
    for (const sp of bShelf) {
      kFurn.box(1.5, 1.8, 0.45, sp.x, bF + 0.9, sp.z, mWood, sp.yaw);
      kFurn.collide(sp.x, bF + 0.9, sp.z, 0.23, 0.9, 0.75);
      shelfSpots.push({ x: sp.x, z: sp.z, yaw: sp.yaw, y: bF });
    }

    this.group.add(k.build('manor-interior', { spatialCellSize: 12 }));
    const furnProc = kFurn.build('manor-furniture', { spatialCellSize: 12 });
    this.group.add(furnProc);

    // ---------- 실물 교체 (지상 + 지하 기록실 한 배치) ----------
    void Promise.all([
      Props.loadNormalized('/models/props/bookshelf.glb', 1.85, 0.5),
      Props.loadNormalized('/models/props/writing-desk.glb', 0.42, 0.5),
      Props.loadNormalized('/models/props/tansu.glb', 1.1, 0.5),
      Props.loadNormalized('/models/props/futon.glb', 0.42, 0.55),
      Props.loadNormalized('/models/props/teacher-desk.glb', 0.72, 0.5),
      Props.loadNormalized('/models/props/ledger.glb', 0.07, 0.6),
      Props.loadNormalized('/models/props/book-stack.glb', 0.32, 0.6),
      Props.loadNormalized('/models/props/ihai.glb', 0.28, 0.6),
    ]).then(([shelfM, wdM, tansuM, futonM, tableM, ledgerM, booksM, ihaiM]) => {
      const clampXZ = (m: THREE.Group, max: number) => {
        const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
        m.scale.multiplyScalar(Math.min(1, max / Math.max(sz.x, sz.z)));
      };
      clampXZ(shelfM, 1.55);
      for (const sp of shelfSpots) {
        const m = shelfM.clone(true);
        m.position.set(sp.x, sp.y ?? floorY, sp.z);
        m.rotation.y = sp.yaw;
        this.group.add(m);
      }
      clampXZ(wdM, 1.15);
      wdM.position.set(wdX, floorY, wdZ);
      this.group.add(wdM);
      clampXZ(tansuM, 1.35);
      tansuM.position.set(tanX, floorY, tanZ);
      this.group.add(tansuM);
      clampXZ(futonM, 1.1);
      futonM.position.set(fuX, floorY, fuZ);
      futonM.rotation.y = 0.2;
      this.group.add(futonM);
      // 지하 열람 탁자 + 기록물 실물 — 앵커는 그대로, 모델은 탁자 상판(bF+0.72)에 앉는다
      clampXZ(tableM, 1.6);
      tableM.position.set(tblX, bF, tblZ);
      this.group.add(tableM);
      clampXZ(ledgerM, 0.34);
      ledgerM.position.set(tblX - 0.35, bF + 0.72, tblZ);
      ledgerM.rotation.y = 0.25;
      this.group.add(ledgerM);
      clampXZ(booksM, 0.42);
      booksM.position.set(tblX + 0.42, bF + 0.72, tblZ);
      booksM.rotation.y = -0.4;
      this.group.add(booksM);
      // 봉인표 여섯 + **비어 있는 일곱 번째 홈** — 받침대 일곱과 같은 라임
      clampXZ(ihaiM, 0.2);
      for (let i = 0; i < 6; i++) {
        const m = ihaiM.clone(true);
        m.position.set(bx0 + 0.28 + i * 0.21, bF + 1.225, bz1 - 0.7);
        m.rotation.y = Math.PI + (i % 3 - 1) * 0.08;
        this.group.add(m);
      }
      const b2 = booksM.clone(true);
      b2.position.set(bx0 + 0.6, bF + 0.665, bz1 - 0.7);
      this.group.add(b2);
      furnProc.visible = false;
    }).catch((e) => console.warn('[manor] 가구 모델 로드 실패 — 절차 가구 유지:', e));

    scene.add(this.group);
  }
}
