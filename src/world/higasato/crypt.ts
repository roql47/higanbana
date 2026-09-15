import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { StreamedDetail } from '@/world/streamedDetail';
import { SITES, type HigasatoGround } from './ground';
import { PartsBuilder } from './kit';
import { manorMaterials, manorBox, batchManorCraft, fitManorFurniture } from './manorCraft';
import { CryptRevelationProps } from './cryptRevelation';

/**
 * 신사 지하 — 검은 문의 공간 (ACT 17~18, PLAN-STORY §9.2 「검은 문 Tripo 랜드마크」)
 *
 * 배전 마루 밑(ACT 5 웃음소리의 좌표)이 입구다: 배전 동쪽 치마 밑 격자 뚜껑 → 수직 샤프트 →
 * 서쪽으로 꺾여 → **본전 아래를 북쪽으로 지나는 복도** → 문의 방. 지상의 참배로가 남→북으로
 * 신사에 이르듯, 지하 복도도 남→북으로 문에 이른다 — 참배로의 지하 반복이 이 공간의 문법이다.
 *
 * 공간·충돌·가동 뚜껑과 히간누시 소품을 소유한다. 진입·조사·대면·복원은 Act18Revelation이 연결한다.
 * 추가 광원은 없다: 초칭과, 문이 그 빛을 되쏘는 검은 옻칠뿐.
 * 문 모델은 검은 도리이 틀 + 쌍문 — 도리이(결계)의 시각 언어가 지하의 마지막 문에서 수렴한다.
 */
export class ShrineCrypt {
  readonly group = new THREE.Group();
  /** 격자 뚜껑(지상, 배전 동쪽 치마 밑) — 개방 조사 지점 */
  readonly entryTop: THREE.Vector3;
  /** 샤프트 바닥 — 하강 연출 텔레포트 도착점 */
  readonly landing: THREE.Vector3;
  /** 검은 문 앞 2.2 m — 카메라·이벤트 앵커 */
  readonly gatePos: THREE.Vector3;
  /** 지하 바닥 y — killY 가드 산정용 */
  readonly floorY: number;
  /** 촛대 자리들 (스토리가 점등을 맡는다 — 지금은 꺼진 채) */
  readonly candleSpots: THREE.Vector3[] = [];
  readonly detail: StreamedDetail;
  readonly revelation: CryptRevelationProps;
  private hatch = new THREE.Group();
  private open = false;
  contains(p: THREE.Vector3) {
    return p.y < this.floorY + 3.2 && p.y > this.floorY - 1.5
      && p.x > this.gatePos.x - 3.4 && p.x < this.entryTop.x + 1.3
      && p.z > this.gatePos.z - 2.45 && p.z < this.entryTop.z + 1.3;
  }
  setOpen(open: boolean) { this.open = open; }
  update(dt: number) {
    this.hatch.rotation.z = THREE.MathUtils.lerp(this.hatch.rotation.z, this.open ? 1.35 : 0, 1 - Math.exp(-dt * 5));
    this.revelation.update(dt);
  }

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.shrine!;
    const cx = s.x, cz = s.z;                  // (0, −47)
    const hz0 = cz - 3;                        // 배전 중심 z (village/shrine.ts 와 같은 산식)
    const gy = ground.heightAt(cx, hz0);
    const F = gy - 4.2;                        // 지하 바닥
    this.floorY = F;
    const H = 2.7;                             // 천장고
    const k = new PartsBuilder(physics);
    const { stone: mStone, dark: mDark, wood: mWood } = manorMaterials();

    /** 사방벽+천장 딸린 직사각 방/복도 조각 — openings 방향은 벽을 뚫어 둔다 */
    let roomN = 0;
    const roomBox = (x0: number, x1: number, z0: number, z1: number, open: ('n' | 's' | 'e' | 'w')[]) => {
      const w = x1 - x0, d = z1 - z0, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      // 이웃 방과 겹치는 바닥이 같은 높이면 z-fight — 방마다 4 mm 씩 내려 겹침을 이긴 쪽만 보이게
      const eps = roomN++ * 0.004;
      k.box(w + 0.8, 0.3, d + 0.8, mx, F - 0.15 - eps, mz, mStone);        // 바닥
      k.collide(mx, F - 0.15 - eps, mz, w / 2 + 0.4, 0.15, d / 2 + 0.4);
      k.box(w + 0.8, 0.25, d + 0.8, mx, F + H + 0.125 + eps, mz, mDark);   // 천장
      const wall = (side: 'n' | 's' | 'e' | 'w') => {
        if (open.includes(side)) return;
        if (side === 'n') { k.box(w + 0.8, H, 0.4, mx, F + H / 2, z0 - 0.2, mStone); k.collide(mx, F + H / 2, z0 - 0.2, w / 2 + 0.4, H / 2, 0.2); }
        if (side === 's') { k.box(w + 0.8, H, 0.4, mx, F + H / 2, z1 + 0.2, mStone); k.collide(mx, F + H / 2, z1 + 0.2, w / 2 + 0.4, H / 2, 0.2); }
        if (side === 'w') { k.box(0.4, H, d + 0.8, x0 - 0.2, F + H / 2, mz, mStone); k.collide(x0 - 0.2, F + H / 2, mz, 0.2, H / 2, d / 2 + 0.4); }
        if (side === 'e') { k.box(0.4, H, d + 0.8, x1 + 0.2, F + H / 2, mz, mStone); k.collide(x1 + 0.2, F + H / 2, mz, 0.2, H / 2, d / 2 + 0.4); }
      };
      (['n', 's', 'e', 'w'] as const).forEach(wall);
    };

    // ---------- ① 샤프트 (배전 동쪽 치마 밑) — 천장 없이 지상까지, 격자 뚜껑이 덮는다 ----------
    // 접합부 원칙: **이웃한 개구의 스팬을 정확히 일치**시킨다 — 폭이 다르면 그 차이만큼
    // 벽 없는 틈이 흙 속으로 뚫린다 (설계 중 실제로 냈던 실수)
    const shX = cx + 4.4, shZ = hz0;           // (4.4, −50) — 마루 치마 바로 밖
    const shH = gy - F + 0.3;                  // 샤프트 벽은 바닥에서 지표까지
    k.box(2.6, 0.3, 2.6, shX, F - 0.11, shZ, mStone);
    k.collide(shX, F - 0.11, shZ, 1.3, 0.15, 1.3);
    const shWall = (w2: number, d2: number, px: number, pz: number, hh = shH, y0 = F) => {
      k.box(w2, hh, d2, px, y0 + hh / 2, pz, mStone);
      k.collide(px, y0 + hh / 2, pz, w2 / 2, hh / 2, d2 / 2);
    };
    shWall(0.4, 2.2, shX + 1.1, shZ);                          // 동벽 (사다리 쪽)
    shWall(2.6, 0.4, shX, shZ - 1.1);                          // 북벽
    shWall(2.6, 0.4, shX, shZ + 1.1);                          // 남벽
    shWall(0.4, 2.2, shX - 1.1, shZ, shH - H, F + H);          // 서벽 — 복도 개구 위쪽만
    this.entryTop = new THREE.Vector3(shX, gy + 0.06, shZ);
    this.hatch.name = 'crypt-entry-hatch'; this.hatch.position.set(shX - 0.8, gy + 0.05, shZ); this.group.add(this.hatch);
    for (const dz of [-0.55, -0.18, 0.18, 0.55]) manorBox(this.hatch, [1.6, 0.06, 0.14], [0.8, 0, dz], mWood);
    for (const dx of [0.15, 1.45]) manorBox(this.hatch, [0.1, 0.06, 1.55], [dx, -0.06, 0], mWood);
    batchManorCraft(this.hatch);
    k.box(1.7, 0.05, 1.7, shX, gy + 0.015, shZ, mDark);        // 판 틈의 어둠 (지표보다 살짝 위)
    k.collide(shX, gy + 0.04, shZ, 0.85, 0.05, 0.85);          // 뚜껑 — 열리기 전엔 밟고 지나간다
    this.landing = new THREE.Vector3(shX, F, shZ);
    for (let i = 0; i < 9; i++) k.box(0.045, 0.045, 0.58, shX + 0.82, F + 0.35 + i * 0.44, shZ, mWood);
    for (const dz of [-0.31, 0.31]) k.box(0.07, shH - 0.15, 0.07, shX + 0.82, F + (shH - 0.15) / 2, shZ + dz, mWood);

    // ---------- ② 서쪽 연결 복도 — 배전 밑을 지난다 (개구 z 스팬 = 샤프트와 동일 ±0.9) ----------
    roomBox(cx + 1.1, shX - 1.1, shZ - 0.9, shZ + 0.9, ['e', 'w']);
    // ---------- ③ 모퉁이 칸 — 서쪽 복도(동) ↔ 북쪽 복도(북), 스팬 각각 일치 ----------
    roomBox(cx - 1.1, cx + 1.1, shZ - 0.9, shZ + 0.9, ['e', 'n']);
    // ---------- ④ 북쪽 복도 — 본전 아래, 지하의 참배로 ----------
    roomBox(cx - 1.1, cx + 1.1, hz0 - 8.4, shZ - 0.9, ['s', 'n']);

    // ---------- ④ 문의 방 ----------
    const ch0 = hz0 - 13.6, ch1 = hz0 - 8.4;   // z −63.6..−58.4
    roomBox(cx - 3.2, cx + 3.2, ch0, ch1, ['s']);
    // 남쪽 입구 — 복도 폭만 남기고 좌우를 막는다
    for (const sgn of [-1, 1]) {
      const wx = cx + sgn * 2.15;
      k.box(2.1, H, 0.4, wx, F + H / 2, ch1 + 0.2, mStone);
      k.collide(wx, F + H / 2, ch1 + 0.2, 1.05, H / 2, 0.2);
    }
    this.gatePos = new THREE.Vector3(cx, F, ch0 + 2.2);
    // 촛대 자리 — 문 좌우 한 쌍 + 복도 어귀 하나 (점등은 스토리)
    this.candleSpots.push(
      new THREE.Vector3(cx - 1.7, F, ch0 + 1.1),
      new THREE.Vector3(cx + 1.7, F, ch0 + 1.1),
      new THREE.Vector3(cx - 0.85, F, ch1 - 0.5),
    );

    // ---------- 검은 문 (절차 폴백 → Tripo 랜드마크) ----------
    const kGate = new PartsBuilder(physics);
    const gz = ch0 + 0.45;
    kGate.box(0.5, H, 0.7, cx - 1.6, F + H / 2, gz, mWood);
    kGate.box(0.5, H, 0.7, cx + 1.6, F + H / 2, gz, mWood);
    kGate.box(3.7, 0.5, 0.7, cx, F + H - 0.25, gz, mWood);
    for (const sgn of [-1, 1]) kGate.box(1.32, 2.25, 0.22, cx + sgn * 0.69, F + 1.125, gz, mDark);
    kGate.collide(cx, F + H / 2, gz, 1.9, H / 2, 0.4);
    this.group.add(k.build('shrine-crypt', { spatialCellSize: 10 }));
    const gateProc = kGate.build('crypt-gate-proc');
    this.group.add(gateProc);
    this.detail = new StreamedDetail(this.group, { minX: cx - 3.2, maxX: shX + 1.1, minZ: ch0, maxZ: shZ + 1.1 }, async detail => {
      const [rawGate, candle] = await detail.models([
        ['/models/props/black-gate.glb', 2.62, 0.7], ['/models/props/candlestick.glb', 0.85, 0.7],
      ]);
      // 문은 방 폭(6.4)을 넘지 않게 — 높이 정규화가 만든 폭을 자른다
      const gate = fitManorFurniture(rawGate, 4.4, 2.62, 0.68); gate.name = 'crypt-black-gate';
      gate.position.set(cx, F, gz + 0.15);
      detail.root.add(gate);
      const cs = new THREE.Box3().setFromObject(candle).getSize(new THREE.Vector3());
      candle.scale.multiplyScalar(Math.min(1, 0.5 / Math.max(cs.x, cs.z)));
      for (const sp of this.candleSpots) {
        const m = candle.clone(true);
        m.position.copy(sp);
        detail.root.add(m);
      }
    }, [gateProc], 'crypt');
    this.revelation = new CryptRevelationProps(this.group, F, this.gatePos);

    scene.add(this.group);
  }
}
