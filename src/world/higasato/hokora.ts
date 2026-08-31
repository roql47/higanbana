import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { SITES, type HigasatoGround } from './ground';
import { PartsBuilder, textCanvas, tileTex } from './kit';
import { Props } from '@/world/props';
import { L, serifFamily } from '@/core/i18n';

/** 로쿠로쿠비가 활주할 수 있는 실내 경계. 벽 바로 옆은 몸 반경만큼 뺀다. */
export interface HokoraChaseArena {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorY: number;
  /** 동쪽 툇마루를 완전히 벗어나면 추격 성공 */
  escapeX: number;
  /** 원형 근사 장애물 — 몸통은 전부 피하고, 낮은 가구는 목 공격만 통과할 수 있다. */
  blockers: { x: number; z: number; radius: number; blocksNeck?: boolean }[];
}

type WardState = 'sealed' | 'loose' | 'restored';

interface WardMark {
  /** 상호작용 좌표와 모델의 회전을 고정하는 뿌리. 상태 모델은 이 아래에서만 교체한다. */
  anchor: THREE.Group;
  tied: THREE.Group | null;
  loose: THREE.Group | null;
  tiedMaterials: THREE.MeshStandardMaterial[];
  looseMaterials: THREE.MeshStandardMaterial[];
  state: WardState;
}

/**
 * 오래된 산중 제당(祠堂) — 공물 1 「붉은 방울」의 보스 아레나 (ACT 6~7).
 *
 * 옛 4.2×4.2 m 사당은 소품 크기였다. 플레이어가 방향을 한 번 바꾸기도 전에 문에 닿고,
 * 몸통이 제단 뒤에 고정된 로쿠로쿠비는 결국 「늘어나는 목을 구경하는 모델 뷰어」가 됐다.
 * 지금 건물은 다음 세 층으로 읽힌다.
 *
 *   · 26×22 m 산중 선반 — 전정까지 달려 나가야 완전히 벗어난다
 *   · 14.8×11.6 m 제당 — 내부 유효 공간 약 13×10 m
 *   · 네 내부 기둥 + 제단 — 좌우 두 개의 추격 루프와 가운데 빠른 길
 *
 * 작은 호코라의 장식 어휘(삭은 목재·시메나와·촛불)는 유지하되, 사람이 들어가 기도하던
 * 산중 제당으로 격을 올렸다. 지붕·격자문·귀틀·대들보·툇마루·석등을 모두 실제 지오메트리로 만든다.
 */
export class Hokora {
  readonly group = new THREE.Group();
  /** 제단 위 — 붉은 방울이 놓이는 자리(월드) */
  readonly suzuPos: THREE.Vector3;
  /** 실내 중심(월드) */
  readonly center: THREE.Vector3;
  /** 로쿠로쿠비 몸통 첫 위치 */
  readonly rokuroSpawn: THREE.Vector3;
  /** 잡혔을 때 밀려나는 전정 바깥 */
  readonly ejectPos: THREE.Vector3;
  readonly chaseArena: HokoraChaseArena;
  /** 방울을 묶은 세 겹의 금기를 푸는 조사 지점 — 에마 둘과 제단 측면 금줄. */
  readonly wardPositions: THREE.Vector3[] = [];
  /** 동쪽 문틀 아래, 아이 손높이에 덧그린 겹원 — 진행과 무관한 선택 복선. */
  readonly childMarkPos: THREE.Vector3;

  private candleMat: THREE.MeshStandardMaterial;
  private lights: THREE.PointLight[] = [];
  /** 중앙 장지문 두 짝. 방울을 집으면 닫히고, 세 매듭을 역순으로 되묶어야 열린다. */
  private doorPanels: { root: THREE.Group; openZ: number; closedZ: number }[] = [];
  /** 문짝은 렌더 메시만으로는 통과를 막지 못하므로 사건 중에만 켜는 실제 빗장. */
  private doorBarrier: ReturnType<Physics['addStaticBox']> | null = null;
  private doorMotion = 0;
  private doorTarget = 0;
  /** 세 조사점의 Tripo 금줄. 묶임/풀림 모델을 바꾸고 다음 복구 지점만 짧게 빛낸다. */
  private wardMarks: WardMark[] = [];
  private wardTarget = -1;
  private t = 0;
  private bounds: { x0: number; z0: number; x1: number; z1: number };

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.hokora!;
    const cx = s.x, cz = s.z;
    const gy = ground.heightAt(cx, cz);
    this.center = new THREE.Vector3(cx, gy, cz);

    const b = new PartsBuilder(physics);
    // 목재·회벽은 PolyHaven PBR 로 — 노멀맵이 촛불을 받을 때 마루 결·회벽 요철이 산다.
    // 단색 팔레트 값을 tint 로 그대로 넘기면 texMat 이 boost 를 곱해 비슷한 명도로 맞춘다
    const woodD = tileTex('/textures/wood/japanese_cedar_planks_diff_1k.webp', true);
    const woodN = tileTex('/textures/wood/japanese_cedar_planks_nor_gl_1k.webp', false);
    const plasterD = tileTex('/textures/plaster/grey_plaster_02_diff_1k.webp', true);
    const plasterN = tileTex('/textures/plaster/grey_plaster_02_nor_gl_1k.webp', false);
    const mTimber = b.texMat(woodD, woodN, 0x30251a, { rough: 0.92 });
    const mBeam = b.texMat(woodD, woodN, 0x1c1510, { rough: 0.96, repeat: 0.85 });
    const mWood = b.texMat(woodD, woodN, 0x3c2c1d, { rough: 0.96 });
    const mWoodPale = b.texMat(woodD, woodN, 0x5a4630, { rough: 0.94 });
    const mPlaster = b.texMat(plasterD, plasterN, 0x8b887d, { boost: 1.9, rough: 1.0, repeat: 0.45 });
    const mRoof = b.mat(0x111315, 0.98);
    const mRoofEdge = b.mat(0x080a0b, 0.96);
    const mStone = b.mat(0x4c504a, 1.0);
    const mStoneDark = b.mat(0x30342f, 1.0);
    const mRope = b.mat(0xa99362, 1.0);
    const mPaper = b.mat(0xbdb7a5, 0.98);
    const mMoss = b.mat(0x263126, 1.0);
    const mVermilion = b.mat(0x5b1d17, 0.9);
    const mSoot = b.mat(0x100d0a, 1.0);
    const mMetal = new THREE.MeshStandardMaterial({ color: 0x737871, roughness: 0.28, metalness: 0.72 });
    // 공양 그릇 전용 — 신경과 재질을 나눈다. 거울 수준 스페큘러를 그릇에 주면
    // 촛불 바로 아래에서 하얀 원반으로 타버린다(실측: 제단 위 흰 포커칩 두 개)
    const mMetalDull = new THREE.MeshStandardMaterial({ color: 0x33362f, roughness: 0.75, metalness: 0.3 });

    // x = 건물 깊이(동쪽 +X 가 정면), z = 정면 폭. 지붕 용마루는 x 축이다.
    const W = 14.8, D = 11.6, H = 3.25, FL = 0.42;
    const wallX0 = cx - W / 2, wallX1 = cx + W / 2;
    const wallZ0 = cz - D / 2, wallZ1 = cz + D / 2;
    const floorY = gy + FL;
    const doorW = 2.8;
    this.childMarkPos = new THREE.Vector3(wallX1 - 0.45, floorY + 0.92, cz + 2.65);
    this.bounds = {
      x0: wallX0 - 1.0, z0: wallZ0 - 1.0,
      x1: wallX1 + 2.8, z1: wallZ1 + 1.0,
    };

    const innerPosts = [
      { x: cx - 2.5, z: cz - 2.75, radius: 0.62 },
      { x: cx - 2.5, z: cz + 2.75, radius: 0.62 },
      { x: cx + 2.6, z: cz - 2.75, radius: 0.62 },
      { x: cx + 2.6, z: cz + 2.75, radius: 0.62 },
    ];
    const lowTables = [
      { x: cx + 0.1, z: cz - 3.65, radius: 1.2, blocksNeck: false },
      { x: cx + 0.1, z: cz + 3.65, radius: 1.2, blocksNeck: false },
    ];
    this.chaseArena = {
      minX: wallX0 + 0.75,
      maxX: wallX1 - 0.75,
      minZ: wallZ0 + 0.75,
      maxZ: wallZ1 - 0.75,
      floorY,
      escapeX: wallX1 + 2.2,
      blockers: [
        ...innerPosts,
        ...lowTables,
        { x: wallX0 + 1.65, z: cz, radius: 1.35 }, // 제단
      ],
    };

    // ---------- 산중 선반 위 기단·귀틀·마루 ----------
    b.box(W + 2.0, 0.24, D + 2.0, cx, gy + 0.12, cz, mStoneDark);
    b.box(W + 1.45, 0.18, D + 1.45, cx, floorY - 0.09, cz, mTimber);
    // 널마루 판재 이음 — 실제 돌출이라 손전등이 지나갈 때 마루 결이 읽힌다
    for (let x = wallX0 + 0.35; x < wallX1; x += 0.62) {
      b.box(0.035, 0.012, D + 1.25, x, floorY + 0.012, cz, mBeam);
    }
    // 기단 전체가 바닥. 동쪽 3단으로만 자연스럽게 오른다.
    b.collide(cx, gy + FL / 2, cz, (W + 1.45) / 2, FL / 2, (D + 1.45) / 2);
    for (let i = 0; i < 3; i++) {
      const h = FL * (i + 1) / 3;
      const x = wallX1 + 1.45 - i * 0.48;
      b.box(0.72, h, 3.2, x, gy + h / 2, cz, mStone);
      b.collide(x, gy + h / 2, cz, 0.36, h / 2, 1.6);
    }
    // 돌계단 난간 — 계단 폭과 큰 처마 사이에 사람 스케일을 잡아 주고, 중앙 탈출선은 비워 둔다.
    const railZ = 1.83;
    for (const sz of [-1, 1]) {
      for (const [x, base] of [
        [wallX1 + 1.72, gy], [wallX1 + 0.92, gy + FL * 0.5], [wallX1 + 0.12, floorY],
      ] as [number, number][]) {
        b.box(0.12, 0.82, 0.12, x, base + 0.41, cz + sz * railZ, mTimber);
      }
      const dx = -1.6, dy = FL;
      const handrail = new THREE.BoxGeometry(Math.hypot(dx, dy), 0.11, 0.13);
      handrail.rotateZ(Math.atan2(dy, dx));
      handrail.translate(wallX1 + 0.92, gy + 0.82 + FL / 2, cz + sz * railZ);
      b.add(handrail, mTimber);
    }
    // 전정의 비뚤어진 디딤돌. 콜라이더 없이 낮게 깔아 달리는 발을 걸지 않는다.
    for (let i = 0; i < 5; i++) {
      const x = wallX1 + 2.25 + i * 0.72;
      const z = cz + [0.0, -0.13, 0.11, -0.08, 0.06][i]!;
      const y = ground.heightAt(x, z);
      const g = new THREE.CylinderGeometry(0.5 - (i % 2) * 0.05, 0.56, 0.075, 9);
      g.scale(1, 1, 0.74 + (i % 3) * 0.08);
      g.rotateY(i * 0.37); g.translate(x, y + 0.025, z); b.add(g, i < 2 ? mStoneDark : mStone);
    }

    // ---------- 외곽 기둥·도리·대들보 ----------
    const postH = H + FL + 0.25;
    const post = (x: number, z: number, thick = 0.24) => {
      b.box(thick, postH, thick, x, gy + postH / 2, z, mTimber);
      b.collide(x, gy + FL + H / 2, z, thick / 2, H / 2, thick / 2);
    };
    // 앞뒤 처마 기둥. 3.7 m 모듈이라 넓어져도 장난감 집처럼 보이지 않는다.
    for (const x of [wallX0, cx - W / 4, cx, cx + W / 4, wallX1]) {
      post(x, wallZ0); post(x, wallZ1);
    }
    for (const z of [cz - D / 4, cz, cz + D / 4]) {
      post(wallX0, z); post(wallX1, z);
    }
    // 네 내부 기둥이 회피 루프를 만든다.
    for (const p of innerPosts) post(p.x, p.z, 0.3);
    for (const z of [wallZ0, cz - 2.75, cz + 2.75, wallZ1]) {
      b.box(W + 0.35, 0.22, 0.24, cx, floorY + H - 0.12, z, mBeam);
    }
    for (const x of [wallX0, cx - 2.5, cx + 2.6, wallX1]) {
      b.box(0.24, 0.2, D + 0.25, x, floorY + H - 0.42, cz, mTimber);
    }

    // ---------- 벽: 하부 판벽 + 상부 바랜 회벽 ----------
    const wallH = H - 0.35;
    // 서벽
    b.box(0.13, wallH, D - 0.45, wallX0 + 0.065, floorY + wallH / 2, cz, mPlaster);
    b.box(0.15, 0.82, D - 0.28, wallX0 + 0.08, floorY + 0.41, cz, mWood);
    b.collide(wallX0 + 0.07, floorY + wallH / 2, cz, 0.08, wallH / 2, D / 2 - 0.18);
    // 남·북벽
    for (const z of [wallZ0, wallZ1]) {
      b.box(W - 0.4, wallH, 0.13, cx, floorY + wallH / 2, z, mPlaster);
      b.box(W - 0.22, 0.82, 0.15, cx, floorY + 0.41, z, mWood);
      b.collide(cx, floorY + wallH / 2, z, W / 2 - 0.18, wallH / 2, 0.08);
    }
    // 동쪽 정면: 가운데만 실제 출구. 좌우는 닫힌 격자문이라 벽 콜라이더가 받친다.
    const sideLen = (D - doorW) / 2;
    for (const sz of [-1, 1]) {
      const z = cz + sz * (doorW / 2 + sideLen / 2);
      b.box(0.13, wallH, sideLen, wallX1 - 0.065, floorY + wallH / 2, z, mWoodPale);
      b.collide(wallX1 - 0.07, floorY + wallH / 2, z, 0.08, wallH / 2, sideLen / 2);
    }
    b.box(0.16, 0.55, doorW + 0.15, wallX1 - 0.08, floorY + H - 0.62, cz, mBeam);

    // 격자문 모델. 얇은 종이판 + 목제 살이라 실루엣이 종이 뒤에 걸린다.
    const shoji = (z: number, width: number, open = false) => {
      const x = wallX1 + 0.025;
      const h = 2.35;
      const paperZ = open ? z + Math.sign(z - cz || 1) * 0.62 : z;
      b.box(0.035, h, width, x, floorY + h / 2, paperZ, mPaper);
      for (const sy of [0, 0.5, 1.0, 1.5, 2.0, h]) {
        b.box(0.055, 0.035, width + 0.03, x + 0.012, floorY + sy, paperZ, mBeam);
      }
      for (let dz = -width / 2; dz <= width / 2 + 0.01; dz += 0.46) {
        b.box(0.055, h, 0.035, x + 0.012, floorY + h / 2, paperZ + dz, mBeam);
      }
    };
    // 좌우 가짜 문 두 짝과, 가운데로 밀려 열린 진짜 문 두 짝.
    shoji(cz - 3.55, 2.25);
    shoji(cz + 3.55, 2.25);
    shoji(cz - doorW / 2 - 0.58, 1.2, true);
    shoji(cz + doorW / 2 + 0.58, 1.2, true);
    // 찢어진 장지의 어두운 보수띠와 문설주 부적. 종이 전체를 깨끗하게 두면 새 세트장처럼 보인다.
    for (const [z, y, yaw] of [
      [cz - 4.1, floorY + 1.48, -0.16], [cz + 3.05, floorY + 0.92, 0.21],
      [cz + 4.08, floorY + 1.82, -0.08],
    ] as [number, number, number][]) {
      b.box(0.018, 0.55, 0.055, wallX1 + 0.052, y, z, mSoot, yaw);
      b.box(0.02, 0.045, 0.42, wallX1 + 0.055, y + 0.1, z, mSoot, yaw);
    }
    // 문설주 부적 — 세로 주문(한자는 언어와 무관하게 한자다) + 붉은 낙인. 안팎 양면에 깐다
    const ofudaTex = textCanvas(128, 512, (ctx) => {
      ctx.fillStyle = '#c8bfa4'; ctx.fillRect(0, 0, 128, 512);
      ctx.fillStyle = 'rgba(120, 100, 70, 0.25)';
      ctx.fillRect(0, 0, 128, 26); ctx.fillRect(96, 0, 32, 512);   // 삭은 가장자리
      ctx.fillStyle = '#7c1c14'; ctx.fillRect(30, 14, 68, 30);      // 머리띠
      ctx.fillStyle = 'rgba(24, 16, 10, 0.92)';
      ctx.textAlign = 'center';
      ctx.font = `700 76px ${serifFamily()}`;
      ['封', '鎮', '守'].forEach((g, i) => ctx.fillText(g, 64, 140 + i * 110));
      // 바닥의 붉은 인장 — 판독 불가한 전서 획
      ctx.strokeStyle = 'rgba(150, 34, 22, 0.85)'; ctx.lineWidth = 5;
      ctx.strokeRect(38, 428, 52, 52);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(48, 440); ctx.lineTo(80, 440); ctx.moveTo(64, 440); ctx.lineTo(64, 470);
      ctx.moveTo(48, 458); ctx.lineTo(80, 470); ctx.stroke();
    });
    const mOfuda = new THREE.MeshStandardMaterial({ map: ofudaTex, roughness: 0.95, metalness: 0 });
    for (const z of [cz - 1.62, cz + 1.62]) {
      b.box(0.025, 0.5, 0.18, wallX1 - 0.18, floorY + 1.7, z, mPaper);
      b.box(0.03, 0.035, 0.2, wallX1 - 0.2, floorY + 1.82, z, mVermilion);
      for (const sx of [-1, 1]) {
        const face = new THREE.PlaneGeometry(0.16, 0.46);
        face.rotateY(sx * Math.PI / 2);
        face.translate(wallX1 - 0.18 + sx * 0.014, floorY + 1.7, z);
        b.add(face, mOfuda);
      }
    }
    // 아이 손바닥 높이의 겹원. ACT 18 손바닥 신호를 설명 없이 먼저 보게 하는 선택 복선이다.
    const childMarkTex = textCanvas(384, 256, (ctx) => {
      ctx.clearRect(0, 0, 384, 256);
      ctx.strokeStyle = 'rgba(72, 32, 25, 0.72)';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(139, 126, 72, 68, -0.12, 0.1, Math.PI * 1.94); ctx.stroke();
      ctx.strokeStyle = 'rgba(92, 38, 29, 0.55)';
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.ellipse(238, 127, 70, 66, 0.09, -0.05, Math.PI * 2.05); ctx.stroke();
      ctx.strokeStyle = 'rgba(125, 43, 34, 0.62)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(185, 181); ctx.quadraticCurveTo(193, 205, 205, 224); ctx.stroke();
    });
    const childMark = new THREE.PlaneGeometry(0.5, 0.34);
    childMark.rotateY(-Math.PI / 2);
    childMark.translate(wallX1 - 0.142, floorY + 0.92, cz + 2.65);
    b.add(childMark, new THREE.MeshStandardMaterial({
      map: childMarkTex, transparent: true, roughness: 1, metalness: 0,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide,
    }));
    // 장지 얼룩 — 물 먹은 갈색 번짐 몇 장. 깨끗한 종이는 새 세트장처럼 보인다(박공 이끼와 같은 문법)
    const stainTex = textCanvas(256, 256, (ctx) => {
      for (const [sx, sy, r, a] of [[128, 120, 110, 0.5], [95, 150, 62, 0.4], [170, 90, 48, 0.35]] as [number, number, number, number][]) {
        const g = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r);
        g.addColorStop(0, `rgba(72, 54, 30, ${a * 0.5})`);
        g.addColorStop(0.75, `rgba(58, 42, 24, ${a})`);
        g.addColorStop(1, 'rgba(58, 42, 24, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
      }
    });
    const mStain = new THREE.MeshStandardMaterial({
      map: stainTex, transparent: true, roughness: 1, metalness: 0,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    for (const [zz, yy, sc, sx] of [
      [cz - 3.3, floorY + 1.45, 0.85, -1], [cz + 3.62, floorY + 0.72, 0.55, -1],
      [cz + 3.25, floorY + 1.9, 0.42, -1], [cz - 3.85, floorY + 1.1, 0.7, 1],
    ] as [number, number, number, number][]) {
      const g = new THREE.PlaneGeometry(sc, sc);
      g.rotateZ(zz * 2.3);   // 위치 기반 시드 — 같은 얼룩이라 들키지 않게 돌린다
      g.rotateY(sx * Math.PI / 2);
      g.translate(wallX1 + 0.025 + sx * 0.02, yy, zz);
      b.add(g, mStain);
    }

    // ---------- 제단과 내부 회피물 ----------
    const altarX = wallX0 + 1.65;
    // 외형만 별도 빌더로 떼어 Tripo 제단이 도착하면 감춘다. 아래 콜라이더와 방울 좌표는
    // 절차 치수를 계속 봐야 저장·추격·상호작용이 모델의 제멋대로인 원점에 끌려가지 않는다.
    const bAltarBody = new PartsBuilder(physics);
    bAltarBody.box(2.15, 0.82, 2.75, altarX, floorY + 0.41, cz, mWood);
    bAltarBody.box(1.9, 0.1, 2.5, altarX + 0.05, floorY + 0.87, cz, mTimber);
    bAltarBody.box(0.62, 1.25, 2.25, wallX0 + 0.42, floorY + 0.62, cz, mBeam);
    const altarBodyProc = bAltarBody.build('hokora-altar-body-proc');
    this.group.add(altarBodyProc);
    b.collide(altarX, floorY + 0.41, cz, 1.08, 0.41, 1.38);
    this.suzuPos = new THREE.Vector3(altarX + 0.22, floorY + 0.94, cz);
    this.wardPositions.push(
      // 모델 두께의 절반이 벽 안으로 들어가게 붙인다. 옛 ±0.22는 벽면에서 약 5cm 떠 보였다.
      new THREE.Vector3(cx - 1.3, floorY + 1.18, wallZ0 + 0.14),
      new THREE.Vector3(cx - 1.3, floorY + 1.18, wallZ1 - 0.14),
      // 옛 좌표(altarX + 1.7, cz + 1.6)는 제단 모서리 바깥 허공에 떠 있었다.
      // 남쪽 측판 한가운데로 붙이면 모델이 목재를 실제로 가로지르고 옆 통로에서도 손이 닿는다.
      new THREE.Vector3(altarX + 0.12, floorY + 0.65, cz + 1.33),
    );
    // 모델이 비동기로 도착하기 전에도 상호작용 좌표와 방향은 확정한다. 빨간 TorusGeometry
    // 폴백은 실제 매듭이 아니라 UI 도넛처럼 보여 제거했다.
    for (let i = 0; i < this.wardPositions.length; i++) {
      const p = this.wardPositions[i]!;
      const anchor = new THREE.Group();
      anchor.name = `hokora-ward-${i}`;
      anchor.position.copy(p);
      // Tripo 생성본의 장축은 로컬 Z다. 북벽은 -90°, 남벽·제단 측판은 +90°로 돌려
      // 장축을 월드 X에 놓고, 모델의 두께축은 각 목재 면 안으로 향하게 한다.
      anchor.rotation.y = i === 0 ? -Math.PI / 2 : Math.PI / 2;
      this.group.add(anchor);
      this.wardMarks.push({
        anchor, tied: null, loose: null,
        tiedMaterials: [], looseMaterials: [], state: 'sealed',
      });
    }
    // 제단 제구 — 중앙 방울은 비워 두고 좌우의 신주·술병·공양 그릇이 시선을 가운데로 모은다.
    b.box(0.72, 0.09, 2.05, wallX0 + 0.82, floorY + 1.18, cz, mVermilion);
    b.box(0.12, 0.82, 0.12, wallX0 + 0.68, floorY + 1.62, cz - 0.52, mTimber);
    b.box(0.12, 0.82, 0.12, wallX0 + 0.68, floorY + 1.62, cz + 0.52, mTimber);
    b.box(0.1, 0.12, 1.25, wallX0 + 0.68, floorY + 2.0, cz, mTimber);
    // 신경(神鏡): 동쪽에서 들어오면 촛불과 초칭 빛을 작게 되돌린다.
    const mirror = new THREE.CylinderGeometry(0.34, 0.34, 0.055, 32);
    mirror.rotateZ(Math.PI / 2); mirror.translate(wallX0 + 0.73, floorY + 1.65, cz); b.add(mirror, mMetal);
    const mirrorBoss = new THREE.CylinderGeometry(0.095, 0.095, 0.065, 20);
    mirrorBoss.rotateZ(Math.PI / 2); mirrorBoss.translate(wallX0 + 0.77, floorY + 1.65, cz); b.add(mirrorBoss, mMetal);
    // 술병·고헤이의 절차 버전은 별도 빌더로 — Tripo 신단 세트(miki/gohei.glb)가 로드되면 감춘다
    const bAltarProc = new PartsBuilder(physics);
    for (const sz of [-1, 1]) {
      // 술병: 몸통·목·마개 세 단으로 실루엣을 만든다.
      const z = cz + sz * 0.66, x = altarX - 0.18;
      bAltarProc.cyl(0.1, 0.16, 0.25, x, floorY + 1.045, z, mPaper, 10);
      bAltarProc.cyl(0.07, 0.09, 0.13, x, floorY + 1.235, z, mPaper, 10);
      bAltarProc.cyl(0.075, 0.075, 0.045, x, floorY + 1.325, z, mVermilion, 10);
      // 그릇은 방울 좌우 안쪽으로 — 바깥(±0.66)에 두면 제단 촛대·술병과 겹친다(실측)
      b.cyl(0.14, 0.17, 0.08, altarX + 0.42, floorY + 0.98, cz + sz * 0.38, mMetalDull, 12);
      // 고헤이: 막대 양옆으로 종이 번개가 네 번 꺾인다.
      const gx = wallX0 + 0.93, gz = cz + sz * 0.78;
      bAltarProc.cyl(0.018, 0.022, 0.72, gx, floorY + 1.67, gz, mWoodPale, 7);
      for (let j = 0; j < 4; j++) {
        bAltarProc.box(0.025, 0.15, 0.24, gx + 0.025, floorY + 1.92 - j * 0.14,
          gz + sz * (0.08 + (j % 2) * 0.12), mPaper, sz * (j % 2 ? -0.2 : 0.2));
      }
    }
    const altarProc = bAltarProc.build('hokora-altar-proc');
    this.group.add(altarProc);
    // 벽 쪽 에마 걸이 — 플레이 공간 바깥 25 cm 안에 붙여 추격 루프를 침범하지 않는다.
    // 판마다 먹글씨 소원을 아틀라스(4×2 타일)에 그려 앞면에 깐다 — 빈 널빤지 12장은 세트장이고,
    // 소원 12개는 마을이다. 5번(붉은 판)과 7번(이름이 그어진 판)이 §4.2 명부의 밑밥.
    const emaTex = textCanvas(1024, 512, (ctx) => {
      const wishes: { t: string; red?: boolean; faded?: boolean; scribble?: boolean; struck?: boolean }[] = [
        { t: L('비를 그치게\n해 주세요', '雨を止めて\nください') },
        { t: L('아이가 무사히\n자라기를', '子が無事に\n育ちますように') },
        { t: L('풍년이 들게\n해 주세요', '豊作であります\nように'), faded: true },
        { t: L('어머니의 병이\n낫기를', '母の病が\n治りますように') },
        { t: L('돌아오게\n해 주세요', '帰ってきます\nように'), red: true },
        { t: '', scribble: true },
        { t: L('용서해\n주세요', '許して\nください') },
        { t: L('치요', 'ちよ'), struck: true },
      ];
      for (let i = 0; i < 8; i++) {
        const w = wishes[i]!;
        const tx = (i % 4) * 256, ty = i < 4 ? 0 : 256;
        ctx.save();
        ctx.translate(tx, ty);
        // 판재 바탕 — 붉은 판 하나만 주칠, 나머지는 삭은 나무색에 결 몇 줄
        ctx.fillStyle = w.red ? '#6e2019' : `hsl(${30 + (i * 7) % 8}, ${26 - (i % 3) * 4}%, ${38 + (i * 5) % 9}%)`;
        ctx.fillRect(0, 0, 256, 256);
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#241a10';
        for (let g = 0; g < 6; g++) ctx.fillRect(0, 20 + g * 42 + (i * 13) % 17, 256, 2 + (g % 2) * 2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(20, 14, 8, 0.55)'; ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, 246, 246);
        if (w.scribble) {
          // 글씨가 되다 만 낙서 — 떨리는 획 몇 개
          ctx.strokeStyle = 'rgba(30, 22, 14, 0.7)'; ctx.lineWidth = 5;
          for (let s = 0; s < 7; s++) {
            ctx.beginPath();
            ctx.moveTo(50 + s * 24, 70 + (s * 37) % 60);
            ctx.quadraticCurveTo(80 + (s * 53) % 90, 130 + (s * 29) % 70, 60 + (s * 31) % 130, 200 - (s * 19) % 50);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = w.red ? 'rgba(16, 10, 8, 0.9)' : 'rgba(26, 18, 10, 0.88)';
          if (w.faded) ctx.globalAlpha = 0.4;
          ctx.font = `700 ${w.struck ? 64 : 38}px ${serifFamily()}`;
          ctx.textAlign = 'center';
          const lines = w.t.split('\n');
          ctx.save();
          ctx.rotate((i - 3.5) * 0.012);   // 판마다 다른 손글씨 기울기
          lines.forEach((ln, li) => ctx.fillText(ln, 128, 118 + (li - (lines.length - 1) / 2) * 52));
          ctx.restore();
          ctx.globalAlpha = 1;
          if (w.struck) {
            // 이름 위로 두 번 그어진 주홍 획 — 명부에서 지워진 아이
            ctx.strokeStyle = 'rgba(140, 30, 20, 0.85)'; ctx.lineWidth = 9;
            ctx.beginPath(); ctx.moveTo(48, 96); ctx.lineTo(210, 122); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(54, 132); ctx.lineTo(202, 104); ctx.stroke();
          }
        }
        ctx.restore();
      }
    });
    const mEma = new THREE.MeshStandardMaterial({ map: emaTex, roughness: 0.9, metalness: 0 });
    const bEmaRack = new PartsBuilder(physics);
    for (const sz of [-1, 1]) {
      const ez = cz + sz * (D / 2 - 0.19);
      // 글씨 판·캔버스는 아래의 b에 남기고 목제 걸이만 분리한다. 생성형 모델에 글씨를 맡기면 깨진다.
      bEmaRack.box(3.0, 0.1, 0.1, cx - 0.55, floorY + 1.52, ez, mTimber);
      const tiles = sz > 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 3, 0, 4, 5];
      for (let i = 0; i < 6; i++) {
        const ex = cx - 1.72 + i * 0.47;
        const ey = floorY + 1.21 - (i % 2) * 0.06;
        const tilt = (i - 2.5) * 0.035;
        b.cyl(0.012, 0.012, 0.18, ex, floorY + 1.38, ez - sz * 0.035, mRope, 6);
        b.box(0.34, 0.29, 0.035, ex, ey, ez - sz * 0.055, tiles[i] === 4 ? mVermilion : mWoodPale, tilt);
        const face = new THREE.PlaneGeometry(0.33, 0.28);
        const uv = face.getAttribute('uv') as THREE.BufferAttribute;
        const tile = tiles[i]!;
        for (let vi = 0; vi < uv.count; vi++) {
          uv.setXY(vi, (tile % 4 + uv.getX(vi)) / 4, (tile < 4 ? 0.5 : 0) + uv.getY(vi) * 0.5);
        }
        if (sz > 0) face.rotateY(Math.PI);
        face.rotateY(tilt);
        face.translate(ex, ey, ez - sz * 0.0745);
        b.add(face, mEma);
      }
    }
    const emaRackProc = bEmaRack.build('hokora-ema-rack-proc');
    this.group.add(emaRackProc);
    // 방울을 집고 돌아보면 큰 실루엣이 유일한 출구를 막는다. 문틀에 끼우지 않고
    // 한 걸음 안쪽에 둬 양옆으로 빠져나갈 틈과 첫 활주 가속 거리를 모두 남긴다.
    this.rokuroSpawn = new THREE.Vector3(wallX1 - 1.05, floorY + 0.01, cz);

    // 낮은 경상 두 개 — 점프로 넘을 수 있지만 달리면 돌아야 한다. 기둥과 함께 S자 동선이 된다.
    const bLowTables = new PartsBuilder(physics);
    for (const table of lowTables) {
      const x = table.x, z = table.z;
      bLowTables.box(2.3, 0.55, 0.72, x, floorY + 0.275, z, mWoodPale);
      bLowTables.box(2.0, 0.06, 0.64, x, floorY + 0.58, z, mTimber);
      b.collide(x, floorY + 0.275, z, 1.15, 0.275, 0.36);
    }
    const lowTablesProc = bLowTables.build('hokora-low-tables-proc');
    this.group.add(lowTablesProc);

    // ---------- 지붕: 내부 삼각체 + 두 겹의 실제 경사면 + 용마루 ----------
    const roofBase = floorY + H + 0.05;
    const roofRise = 2.45;
    const roofSpan = D / 2 + 1.35;
    b.gable(cx, cz, W / 2 + 1.35, roofSpan, roofBase, roofRise, mRoof);
    const roofPlane = (side: -1 | 1, over = 0, mat = mRoofEdge) => {
      const span = roofSpan + over;
      const rise = roofRise + over * 0.18;
      const len = Math.hypot(span, rise);
      const g = new THREE.BoxGeometry(W + 2.85 + over * 0.5, 0.14, len);
      g.rotateX(side * Math.atan2(rise, span));
      g.translate(cx, roofBase + rise / 2 + 0.05, cz + side * span / 2);
      b.add(g, mat);
    };
    roofPlane(-1); roofPlane(1);
    // 두꺼운 처마선과 용마루 기와
    for (const z of [cz - roofSpan, cz + roofSpan]) {
      b.box(W + 3.0, 0.25, 0.22, cx, roofBase + 0.02, z, mRoofEdge);
    }
    const ridge = new THREE.CylinderGeometry(0.18, 0.18, W + 2.45, 10);
    ridge.rotateZ(Math.PI / 2);
    ridge.translate(cx, roofBase + roofRise + 0.13, cz);
    b.add(ridge, mRoofEdge);
    // 기와 골: 경사 방향 세로골 + 가로 겹침 단. 병합되므로 수십 개여도 재질당 드로우콜은 하나다.
    const slopeAngle = Math.atan2(roofRise, roofSpan);
    for (const side of [-1, 1] as const) {
      for (let x = wallX0 - 1.15; x <= wallX1 + 1.15; x += 0.52) {
        const rib = new THREE.BoxGeometry(0.065, 0.075, Math.hypot(roofSpan, roofRise) + 0.12);
        rib.rotateX(side * slopeAngle);
        rib.translate(x, roofBase + roofRise / 2 + 0.14, cz + side * roofSpan / 2);
        b.add(rib, mRoofEdge);
      }
      for (let j = 1; j < 12; j++) {
        const u = j / 12;
        const course = new THREE.BoxGeometry(W + 2.8, 0.055, 0.1);
        course.rotateX(side * slopeAngle);
        course.translate(cx, roofBase + roofRise * u + 0.105, cz + side * roofSpan * (1 - u));
        b.add(course, mRoofEdge);
      }
      // 물 먹은 이끼가 처마 한쪽에만 번져 대칭을 깨뜨린다.
      for (const [ox, u, rw, rd] of [[-3.4, 0.25, 1.55, 0.7], [2.8, 0.62, 1.0, 0.5]] as [number, number, number, number][]) {
        const moss = new THREE.BoxGeometry(rw, 0.035, rd);
        moss.rotateX(side * slopeAngle);
        moss.translate(cx + ox + side * 0.18, roofBase + roofRise * u + 0.16,
          cz + side * roofSpan * (1 - u));
        b.add(moss, mMoss);
      }
    }
    // 용마루 양끝 귀면기와 — 멀리서도 지붕 끝이 네모로 잘리지 않는다.
    for (const sx of [-1, 1]) {
      const endX = cx + sx * (W / 2 + 1.18);
      const cap = new THREE.CylinderGeometry(0.41, 0.41, 0.2, 12);
      cap.rotateZ(Math.PI / 2); cap.translate(endX, roofBase + roofRise + 0.13, cz); b.add(cap, mRoofEdge);
      const boss = new THREE.CylinderGeometry(0.13, 0.13, 0.22, 10);
      boss.rotateZ(Math.PI / 2); boss.translate(endX + sx * 0.03, roofBase + roofRise + 0.13, cz); b.add(boss, mStoneDark);
    }
    // 박공면 풍판 — 겹친 세로 목재가 정면의 크기감을 잡는다.
    for (const x of [wallX0 - 0.02, wallX1 + 0.02]) {
      for (const sz of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.14, 0.16, Math.hypot(D / 2, roofRise) + 0.3);
        g.rotateX(sz * Math.atan2(roofRise, D / 2));
        g.translate(x, roofBase + roofRise / 2, cz + sz * D / 4);
        b.add(g, mTimber);
      }
    }

    // ---------- 정면 금줄과 석등: 멀리서도 「사당」으로 읽히는 실루엣 ----------
    const ropeY = floorY + 2.65;
    for (const sz of [-1, 1]) {
      const rope = new THREE.CylinderGeometry(0.045, 0.055, 1.45, 7);
      rope.rotateX(Math.PI / 2);
      rope.rotateZ(sz * 0.22);
      rope.translate(wallX1 + 0.18, ropeY - 0.16, cz + sz * 0.76);
      b.add(rope, mRope);
    }
    for (const z of [cz - 0.92, cz - 0.3, cz + 0.35]) {
      b.box(0.035, 0.48, 0.18, wallX1 + 0.22, ropeY - 0.5, z, mPaper);
    }
    // 석등 절차 버전은 별도 빌더 — ishidoro.glb(마을 랜드마크와 같은 모델)가 로드되면 감춘다
    const bLan = new PartsBuilder(physics);
    const stoneLantern = (x: number, z: number) => {
      bLan.box(0.72, 0.22, 0.72, x, gy + 0.11, z, mStoneDark);
      bLan.cyl(0.18, 0.24, 1.05, x, gy + 0.74, z, mStone, 8);
      bLan.box(0.62, 0.52, 0.62, x, gy + 1.48, z, mStoneDark);
      const cap = new THREE.ConeGeometry(0.58, 0.38, 4);
      cap.rotateY(Math.PI / 4); cap.translate(x, gy + 1.93, z); bLan.add(cap, mStone);
      b.collide(x, gy + 0.92, z, 0.38, 0.92, 0.38);
    };
    stoneLantern(wallX1 + 2.65, cz - 3.2);
    stoneLantern(wallX1 + 2.65, cz + 3.2);
    const lanternProc = bLan.build('hokora-ishidoro-proc');
    this.group.add(lanternProc);

    this.group.add(b.build('hokora-grand-hall', { spatialCellSize: 12 }));

    // PartsBuilder의 건물은 정적 병합 메시라 문짝만 움직일 수 없다. 같은 재질·격자 비례의
    // 런타임 문을 열린 문 위에 겹쳐 두고, 사건이 시작될 때만 보이게 해 실제로 중앙을 닫는다.
    const slidingDoor = (side: -1 | 1) => {
      const root = new THREE.Group();
      const h = 2.35, width = 1.28;
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, width), mPaper);
      root.add(paper);
      for (const sy of [-h / 2, -0.68, -0.16, 0.36, 0.88, h / 2]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.038, width + 0.035), mBeam);
        rail.position.set(0.014, sy, 0); root.add(rail);
      }
      for (const dz of [-width / 2, -0.22, 0.22, width / 2]) {
        const stile = new THREE.Mesh(new THREE.BoxGeometry(0.058, h, 0.038), mBeam);
        stile.position.set(0.014, 0, dz); root.add(stile);
      }
      const openZ = cz + side * 2.60;
      const closedZ = cz + side * (width / 2 + 0.02);
      root.position.set(wallX1 + 0.03, floorY + h / 2, openZ);
      root.visible = false;
      root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      this.doorPanels.push({ root, openZ, closedZ });
      this.group.add(root);
    };
    slidingDoor(-1); slidingDoor(1);
    this.doorBarrier = physics.addStaticBox(
      new THREE.Vector3(wallX1 + 0.035, floorY + 1.18, cz),
      new THREE.Vector3(0.11, 1.18, doorW / 2),
    );
    this.doorBarrier.body.setEnabled(false);

    // 촛불 셋 — 제단 하나, 출구 방향 둘. 길 유도와 몸통 림라이트를 동시에 맡는다.
    // 몸체는 candlestick.glb(납골당과 같은 철 촛대)가 맡고, 여기는 **불붙은 촛농 끝**만 그린다
    this.candleMat = new THREE.MeshStandardMaterial({
      color: 0xf6e3bf,
      emissive: new THREE.Color(0xff8a32),
      emissiveIntensity: 1.0,
      roughness: 0.95,
    });
    const candleSticks: { x: number; z: number; baseY: number; s: number; yaw: number }[] = [];
    const candle = (x: number, y: number, z: number, intensity: number, distance: number) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.09, 8), this.candleMat);
      c.position.set(x, y, z); this.group.add(c);
      // 광원은 불꽃보다 한 뼘 위 — 촛대의 흰 촛농·받침에 너무 붙으면 하얗게 타버린다(실측)
      const l = new THREE.PointLight(0xff913d, intensity, distance, 2);
      l.position.set(x, y + 0.34, z); l.castShadow = false;
      this.lights.push(l); this.group.add(l);
    };
    const altarTopY = floorY + 0.92;
    candle(this.suzuPos.x + 0.2, altarTopY + 0.34, this.suzuPos.z - 0.72, 1.0, 8.5);
    candleSticks.push({ x: this.suzuPos.x + 0.2, z: this.suzuPos.z - 0.72, baseY: altarTopY, s: 0.42, yaw: 0.6 });
    for (const sz of [-1, 1]) {
      // 예전엔 벽 옆 1.3 m 에 떠 있었다 — 바닥에 서는 철 촛대로 내리면 빛이 마루 결을 핥는다
      candle(wallX1 - 0.6, floorY + 0.84, cz + sz * 1.75, 0.85, 6.5);
      candleSticks.push({ x: wallX1 - 0.6, z: cz + sz * 1.75, baseY: floorY, s: 1, yaw: sz * 1.9 });
    }

    // ---------- GLB 소품 — 절차 버전을 실물로 바꿔 끼운다 (실패 시 절차 유지) ----------
    void Promise.all([
      Props.loadNormalized('/models/props/ishidoro.glb', 2.05, 0.62),
      Props.loadNormalized('/models/props/candlestick.glb', 0.85, 0.7),
    ]).then(([lan, stick]) => {
      for (const [lx, lz, yaw] of [[wallX1 + 2.65, cz - 3.2, 0.4], [wallX1 + 2.65, cz + 3.2, -2.5]] as [number, number, number][]) {
        const m = lan.clone(true);
        m.position.set(lx, ground.heightAt(lx, lz) - 0.02, lz);
        m.rotation.y = yaw;
        this.group.add(m);
      }
      lanternProc.visible = false;
      for (const cs of candleSticks) {
        const m = stick.clone(true);
        m.scale.multiplyScalar(cs.s);
        m.position.set(cs.x, cs.baseY, cs.z);
        m.rotation.y = cs.yaw;
        this.group.add(m);
      }
    }).catch((e) => console.warn('[hokora] 석등/촛대 모델 로드 실패 — 절차 소품 유지:', e));
    void Promise.all([
      Props.loadNormalized('/models/props/miki.glb', 0.34, 0.9),
      Props.loadNormalized('/models/props/gohei.glb', 0.74, 0.95),
    ]).then(([miki, gohei]) => {
      altarProc.visible = false;
      for (const sz of [-1, 1]) {
        const m = miki.clone(true);
        m.position.set(altarX - 0.18, altarTopY, cz + sz * 0.66);
        m.rotation.y = sz * 0.5;
        this.group.add(m);
        const g = gohei.clone(true);
        g.position.set(wallX0 + 0.93, floorY + 1.225, cz + sz * 0.78);
        g.rotation.y = sz * Math.PI / 2;
        this.group.add(g);
      }
    }).catch((e) => console.warn('[hokora] 신단 세트 모델 로드 실패 — 절차 제구 유지:', e));
    void Props.loadNormalized('/models/props/hokora-altar.glb', 0.82, 0.78).then((altar) => {
      altar.name = 'hokora-altar-tripo';
      // 생성본의 폭:깊이가 실제 충돌체보다 좁다. 로컬 X=정면 폭, Z=깊이를 각각 맞춘 뒤
      // +Z 정면을 사당 입구(+X)로 돌린다. 방울·촛대는 기존 월드 좌표를 그대로 쓴다.
      altar.scale.set(2.22, 1, 3.34);
      altar.rotation.y = Math.PI / 2;
      altar.position.set(altarX, floorY, cz);
      altar.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
      this.group.add(altar);
      altarBodyProc.visible = false;
    }).catch((e) => console.warn('[hokora] Tripo 제단 로드 실패 — 절차 제단 유지:', e));
    void Props.loadNormalized('/models/props/hokora-kyodai.glb', 0.58, 0.8).then((table) => {
      table.name = 'hokora-kyodai-tripo-source';
      for (let i = 0; i < lowTables.length; i++) {
        const spot = lowTables[i]!;
        const m = table.clone(true);
        m.name = `hokora-kyodai-tripo-${i}`;
        m.scale.set(1.27, 1, 1.42);
        m.position.set(spot.x, floorY, spot.z);
        m.rotation.y = i === 0 ? 0.025 : -0.035;
        this.group.add(m);
      }
      lowTablesProc.visible = false;
    }).catch((e) => console.warn('[hokora] Tripo 경상 로드 실패 — 절차 경상 유지:', e));
    void Props.loadNormalized('/models/props/ema-rack-frame.glb', 0.42, 0.78).then((rack) => {
      for (const sz of [-1, 1]) {
        const m = rack.clone(true);
        m.name = `hokora-ema-rack-tripo-${sz < 0 ? 'north' : 'south'}`;
        // 생성본의 장축은 로컬 Z. 벽의 X 방향 3m 폭에 맞추고 판보다 8cm 뒤에 붙인다.
        m.scale.z *= 2.35;
        m.rotation.y = sz * Math.PI / 2;
        m.position.set(cx - 0.55, floorY + 1.18, cz + sz * (D / 2 - 0.27));
        this.group.add(m);
      }
      emaRackProc.visible = false;
    }).catch((e) => console.warn('[hokora] Tripo 에마 걸이 로드 실패 — 절차 걸이 유지:', e));
    // 상호작용 금줄은 단순 원환이 아니라 Tripo에서 만든 실제 볏짚 결속 두 상태를 쓴다.
    // 한 번 읽고 지오메트리는 공유하되, 발광은 매듭별로 달라야 하므로 재질만 인스턴스마다 복제한다.
    void Promise.all([
      Props.loadNormalized('/models/props/shimenawa-binding.glb', 0.36, 0.84),
      Props.loadNormalized('/models/props/shimenawa-loose.glb', 0.36, 0.84),
    ]).then(([tiedBase, looseBase]) => {
      const cloneWard = (source: THREE.Group) => {
        const root = source.clone(true);
        const materials: THREE.MeshStandardMaterial[] = [];
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const cloned = src.map((material) => {
            const mat = material.clone() as THREE.MeshStandardMaterial;
            mat.emissive = new THREE.Color(0x000000);
            mat.emissiveIntensity = 0;
            mat.roughness = Math.max(0.78, mat.roughness ?? 0.9);
            materials.push(mat);
            return mat;
          });
          mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]!;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        return { root, materials };
      };
      for (let i = 0; i < this.wardMarks.length; i++) {
        const mark = this.wardMarks[i]!;
        const tied = cloneWard(tiedBase);
        const loose = cloneWard(looseBase);
        // 높이 0.36m의 중심을 상호작용점에 맞춘다. 깊이는 눌러 벽에서 솟은 부피를 줄이고,
        // 풀린 모델은 원본 장축이 짧아 Z만 보정해 묶인 모델과 같은 설치 폭을 유지한다.
        tied.root.position.y = -0.18;
        tied.root.scale.x = 0.55;
        loose.root.position.y = -0.18;
        loose.root.scale.set(0.55, 1, 1.28);
        tied.root.name = `hokora-ward-tied-${i}`;
        loose.root.name = `hokora-ward-loose-${i}`;
        mark.tied = tied.root;
        mark.loose = loose.root;
        mark.tiedMaterials = tied.materials;
        mark.looseMaterials = loose.materials;
        mark.anchor.add(tied.root, loose.root);
        this.refreshWardVisual(i);
      }
    }).catch((e) => console.warn('[hokora] Tripo 금줄 매듭 로드 실패:', e));

    this.ejectPos = new THREE.Vector3(
      wallX1 + 3.35,
      ground.heightAt(wallX1 + 3.35, cz) + 0.08,
      cz,
    );
    scene.add(this.group);
  }

  /** 실내·툇마루 판정 — 카메라 조임과 안개 제거가 같은 외곽을 본다. */
  contains(p: THREE.Vector3): boolean {
    return p.x > this.bounds.x0 && p.x < this.bounds.x1
      && p.z > this.bounds.z0 && p.z < this.bounds.z1
      && p.y < this.center.y + 5.7;
  }

  /** 방울을 집는 순간, 유일한 출구를 장지문 두 짝이 가로막는다. */
  closeDoor() {
    this.doorTarget = 1;
    this.doorBarrier?.body.setEnabled(true);
    for (const p of this.doorPanels) p.root.visible = true;
  }

  /** 세 매듭 복구 완료·실패 리셋 때 실제 빗장과 문짝을 함께 연다. */
  openDoor() {
    this.doorTarget = 0;
    this.doorBarrier?.body.setEnabled(false);
  }

  private refreshWardVisual(index: number) {
    const mark = this.wardMarks[index];
    if (!mark) return;
    const loose = mark.state === 'loose';
    if (mark.tied) mark.tied.visible = !loose;
    if (mark.loose) mark.loose.visible = loose;

    const targeted = index === this.wardTarget;
    const wave = 0.5 + 0.5 * Math.sin(this.t * 7.4);
    // 복구된 매듭은 팽팽하게 조금 줄이고, 풀린 매듭은 느슨하게 처진 모델을 그대로 드러낸다.
    const baseScale = loose ? 1.03 : mark.state === 'restored' ? 0.96 : 1;
    mark.anchor.scale.setScalar(baseScale * (targeted ? 1 + wave * 0.025 : 1));
    mark.anchor.rotation.z = loose ? (index % 2 === 0 ? 0.045 : -0.045) : 0;

    for (const mat of [...mark.tiedMaterials, ...mark.looseMaterials]) {
      if (targeted) {
        // 매듭 전체를 빨갛게 칠하지 않고 촛불이 스친 정도의 약한 호박색만 준다.
        mat.emissive.setHex(0x6a2b12);
        mat.emissiveIntensity = 0.1 + wave * 0.18;
      } else if (mark.state === 'restored') {
        mat.emissive.setHex(0x2b2415);
        mat.emissiveIntensity = 0.06;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }
  }

  setWardState(index: number, state: WardState) {
    const mark = this.wardMarks[index];
    if (!mark) return;
    mark.state = state;
    this.refreshWardVisual(index);
  }

  setWardTarget(index: number | null) {
    this.wardTarget = index ?? -1;
    for (let i = 0; i < this.wardMarks.length; i++) this.refreshWardVisual(i);
  }

  update(dt: number) {
    this.t += dt;
    const f = 0.78 + 0.22 * Math.sin(this.t * 5.3) * Math.sin(this.t * 1.7);
    this.candleMat.emissiveIntensity = 1.0 * f;
    for (let i = 0; i < this.lights.length; i++) {
      this.lights[i]!.intensity = (i === 0 ? 1.25 : 0.85) * f;
    }
    for (let i = 0; i < this.wardMarks.length; i++) {
      if (i === this.wardTarget) this.refreshWardVisual(i);
    }
    this.doorMotion += (this.doorTarget - this.doorMotion) * (1 - Math.exp(-dt * 7.5));
    const k = this.doorMotion * this.doorMotion * (3 - 2 * this.doorMotion);
    for (const p of this.doorPanels) p.root.position.z = THREE.MathUtils.lerp(p.openZ, p.closedZ, k);
    if (this.doorTarget === 0 && this.doorMotion < 0.008) {
      for (const p of this.doorPanels) p.root.visible = false;
    }
  }
}
