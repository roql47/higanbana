import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { Props } from '@/world/props';
import { makeHouseMaterials } from '../village/houseMaterials';
import { SITES, type HigasatoGround } from './ground';
import { MIO_CLEAR_DOOR_HEIGHT, PartsBuilder, textCanvas, tileTex } from './kit';
import { grunge, projectUV } from './minka';
import { makeSchoolMaterials } from './schoolMaterials';
import { L } from '@/core/i18n';

/** 실내 미닫이 개구 폭 · 문짝 폭 — 문짝은 개구를 조금 넘겨 겹치고, 열릴 때 딱 제 폭만큼 밀린다 */
const DOOR_W = 1.1;
const LEAF_W = DOOR_W * 1.06;

/**
 * 폐교 — ACT 8~9 「붉은 머리빗」의 무대 (PLAN-STORY §5.3.2, §9.2)
 *
 * v6.2 부터 이 모듈이 **건물 전체**를 짓는다(범용 셸 졸업): 하미판(下見板) 외벽 + 1·2층 창 줄 +
 * 현관 포치 + 문패 + 지붕. 재질은 폐가 PBR 세트(`makeHouseMaterials`)를 그대로 재사용 —
 * 마을과 같은 손으로 지은 건물로 읽혀야 한다. 평면(실내 27×14):
 *
 *   교실 1 (13×5.7)      | 교실 2 (14×5.7, 음악실 겸)
 *   ---------- 복도 2.6 ----------
 *   교무실 (9.5) | 준비실 (9) | 방송실 (8.5)
 *
 * ## 이 실내는 유리(얼굴 없는 학생)의 보드다
 *   · 칸막이 벽에는 **콜라이더가 있다** — 유리의 시선(LOS) 판정이 물리 레이로 돈다.
 *     벽 너머의 그녀는 「보이지 않는 것」이고, 보이지 않으면 움직인다
 *   · 책상은 낮다(실물 책걸상 0.78 m) — 눈높이 레이가 넘어가므로 시선을 끊지 않는다.
 *     책상 뒤에 숨는 것은 유리에게 통하지 않는다 — 그녀는 발소리를 내지 않으니까
 *   · 형광등은 **그녀의 접근 신호다** (§5.3.2 — 접근 신호는 형광등 깜빡임과 책상 긁는 소리뿐).
 *     `setFlicker(0..1)` 를 유리 드라이버가 매 프레임 몬다
 */
export class SchoolInterior {
  readonly group = new THREE.Group();
  /** 머리빗 — 음악실 피아노 안 */
  readonly kushiPos: THREE.Vector3;
  /** 교무실 일지 (조사 지점) */
  readonly journalPos: THREE.Vector3;
  /** 준비실 크레용 그림 (조사 지점) */
  readonly crayonPos: THREE.Vector3;
  /** 3학년 교실 칠판의 출석 숫자 */
  readonly attendancePos: THREE.Vector3;
  /** 현관 신발장 — 이름표가 뜯긴 칸 (곁가지 조사점, 단서 4에는 안 든다) */
  readonly getabakoPos: THREE.Vector3;
  /** 책상 밑에 남은 유리의 이름표 */
  readonly deskNamePos: THREE.Vector3;
  /** 네 단서를 조합해 이름을 부르는 교내 방송 마이크 */
  readonly broadcastPos: THREE.Vector3;
  /** 유리 추격 중 한 번 닫아 시간을 벌 수 있는 복도 미닫이문 */
  readonly hauntedDoorPos: THREE.Vector3;
  /** 준비실 벽장 입구와 실제 은신 위치 */
  readonly hideEntryPos: THREE.Vector3;
  readonly hideInsidePos: THREE.Vector3;
  /** 문 밖 1.5 m — 스폰·QA 텔레포트 (구 셸 API 유지) */
  readonly doorPos: THREE.Vector3;
  /** 유리 리스폰 자리들 — 잡힌 뒤/활성화 때 플레이어에게서 가장 먼 곳을 고른다 */
  readonly spawns: THREE.Vector3[] = [];
  /** 머리빗을 집었을 때 여러 교실에서 연쇄적으로 넘어지는 책상의 음원 위치. */
  readonly deskPositions: THREE.Vector3[] = [];
  /** 실내 경계 (유리의 아레나) */
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number; floorY: number };

  private lightMats: THREE.MeshStandardMaterial[] = [];
  private lights: THREE.PointLight[] = [];
  private flickerK = 0;
  private broadcastMat: THREE.MeshStandardMaterial;
  /** 붉게 살아나는 것들 — 마이크 표시구 + 문 위 「방송 중」 사인 */
  private broadcastMats: THREE.MeshStandardMaterial[] = [];
  private broadcastLight: THREE.PointLight;
  private broadcastPulse = 0;
  private hauntedDoor: THREE.Group;
  private hauntedDoorClosedX = 0;
  private hauntedDoorSlide = 1;
  private doorBraceT = 0;
  private doorBarrier: ReturnType<Physics['addStaticBox']> | null = null;
  /** ACT 8 추격 뒤 창문·천장에 번갈아 비치는 유리의 잔상. Sprite라 추가 본/애니메이션 비용이 없다. */
  private apparitions: THREE.Sprite[] = [];
  private apparitionThreat = 0;
  private apparitionsActive = false;
  private t = 0;

  constructor(scene: THREE.Scene, private physics: Physics, ground: HigasatoGround) {
    const s = SITES.school!;
    const cx = s.x, cz = s.z;
    const w = s.w - 5, d = s.d - 5;           // 건물 발자국 (27 × 14)
    const gy = ground.heightAt(cx, cz);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const FLOOR = gy + 0.33;                  // 마루 윗면
    this.bounds = { minX: x0 + 0.4, maxX: x1 - 0.4, minZ: z0 + 0.4, maxZ: z1 - 0.4, floorY: FLOOR };
    const HB = 6.8;                           // 외벽 높이 (2층 목조 교사 — v5.8)

    const k = new PartsBuilder(physics);
    const tex = makeHouseMaterials();          // 폐가 PBR 세트 재사용 (캐시)
    const schoolTex = makeSchoolMaterials();   // 폐교 회벽 1K PBR — 칸막이 전체가 한 드로우콜을 공유한다
    // 가구는 삼나무 판재 PBR(제당과 같은 타일) — 외피·칸막이는 이미 폐가 세트라 남은 단색이 가구뿐이었다.
    // 책상은 플레이어가 코앞에서 조사하는 소품이라(이름 각인·쿠시) 결이 제일 티 난다
    const woodD = tileTex('/textures/wood/japanese_cedar_planks_diff_1k.webp', true);
    const woodN = tileTex('/textures/wood/japanese_cedar_planks_nor_gl_1k.webp', false);
    const mTrim = k.mat(0x1f1811, 0.95);
    const mWood = k.texMat(woodD, woodN, 0x2a211a, { rough: 0.9, repeat: 0.9 });
    const mDesk = k.texMat(woodD, woodN, 0x4a3b2a, { rough: 0.85, repeat: 1.1 });
    const mDeskTop = k.texMat(woodD, woodN, 0x5a4a35, { rough: 0.8, repeat: 1.1 });
    const mFloor = k.texMat(woodD, woodN, 0x534534, { boost: 1.75, rough: 0.88, repeat: 0.48, normalScale: 0.48 });
    mFloor.vertexColors = true;
    const mBoard = k.mat(0x1c2b22, 0.6);      // 칠판 (절차 폴백)
    const mStone = k.mat(0x474b44, 1.0);
    // DoubleSide — 단면이면 실내에서 유리가 컬링돼 창이 뻥 뚫린 구멍으로 보인다 (실측)
    const mGlass = new THREE.MeshStandardMaterial({ color: 0x0b0e11, roughness: 0.12, metalness: 0.35, side: THREE.DoubleSide });

    /**
     * 텍스처 박스 — 폐가 재질은 `vertexColors: true` 라 **색 속성이 반드시 필요**하다(grunge 가 채운다).
     * projectUV 는 좌표 그대로 투영하므로 grunge 의 y 기준(지면 0)에 맞게 gy 를 뺐다가 되돌린다.
     */
    const tput = (bw: number, bh: number, bd: number, x: number, y: number, z: number, mat: THREE.Material, su: number, sv: number, yaw = 0) => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      if (yaw) g.rotateY(yaw);
      g.translate(x, y - gy, z);
      projectUV(g, su, sv);
      grunge(g, HB);
      g.translate(0, gy, 0);
      k.add(g, mat);
    };

    // ================= 외피 — 하미판 이층 교사 =================
    // 기초 + 마루 (마루에는 콜라이더 — 판자 위를 걷는다. 문턱 0.33 은 오토스텝 0.35 안)
    tput(w + 0.7, 0.35, d + 0.7, cx, gy + 0.175, cz, tex.mud, 0.8, 0.8);
    tput(w, 0.12, d, cx, gy + 0.27, cz, mFloor, 0.48, 0.48);
    k.collide(cx, gy + 0.27, cz, w / 2, 0.06, d / 2);
    const SILL1 = 1.05, HEAD1 = 2.35, SILL2 = 4.25, HEAD2 = 5.45;
    const WIN_W = 1.7, PIER = 1.0, MARGIN = 1.2;
    /**
     * 긴 면(남북)의 창 줄 벽 — 띠(band) 다섯 + 창 사이 기둥벽.
     * 창은 물리적으로 **뚫리지 않는다**(유리·판자) — 면 전체 콜라이더 하나로 충분하다.
     */
    const longWall = (pz: number, sgn: 1 | -1) => {
      const bands: [number, number][] = [[0.35, SILL1], [HEAD1, SILL2], [HEAD2, HB]];
      for (const [a, b] of bands) tput(w, b - a, 0.16, cx, gy + (a + b) / 2, pz, tex.plankDark, 0.5, 0.5);
      const n = Math.floor((w - MARGIN * 2 + PIER) / (WIN_W + PIER));
      const span = n * WIN_W + (n - 1) * PIER;
      const startX = cx - span / 2;
      for (const [sillY, headY] of [[SILL1, HEAD1], [SILL2, HEAD2]] as const) {
        for (let i = 0; i <= n; i++) {
          // 창 사이 기둥벽 (양끝은 여백 벽)
          const px = i === 0 ? (x0 + (startX - x0) / 2) : i === n ? (x1 - (x1 - (startX + span)) / 2 - 0) : startX + i * (WIN_W + PIER) - PIER / 2;
          const pw = i === 0 || i === n ? (startX - x0) : PIER;
          tput(pw, headY - sillY, 0.16, i === n ? x1 - pw / 2 : px, gy + (sillY + headY) / 2, pz, tex.plankDark, 0.5, 0.5);
        }
        for (let i = 0; i < n; i++) {
          const wx = startX + i * (WIN_W + PIER) + WIN_W / 2;
          // 유리(안쪽) + 틀 + 중간살
          const gp = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W - 0.12, headY - sillY - 0.12), mGlass);
          gp.position.set(wx, gy + (sillY + headY) / 2, pz + sgn * 0.02);
          gp.rotation.y = sgn > 0 ? 0 : Math.PI;
          this.group.add(gp);
          tput(WIN_W + 0.1, 0.09, 0.2, wx, gy + sillY - 0.02, pz, tex.timber, 1.6, 0.5);
          tput(WIN_W + 0.1, 0.09, 0.2, wx, gy + headY + 0.02, pz, tex.timber, 1.6, 0.5);
          for (const ox of [-WIN_W / 2, 0, WIN_W / 2]) tput(0.08, headY - sillY, 0.18, wx + ox, gy + (sillY + headY) / 2, pz, tex.timber, 1.6, 0.5);
          tput(0.06, 0.05, 0.18, wx, gy + (sillY + headY) / 2, pz, tex.timber, 1.6, 0.5);
          // 1층 창 일부는 판자로 못질 — 폐허의 문법 (결정적 선택)
          if (sillY === SILL1 && (i * 7 + (sgn > 0 ? 1 : 0)) % 3 === 0) {
            tput(WIN_W + 0.2, 0.17, 0.06, wx, gy + sillY + 0.45, pz + sgn * 0.1, tex.plankDark, 1.4, 1.2, 0);
            tput(WIN_W + 0.2, 0.17, 0.06, wx, gy + sillY + 0.95, pz + sgn * 0.1, tex.plankDark, 1.4, 1.2, 0);
          }
        }
      }
      k.collide(cx, gy + HB / 2 + 0.3, pz, w / 2, HB / 2, 0.1);
    };
    longWall(z0 + 0.08, -1);                  // 북면 (창이 뒷산을 본다)
    longWall(z1 - 0.08, 1);                   // 남면
    /** 짧은 면(동서 박공) — 서면 가운데에 현관 개구 */
    const gableWall = (px: number, hasDoor: boolean) => {
      const DW = 1.7, DH = MIO_CLEAR_DOOR_HEIGHT;
      if (!hasDoor) {
        tput(0.16, HB - 0.35, d, px, gy + 0.35 + (HB - 0.35) / 2, cz, tex.plankDark, 0.5, 0.5);
        k.collide(px, gy + HB / 2 + 0.3, cz, 0.1, HB / 2, d / 2);
        return;
      }
      const seg = (d - DW) / 2;
      for (const sgn of [-1, 1]) {
        tput(0.16, HB - 0.35, seg, px, gy + 0.35 + (HB - 0.35) / 2, cz + sgn * (DW / 2 + seg / 2), tex.plankDark, 0.5, 0.5);
        k.collide(px, gy + HB / 2 + 0.3, cz + sgn * (DW / 2 + seg / 2), 0.1, HB / 2, seg / 2);
      }
      tput(0.16, HB - 0.35 - DH, DW, px, gy + DH + (HB - 0.35 - DH) / 2 + 0.35 - 0.35, cz, tex.plankDark, 0.5, 0.5);
      k.collide(px, gy + DH + (HB - DH) / 2, cz, 0.1, (HB - DH) / 2, DW / 2);
    };
    gableWall(x0 + 0.08, true);
    gableWall(x1 - 0.08, false);
    // 모서리 널 + 층 사이 띠장 — 목조 교사의 뼈대 선
    for (const [ex, ez] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]] as const) tput(0.22, HB - 0.3, 0.22, ex + (ex < cx ? 0.06 : -0.06), gy + 0.35 + (HB - 0.3) / 2 - 0.02, ez + (ez < cz ? 0.06 : -0.06), tex.timber, 1.4, 0.5);
    for (const pz of [z0 + 0.02, z1 - 0.02]) tput(w + 0.1, 0.2, 0.24, cx, gy + 3.15, pz, tex.timber, 1.6, 0.5);
    // 2층 바닥 슬래브(실내 천장) — v5.8 의 것을 이 모듈이 승계
    tput(w - 0.1, 0.14, d - 0.1, cx, gy + 3.1, cz, tex.plankDark, 0.4, 0.4);
    /**
     * 지붕 — ⚠️ `k.gable` 지오메트리에는 color 속성이 없다. vertexColors 재질(tex.*)과 섞으면
     * mergeGeometries 가 **그 재질의 배치 전체를 조용히 버린다**(벽까지 통째로 사라졌다, 실측).
     * 지붕·캐노피는 무광 전용 재질로 — 밤에는 실루엣이 전부라 텍스처 손해가 없다
     */
    const mRoof = k.mat(0x15110e, 0.95);
    k.gable(cx, cz, w / 2 + 0.85, d / 2 + 0.7, gy + HB + 0.3, 2.3, mRoof, 0);
    // 현관 포치: 디딤단 3 + 캐노피 + 문패
    for (let i = 0; i < 3; i++) {
      tput(2.4, 0.12, 0.5, x0 - 0.35 - i * 0.42, gy + 0.25 - i * 0.11, cz, tex.mud, 0.8, 0.8);
      k.collide(x0 - 0.35 - i * 0.42, gy + 0.25 - i * 0.11, cz, 1.2, 0.06, 0.25);
    }
    for (const sgn of [-1, 1]) tput(0.14, 2.6, 0.14, x0 - 1.15, gy + 1.3, cz + sgn * 1.25, tex.timber, 1.4, 0.5);
    k.gable(cx - w / 2 - 0.55, cz, 1.15, 1.65, gy + 2.62, 0.55, mRoof, Math.PI / 2);
    const plate = textCanvas(256, 64, (ctx) => {
      ctx.fillStyle = 'rgba(28, 22, 14, 0.94)'; ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(214, 202, 176, 0.85)';
      ctx.font = '600 30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(L('히가사토 초등학교', '彼ヶ里小学校'), 128, 34);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: plate, roughness: 0.9 }));
    sign.position.set(x0 - 0.02, gy + 2.75, cz);
    sign.rotation.y = -Math.PI / 2;
    this.group.add(sign);
    this.doorPos = new THREE.Vector3(x0 - 1.5, gy, cz);

    // ================= 실내 =================
    // 2층 바닥 아랫면(gy+3.03)까지 칸막이를 채운다. 이전 2.6 m는 천장 아래에 틈이 남았다.
    const H = 2.7, T = 0.1;
    const DOOR = DOOR_W;
    // 미오(1.62 m)보다 0.78 m 높다. 외부 현관과 실내 문이 같은 2.40 m 기준을 공유한다.
    const DOOR_HEAD = MIO_CLEAR_DOOR_HEIGHT;
    /** 칸막이 — 문 틈 + 인방, 콜라이더 포함. 폐교 전용 회벽 PBR */
    const pwall = (bw: number, bd: number, x: number, y: number, z: number, bh = H) => {
      // 한 타일 ≈ 2.25 m. 균열을 크게 읽히게 하면서 교실마다 같은 얼룩이 반복되는 것을 피한다.
      tput(bw, bh, bd, x, y, z, schoolTex.plaster, 0.44, 0.44);
    };
    const partX = (px: number, zA: number, zB: number, doorAt?: number) => {
      if (doorAt === undefined) {
        pwall(T, zB - zA, px, FLOOR + H / 2, (zA + zB) / 2);
        k.collide(px, FLOOR + H / 2, (zA + zB) / 2, T / 2, H / 2, (zB - zA) / 2);
        return;
      }
      const aLen = doorAt - DOOR / 2 - zA, bLen = zB - (doorAt + DOOR / 2);
      if (aLen > 0.05) { pwall(T, aLen, px, FLOOR + H / 2, zA + aLen / 2); k.collide(px, FLOOR + H / 2, zA + aLen / 2, T / 2, H / 2, aLen / 2); }
      if (bLen > 0.05) { pwall(T, bLen, px, FLOOR + H / 2, zB - bLen / 2); k.collide(px, FLOOR + H / 2, zB - bLen / 2, T / 2, H / 2, bLen / 2); }
      const headH = H - DOOR_HEAD;
      pwall(T, DOOR, px, FLOOR + DOOR_HEAD + headH / 2, doorAt, headH);
      k.collide(px, FLOOR + DOOR_HEAD + headH / 2, doorAt, T / 2, headH / 2, DOOR / 2);
    };
    const partZ = (pz: number, xA: number, xB: number, doorAt?: number) => {
      if (doorAt === undefined) {
        pwall(xB - xA, T, (xA + xB) / 2, FLOOR + H / 2, pz);
        k.collide((xA + xB) / 2, FLOOR + H / 2, pz, (xB - xA) / 2, H / 2, T / 2);
        return;
      }
      const aLen = doorAt - DOOR / 2 - xA, bLen = xB - (doorAt + DOOR / 2);
      if (aLen > 0.05) { pwall(aLen, T, xA + aLen / 2, FLOOR + H / 2, pz); k.collide(xA + aLen / 2, FLOOR + H / 2, pz, aLen / 2, H / 2, T / 2); }
      if (bLen > 0.05) { pwall(bLen, T, xB - bLen / 2, FLOOR + H / 2, pz); k.collide(xB - bLen / 2, FLOOR + H / 2, pz, bLen / 2, H / 2, T / 2); }
      const headH = H - DOOR_HEAD;
      pwall(DOOR, T, doorAt, FLOOR + DOOR_HEAD + headH / 2, pz, headH);
      k.collide(doorAt, FLOOR + DOOR_HEAD + headH / 2, pz, DOOR / 2, headH / 2, T / 2);
    };

    // 평면: 복도 2.6 · 남측 세 칸 (교무실 | 준비실 | 방송실 — 설정의 방송실이 제 방을 얻었다)
    const corrZ0 = cz - 1.3, corrZ1 = cz + 1.3;
    const nSplit = cx - 0.5;
    const sSplit1 = x0 + 9.5, sSplit2 = x0 + 18.5;
    partZ(corrZ0, x0, nSplit, x0 + 1.3);
    partZ(corrZ0, nSplit, x1, nSplit + 1.3);
    partX(nSplit, z0, corrZ0);
    partZ(corrZ1, x0, sSplit1, x0 + 4.5);
    partZ(corrZ1, sSplit1, sSplit2, sSplit1 + 2.0);
    partZ(corrZ1, sSplit2, x1, sSplit2 + 2.0);
    partX(sSplit1, corrZ1, z1);
    partX(sSplit2, corrZ1, z1);

    // ---------- 책상 열 — 교실마다 3×2, 넓어진 방에 맞춘 간격 (통로 1.5 m+) ----------
    const kFurn = new PartsBuilder(physics);
    const deskSpots: { x: number; z: number; yaw: number }[] = [];
    const desk = (dx: number, dz: number) => {
      kFurn.box(0.62, 0.5, 0.42, dx, FLOOR + 0.25, dz, mDesk);
      kFurn.box(0.72, 0.05, 0.5, dx, FLOOR + 0.53, dz, mDeskTop);
      kFurn.collide(dx, FLOOR + 0.28, dz, 0.36, 0.28, 0.25);
      this.deskPositions.push(new THREE.Vector3(dx, FLOOR + 0.25, dz));
      deskSpots.push({ x: dx, z: dz, yaw: -Math.PI / 2 + ((((dx * 7 + dz * 13) | 0) % 5) - 2) * 0.07 });
    };
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 2; iz++) desk(x0 + 3.0 + ix * 2.5, z0 + 1.6 + iz * 2.1);
    this.deskNamePos = new THREE.Vector3(x0 + 3.0, FLOOR + 0.58, z0 + 1.6);
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 2; iz++) desk(nSplit + 3.0 + ix * 2.5, z0 + 1.6 + iz * 2.1);
    const pianoZ = z0 + 1.9;   // 피아노는 kFix 가 짓는다 (아래 — 실물 스왑이 없다)
    // 칠판 — 절차 폴백(kFurn) + Tripo 실물 스왑. 분필 낙서는 로드 후 실물 면 위에 얹는다
    const boardDefs = [
      { x: x0 + 0.24, z: (z0 + corrZ0) / 2 },
      { x: nSplit + 0.2, z: (z0 + corrZ0) / 2 },
    ];
    for (const b of boardDefs) kFurn.box(0.06, 1.15, 3.0, b.x, FLOOR + 1.5, b.z, mBoard);
    this.attendancePos = new THREE.Vector3(x0 + 0.38, FLOOR + 1.45, (z0 + corrZ0) / 2);
    // 교무실 책상 + 일지 / 준비실 선반 + 크레용 / 방송실 마이크
    kFurn.box(1.5, 0.72, 0.7, x0 + 2.2, FLOOR + 0.36, corrZ1 + 1.9, mDesk);
    kFurn.collide(x0 + 2.2, FLOOR + 0.36, corrZ1 + 1.9, 0.75, 0.36, 0.35);
    this.journalPos = new THREE.Vector3(x0 + 2.2, FLOOR + 0.76, corrZ1 + 1.9);
    kFurn.box(0.4, 1.6, 2.4, sSplit2 - 0.35, FLOOR + 0.8, corrZ1 + 1.7, mWood);
    kFurn.collide(sSplit2 - 0.35, FLOOR + 0.8, corrZ1 + 1.7, 0.2, 0.8, 1.2);
    this.crayonPos = new THREE.Vector3(sSplit1 + 1.6, FLOOR + 1.1, z1 - 0.3);
    const micX = sSplit2 + 4.2, micZ = z1 - 0.85;
    kFurn.box(0.65, 0.78, 0.42, micX, FLOOR + 0.39, micZ, mDesk);
    kFurn.box(0.13, 0.24, 0.13, micX, FLOOR + 0.92, micZ, mWood);
    this.broadcastPos = new THREE.Vector3(micX, FLOOR + 1.0, micZ);
    this.broadcastMat = new THREE.MeshStandardMaterial({
      color: 0x2a0707,
      emissive: new THREE.Color(0xff1717),
      emissiveIntensity: 0,
      roughness: 0.45,
    });
    const broadcastLamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 6), this.broadcastMat);
    broadcastLamp.position.copy(this.broadcastPos).add(new THREE.Vector3(0.12, 0.02, 0));
    this.group.add(broadcastLamp);
    this.broadcastLight = new THREE.PointLight(0xff1b15, 0, 1.8, 2);
    this.broadcastLight.position.copy(broadcastLamp.position).add(new THREE.Vector3(0, 0.08, 0));
    this.group.add(this.broadcastLight);

    /**
     * ---------- 붙박이 조형물 (미닫이문 · 형광등 · 교탁) ----------
     * 절차 가구(kFurn)와 달리 **실물 스왑이 없는** 것들이다. kFurn 은 Tripo 가구가
     * 도착하면 통째로 숨으므로 여기 것들을 섞으면 같이 사라진다 — 빌더를 따로 쓴다.
     */
    const kFix = new PartsBuilder(physics);
    const mDoorW = k.texMat(woodD, woodN, 0x382d20, { rough: 0.88, repeat: 1.5 });
    // 간유리 — 폐교의 문은 안이 보일 듯 말 듯해야 한다(유리가 저 너머에 서 있을 수 있게)
    const mPane = new THREE.MeshStandardMaterial({ color: 0x151d21, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.46, side: THREE.DoubleSide });
    const mSteel = k.mat(0x2b302d, 0.7);
    // 형광관 — 일곱 기구가 **재질 하나**를 공유한다. 깜빡임은 emissiveIntensity 하나로 돈다
    const mTube = new THREE.MeshStandardMaterial({ color: 0xdfe8e4, emissive: new THREE.Color(0xcfe0da), emissiveIntensity: 0, roughness: 0.35 });
    this.lightMats.push(mTube);

    /**
     * 미닫이문 한 짝 — 허리판(腰板) + 간유리 여섯 칸. 문틀 개구는 **늘 열려 있어야 하므로**
     * (유리의 LOS 는 칸막이 콜라이더로만 돈다) 문짝에는 콜라이더가 없고, 실제 引き戸 처럼
     * 옆 벽면으로 한 짝 폭만큼 밀어 둔 자리에 세운다. baseY 는 문짝 아랫면.
     */
    const LEAF_H = DOOR_HEAD - 0.03, LEAF_T = 0.05;
    const doorLeaf = (b: PartsBuilder, lx: number, baseY: number, lz: number) => {
      const rail = 0.085, stile = 0.075, kick = 0.55, inner = LEAF_W - stile * 2;
      b.box(LEAF_W, rail, LEAF_T, lx, baseY + LEAF_H - rail / 2, lz, mDoorW);
      b.box(LEAF_W, rail, LEAF_T, lx, baseY + rail / 2, lz, mDoorW);
      for (const u of [-1, 1]) b.box(stile, LEAF_H, LEAF_T, lx + u * (LEAF_W - stile) / 2, baseY + LEAF_H / 2, lz, mDoorW);
      b.box(inner, kick, LEAF_T * 0.92, lx, baseY + rail + kick / 2, lz, mDoorW);
      const g0 = baseY + rail + kick, g1 = baseY + LEAF_H - rail;
      b.box(inner, g1 - g0, LEAF_T * 0.34, lx, (g0 + g1) / 2, lz, mPane);
      // 살 — 세로 하나 · 가로 둘 (2.4 m 개구라 문짝이 길다. 칸을 나눠야 문으로 읽힌다)
      b.box(0.042, g1 - g0, LEAF_T * 0.8, lx, (g0 + g1) / 2, lz, mDoorW);
      for (let i = 1; i <= 2; i++) b.box(inner, 0.042, LEAF_T * 0.8, lx, g0 + (g1 - g0) * i / 3, lz, mDoorW);
    };
    /** 상부 홈틀 + 바닥 문지방 — 개구에서 밀어 둔 문짝까지 이어진다 */
    const doorTrack = (at: number, tz: number) => {
      const len = DOOR + LEAF_W + 0.24;
      const mid = at + len / 2 - DOOR / 2 - 0.12;
      kFix.box(len, 0.075, 0.15, mid, FLOOR + DOOR_HEAD + 0.038, tz, mDoorW);
      kFix.box(len, 0.028, 0.15, mid, FLOOR + 0.014, tz, mDoorW);
    };
    // 복도 쪽 다섯 자리. 교실2 만 문짝이 움직이므로(유령문) 여기서는 틀만 놓는다
    const HAUNTED_AT = nSplit + 1.3;
    for (const [at, dz] of [[x0 + 1.3, corrZ0 + 0.079], [HAUNTED_AT, corrZ0 + 0.079],
      [x0 + 4.5, corrZ1 - 0.079], [sSplit1 + 2.0, corrZ1 - 0.079], [sSplit2 + 2.0, corrZ1 - 0.079]] as const) {
      doorTrack(at, dz);
      if (at !== HAUNTED_AT) doorLeaf(kFix, at + LEAF_W, FLOOR, dz);
    }
    // 유령문 — 평소엔 밀려 열려 있고, 첫 방송 때 스스로 닫혔다가 다시 열린다 (§5.3.2)
    this.hauntedDoorClosedX = HAUNTED_AT;
    const kDoor = new PartsBuilder(physics);
    doorLeaf(kDoor, 0, 0, 0);
    this.hauntedDoor = kDoor.build('school-door-haunted');
    this.hauntedDoor.position.set(HAUNTED_AT + LEAF_W, FLOOR, corrZ0 + 0.079);
    this.hauntedDoorPos = new THREE.Vector3(HAUNTED_AT, FLOOR + 1.05, corrZ0 + 0.18);
    this.group.add(this.hauntedDoor);

    // ---------- 형광등 — 복도 4 + 교실 2 + 방송실 1 (전부 유리의 신호등, 초기 상주) ----------
    /**
     * 학교 복도의 역후지형(逆富士) 2등용. 예전에는 **판때기 하나가 천장 아래 12 cm 에 떠**
     * 있었다 — 기구도, 매다는 것도 없이. 이제 천장에서 내려온 파이프 둘 + 강판 등판 +
     * 반사갓 + 형광관 두 대다. 빛나는 것은 관뿐 (기구는 죽은 쇠라야 폐교로 읽힌다).
     */
    const CEIL = FLOOR + H;               // 2층 바닥 슬래브 아랫면
    const tube = (tx: number, tz: number) => {
      const drop = 0.20, LEN = 1.24, topY = CEIL - drop;
      for (const u of [-1, 1]) kFix.cyl(0.016, 0.016, drop, tx + u * (LEN / 2 - 0.18), topY + drop / 2, tz, mSteel, 6);
      kFix.box(LEN, 0.07, 0.13, tx, topY - 0.035, tz, mSteel);                                        // 등판(채널)
      for (const u of [-1, 1]) {                                                                       // 반사갓 — 바깥으로 벌어진 강판
        const g = new THREE.BoxGeometry(LEN, 0.012, 0.135);
        g.rotateX(u * 0.6);
        g.translate(tx, topY - 0.095, tz + u * 0.102);
        kFix.add(g, mSteel);
      }
      for (const u of [-1, 1]) kFix.box(0.055, 0.105, 0.19, tx + u * (LEN / 2 - 0.028), topY - 0.077, tz, mSteel);   // 소켓
      for (const u of [-1, 1]) {                                                                       // 형광관 2 대
        const g = new THREE.CylinderGeometry(0.017, 0.017, LEN - 0.11, 8, 1);
        g.rotateZ(Math.PI / 2);
        g.translate(tx, topY - 0.108, tz + u * 0.046);
        kFix.add(g, mTube);
      }
      const l = new THREE.PointLight(0xcfe0da, 0.0, 7, 2);
      l.position.set(tx, topY - 0.24, tz);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    };
    tube(x0 + 3.5, cz); tube(x0 + 10, cz); tube(x0 + 17, cz); tube(x1 - 3.5, cz);
    tube(nSplit + 3.2, z0 + 1.8);   // 교실2 — 머리빗 근처
    tube(x0 + 5.2, z0 + 2.7);       // 교실1
    tube(micX - 0.6, z1 - 2.6);     // 방송실

    /**
     * 음악실 피아노 — 업라이트. Tripo 의 piano.glb 는 건반도 페달도 없는 **주황 궤짝**이라
     * 「피아노 안의 머리빗」이 전혀 읽히지 않았다. 피아노는 상자에 가까운 물건이라
     * 절차로 짓는 편이 정확하다 (형광등과 같은 판단).
     */
    const mPiano = k.mat(0x171215, 0.42);
    const mIvory = k.mat(0xc9c2b0, 0.55);
    const mEbony = k.mat(0x0b0b0d, 0.4);
    const pBack = x1 - 0.16;                       // 동쪽 박공벽 안쪽 면
    const P_D = 0.36, P_W = 1.5, P_H = 1.30;       // 몸통 깊이 · 폭 · 높이
    const pBodyX = pBack - P_D / 2;
    const pShelfX = pBodyX - P_D / 2 - 0.13;       // 건반 선반 (몸통보다 앞으로 나온다)
    kFix.box(P_D, P_H, P_W, pBodyX, FLOOR + P_H / 2, pianoZ, mPiano);
    kFix.box(0.26, 0.14, P_W, pShelfX, FLOOR + 0.63, pianoZ, mPiano);
    const KEYS = P_W - 0.28, whiteW = KEYS / 35;   // 흰건반 35 (5 옥타브)
    kFix.box(0.23, 0.03, KEYS, pShelfX - 0.005, FLOOR + 0.715, pianoZ, mIvory);
    for (let o = 0; o < 5; o++) for (const st of [0, 1, 3, 4, 5]) {   // 검은건반 — 2 · 3 묶음
      kFix.box(0.14, 0.024, 0.033, pShelfX - 0.042, FLOOR + 0.742, pianoZ - KEYS / 2 + (o * 7 + st + 1) * whiteW, mEbony);
    }
    kFix.box(0.05, 0.30, P_W - 0.06, pBodyX - P_D / 2 - 0.02, FLOOR + 0.95, pianoZ, mPiano);   // 젖혀 올린 건반뚜껑
    {
      // 윗뚜껑 — 뒤쪽에서 경첩으로 열려 있다. 머리빗이 「안에」 있으려면 뚜껑이 열려 있어야 한다
      const g = new THREE.BoxGeometry(0.42, 0.035, P_W);
      g.translate(-0.21, 0, 0);
      g.rotateZ(-0.44);
      g.translate(pBack, FLOOR + P_H + 0.02, pianoZ);
      kFix.add(g, mPiano);
    }
    for (const s2 of [-1, 1]) kFix.box(0.24, 0.60, 0.17, pShelfX + 0.02, FLOOR + 0.30, pianoZ + s2 * (P_W / 2 - 0.09), mPiano);  // 토블록
    kFix.box(0.10, 0.26, 0.20, pBodyX - 0.06, FLOOR + 0.15, pianoZ, mPiano);                                                     // 페달 리라
    for (const s2 of [-1, 0, 1]) kFix.box(0.13, 0.018, 0.045, pBodyX - 0.13, FLOOR + 0.075, pianoZ + s2 * 0.075, mSteel);        // 페달 3
    kFix.collide(pBodyX - 0.05, FLOOR + 0.65, pianoZ, 0.34, 0.65, P_W / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kFix.box(0.05, 0.44, 0.05, pShelfX - 0.55 + sx * 0.13, FLOOR + 0.22, pianoZ + sz * 0.37, mPiano);  // 의자
    kFix.box(0.36, 0.07, 0.88, pShelfX - 0.55, FLOOR + 0.47, pianoZ, mPiano);
    // 머리빗은 열린 뚜껑 아래 **건반 위에 직접** 놓인다. 공물 쪽 공통 받침대도 이 항목만 생략한다.
    this.kushiPos = new THREE.Vector3(pShelfX - 0.02, FLOOR + 0.758, pianoZ + 0.26);

    // 교탁 — 칠판과 첫 책상 열 사이의 빈 자리. 교실은 이 하나로 교실이 된다
    for (const b of boardDefs) {
      kFix.box(0.60, 0.055, 1.02, b.x + 1.42, FLOOR + 0.855, b.z, mDeskTop);
      kFix.box(0.48, 0.80, 0.90, b.x + 1.42, FLOOR + 0.43, b.z, mDesk);
      kFix.collide(b.x + 1.42, FLOOR + 0.43, b.z, 0.24, 0.43, 0.45);
    }

    /**
     * ---------- 남쪽 세 방의 세간 ----------
     * 교무실·준비실·방송실은 책상/선반 하나씩만 놓인 빈 방이었다. 세 방 다 **단서가 나오는
     * 방**이라(§4.2 ACT 8~9 — 일지 · 크레용 · 이름 부르기) 방이 비어 있으면 단서도 안 읽힌다.
     */
    const mCab = k.mat(0x3a413c, 0.62);        // 도장 강판 — 서류 캐비닛 · 방송 랙
    const mIron = k.mat(0x191512, 0.8);        // 무쇠 — 달마 스토브 · 연통
    /** 목제 의자 한 벌 — 앉는 판 + 등받이 + 네 다리 */
    const chair = (cxx: number, czz: number, yaw: number) => {
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const at = (dx: number, dz: number) => [cxx + dx * c - dz * sn, czz + dx * sn + dz * c] as const;
      const [sx, sz] = at(0, 0);
      kFix.box(0.42, 0.045, 0.40, sx, FLOOR + 0.44, sz, mDeskTop, yaw);
      const [bx, bz] = at(0, 0.18);
      kFix.box(0.40, 0.42, 0.04, bx, FLOOR + 0.66, bz, mDeskTop, yaw);
      for (const dx of [-0.17, 0.17]) for (const dz of [-0.15, 0.15]) {
        const [lx, lz] = at(dx, dz);
        kFix.box(0.035, 0.44, 0.035, lx, FLOOR + 0.22, lz, mDesk);
      }
    };
    /** 나무 궤짝 — 준비실 잡동사니. 뚜껑 테두리만 얹어도 상자가 궤짝으로 읽힌다 */
    const crate = (cxx: number, cyy: number, czz: number, w2: number, h2: number, d2: number, yaw = 0) => {
      kFix.box(w2, h2, d2, cxx, cyy, czz, mDoorW, yaw);
      kFix.box(w2 + 0.03, 0.035, d2 + 0.03, cxx, cyy + h2 / 2, czz, mDesk, yaw);
    };

    // ===== 교무실 — 마주 본 교무 책상 섬 · 서류 캐비닛 · 달마 스토브 · 멈춘 벽시계 =====
    const staffDeskSpots: { x: number; z: number }[] = [];
    for (const dz of [corrZ1 + 2.3, corrZ1 + 3.1]) for (const dx of [x0 + 4.9, x0 + 6.4]) staffDeskSpots.push({ x: dx, z: dz });
    for (const sp of staffDeskSpots) {
      kFix.collide(sp.x, FLOOR + 0.37, sp.z, 0.62, 0.37, 0.35);
      chair(sp.x, sp.z + (sp.z < corrZ1 + 2.7 ? -0.78 : 0.78), sp.z < corrZ1 + 2.7 ? 0 : Math.PI);
    }
    for (const cz2 of [corrZ1 + 1.1, corrZ1 + 2.1]) {   // 서류 캐비닛 — 명부가 잠들어 있는 곳
      kFix.box(0.44, 1.80, 0.88, sSplit1 - 0.28, FLOOR + 0.90, cz2, mCab);
      kFix.box(0.02, 1.68, 0.03, sSplit1 - 0.51, FLOOR + 0.90, cz2, mSteel);          // 문 이음매
      for (const hy of [0.62, 1.28]) kFix.box(0.05, 0.035, 0.16, sSplit1 - 0.53, FLOOR + hy, cz2 + 0.2, mSteel);
      kFix.collide(sSplit1 - 0.28, FLOOR + 0.90, cz2, 0.22, 0.90, 0.44);
    }
    {   // 달마 스토브 + 연통 — 쇼와 교사의 겨울. 연통은 천장으로 올라가 남벽으로 빠진다
      const stX = x0 + 3.4, stZ = z1 - 1.5;
      kFix.cyl(0.30, 0.34, 0.62, stX, FLOOR + 0.44, stZ, mIron, 14);
      kFix.cyl(0.22, 0.30, 0.16, stX, FLOOR + 0.83, stZ, mIron, 14);
      kFix.box(0.72, 0.09, 0.72, stX, FLOOR + 0.09, stZ, mIron);                       // 받침 철판
      kFix.box(0.26, 0.24, 0.03, stX - 0.30, FLOOR + 0.44, stZ, mSteel);               // 아궁이 문
      kFix.cyl(0.075, 0.075, 1.20, stX, FLOOR + 1.51, stZ, mIron, 10);
      kFix.box(0.15, 0.15, 1.35, stX, FLOOR + 2.05, stZ + 0.68, mIron);                // 남벽으로 빠지는 가로 연통
      kFix.collide(stX, FLOOR + 0.44, stZ, 0.34, 0.44, 0.34);
    }
    this.group.add(kFix.build('school-fixtures', { spatialCellSize: 16 }));

    // 멈춘 벽시계 · 졸업사진 — 교무실 북쪽 칸막이. 둘 다 「그날」에 붙들려 있다
    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 24),
      new THREE.MeshStandardMaterial({ map: clockCanvas(), roughness: 0.75 }),
    );
    clock.position.set(x0 + 7.1, FLOOR + 2.05, corrZ1 + 0.062);
    this.group.add(clock);
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.02, 0.72),
      new THREE.MeshStandardMaterial({ map: gradPhotoCanvas(), roughness: 0.82 }),
    );
    photo.position.set(x0 + 1.9, FLOOR + 1.78, corrZ1 + 0.062);
    this.group.add(photo);

    // ===== 준비실 — 벽장(크레용 그림이 사는 곳) · 궤짝 =====
    const kRoom = new PartsBuilder(physics);
    /**
     * 벽장(戸棚) — SCHOOL_RECORDS.crayon 은 「戸棚の内側」이라고 말하는데 벽장이 없었다.
     * 미닫이 한 짝을 밀어 두고, 열린 쪽 안판에 크레용 그림을 붙인다. 조사 지점도 그 앞으로.
     */
    // 왼쪽 아래칸은 미오가 웅크려 들어갈 수 있도록 깊이를 확보한다. 단순 조사 판이 아니라
    // 유리의 시선을 끊는 실제 피난처다. 오른쪽 문짝과 위 선반은 그대로 남아 벽장으로 읽힌다.
    const cbX = sSplit1 + 1.6, cbW = 1.8, cbH = 1.95, cbD = 0.86;
    const cbZ = z1 - 0.16 - cbD / 2;                 // 남쪽 외벽 안쪽 면에 붙인다
    const cbBack = cbZ + cbD / 2 - 0.02;             // 뒤판 — 그림이 붙는 면
    // 판재로 짠다(속을 파낸 척하는 통짜 상자는 안이 안 보인다)
    kRoom.box(cbW, cbH, 0.04, cbX, FLOOR + cbH / 2, cbBack, mDoorW);
    for (const u of [-1, 1]) kRoom.box(0.04, cbH, cbD, cbX + u * (cbW / 2 - 0.02), FLOOR + cbH / 2, cbZ, mDoorW);
    for (const yy of [0.025, cbH - 0.025]) kRoom.box(cbW, 0.05, cbD, cbX, FLOOR + yy, cbZ, mDoorW);
    kRoom.box(cbW - 0.09, 0.04, cbD - 0.06, cbX, FLOOR + 0.98, cbZ, mDoorW);            // 중간 선반
    kRoom.box(cbW / 2, cbH - 0.11, 0.035, cbX + cbW / 4, FLOOR + cbH / 2, cbZ - cbD / 2 + 0.03, mDoorW);   // 밀어 둔 문짝 한 짝
    for (const yy of [0.06, cbH - 0.06]) kRoom.box(cbW, 0.035, 0.06, cbX, FLOOR + yy, cbZ - cbD / 2 + 0.02, mDesk);   // 문 홈틀
    // 통짜 콜라이더는 열린 칸까지 막아 놓는다. 뒤판·옆판만 충돌시켜 왼쪽 아래칸에 들어갈 수 있게 한다.
    kRoom.collide(cbX, FLOOR + cbH / 2, cbBack, cbW / 2, cbH / 2, 0.025);
    for (const u of [-1, 1]) kRoom.collide(cbX + u * (cbW / 2 - 0.02), FLOOR + cbH / 2, cbZ, 0.025, cbH / 2, cbD / 2);
    this.hideInsidePos = new THREE.Vector3(cbX - cbW / 4, FLOOR + 0.04, cbZ + 0.02);
    this.hideEntryPos = new THREE.Vector3(cbX - cbW / 4, FLOOR + 0.55, cbZ - cbD / 2 - 0.34);
    // 크레용 그림 — 열린 쪽 안판. 조사 지점을 그 앞으로 옮긴다
    const crayon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.68, 0.85),
      new THREE.MeshStandardMaterial({ map: crayonCanvas(), transparent: true, roughness: 0.95 }),
    );
    crayon.position.set(cbX - cbW / 4, FLOOR + 1.46, cbBack - 0.023);
    crayon.rotation.y = Math.PI;
    this.group.add(crayon);
    this.crayonPos = new THREE.Vector3(cbX - cbW / 4, FLOOR + 1.35, cbZ - 0.45);
    for (const [gx, gz, gw, gh, gd, gy] of [
      [sSplit1 + 4.6, corrZ1 + 3.9, 0.62, 0.46, 0.46, 0.23],
      [sSplit1 + 4.6, corrZ1 + 3.9, 0.54, 0.40, 0.40, 0.66],
      [sSplit1 + 5.3, corrZ1 + 4.2, 0.70, 0.52, 0.50, 0.26],
      [sSplit1 + 3.9, corrZ1 + 4.4, 0.58, 0.44, 0.44, 0.22],
    ] as const) crate(gx, FLOOR + gy, gz, gw, gh, gd, ((gx * 5 + gz * 3) % 1) * 0.9);

    // ===== 방송실 — 탁상 마이크(절차) · 방송 설비 랙 · 테이프 데크 · 벽 스피커 =====
    /**
     * 마이크 — broadcast-mic.glb 는 책상 위 유리 장식으로 읽혔다(가는 침 하나가 솟아 있었다).
     * ACT 9 의 의식이 걸린 물건이라 한눈에 마이크여야 한다: 묵직한 원반 받침 + 크롬 기둥 +
     * 요크에 물린 망 머리. broadcastPos(= 부르는 자리)는 그대로 둔다.
     */
    const micY = FLOOR + 0.75;
    kRoom.cyl(0.115, 0.125, 0.04, micX, micY + 0.02, micZ, mCab, 18);
    kRoom.cyl(0.018, 0.018, 0.19, micX, micY + 0.13, micZ, mSteel, 10);
    for (const u of [-1, 1]) kRoom.box(0.012, 0.14, 0.02, micX, micY + 0.28, micZ + u * 0.055, mSteel);   // 요크
    kRoom.cyl(0.052, 0.052, 0.10, micX, micY + 0.31, micZ, mEbony, 16);                                   // 망 머리
    kRoom.cyl(0.056, 0.056, 0.015, micX, micY + 0.365, micZ, mSteel, 16);
    kRoom.box(0.10, 0.03, 0.07, micX - 0.14, micY + 0.025, micZ + 0.09, mSteel);                          // 스위치 상자
    {   // 방송 설비 랙 — 앰프 · VU 계기 · 테이프 데크. 패널만 캔버스로 그린다
      const rkX = x1 - 0.52, rkZ = corrZ1 + 3.4;
      kRoom.box(0.62, 1.55, 0.80, rkX, FLOOR + 0.775, rkZ, mCab);
      kRoom.collide(rkX, FLOOR + 0.775, rkZ, 0.31, 0.775, 0.40);
      for (const dy of [0.34, 1.16]) kRoom.box(0.02, 0.03, 0.72, rkX - 0.31, FLOOR + dy, rkZ, mSteel);
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.70, 0.52),
        new THREE.MeshStandardMaterial({ map: rackPanelCanvas(), roughness: 0.6 }),
      );
      panel.position.set(rkX - 0.315, FLOOR + 0.86, rkZ);
      panel.rotation.y = -Math.PI / 2;
      this.group.add(panel);
      // 테이프 데크 — 랙 위. §5.3.2 2부의 녹음테이프가 사는 자리
      kRoom.box(0.42, 0.12, 0.34, rkX, FLOOR + 1.61, rkZ, mCab);
      for (const u of [-1, 1]) kRoom.cyl(0.075, 0.075, 0.014, rkX + 0.02, FLOOR + 1.674, rkZ + u * 0.085, mEbony, 14);
    }
    // 벽 스피커 — 복도 방송이 이 방에서 나간다
    kRoom.box(0.30, 0.38, 0.26, x1 - 2.4, FLOOR + 2.22, corrZ1 + 0.19, mDoorW);
    kRoom.box(0.02, 0.28, 0.18, x1 - 2.4 - 0.16, FLOOR + 2.22, corrZ1 + 0.19, mEbony);
    this.group.add(kRoom.build('school-rooms', { spatialCellSize: 16 }));

    /**
     * ---------- 복도 · 현관 (신발장 · 막힌 계단 · 세간) ----------
     * 복도는 유리 추격의 주 무대인데 문 말고는 아무것도 없었고, 현관은 포치에서 문 하나 지나면
     * 곧장 복도였다(일본 학교의 첫 화면은 신발장이다). 설정은 2층 교사인데(§2.3) 실내에
     * 계단이 없어 층이 안 읽히던 것도 여기서 메운다.
     */
    const kHall = new PartsBuilder(physics);
    const mRed = k.mat(0x671a12, 0.5);         // 소화기
    const mConc = k.mat(0x5a5e57, 0.92);       // 수돗가 인조석

    // ===== 신발장(下駄箱) — 현관 안쪽 남벽. 스물넷 칸, 이름표는 스물셋 =====
    /**
     * 이 폐교의 주제는 「지워진 이름」인데 단서 넷이 전부 건물 안쪽 깊이 있었다. 들어서자마자
     * 보이는 신발장에 **한 칸만 이름표가 뜯겨 나가** 있으면 예고가 된다 — 빈자리는 오십음도
     * 순으로 「たなか」와 「なかむら」 사이, 정확히 **なつめ** 가 있어야 할 칸이다.
     */
    const gbX0 = x0 + 0.45, gbW = 3.2, gbBase = 0.09, gbTop = 0.08;
    const gbGridH = 1.52, gbD = 0.42;
    const gbZ = corrZ1 - 0.05 - gbD / 2;       // 남벽 면에 등을 붙인다
    const gbCX = gbX0 + gbW / 2, gbY0 = FLOOR + gbBase;
    kHall.box(gbW, gbBase, gbD, gbCX, FLOOR + gbBase / 2, gbZ, mDoorW);                       // 굽받이
    kHall.box(gbW, gbTop, gbD, gbCX, gbY0 + gbGridH + gbTop / 2, gbZ, mDoorW);                // 천판
    kHall.box(gbW, gbGridH, 0.03, gbCX, gbY0 + gbGridH / 2, gbZ + gbD / 2 - 0.015, mTrim);    // 뒤판
    for (let i = 0; i <= 6; i++) {                                                            // 세로 칸막이 (양끝 = 옆판)
      const t = i === 0 || i === 6 ? 0.035 : 0.022;
      kHall.box(t, gbGridH, gbD, gbX0 + (i / 6) * gbW, gbY0 + gbGridH / 2, gbZ, mDoorW);
    }
    for (let j = 1; j < 4; j++) kHall.box(gbW, 0.024, gbD, gbCX, gbY0 + (j / 4) * gbGridH, gbZ, mDoorW);
    kHall.collide(gbCX, FLOOR + (gbBase + gbGridH + gbTop) / 2, gbZ, gbW / 2, (gbBase + gbGridH + gbTop) / 2, gbD / 2);
    const tags = new THREE.Mesh(
      new THREE.PlaneGeometry(gbW, gbGridH),
      new THREE.MeshStandardMaterial({ map: getabakoTagCanvas(), transparent: true, roughness: 0.9 }),
    );
    tags.position.set(gbCX, gbY0 + gbGridH / 2, gbZ - gbD / 2 - 0.008);
    tags.rotation.y = Math.PI;
    this.group.add(tags);
    // 조사 자리는 신발장 앞. 들어서면 바로 잡히도록 복도 쪽으로 반 걸음 내놓는다
    this.getabakoPos = new THREE.Vector3(gbCX, FLOOR + 0.95, gbZ - gbD / 2 - 0.34);

    // ===== 막힌 계단 — 복도 동쪽 끝. 올라가는 다섯 단과, 그 위를 가로막은 널판 =====
    // 폭은 복도를 꽉 채운다 — 좁게 놓으면 양옆으로 돌아 널판 뒤 죽은 공간에 들어가진다
    const stX0 = x1 - 2.8, stRun = 0.32, stRise = 0.20, stW = corrZ1 - corrZ0 - 0.12;
    const stTop = FLOOR + stRise * 5;
    for (let i = 0; i < 5; i++) {   // 옆이 막힌 상자 계단 — 단마다 바닥까지 채운다
      const h = stRise * (i + 1), sx = stX0 + (i + 0.5) * stRun;
      kHall.box(stRun, h, stW, sx, FLOOR + h / 2, cz, mDesk);
      kHall.collide(sx, FLOOR + h / 2, cz, stRun / 2, h / 2, stW / 2);
    }
    {
      const bX = stX0 + 5 * stRun + 0.03;
      for (let i = 0; i < 6; i++) {   // 가로 널판 — 틈을 남겨 못질했다. 그 너머는 어둠뿐
        const py = stTop + 0.14 + i * 0.27;
        if (py > FLOOR + H - 0.1) break;
        kHall.box(0.05, 0.21, stW, bX, py, cz, mDoorW);
      }
      for (const u of [-1, 1]) {      // 엇갈려 댄 버팀목
        const g = new THREE.BoxGeometry(0.045, 1.72, 0.14);
        g.rotateX(u * 0.71);
        g.translate(bX - 0.05, stTop + 0.85, cz);
        kHall.add(g, mDoorW);
      }
      kHall.collide(bX, stTop + 0.85, cz, 0.09, 0.85, stW / 2);
      // 난간 — 북벽에 붙인 손스침. 디딤판 위 0.85 m 를 계단 기울기 그대로 따라간다
      const slope = stRise / stRun, railZ = corrZ0 + 0.17;
      const railMidX = stX0 + 2.5 * stRun, railMidY = FLOOR + stRise * 2 + 0.85;
      const railY = (px: number) => railMidY + (px - railMidX) * slope;
      for (let i = 0; i < 3; i++) {   // 벽 브래킷
        const px = stX0 + 0.24 + i * 0.66;
        kHall.box(0.055, 0.05, 0.17, px, railY(px) - 0.045, corrZ0 + 0.095, mSteel);
      }
      const rail = new THREE.BoxGeometry(2.1, 0.06, 0.075);
      rail.rotateZ(Math.atan(slope));
      rail.translate(railMidX, railMidY, railZ);
      kHall.add(rail, mDesk);
      const stairSign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.82, 0.48),
        new THREE.MeshStandardMaterial({ map: stairSignCanvas(), transparent: true, roughness: 0.85 }),
      );
      stairSign.position.set(bX - 0.035, stTop + 1.16, cz);
      stairSign.rotation.y = -Math.PI / 2;
      this.group.add(stairSign);
    }

    // ===== 복도 세간 — 소화기 둘 · 게시판 · 수돗가 =====
    for (const fx of [x0 + 4.5, x0 + 20.0]) {   // 소화기 — 북벽 걸이. 문틀·거울을 피한 자리
      const fz = corrZ0 + 0.14;
      kHall.cyl(0.085, 0.095, 0.42, fx, FLOOR + 0.66, fz, mRed, 12);
      kHall.cyl(0.035, 0.035, 0.10, fx, FLOOR + 0.92, fz, mSteel, 8);
      kHall.box(0.05, 0.10, 0.16, fx + 0.09, FLOOR + 0.92, fz, mEbony);
      kHall.box(0.24, 0.05, 0.09, fx, FLOOR + 0.50, corrZ0 + 0.09, mSteel);   // 벽 걸이
      kHall.box(0.30, 0.34, 0.025, fx, FLOOR + 1.30, corrZ0 + 0.072, mRed);   // 「消火器」 표지판
    }
    {   // 수돗가 — 남벽. 인조석 물통 + 꼭지 셋
      const wX = x0 + 9.1, wZ = corrZ1 - 0.05 - 0.19;
      kHall.box(1.34, 0.26, 0.38, wX, FLOOR + 0.78, wZ, mConc);
      kHall.box(1.10, 0.10, 0.26, wX, FLOOR + 0.86, wZ - 0.02, mTrim);        // 파인 물받이
      kHall.box(0.52, 0.66, 0.30, wX, FLOOR + 0.33, wZ + 0.02, mConc);        // 다리
      for (const u of [-1, 0, 1]) {
        kHall.cyl(0.022, 0.022, 0.20, wX + u * 0.38, FLOOR + 1.02, wZ + 0.13, mSteel, 8);
        kHall.box(0.05, 0.045, 0.14, wX + u * 0.38, FLOOR + 1.10, wZ + 0.05, mSteel);
        kHall.box(0.11, 0.03, 0.03, wX + u * 0.38, FLOOR + 1.14, wZ + 0.13, mSteel);   // 손잡이
      }
      kHall.collide(wX, FLOOR + 0.55, wZ, 0.67, 0.55, 0.19);
    }
    // 게시판 — 북벽. 틀은 지오메트리, 붙은 종이는 캔버스
    kHall.box(1.92, 1.07, 0.05, x0 + 7.3, FLOOR + 1.48, corrZ0 + 0.075, mDesk);
    this.group.add(kHall.build('school-hall', { spatialCellSize: 16 }));
    const notice = new THREE.Mesh(
      new THREE.PlaneGeometry(1.80, 0.95),
      new THREE.MeshStandardMaterial({ map: noticeBoardCanvas(), roughness: 0.92 }),
    );
    notice.position.set(x0 + 7.3, FLOOR + 1.48, corrZ0 + 0.103);
    this.group.add(notice);

    // 「방송 중」 표시등 — 문 위. 죽은 마이크가 살아나는 동안만 같이 붉어진다
    this.broadcastMats = [this.broadcastMat];
    const onAirTex = onAirCanvas();
    const signMat = new THREE.MeshStandardMaterial({
      map: onAirTex, emissiveMap: onAirTex, color: 0x6a5f5c,
      emissive: new THREE.Color(0xff2a18), emissiveIntensity: 0, roughness: 0.5,
    });
    this.broadcastMats.push(signMat);
    const onAirSign = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.19, 0.06), signMat);
    onAirSign.position.set(sSplit2 + 2.0, FLOOR + DOOR_HEAD + 0.15, corrZ1 + 0.05);
    this.group.add(onAirSign);

    // 복도 거울 — 실제 반사 RT 대신 어두운 유리와 별도 잔상을 겹친다. ACT 8의 핵심은 정확한
    // 반사가 아니라 「거울 속 유리가 현실과 다른 곳에 있다」는 규칙이고, 이 방식은 추가 렌더패스가 없다.
    // ⚠️ cx+1.3 은 교실2 유령문이 **열려 선 자리**(63.4~64.6)와 겹쳤다 — 예전엔 그 문짝이
    // 평소 안 보여서 드러나지 않았다. 거울을 문짝 동쪽으로 물린다.
    const mirrorX = cx + 3.6, mirrorZ = corrZ0 + 0.115;
    const mirrorPane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.02, 1.58),
      new THREE.MeshPhysicalMaterial({
        color: 0x26313a, roughness: 0.18, metalness: 0.72, transparent: true, opacity: 0.62,
        clearcoat: 0.55, clearcoatRoughness: 0.2, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    mirrorPane.position.set(mirrorX, FLOOR + 1.35, mirrorZ + 0.012);
    mirrorPane.renderOrder = 3;
    this.group.add(mirrorPane);
    for (const [fw, fh, ox, oy] of [
      [1.16, 0.065, 0, 0.82], [1.16, 0.065, 0, -0.82],
      [0.065, 1.70, -0.55, 0], [0.065, 1.70, 0.55, 0],
    ] as const) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.055), mTrim);
      frame.position.set(mirrorX + ox, FLOOR + 1.35 + oy, mirrorZ + 0.025);
      this.group.add(frame);
    }

    // 유리 리스폰 자리 (방 안쪽 구석)
    this.spawns.push(
      new THREE.Vector3(x0 + 1.2, FLOOR, z0 + 0.9),          // 교실1 서북
      new THREE.Vector3(x1 - 1.2, FLOOR, z0 + 0.9),          // 교실2 동북
      new THREE.Vector3(sSplit2 - 1.2, FLOOR, z1 - 0.9),     // 준비실 동남
      new THREE.Vector3(x0 + 1.2, FLOOR, z1 - 0.9),          // 교무실 서남
    );

    // 머리빗을 얻은 뒤에는 본체 외에도 창밖과 천장에 얼굴 없는 학생이 한 프레임씩 걸린다.
    // 복제 모델 셋을 더 올리지 않고 동일한 128×256 실루엣 텍스처를 빌보드로 공유한다.
    const apparitionTex = facelessApparitionTexture();
    const apparitionDefs = [
      { p: new THREE.Vector3(cx - 5.2, FLOOR + 1.55, z0 + 0.22), s: [0.78, 1.62] as const, upsideDown: false },
      { p: new THREE.Vector3(cx + 5.6, FLOOR + 1.62, z1 - 0.22), s: [0.82, 1.7] as const, upsideDown: false },
      { p: new THREE.Vector3(cx + 2.2, FLOOR + 2.72, cz - 0.15), s: [0.68, 1.42] as const, upsideDown: true },
      // 거울 유리는 현실의 본체와 무관한 고정점에 선다. 거울 프레임 안에서만 보이도록 작게 재단.
      { p: new THREE.Vector3(mirrorX, FLOOR + 1.25, mirrorZ - 0.01), s: [0.46, 1.08] as const, upsideDown: false },
    ];
    for (const d2 of apparitionDefs) {
      const mat = new THREE.SpriteMaterial({
        map: apparitionTex, color: 0xd5dfeb, transparent: true, opacity: 0,
        depthWrite: false, fog: true, rotation: d2.upsideDown ? Math.PI : 0,
      });
      const ghost = new THREE.Sprite(mat);
      ghost.position.copy(d2.p);
      ghost.scale.set(d2.s[0], d2.s[1], 1);
      ghost.visible = false;
      ghost.renderOrder = 4;
      this.apparitions.push(ghost);
      this.group.add(ghost);
    }

    this.group.add(k.build('school-interior', { spatialCellSize: 16 }));
    const furnProc = kFurn.build('school-furniture', { spatialCellSize: 16 });
    this.group.add(furnProc);

    /**
     * 가구 실물 (Tripo 6종) — 도착하면 절차 가구(kFurn)를 통째로 감춘다.
     * 칠판은 실물 위에 **분필 캔버스**를 얹는다 — 낙서 내용은 SCHOOL_RECORDS.attendance 의
     * 단서(「23」 위에 「24」, 24만 세게 지운 흔적)와 같은 사건을 그린다. 글자는 캔버스가 정답
     * (로컬라이즈·훼손 연출은 코드가 다시 그릴 수 있어야 한다 — 비석 각인과 같은 원칙).
     */
    void Promise.all([
      Props.loadNormalized('/models/props/school-desk.glb', 0.78, 0.55),
      Props.loadNormalized('/models/props/teacher-desk.glb', 0.75, 0.5),
      Props.loadNormalized('/models/props/shelf.glb', 1.85, 0.5),
      Props.loadNormalized('/models/props/blackboard.glb', 1.35, 0.6),
    ]).then(([deskM, tdeskM, shelfM, boardM]) => {
      const clampXZ = (m: THREE.Group, max: number) => {
        const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
        m.scale.multiplyScalar(Math.min(1, max / Math.max(sz.x, sz.z)));
      };
      clampXZ(deskM, 1.05);
      for (const sp of deskSpots) {
        const m = deskM.clone(true);
        m.position.set(sp.x, FLOOR, sp.z);
        m.rotation.y = sp.yaw;
        this.group.add(m);
      }
      clampXZ(tdeskM, 1.6);
      tdeskM.position.set(x0 + 2.2, FLOOR, corrZ1 + 1.9);
      // 교사용 책상은 긴 축을 교실의 X축에 맞춘다.
      tdeskM.rotation.y = Math.PI / 2;
      this.group.add(tdeskM);
      const micTable = tdeskM.clone(true);
      micTable.position.set(micX, FLOOR, micZ);
      micTable.rotation.y = Math.PI / 2;
      this.group.add(micTable);
      // 교무실의 마주 본 책상 섬 — 같은 실물을 네 벌 더 놓는다 (콜라이더·의자는 kFix 가 이미 깔았다)
      for (const sp of staffDeskSpots) {
        const m = tdeskM.clone(true);
        m.position.set(sp.x, FLOOR, sp.z);
        m.rotation.y = Math.PI / 2;
        this.group.add(m);
      }
      clampXZ(shelfM, 2.4);
      shelfM.position.set(sSplit2 - 0.35, FLOOR, corrZ1 + 1.7);
      // 선반도 원본 긴 축이 Z다. X방향 칸막이 옆에서는 무회전이 벽과 평행이다.
      shelfM.rotation.y = 0;
      this.group.add(shelfM);
      const shelf2 = shelfM.clone(true);
      shelf2.position.set(sSplit2 - 0.35, FLOOR, corrZ1 + 4.1);
      this.group.add(shelf2);
      // 칠판 실물 — 벽에 걸린 높이(판 중심 1.5)로 맞추고, 분필 낙서를 판면 위에 얹는다
      clampXZ(boardM, 3.1);
      const bb = new THREE.Box3().setFromObject(boardM);
      const bh = bb.max.y - bb.min.y, bdep = bb.max.x - bb.min.x, bw = bb.max.z - bb.min.z;
      /**
       * 분필 캔버스는 **판면 안쪽**에만 앉는다. 예전에는 2.5 × 0.95 m 로 못박혀 있어서
       * 폭 1.87 m 판을 양옆으로 0.3 m 씩 넘겨 **글씨가 벽에 써졌다**. 이제 실물 판을 재서 맞춘다:
       *   · PANEL_W/H — 나무 테두리 안쪽 흑판 면의 비율 (blackboard.glb 정면 실측)
       *   · PANEL_X   — 판면은 앞면(분필받이)보다 뒤로 물러나 있다. 두께의 0.74 지점이 흑판 면이다
       *                 (예전엔 바운딩박스 앞면 + 1 cm 라 낙서가 판에서 8 cm 떠 있었다)
       *   · 캔버스 종횡비도 판에 맞춰 다시 그린다 — 안 그러면 글자가 눌린다
       */
      const PANEL_W = 0.86, PANEL_H = 0.72, PANEL_X = 0.74;
      const chalkW = bw * PANEL_W, chalkH = bh * PANEL_H;
      const chalkGeo = new THREE.PlaneGeometry(chalkW, chalkH);
      const chalkMat = new THREE.MeshStandardMaterial({
        map: chalkCanvas(chalkW / chalkH), transparent: true, roughness: 0.9,
        polygonOffset: true, polygonOffsetFactor: -1,
      });
      for (const bd2 of boardDefs) {
        const m = boardM.clone(true);
        // blackboard.glb는 폭=Z, 두께=X로 정규화되어 있다. 이미 X벽과 평행하므로 돌리지 않는다.
        // 기존 +90°는 폭 1.9 m를 X축으로 눕혀 칠판이 벽을 가로질러 튀어나오게 했다.
        m.rotation.y = 0;
        m.position.set(bd2.x - 0.02, FLOOR + 1.5 - bh / 2, bd2.z);
        this.group.add(m);
        const chalk = new THREE.Mesh(chalkGeo, chalkMat);
        chalk.position.set(bd2.x - 0.02 + bdep * (PANEL_X - 0.5) + 0.009, FLOOR + 1.5 + bh * 0.03, bd2.z);
        chalk.rotation.y = Math.PI / 2;
        this.group.add(chalk);
      }
      furnProc.visible = false;
    }).catch((e) => console.warn('[school] 가구 모델 로드 실패 — 절차 가구 유지:', e));
    scene.add(this.group);
  }

  /**
   * 형광등 깜빡임 0..1 — 유리 드라이버가 몬다. 0 이면 죽은 등(폐교의 평소),
   * 커질수록 켜졌다 꺼졌다를 반복한다 — 불규칙 이중 사인 + 스파이크
   */
  setFlicker(k: number) { this.flickerK = THREE.MathUtils.clamp(k, 0, 1); }

  /** 지워진 이름을 부르는 동안만 죽은 마이크가 붉게 살아난다. */
  pulseBroadcast(seconds = 8) { this.broadcastPulse = Math.max(this.broadcastPulse, seconds); }

  /** 유리 AI가 보내는 접근도. 실제 유리를 보고 정지시켜도 잔상은 다른 위치에서 짧게 나타난다. */
  setApparitionThreat(active: boolean, proximity = 0) {
    this.apparitionsActive = active;
    this.apparitionThreat = THREE.MathUtils.clamp(proximity, 0, 1);
    if (!active) for (const a of this.apparitions) {
      a.visible = false;
      (a.material as THREE.SpriteMaterial).opacity = 0;
    }
  }

  hauntDoor() {
    this.hauntedDoorSlide = 0;
  }

  get doorBraced() { return this.doorBraceT > 0; }

  /** 복도 미닫이문을 잠깐 고정한다. 동적 콜라이더라 시간이 끝나면 반드시 제거한다. */
  braceHauntedDoor(seconds = 3.8) {
    if (this.doorBraceT > 0) return false;
    this.doorBraceT = seconds;
    this.hauntedDoorSlide = 0;
    this.hauntedDoor.position.x = this.hauntedDoorClosedX;
    if (!this.doorBarrier) {
      this.doorBarrier = this.physics.addStaticBox(
        new THREE.Vector3(this.hauntedDoorClosedX, this.bounds.floorY + MIO_CLEAR_DOOR_HEIGHT / 2, this.hauntedDoor.position.z),
        new THREE.Vector3(DOOR_W / 2, MIO_CLEAR_DOOR_HEIGHT / 2, 0.055),
      );
    }
    return true;
  }

  /** 준비실 벽장 왼쪽 아래칸. 들어가기만 해서는 안 되고 main에서 웅크림까지 함께 확인한다. */
  inHideCloset(p: THREE.Vector3) {
    return Math.abs(p.x - this.hideInsidePos.x) < 0.43
      && Math.abs(p.z - this.hideInsidePos.z) < 0.38
      && p.y >= this.bounds.floorY - 0.25 && p.y <= this.bounds.floorY + 1.15;
  }

  contains(p: THREE.Vector3) {
    const b = this.bounds;
    return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ
      && p.y >= b.floorY - 0.5 && p.y <= b.floorY + 3.5;
  }

  update(dt: number) {
    this.t += dt;
    const kk = this.flickerK;
    // 죽은 등이 살아나려 애쓰는 파형: 이중 사인 곱(불규칙) + 임계 통과 때만 점등
    const wave = Math.sin(this.t * 13.7) * Math.sin(this.t * 5.3) + Math.sin(this.t * 31.1) * 0.35;
    const on = wave > (1.15 - kk * 1.1) ? 1 : 0;
    const inten = on * (0.55 + kk * 0.75);
    for (const m of this.lightMats) m.emissiveIntensity = inten * 1.4;
    for (const l of this.lights) l.intensity = inten;
    this.broadcastPulse = Math.max(0, this.broadcastPulse - dt);
    const red = this.broadcastPulse > 0 ? 1 : 0;
    for (const m of this.broadcastMats) m.emissiveIntensity += (red * 2.4 - m.emissiveIntensity) * (1 - Math.exp(-dt * 12));
    this.broadcastLight.intensity = this.broadcastMat.emissiveIntensity * 0.34;
    if (this.doorBraceT > 0) {
      this.doorBraceT = Math.max(0, this.doorBraceT - dt);
      this.hauntedDoorSlide = 0;
      this.hauntedDoor.position.x = this.hauntedDoorClosedX;
      if (this.doorBraceT <= 0 && this.doorBarrier) {
        this.physics.world.removeRigidBody(this.doorBarrier.body);
        this.doorBarrier = null;
      }
    } else if (this.hauntedDoorSlide < 0.999) {
      this.hauntedDoorSlide += (1 - this.hauntedDoorSlide) * (1 - Math.exp(-dt * 1.55));
      this.hauntedDoor.position.x = this.hauntedDoorClosedX + this.hauntedDoorSlide * LEAF_W;
    }
    // 접근할수록 더 자주, 그러나 한 번에 하나만. 실제 위치와 다른 곳에 보이는 규칙을
    // 저렴한 잔상으로 전달하고, 0.16초 안팎의 짧은 점멸로 정적인 판 느낌을 감춘다.
    const slot = Math.floor(this.t / 1.37) % Math.max(1, this.apparitions.length);
    const blink = Math.sin(this.t * 23.0) * Math.sin(this.t * 8.7);
    for (let i = 0; i < this.apparitions.length; i++) {
      const a = this.apparitions[i]!;
      const on2 = this.apparitionsActive && i === slot && blink > 0.48 - this.apparitionThreat * 0.35;
      const mat = a.material as THREE.SpriteMaterial;
      const target = on2 ? 0.18 + this.apparitionThreat * 0.34 : 0;
      mat.opacity += (target - mat.opacity) * (1 - Math.exp(-dt * (on2 ? 24 : 13)));
      a.visible = mat.opacity > 0.012;
    }
  }
}

/** 얼굴의 자리를 비워 둔 교복 실루엣. 작은 단색 텍스처라 세 잔상이 GPU 메모리를 공유한다. */
function facelessApparitionTexture() {
  return textCanvas(128, 256, (ctx) => {
    ctx.clearRect(0, 0, 128, 256);
    const haze = ctx.createRadialGradient(64, 112, 12, 64, 126, 94);
    haze.addColorStop(0, 'rgba(5,8,12,0.96)');
    haze.addColorStop(0.7, 'rgba(5,8,12,0.72)');
    haze.addColorStop(1, 'rgba(5,8,12,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = 'rgba(4,6,9,0.96)';
    ctx.beginPath(); ctx.ellipse(64, 55, 23, 31, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(38, 91); ctx.lineTo(90, 91); ctx.lineTo(106, 226); ctx.lineTo(22, 226); ctx.closePath(); ctx.fill();
    // 얼굴만 빛이 먹은 듯 매끈하게 비어 있다.
    const face = ctx.createRadialGradient(64, 56, 2, 64, 56, 17);
    face.addColorStop(0, 'rgba(188,198,204,0.5)');
    face.addColorStop(1, 'rgba(93,106,116,0.08)');
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.ellipse(64, 57, 15, 20, 0, 0, Math.PI * 2); ctx.fill();
  });
}

/**
 * 분필 낙서 캔버스 — 3학년 교실 사건의 그림: 날짜(그날), 지우다 만 출석 숫자
 * 「23」 위에 「24」(24만 여러 번 지운 자국), 지우개 자국들. SCHOOL_RECORDS.attendance 와 한 사건.
 */
function chalkCanvas(aspect: number): THREE.CanvasTexture {
  // 판면 비율을 그대로 받는다 — 좌표·글자 크기는 전부 비율이라 어떤 칠판에 얹어도 안 눌린다.
  // 세로 기준(H)으로 재는 이유: 분필 글씨 크기는 판의 **높이**에 매여 있다 (사람 손 크기)
  const W = 1024, H = Math.round(W / aspect);
  return textCanvas(W, H, (ctx) => {
    ctx.clearRect(0, 0, W, H);
    const chalk = (a: number) => `rgba(226, 230, 224, ${a})`;
    const u = (t: number) => t * W, v = (t: number) => t * H;
    // 지우개 자국 — 넓고 흐린 스트로크
    ctx.strokeStyle = chalk(0.05);
    ctx.lineWidth = H * 0.121;
    ctx.lineCap = 'round';
    for (const [ax, ay, bx, by] of [[0.117, 0.395, 0.420, 0.289], [0.195, 0.658, 0.547, 0.605], [0.586, 0.368, 0.879, 0.474]] as const) {
      ctx.beginPath(); ctx.moveTo(u(ax), v(ay)); ctx.quadraticCurveTo(u((ax + bx) / 2), v(ay - 0.105), u(bx), v(by)); ctx.stroke();
    }
    // 날짜 — 우상단. 공고판·폰과 같은 그날
    ctx.fillStyle = chalk(0.55);
    ctx.font = `500 ${H * 0.116}px serif`;
    ctx.textAlign = 'right';
    ctx.fillText('九月二十三日', u(0.955), v(0.19));
    // 출석표 — 좌하단 구석
    ctx.textAlign = 'left';
    ctx.font = `500 ${H * 0.105}px serif`;
    ctx.fillStyle = chalk(0.5);
    ctx.fillText('在籍 23', u(0.068), v(0.711));
    ctx.fillText('出席', u(0.068), v(0.868));
    // 「23」 위에 다른 필체의 「24」 — 24만 여러 번 세게 지웠다
    ctx.fillStyle = chalk(0.34);
    ctx.font = `500 ${H * 0.111}px serif`;
    ctx.fillText('23', u(0.171), v(0.874));
    ctx.save();
    ctx.translate(u(0.182), v(0.847)); ctx.rotate(-0.08);
    ctx.font = `700 ${H * 0.126}px serif`;
    ctx.fillStyle = chalk(0.42);
    ctx.fillText('24', 0, 0);
    ctx.restore();
    ctx.strokeStyle = chalk(0.10);
    ctx.lineWidth = H * 0.079;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(u(0.156), v(0.758 + i * 0.024)); ctx.lineTo(u(0.262), v(0.737 + i * 0.024));
      ctx.stroke();
    }
  });
}

/**
 * 교무실 벽시계 — 그날에 붙들려 멈춰 있다. CircleGeometry 의 UV 는 사각 캔버스의
 * 한가운데 원을 그대로 쓰므로, 캔버스 전면에 시계 판을 채운다.
 */
function clockCanvas(): THREE.CanvasTexture {
  return textCanvas(512, 512, (ctx) => {
    const C = 256;
    ctx.fillStyle = '#1a1613'; ctx.beginPath(); ctx.arc(C, C, 254, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cfc6b2'; ctx.beginPath(); ctx.arc(C, C, 224, 0, Math.PI * 2); ctx.fill();
    // 곰팡이 얼룩 — 폐교의 십 년
    for (const [ox, oy, r, a] of [[-90, -60, 70, 0.13], [70, 95, 88, 0.10], [110, -110, 54, 0.09]] as const) {
      ctx.fillStyle = `rgba(70, 62, 44, ${a})`;
      ctx.beginPath(); ctx.arc(C + ox, C + oy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#2a241d'; ctx.lineCap = 'butt';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
      ctx.lineWidth = big ? 8 : 3;
      const r0 = big ? 176 : 194;
      ctx.beginPath();
      ctx.moveTo(C + Math.sin(a) * r0, C - Math.cos(a) * r0);
      ctx.lineTo(C + Math.sin(a) * 210, C - Math.cos(a) * 210);
      ctx.stroke();
    }
    // 두 시 사십칠 분에서 멈췄다 — 초침은 아예 떨어져 판 아래 걸려 있다
    const hand = (turn: number, len: number, w: number, col: string) => {
      const a = turn * Math.PI * 2;
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(C - Math.sin(a) * 26, C + Math.cos(a) * 26);
      ctx.lineTo(C + Math.sin(a) * len, C - Math.cos(a) * len); ctx.stroke();
    };
    hand((2 + 47 / 60) / 12, 118, 17, '#1d1915');
    hand(47 / 60, 176, 11, '#1d1915');
    ctx.save();
    ctx.translate(C, C + 150); ctx.rotate(1.32);
    ctx.strokeStyle = 'rgba(120, 30, 24, 0.85)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-120, 0); ctx.lineTo(60, 0); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#1d1915'; ctx.beginPath(); ctx.arc(C, C, 13, 0, Math.PI * 2); ctx.fill();
    // 유리에 간 금
    ctx.strokeStyle = 'rgba(232, 236, 232, 0.30)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(96, 62); ctx.lineTo(214, 250); ctx.lineTo(180, 402); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(214, 250); ctx.lineTo(392, 210); ctx.stroke();
  });
}

/**
 * 졸업사진 — 명부는 스물셋인데 **줄에 선 아이는 스물넷**이다(칠판의 「23 위에 24」와 한 사건).
 * 한 얼굴만 손톱으로 긁혀 있다 — 지워진 쪽은 언제나 같은 아이다.
 */
function gradPhotoCanvas(): THREE.CanvasTexture {
  return textCanvas(720, 508, (ctx) => {
    ctx.fillStyle = '#241d15'; ctx.fillRect(0, 0, 720, 508);          // 액자
    ctx.fillStyle = '#cdb992'; ctx.fillRect(24, 24, 672, 460);        // 대지
    ctx.fillStyle = '#a89272'; ctx.fillRect(38, 38, 644, 400);        // 인화지
    let scratched = { x: 0, y: 0 };
    let n = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
      const x = 78 + c * 78, y = 118 + r * 108;
      ctx.fillStyle = 'rgba(58, 47, 33, 0.92)';                       // 교복 — 어깨에서 아래로
      ctx.beginPath();
      ctx.moveTo(x - 27, y + 76); ctx.lineTo(x - 20, y + 26);
      ctx.quadraticCurveTo(x, y + 14, x + 20, y + 26);
      ctx.lineTo(x + 27, y + 76); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(232, 216, 186, 0.96)';                    // 얼굴
      ctx.beginPath(); ctx.ellipse(x, y, 16, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(38, 30, 22, 0.95)';                       // 머리 — 윗머리만
      ctx.beginPath(); ctx.ellipse(x, y - 5, 17.5, 16, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(64, 52, 38, 0.75)';                       // 눈 두 점
      ctx.beginPath(); ctx.arc(x - 6, y + 2, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 6, y + 2, 2.2, 0, Math.PI * 2); ctx.fill();
      if (n === 12) scratched = { x, y };
      n++;
    }
    // 손톱으로 긁어낸 얼굴 하나 — 인화지가 벗겨져 하얗게 일어났다
    ctx.save();
    ctx.beginPath(); ctx.ellipse(scratched.x, scratched.y - 2, 22, 27, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(214, 204, 184, 0.85)';
    ctx.fillRect(scratched.x - 24, scratched.y - 30, 48, 58);
    ctx.strokeStyle = 'rgba(120, 104, 78, 0.85)'; ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      ctx.lineWidth = 1.5 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(scratched.x - 26 + (i * 9) % 22, scratched.y - 32 + (i * 7) % 12);
      ctx.lineTo(scratched.x + 26 - (i * 5) % 20, scratched.y + 32 - (i * 11) % 14);
      ctx.stroke();
    }
    ctx.restore();
    // 나이 든 인화지 — 네 귀퉁이가 먼저 죽는다
    const vig = ctx.createRadialGradient(360, 230, 120, 360, 230, 400);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(46, 36, 24, 0.45)');
    ctx.fillStyle = vig; ctx.fillRect(38, 38, 644, 400);
    ctx.fillStyle = 'rgba(42, 33, 22, 0.82)';
    ctx.font = '500 30px serif'; ctx.textAlign = 'center';
    ctx.fillText(L('히가사토 초등학교 · 졸업기념', '彼ヶ里小学校 · 卒業記念'), 360, 466);
  });
}

/** 방송 설비 랙 전면 — VU 계기 둘 + 손잡이 · 스위치 줄 */
function rackPanelCanvas(): THREE.CanvasTexture {
  return textCanvas(560, 416, (ctx) => {
    ctx.fillStyle = '#20241f'; ctx.fillRect(0, 0, 560, 416);
    ctx.strokeStyle = 'rgba(150, 158, 146, 0.22)'; ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 540, 396);
    for (const mx of [150, 390]) {                                     // VU 계기
      ctx.fillStyle = '#ccc09a'; ctx.fillRect(mx - 104, 44, 208, 116);
      ctx.strokeStyle = '#4a4438'; ctx.lineWidth = 3; ctx.strokeRect(mx - 104, 44, 208, 116);
      ctx.strokeStyle = 'rgba(52, 46, 36, 0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, 168, 96, Math.PI * 1.16, Math.PI * 1.84); ctx.stroke();
      ctx.strokeStyle = 'rgba(140, 34, 26, 0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(mx, 168, 96, Math.PI * 1.72, Math.PI * 1.84); ctx.stroke();
      ctx.strokeStyle = '#2b2620'; ctx.lineWidth = 3;                  // 바늘 — 죽어 있다(왼쪽 끝)
      ctx.beginPath(); ctx.moveTo(mx, 166); ctx.lineTo(mx - 86, 106); ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {                                      // 손잡이
      const kx = 74 + i * 82;
      ctx.fillStyle = '#151814'; ctx.beginPath(); ctx.arc(kx, 250, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(176, 182, 170, 0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(kx, 250); ctx.lineTo(kx + Math.sin(i * 1.7) * 20, 250 - Math.cos(i * 1.7) * 20); ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {                                      // 스위치 줄
      ctx.fillStyle = i === 3 ? '#6d2a1e' : '#3b423a';
      ctx.fillRect(60 + i * 56, 316, 34, 22);
    }
    ctx.fillStyle = 'rgba(178, 184, 172, 0.55)';
    ctx.font = '500 22px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(L('교내 방송 설비', '校内放送設備'), 60, 384);
  });
}

/** 문 위 「방송 중」 — 글자만 빛나야 해서 map 과 emissiveMap 에 같은 캔버스를 문다 */
function onAirCanvas(): THREE.CanvasTexture {
  return textCanvas(512, 186, (ctx) => {
    ctx.fillStyle = '#100b0a'; ctx.fillRect(0, 0, 512, 186);
    ctx.strokeStyle = '#57402f'; ctx.lineWidth = 8; ctx.strokeRect(12, 12, 488, 162);
    ctx.fillStyle = '#ffd8cc';
    ctx.font = '700 96px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(L('방송 중', '放送中'), 256, 96);
  });
}

/**
 * 준비실 벽장 안판의 크레용 그림 — SCHOOL_RECORDS.crayon 과 같은 장면.
 * 붉은 리본과 푸른 원피스의 아이 둘이 손을 잡았고, 한 아이는 얼굴이 비어 있다.
 */
function crayonCanvas(): THREE.CanvasTexture {
  return textCanvas(560, 700, (ctx) => {
    ctx.clearRect(0, 0, 560, 700);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const kid = (cx2: number, ribbon: string, dress: string, faceless: boolean) => {
      ctx.strokeStyle = '#d8c9a8'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(cx2, 300, 44, 0, Math.PI * 2); ctx.stroke();     // 머리
      if (!faceless) {
        ctx.fillStyle = '#d8c9a8';
        ctx.beginPath(); ctx.arc(cx2 - 16, 292, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx2 + 16, 292, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx2, 308, 16, 0.2, Math.PI - 0.2); ctx.stroke();
      }
      ctx.strokeStyle = ribbon; ctx.lineWidth = 9;                              // 리본
      ctx.beginPath(); ctx.moveTo(cx2 - 40, 268); ctx.lineTo(cx2 - 14, 254); ctx.stroke();
      ctx.strokeStyle = dress; ctx.lineWidth = 8;                               // 원피스
      ctx.beginPath();
      ctx.moveTo(cx2, 344); ctx.lineTo(cx2 - 52, 486); ctx.lineTo(cx2 + 52, 486); ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2 - 30, 486); ctx.lineTo(cx2 - 24, 564); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2 + 30, 486); ctx.lineTo(cx2 + 24, 564); ctx.stroke();
    };
    kid(178, '#c8384a', '#c8384a', false);
    kid(384, '#c8384a', '#3f6fb8', true);
    ctx.strokeStyle = '#d8c9a8'; ctx.lineWidth = 7;                             // 잡은 손
    ctx.beginPath(); ctx.moveTo(216, 380); ctx.lineTo(281, 412); ctx.lineTo(346, 380); ctx.stroke();
    ctx.strokeStyle = '#7d8f4e'; ctx.lineWidth = 6;                             // 바닥 선
    ctx.beginPath(); ctx.moveTo(58, 592); ctx.lineTo(506, 586); ctx.stroke();
    ctx.fillStyle = '#c9b98f';
    ctx.font = '500 40px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(L('언니가 조용히 하래', 'おねえちゃん しずかにしてって'), 280, 662);
    ctx.font = '700 56px sans-serif';
    ctx.fillStyle = '#3f6fb8';
    ctx.fillText('ゆり', 280, 176);
  });
}

/**
 * 신발장 이름표 — 스물넷 칸에 이름은 스물셋. 오십음도 순으로 늘어놓았으니
 * 「たなか」 다음의 빈칸은 **なつめ** 자리다. 이름표는 뜯겨 나가고 풀 자국만 남았다.
 * (책상 밑 각인과 같은 원칙 — 아이 이름은 고유명사라 두 언어 모두 원문 그대로 둔다)
 */
function getabakoTagCanvas(): THREE.CanvasTexture {
  const NAMES = [
    'あおき', 'いのうえ', 'うえだ', 'おおた', 'かとう', 'きむら',
    'くどう', 'こばやし', 'さいとう', 'しみず', 'すずき', 'たかはし',
    'たなか', 'なかむら', 'にしむら', 'はやし', 'ふじた', 'まつもと',
    'みやざき', 'もりた', 'やまぐち', 'よしだ', 'わたなべ',
  ];
  const slots: (string | null)[] = [...NAMES.slice(0, 13), null, ...NAMES.slice(13)];
  const W = 1024, H = 486, COL = 6, ROW = 4;
  return textCanvas(W, H, (ctx) => {
    ctx.clearRect(0, 0, W, H);
    const cw = W / COL, ch = H / ROW;
    slots.forEach((name, i) => {
      const cx2 = (i % COL) * cw + cw / 2, top = Math.floor(i / COL) * ch;
      const ty = top + ch - 40, tw = cw - 26, th = 32;
      if (!name) {
        // 뜯긴 칸 — 누렇게 남은 풀 자국과 찢긴 종이 끄트머리
        ctx.fillStyle = 'rgba(150, 132, 96, 0.34)';
        ctx.fillRect(cx2 - tw / 2, ty, tw, th);
        ctx.fillStyle = 'rgba(214, 205, 180, 0.85)';
        ctx.beginPath();
        ctx.moveTo(cx2 - tw / 2, ty); ctx.lineTo(cx2 - tw / 2 + 30, ty);
        ctx.lineTo(cx2 - tw / 2 + 20, ty + 13); ctx.lineTo(cx2 - tw / 2 + 34, ty + 22);
        ctx.lineTo(cx2 - tw / 2, ty + 18); ctx.closePath(); ctx.fill();
        return;
      }
      ctx.fillStyle = 'rgba(220, 211, 186, 0.94)';
      ctx.fillRect(cx2 - tw / 2, ty, tw, th);
      ctx.strokeStyle = 'rgba(96, 84, 62, 0.5)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx2 - tw / 2, ty, tw, th);
      ctx.fillStyle = 'rgba(34, 28, 20, 0.88)';
      ctx.font = '500 23px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name, cx2, ty + th / 2 + 1);
    });
  });
}

/** 복도 게시판 — 그날에서 멈춘 종이들. 시간표 · 임시 휴교 공고 · 찢긴 안내문 */
function noticeBoardCanvas(): THREE.CanvasTexture {
  return textCanvas(1024, 540, (ctx) => {
    ctx.fillStyle = '#3e3a2c'; ctx.fillRect(0, 0, 1024, 540);          // 코르크
    for (let i = 0; i < 260; i++) {                                     // 압정 자국 · 결
      ctx.fillStyle = `rgba(${90 + (i * 37) % 40}, ${82 + (i * 17) % 30}, 60, 0.20)`;
      ctx.fillRect((i * 137) % 1024, (i * 79) % 540, 3 + (i % 4), 2);
    }
    const pin = (px: number, py: number) => {
      ctx.fillStyle = 'rgba(178, 46, 36, 0.9)';
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    };
    // 임시 휴교 공고 — 그날 날짜
    ctx.save(); ctx.translate(96, 58); ctx.rotate(-0.022);
    ctx.fillStyle = 'rgba(226, 219, 198, 0.95)'; ctx.fillRect(0, 0, 330, 400);
    ctx.fillStyle = 'rgba(40, 32, 22, 0.88)';
    ctx.font = '700 44px serif'; ctx.textAlign = 'center';
    ctx.fillText(L('임시 휴교', '臨時休校'), 165, 78);
    ctx.font = '500 26px serif';
    ctx.fillText(L('구월 이십삼일', '九月二十三日'), 165, 134);
    ctx.strokeStyle = 'rgba(40, 32, 22, 0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(38, 160); ctx.lineTo(292, 160); ctx.stroke();
    ctx.font = '400 20px serif'; ctx.textAlign = 'left';
    for (const [ln, ty] of [[L('산길이 끊겼습니다.', '山道が塞がれました。'), 200],
      [L('전 학년 하교를 미룹니다.', '全学年、下校を見合わせます。'), 236],
      [L('보호자께서 오실 때까지', '保護者の方がお迎えに'), 272],
      [L('교실에서 기다리십시오.', 'みえるまで教室で待つこと。'), 306]] as const) {
      ctx.fillText(ln, 38, ty as number);
    }
    ctx.restore();
    pin(120, 66); pin(408, 74);
    // 시간표
    ctx.save(); ctx.translate(468, 44); ctx.rotate(0.014);
    ctx.fillStyle = 'rgba(214, 208, 186, 0.92)'; ctx.fillRect(0, 0, 400, 268);
    ctx.strokeStyle = 'rgba(52, 44, 32, 0.55)'; ctx.lineWidth = 1.6;
    for (let r = 0; r <= 6; r++) { ctx.beginPath(); ctx.moveTo(14, 44 + r * 34); ctx.lineTo(386, 44 + r * 34); ctx.stroke(); }
    for (let c = 0; c <= 5; c++) { ctx.beginPath(); ctx.moveTo(14 + c * 74.4, 44); ctx.lineTo(14 + c * 74.4, 248); ctx.stroke(); }
    ctx.fillStyle = 'rgba(40, 32, 22, 0.85)';
    ctx.font = '500 24px serif'; ctx.textAlign = 'center';
    ctx.fillText(L('시간표', '時間割'), 200, 30);
    ctx.restore();
    pin(490, 54); pin(852, 60);
    // 찢긴 안내문 — 아래쪽 반만 남았다
    ctx.save(); ctx.translate(520, 348); ctx.rotate(-0.05);
    ctx.fillStyle = 'rgba(206, 198, 174, 0.9)';
    ctx.beginPath();
    ctx.moveTo(0, 30); ctx.lineTo(46, 8); ctx.lineTo(104, 26); ctx.lineTo(168, 4);
    ctx.lineTo(238, 24); ctx.lineTo(300, 6); ctx.lineTo(300, 150); ctx.lineTo(0, 150);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40, 32, 22, 0.6)';
    ctx.font = '400 19px serif'; ctx.textAlign = 'left';
    ctx.fillText(L('…명부와 대조할 것', '…名簿と照合のこと'), 24, 86);
    ctx.fillText(L('…한 명이 맞지 않음', '…一名合わず'), 24, 120);
    ctx.restore();
    pin(560, 372);
  });
}

/** 막힌 계단의 못질 표지 — 두 줄로 끊어야 글자가 커지고, 복도 끝에서도 읽힌다 */
function stairSignCanvas(): THREE.CanvasTexture {
  return textCanvas(512, 300, (ctx) => {
    ctx.clearRect(0, 0, 512, 300);
    ctx.fillStyle = 'rgba(214, 205, 180, 0.94)'; ctx.fillRect(14, 12, 484, 276);
    ctx.strokeStyle = 'rgba(118, 28, 20, 0.85)'; ctx.lineWidth = 8;
    ctx.strokeRect(32, 30, 448, 240);
    ctx.fillStyle = 'rgba(120, 26, 18, 0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 80px serif';
    ctx.fillText(L('2층', '二階'), 256, 104);
    ctx.font = '700 76px serif';
    ctx.fillText(L('출입금지', '立入禁止'), 256, 200);
    ctx.fillStyle = 'rgba(58, 50, 38, 0.55)';   // 못 자국 넷
    for (const [px, py] of [[40, 38], [472, 38], [40, 262], [472, 262]] as const) {
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
    }
  });
}

/** 폐교 기록물 대사 — main 의 inspect 가 쓴다 (§4.2 ACT 8~9 수집물) */
export const SCHOOL_RECORDS = {
  attendance: [
    { text: L('칠판 구석에 지우다 만 출석 숫자가 겹쳐 있다.', '黒板の隅に、消しかけの出席数が重なっている。') },
    { text: L('「23」 위에 다른 필체로 「24」. 그리고 24만 여러 번 세게 지운 흔적.', '「23」の上に別の筆跡で「24」。そして24だけを何度も強く消した跡。') },
    { who: L('미오', 'ミオ'), text: L('없던 아이가 들어온 게 아니라…… 있던 아이 하나를 없던 셈 친 거야.', 'いない子が増えたんじゃない……いた子を、いなかったことにしたんだ。') },
  ],
  /**
   * 현관 신발장 — **단서 4개에는 들지 않는다**(카운터·게이트는 SCHOOL_EVIDENCE 넷 그대로).
   * 들어서자마자 「이름 하나가 통째로 뜯겼다」만 알려 주고, 누구인지는 말하지 않는다.
   */
  getabako: [
    { text: L('현관 신발장. 칸마다 손으로 쓴 이름표가 붙어 있다.', '昇降口の下駄箱。桝ごとに手書きの名札が貼ってある。') },
    { text: L('이름은 오십음도 순이다 — 「たなか」 바로 다음이 「なかむら」.', '名は五十音順 — 「たなか」のすぐ次が「なかむら」。') },
    { text: L('그 사이 한 칸만 이름표가 뜯겨 있다. 누렇게 굳은 풀 자국뿐.', 'その間の一桝だけ名札が剥がされている。黄ばんで固まった糊の跡だけ。') },
    { who: L('미오', 'ミオ'), text: L('신발장은 스물넷인데…… 이름은 스물셋이야.', '下駄箱は二十四。……名は二十三。') },
  ],
  deskName: [
    { text: L('맨 앞 책상 밑면에 손톱으로 이름이 새겨져 있다.', '一番前の机の裏に、爪で名前が刻まれている。') },
    { text: L('「なつめ　ゆり」 — 나츠메 유리.', '「なつめ　ゆり」 — 夏目ユリ。') },
    { text: L('이름 끝에 작은 글씨. 「나는 여기 있었어」.', '名前の末尾に小さな字。「わたしはここにいた」。') },
  ],
  journal: [
    { text: L('당직 교사의 기록. 마지막 장은 피와 빗물에 번져 있다.', '宿直教師の記録。最後の頁は血と雨水で滲んでいる。') },
    { text: L('「학생들을 3학년 교실로 대피시켰다.」', '「児童を三年生の教室へ避難させた。」') },
    { text: L('「복도에 이미 죽은 아이들이 걷고 있다. 문을 절대로 열어서는 안 된다.」', '「廊下を、すでに死んだ子供たちが歩いている。扉を決して開けてはならない。」') },
    { text: L('「명부에는 스물세 명이다. 교실 안에는 스물네 명이 있다.」', '「名簿は二十三人。教室の中には二十四人いる。」') },
    { text: L('마지막 줄 — 「한 명은 우리 아이가 아니다.」', '最後の一行 — 「一人は、私たちの子ではない。」') },
  ],
  crayon: [
    { text: L('벽장 안쪽에 어린아이의 크레용 글씨가 남아 있다.', '戸棚の内側に、幼い子のクレヨン文字が残っている。') },
    { text: L('「언니가 조용히 하라고 했다. 밖에서 아저씨들이 내 이름을 부른다.」', '「お姉ちゃんが静かにしてって言った。外でおじさんたちが私の名前を呼ぶ。」') },
    { text: L('「엄마 목소리도 들린다. 그런데 언니가 엄마도 가짜라고 했다.」', '「お母さんの声も聞こえる。でもお姉ちゃんは、お母さんも偽物だって言った。」') },
    { text: L('옆에는 붉은 리본과 푸른 원피스의 여자아이 둘이 손을 잡은 그림.', '隣には、赤いリボンと青いワンピースの少女二人が手を繋ぐ絵。') },
    { who: L('미오', 'ミオ'), text: L('누가 쓴 거지……?', '誰が書いたの……?') },
  ],
};
