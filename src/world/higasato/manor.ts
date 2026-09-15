import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { StreamedDetail } from '@/world/streamedDetail';
import { RoomOcclusion } from '@/world/roomOcclusion';
import { investigationPaper } from '@/world/investigationProps';
import { L } from '@/core/i18n';
import { SITES, type HigasatoGround } from './ground';
import { makePartitions, PartsBuilder } from './kit';
import { ManorDispatchProps } from './manorDispatchProps';
import { fitManorFurniture, manorMaterials } from './manorCraft';
import { manorDressing } from './manorDressing';
import { layFlatBook } from './innProps';

/**
 * 촌장 저택 실내 — 제문과 봉인패(공물 6)·기록의 무대 (PLAN-STORY §2.3, ACT 14~16)
 *
 * 셸(`blockouts.ts`)이 외피·기록 책상 3을 맡고, 이 모듈이 불단·조사 가구와 방을 채운다.
 * 셸의 스토리 가구는 전부 **대청**(가운데 큰 방)에 있으므로, 칸막이는 그 둘레로만 두른다:
 *
 *   서재(북) — 서가·서안
 *   현관 | 대청 (기록 책상 3 + 불단) | 지하 계단실(동)
 *   안방(남) — 장롱·이불
 *
 * 지하 기록실에는 결재함의 세 인장판과 회신함을 놓는다. 문서·결재함·불단 덮개가 연결된다.
 * 조명은 없다. 저택의 빛도 플레이어의 초칭뿐이다 (불단의 메아리 빛은 셸이 관리).
 */
export class ManorInterior {
  readonly group = new THREE.Group();
  readonly detail: StreamedDetail;
  readonly occlusion = new RoomOcclusion();
  /** 지하 기록실 마루 뚜껑 — ACT 15~16 개방 지점 (조사 지문 자리) */
  readonly hatchPos: THREE.Vector3;
  /** 지하 기록실 — 사다리 발치(하강 연출 텔레포트 도착점, 우물 `landing` 문법) */
  readonly archiveEnter: THREE.Vector3;
  /** 기록 열람 지점 셋 — [0] 명부 수첩 · [1] 회의록 책더미 · [2] 봉인표 열 (ACT 15 선택 조사) */
  readonly archivePositions: THREE.Vector3[] = [];
  /** 기록실 바닥 y — killY 가드 산정용 */
  readonly archiveFloorY: number;
  readonly orderCluePositions: THREE.Vector3[] = [];
  readonly orderResolvePositions: THREE.Vector3[] = [];
  readonly dispatch: ManorDispatchProps;
  update(dt: number) { this.dispatch.update(dt); }

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.manor!;
    const cx = s.x, cz = s.z;
    const w = s.w - 5, d = s.d - 5;            // 셸과 같은 산식 (14 × 10)
    const gy = ground.heightAt(cx, cz);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const floorY = gy + 0.33;

    const k = new PartsBuilder(physics, { opaqueBox: this.occlusion.addBox });
    const { plaster: mWall, wood: mWood, dark: mDark, stone: mStone } = manorMaterials();
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
    this.archiveEnter = new THREE.Vector3(haX - 0.35, bF, haZ);
    // 사다리 — 뚜껑 밑에서 바닥까지. 오르내림은 연출 텔레포트라 콜라이더는 없다
    for (let i = 0; i < 7; i++) k.box(0.045, 0.045, 0.55, haX - 0.35, bF + 0.35 + i * 0.42, haZ, mWood);
    for (const dz of [-0.28, 0.28]) {
      k.box(0.06, bH - 0.1, 0.06, haX - 0.35, bF + bH / 2 - 0.05, haZ + dz, mWood);
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
    this.orderCluePositions.push(new THREE.Vector3(wdX, floorY + 0.43, wdZ),
      new THREE.Vector3(tanX + 0.45, floorY + 0.03, tanZ - 0.65), this.archivePositions[0]!.clone());
    this.orderResolvePositions.push(this.orderCluePositions[0]!.clone(), this.archivePositions[1]!.clone());
    investigationPaper(this.group, this.orderCluePositions[0]!, L('명령 사본', '命令控え'), [L('생존자 확인', '生存者確認'), L('대피 지원', '避難支援')]);
    investigationPaper(this.group, this.orderCluePositions[1]!, L('배부 장부', '配布帳'), [L('회신 미도착', '返信未着'), L('아이를 먼저', '子供を先に')]);
    // 봉인표 선반 — 남서 구석. 사람 제물 명단이 아니라 여섯 봉인표와 비어 있는 일곱 번째 홈이다.
    // 조사 문구가 이것을 「이름을 찾지 못했을 때만 쓰는 불완전한 대체 의식」의 기록으로 밝힌다.
    // The real rack is permanent joinery: streaming its tablets must not hide their support.
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
    this.dispatch = new ManorDispatchProps(this.group, physics, [
      new THREE.Vector3(genkan + 2.4, floorY + 1.15, studyZ - 0.07),
      new THREE.Vector3(fuX + 1.0, floorY + 0.16, fuZ),
      new THREE.Vector3(bx1 - 1.4, bF + 1.25, bz0 + 0.09),
    ], new THREE.Vector3(bx0 + 3, bF, bz1 - 0.4),
    new THREE.Vector3(cx + 2.0, gy + 1.22, cz), this.hatchPos);
    manorDressing(this.group, physics, floorY, bF, cx, cz, w, d);

    this.group.add(k.build('manor-interior', { spatialCellSize: 12 }));
    const furnProc = kFurn.build('manor-furniture', { spatialCellSize: 12 });
    this.group.add(furnProc);

    // ---------- 실물 교체 (지상 + 지하 기록실 한 배치) ----------
    this.detail = new StreamedDetail(this.group, { minX: x0, maxX: x1, minZ: z0, maxZ: z1 }, async (detail) => {
      const [shelfM, wdM, tansuM, futonM, tableM, ledgerM, booksM, ihaiM] = await detail.models([
        ['/models/props/bookshelf.glb', 1.85, 0.72],
        ['/models/props/writing-desk.glb', 0.42, 0.72],
        ['/models/props/tansu.glb', 1.1, 0.72],
        ['/models/props/futon.glb', 0.42, 0.55],
        ['/models/props/teacher-desk.glb', 0.72, 0.78],
        ['/models/props/ledger.glb', 0.07, 0.78],
        ['/models/props/book-stack.glb', 0.32, 0.6],
        ['/models/props/ihai.glb', 0.28, 0.6],
      ]);

      const clampXZ = (m: THREE.Group, max: number) => {
        const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
        m.scale.multiplyScalar(Math.min(1, max / Math.max(sz.x, sz.z)));
      };
      const shelf = fitManorFurniture(shelfM, 1.5, 1.8, 0.45);
      for (const sp of shelfSpots) {
        const m = shelf.clone(true); m.name = 'manor-bookshelf';
        m.position.set(sp.x, sp.y ?? floorY, sp.z);
        m.rotation.y = sp.yaw;
        detail.root.add(m);
      }
      const desk = fitManorFurniture(wdM, 1.1, 0.42, 0.55); desk.name = 'manor-study-desk';
      desk.position.set(wdX, floorY, wdZ); detail.root.add(desk);
      const tansu = fitManorFurniture(tansuM, 1.3, 1.1, 0.55); tansu.name = 'manor-bedroom-tansu';
      tansu.position.set(tanX, floorY, tanZ); tansu.rotation.y = Math.PI; detail.root.add(tansu);
      const futon = fitManorFurniture(futonM, 1.1, 0.24, 0.72); futon.name = 'manor-bedroom-futon';
      futon.position.set(fuX, floorY + 0.028, fuZ); futon.rotation.y = Math.PI / 2 + 0.2; detail.root.add(futon);
      // 지하 열람 탁자 + 기록물 실물 — 앵커는 그대로, 모델은 탁자 상판(bF+0.72)에 앉는다
      const table = fitManorFurniture(tableM, 1.5, 0.72, 0.7); table.name = 'manor-archive-table';
      table.position.set(tblX, bF, tblZ); detail.root.add(table);
      const ledger = layFlatBook(ledgerM, 0.4, 0.045); ledger.name = 'manor-archive-ledger';
      ledger.position.set(tblX - 0.35, bF + 0.722, tblZ); ledger.rotation.y = 0.25; detail.root.add(ledger);
      clampXZ(booksM, 0.42);
      booksM.position.set(tblX + 0.42, bF + 0.72, tblZ);
      booksM.rotation.y = -0.4;
      booksM.name = 'manor-archive-minutes';
      detail.root.add(booksM);
      // 봉인표 여섯 + **비어 있는 일곱 번째 홈** — 받침대 일곱과 같은 라임
      const seal = fitManorFurniture(ihaiM, 0.17, 0.28, 0.2);
      // The source roughness map averages ~0.02: soften its mirror-like lacquer under the lantern.
      ihaiM.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.roughnessMap = null; material.roughness = 0.6; material.metalness = 0.08;
        }
      });
      for (let i = 0; i < 6; i++) {
        const m = seal.clone(true); m.name = `manor-seal-tablet-${i}`;
        m.position.set(bx0 + 0.28 + i * 0.21, bF + 1.232, bz1 - 0.7);
        m.rotation.y = Math.PI + (i % 3 - 1) * 0.08;
        detail.root.add(m);
      }
      const b2 = booksM.clone(true);
      b2.position.set(bx0 + 0.6, bF + 0.665, bz1 - 0.7);
      detail.root.add(b2);

    }, [furnProc], 'manor');

    scene.add(this.group);
  }
}
