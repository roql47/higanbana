import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { Props } from '@/world/props';
import { SITES, type HigasatoGround } from './ground';
// 거울 세계는 **단색 재질**이라 `makePartitions`(색 속성 없음)를 그대로 써도 안전하다.
// 현실 쪽만 정점색 폐가 세트라 자체 partX/partZ 를 따로 짓는다(아래 주석 참고).
import { makePartitions, MIO_CLEAR_DOOR_HEIGHT, PartsBuilder, textCanvas } from './kit';
import { makeHouseMaterials } from '../village/houseMaterials';
import { grunge, projectUV } from './minka';
import { L } from '@/core/i18n';

/**
 * 폐여관 「히간장」 실내 — 깨진 거울(공물 5)의 무대 (PLAN-STORY §2.3, §5.3.5)
 *
 * 셸(`blockouts.ts`)이 외피·큰 거울·화장대·환영 장치를 맡고, 이 모듈이 **방**을 채운다
 * (폐교 `school.ts` 와 같은 분업). 평면은 서쪽 정문 → 복도 → **동쪽 거울 방**으로 곧다:
 * 문을 열면 복도 끝 어둠 속에서 큰 거울이 초칭 빛을 되쏘는 것이 이 건물의 첫 그림이다.
 *
 *   객실1 | 객실2 |
 *   ------문------  거울 방 (셸의 화장대·환영 — 이 모듈은 건드리지 않는다)
 *   로비‧계단 | 객실3 |
 *
 * 여관은 **불탔다** — 조명은 없고(형광등도 촛불도), 빛은 플레이어의 초칭뿐이다.
 * 2층은 셸의 슬래브가 막는다. 로비의 계단은 판자로 못질돼 있다(올라가는 동선 없음).
 */
export class InnInterior {
  readonly group = new THREE.Group();
  /** 못질된 2층 계단 — 조사 지문 자리 (「위층은 무너졌다」) */
  readonly stairsPos: THREE.Vector3;
  /** 접수대 숙박부 — 조사 지문 자리 */
  readonly registerPos: THREE.Vector3;
  /** 가짜 벽(거울 속에서만 문) 중심 — 거울 대조의 정답 지점 */
  readonly secretPos: THREE.Vector3;
  /** 복도 벽거울 — **손거울을 얻기 전의 도구**(§5.3.5 「획득 전엔 벽거울」) */
  readonly wallMirrorPos: THREE.Vector3;
  /** 와쿄(和鏡) — 손잡이 없는 청동 거울. 객실1 좌탁 위, 이 방의 진짜 도구 */
  readonly wakyoPos: THREE.Vector3;
  /** 거울 속 세계 — 별도 씬에 담긴 **온전한 여관**. 손거울이 이걸 비춘다 */
  readonly mirrorScene = new THREE.Scene();

  /** 좌탁 위 와쿄 프롭 — 주우면 숨긴다 */
  private wakyoProp: THREE.Object3D;
  /** 거울 속 절차 가구 — GLB 클론 도착 시 감춘다 */
  private mirrorFurnProc: THREE.Group | null = null;
  /** 미오의 초칭이 거울에 비친 몫 — main 이 매 프레임 현실 초칭 값을 복사한다 */
  mirrorChochin!: THREE.PointLight;
  /** 거울 속 축제 인파 — 셋만 「이쪽을 본다」(§5.3.5 3회 고정 이벤트) */
  private crowd: { root: THREE.Group; home: number; watching: boolean }[] = [];
  /** 시선 이벤트 지점 — 각 인파가 서 있는 자리(월드) */
  readonly crowdSpots: THREE.Vector3[] = [];
  /** 와쿄를 주웠다 — 프롭을 치운다 */
  takeWakyo() { this.wakyoProp.visible = false; }

  /** i 번 인파가 플레이어 쪽으로 **돌아본다** (금기 三 시선 이벤트 시작) */
  watch(i: number, player: THREE.Vector3) {
    const c = this.crowd[i];
    if (!c) return;
    c.watching = true;
    c.root.rotation.y = Math.atan2(player.x - c.root.position.x, player.z - c.root.position.z);
  }

  /** 시선을 거둔다 — 대답하지 않고 버텼거나, 이벤트가 끝났다 */
  unwatch(i: number) {
    const c = this.crowd[i];
    if (!c) return;
    c.watching = false;
    c.root.rotation.y = c.home;
  }

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.inn!;
    const cx = s.x, cz = s.z;
    const w = s.w - 5, d = s.d - 5;            // 셸과 같은 산식 (12 × 9)
    const gy = ground.heightAt(cx, cz);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const floorY = gy + 0.33;

    const k = new PartsBuilder(physics);
    /**
     * **폐교와 같은 경로**로 텍스처를 얻는다 — `makeHouseMaterials()`(폐가 PBR 세트) + `projectUV` + `grunge`.
     * `kit.texMat` 은 이 건물에서만 조명을 죽였고(v5.13 실측: 같은 광원에서 `k.mat()` 은 보이고 texMat 은 칠흑,
     * 노멀맵을 빼도 검었다) 원인을 못 찾았다. 폐교·민가에서 이미 돌아가는 길이 있는데 그걸 두고
     * 미궁을 파는 건 낭비다 — **검증된 경로로 우회하고, texMat 추적은 별건으로 남긴다**.
     *
     * 「탄 집」은 재질이 아니라 **정점색**으로 만든다: `grunge` 가 바닥 얼룩·처마 그늘을 깔고,
     * `sootTint` 가 그 위에 숯 색을 곱한다. 텍스처의 나뭇결·회벽 요철은 그대로 남고 색만 타 버린다.
     */
    const tex = makeHouseMaterials();
    const mWall = tex.mud;                     // 그을린 회벽 (정점색으로 태운다)
    const mChar = tex.plankDark;               // 탄 목재
    const mWood = tex.plank;
    // 가구 폴백은 **단색**으로 둔다 — GLB 가 오면 감춰지는 것들이라 텍스처를 줄 이유가 없고,
    // 정점색 재질과 섞이면 배치가 통째로 버려진다(아래 tput 주석의 그 함정)
    const mFurn = k.mat(0x4a3a28, 0.9);
    const mAsh = k.mat(0x1a1714, 1.0);         // 재 — 결이 없다. 텍스처를 주면 재가 아니라 흙이 된다
    /**
     * 텍스처 박스 — 폐가 재질은 `vertexColors: true` 라 **색 속성이 필수**다(없으면 mergeGeometries 가
     * 그 재질의 배치를 통째로 버린다 — `school.ts` 에 기록된 함정).
     * `projectUV` 로 월드 좌표를 그대로 투영하고, `grunge`(바닥 얼룩·처마 그늘) 위에 **숯 색을 곱해**
     * 「탄 집」을 만든다. 재질은 폐가와 같고 색만 타 버린 상태 — 그래서 나뭇결·회벽 요철이 살아 있다.
     */
    const H_TOP = 2.7;
    const tput = (bw: number, bh: number, bd: number, x: number, y: number, z: number,
                  mat: THREE.Material, su: number, sv: number, soot = 0.5, yaw = 0) => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      if (yaw) g.rotateY(yaw);
      g.translate(x, y - gy, z);
      projectUV(g, su, sv);
      grunge(g, H_TOP);
      // 숯: grunge 가 깐 정점색에 곱한다. 위로 갈수록 더 탔다(불은 천장을 먼저 먹는다)
      const col = g.getAttribute('color') as THREE.BufferAttribute;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < col.count; i++) {
        const up = Math.min(1, Math.max(0, pos.getY(i) / H_TOP));
        const k2 = 1 - soot * (0.55 + 0.45 * up);
        col.setXYZ(i, col.getX(i) * k2, col.getY(i) * k2 * 0.96, col.getZ(i) * k2 * 0.9);
      }
      g.translate(0, gy, 0);
      k.add(g, mat);
    };
    /**
     * 칸막이는 **직접 짓는다** — `makePartitions` 는 `k.box` 를 쓰는데 그건 색 속성을 안 만든다.
     * 정점색 재질(폐가 세트)과 섞으면 `mergeGeometries` 가 **그 재질의 배치를 조용히 버린다**
     * (school.ts 에 기록된 함정). 문 틈·인방·콜라이더 규격은 `makePartitions` 와 동일하다.
     */
    const PH = 2.7, PT = 0.1, PDOOR = 1.2, PHEAD = MIO_CLEAR_DOOR_HEIGHT;
    const partX = (px: number, zA: number, zB: number, doorAt?: number) => {
      const seg = (zC: number, len: number) => {
        if (len <= 0.05) return;
        tput(PT, PH, len, px, floorY + PH / 2, zC, mWall, 0.7, 0.7);
        k.collide(px, floorY + PH / 2, zC, PT / 2, PH / 2, len / 2);
      };
      if (doorAt === undefined) { seg((zA + zB) / 2, zB - zA); return; }
      const aLen = doorAt - PDOOR / 2 - zA, bLen = zB - (doorAt + PDOOR / 2);
      seg(zA + aLen / 2, aLen); seg(zB - bLen / 2, bLen);
      tput(PT, PH - PHEAD, PDOOR, px, floorY + PHEAD + (PH - PHEAD) / 2, doorAt, mWall, 0.7, 0.7);
    };
    const partZ = (pz: number, xA: number, xB: number, doorAt?: number) => {
      const seg = (xC: number, len: number) => {
        if (len <= 0.05) return;
        tput(len, PH, PT, xC, floorY + PH / 2, pz, mWall, 0.7, 0.7);
        k.collide(xC, floorY + PH / 2, pz, len / 2, PH / 2, PT / 2);
      };
      if (doorAt === undefined) { seg((xA + xB) / 2, xB - xA); return; }
      const aLen = doorAt - PDOOR / 2 - xA, bLen = xB - (doorAt + PDOOR / 2);
      seg(xA + aLen / 2, aLen); seg(xB - bLen / 2, bLen);
      tput(PDOOR, PH - PHEAD, PT, doorAt, floorY + PHEAD + (PH - PHEAD) / 2, pz, mWall, 0.7, 0.7);
    };
    // 마루·천장 — 불탄 판재
    tput(w, 0.1, d, cx, floorY - 0.05, cz, mWood, 0.55, 0.55, 0.35);
    tput(w, 0.12, d, cx, floorY + 2.66, cz, mChar, 0.5, 0.5, 0.7);

    // ---------- 평면 ----------
    /**
     * 평면 분할은 **비율**이다. 예전엔 고정 오프셋(x0+8.4 등)이라, 건물을 12 → 19 m 로 넓히자
     * 앞쪽 방들은 그대로인데 **거울 방만 3.6 → 10.6 m 로 부풀었다**(실측). 폭에 비례시키면
     * 어느 크기로 다시 잡아도 방 비율이 유지된다 — 이 건물은 이미 두 번 넓혔고 또 넓힐 수 있다.
     */
    const mirrorWall = x0 + w * 0.70;          // 동쪽 30 % 가 거울 방
    const nDiv = x0 + w * 0.35;                // 객실1 | 객실2
    const sDiv = x0 + w * 0.38;                // 로비 | 객실3
    const corrHalf = Math.min(1.6, d * 0.105); // 복도 반폭 — 깊이에 비례하되 3.2 m 를 넘기지 않는다
    const corrZ0 = cz - corrHalf, corrZ1 = cz + corrHalf * 1.15;
    /**
     * 거울 방 문 — **보이지만 못 들어간다.** 문틀은 열려 있는데 무너진 들보가 가로막는다.
     * 이것이 §5.3.5 퍼즐의 전제다: 목적지는 처음부터 보이고, 문제는 **가는 길**이다.
     */
    /**
     * 거울 방 벽은 **세 토막**이다 — 이렇게 나누지 않으면 비밀 통로가 성립하지 않는다.
     * `partX(mirrorWall, z0, z1, cz)` 한 줄로 두었더니 칸막이 콜라이더가 z0~z1 전체를 덮어,
     * 그 위에 얹은 「가짜 벽」이 그냥 **벽 위의 벽**이 됐다(실측: 밀어도 48.04 에서 막힘).
     */
    const secZ = z0 + 1.6;
    partX(mirrorWall, z0, secZ - 0.75);        // 북쪽 토막 (콜라이더 있음)
    partX(mirrorWall, secZ + 0.75, z1, cz);    // 남쪽 토막 + 정문
    tput(1.35, 0.22, 0.24, mirrorWall, floorY + 0.55, cz, mChar, 1.2, 1.2, 0.85, 0.42);
    tput(1.35, 0.22, 0.24, mirrorWall, floorY + 1.15, cz, mChar, 1.2, 1.2, 0.85, -0.3);
    k.collide(mirrorWall, floorY + 0.95, cz, 0.3, 0.95, 0.62);
    /**
     * **가짜 벽** — 객실2 와 거울 방 사이. 현실에서는 그을린 벽으로 보이지만 콜라이더가 없다.
     * 거울 속에서는 이 자리가 **열린 문**이다(`mirrorGroup`). 이 한 곳이 퍼즐의 답이고,
     * 그래서 그을음 띠(P1)가 거울 방에서 이쪽으로 번져 있다 — 불이 지나간 길이 곧 사람이 지나갈 길이다.
     */
    /**
     * 3차 개정: 「걸어서 통과하는 가짜 벽」 폐기 — **벽은 진짜 벽이다**(콜라이더 있음).
     * 대신 이 벽에 **그을린 거울**이 걸려 있고, 와쿄를 든 채 이 거울을 마주 보면(合わせ鏡)
     * 통로가 열린다(이동 처리는 main 의 inspect). 마주 거울은 「거울과 거울 사이는 이어져 있다」는
     * 일본 괴담 문법 그대로다 — 벽을 몸으로 뚫는 것보다 이쪽이 이 여관답다.
     */
    this.secretPos = new THREE.Vector3(mirrorWall, floorY + 1.3, secZ);
    tput(0.1, 2.6, 1.5, mirrorWall, floorY + 1.3, secZ, mWall, 0.7, 0.7);
    k.collide(mirrorWall, floorY + 1.3, secZ, 0.06, 1.3, 0.75);
    /**
     * 벽에 걸린 그을린 거울 — 서쪽(객실2)을 본다. 와쿄와 마주 보는 짝.
     * ⚠️ 액자는 **벽이 뻗는 축**을 따라 넓어야 한다. 이 벽(mirrorWall)은 **Z 축으로** 뻗으므로
     * 폭 0.9 는 Z, 두께 0.07 이 X 다. 처음엔 (0.9, 1.25, 0.07) 로 둬서 액자가 X 로 0.9 m
     * 튀어나와 **벽을 관통한 널빤지**가 됐다(유리 법선은 맞았는데 액자만 90° 돌아가 있었다).
     */
    tput(0.07, 1.25, 0.9, mirrorWall - 0.06, floorY + 1.5, secZ, mChar, 1.2, 1.2, 0.8);
    const fmGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 1.05),
      new THREE.MeshStandardMaterial({ color: 0x10141a, roughness: 0.14, metalness: 0.8 }),
    );
    fmGlass.position.set(mirrorWall - 0.11, floorY + 1.5, secZ);
    fmGlass.rotation.y = -Math.PI / 2;
    this.group.add(fmGlass);
    // 복도 북벽: 객실1 문 + 객실2 문
    partZ(corrZ0, x0, nDiv, x0 + 2.1);
    partZ(corrZ0, nDiv, mirrorWall, nDiv + 2.1);
    partX(nDiv, z0, corrZ0);
    // 복도 남벽: 로비 입구(넓게 튼다 — 벽 두 조각만) + 객실3 문
    partZ(corrZ1, x0, x0 + 0.6);
    partZ(corrZ1, x0 + 2.6, sDiv);             // 로비는 x0+0.6~2.6 이 뚫린 입구다
    partZ(corrZ1, sDiv, mirrorWall, sDiv + 1.9);
    partX(sDiv, corrZ1, z1);

    /**
     * ---------- 복도 벽거울 ----------
     * **이게 없으면 이 방은 데드락이다.** 거울 방 정문은 들보로 막혀 있고, 손거울은 그 방 안
     * 화장대에 있다 — 들어가려면 손거울이 필요하고 손거울을 얻으려면 들어가야 한다(실측: 사용자가
     * 「큰 거울 4 m 앞에서 못 지나간다」고 두 번 짚었다).
     * 스토리보드가 「손거울(**획득 전엔 벽거울**)」이라고 못박은 이유가 이것이다 — 복도에 붙은
     * 이 거울이 첫 도구고, 여기서 처음으로 「거울 속은 다르다」를 배운다.
     */
    // ⚠️ **북벽**이다. 처음엔 남벽에 걸었는데 하필 복도 잔해와 같은 벽·같은 x 라 다가갈 수가 없었다
    // (실측: 입구→벽거울 경로가 막힘). 잔해는 남쪽, 거울은 북쪽 — 서로 반대 차선에 둔다.
    const wmX = x0 + 3.4, wmZ = corrZ0 + 0.06;
    tput(1.15, 1.5, 0.09, wmX, floorY + 1.45, wmZ, mChar, 1.2, 1.2, 0.8);   // 그을린 테두리
    const wmGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 0.16, metalness: 0.72 }),
    );
    wmGlass.position.set(wmX, floorY + 1.45, wmZ + 0.06);
    this.group.add(wmGlass);
    this.wallMirrorPos = new THREE.Vector3(wmX, floorY + 1.45, wmZ + 0.55);

    // ---------- 로비 — 접수대 + 못질된 계단 ----------
    const kFurn = new PartsBuilder(physics);
    const counterX = x0 + 1.9, counterZ = z1 - 1.15;
    kFurn.box(1.9, 0.95, 0.6, counterX, floorY + 0.475, counterZ, mFurn);
    kFurn.collide(counterX, floorY + 0.475, counterZ, 0.95, 0.475, 0.3);
    this.registerPos = new THREE.Vector3(counterX, floorY + 1.02, counterZ);
    // 계단 — 세 단 오르다 판자에 막힌다. 오르는 동선은 없다(콜라이더가 벽이다)
    const stX = sDiv - 0.75, stZ = z1 - 0.75;
    for (let i = 0; i < 3; i++) tput(1.1, 0.18, 0.3, stX, floorY + 0.09 + i * 0.18, stZ + 0.45 - i * 0.3, mWood, 1.0, 1.0, 0.45);
    tput(1.1, 2.0, 0.12, stX, floorY + 1.0, stZ - 0.32, mChar, 1.0, 1.0, 0.75);
    for (const dy of [-0.3, 0.25]) tput(1.25, 0.14, 0.05, stX, floorY + 1.3 + dy, stZ - 0.4, mChar, 1.2, 1.2, 0.75, 0.12 * (dy > 0 ? -1 : 1));
    k.collide(stX, floorY + 1.0, stZ, 0.6, 1.0, 0.75);
    this.stairsPos = new THREE.Vector3(stX, floorY + 1.0, stZ - 0.5);

    // ---------- 객실 세 칸 — 좌탁·이불·단스 (생활 정지의 문법) ----------
    const chabudai = (px: number, pz: number) => {
      kFurn.cyl(0.42, 0.42, 0.32, px, floorY + 0.16, pz, mFurn, 12);
      kFurn.collide(px, floorY + 0.16, pz, 0.4, 0.16, 0.4);
    };
    const futon = (px: number, pz: number, yaw: number) => {
      kFurn.box(0.72, 0.4, 0.95, px, floorY + 0.2, pz, mFurn, yaw);
      kFurn.collide(px, floorY + 0.2, pz, 0.36, 0.2, 0.48, yaw);
    };
    const futonSpots: { x: number; z: number; yaw: number }[] = [];
    const chabudaiSpots: { x: number; z: number }[] = [];
    /**
     * @param cdz 좌탁을 방 중심에서 z 로 밀어내는 양 — **동선을 비우기 위한 것**이다.
     * 객실2 는 문(z 46)에서 가짜 벽(z 44.1)으로 지나가는 통로를 겸하는데, 좌탁을 방 한가운데
     * (46.3, 44.25)에 두면 그 통로를 정확히 막는다. 무릎 높이(윗면 0.64 m)라 **눈에는 잘 안 띄고
     * 몸만 걸린다** — 실측에서 높이 0.35·1.2 로만 레이를 쏘다가 좌탁 윗면을 3 cm 차이로 넘겨 놓쳤다.
     */
    const room = (rx0: number, rx1: number, rz0: number, rz1: number, fYaw: number, cdx = 0, cdz = 0) => {
      const mx = (rx0 + rx1) / 2 + cdx, mz = (rz0 + rz1) / 2 + cdz;
      chabudai(mx, mz); chabudaiSpots.push({ x: mx, z: mz });
      futon(rx0 + 0.75, rz0 + 0.85, fYaw); futonSpots.push({ x: rx0 + 0.75, z: rz0 + 0.85, yaw: fYaw });
    };
    room(x0, nDiv, z0, corrZ0, 0.15);            // 객실1
    /**
     * 객실2 는 **두 개의 통로가 교차하는 방**이다 — 문(x 45.7~46.9, 세로)과 비밀 통로(z 43.35~44.85, 가로).
     * 좌탁은 그 십자를 **둘 다 피해** 서북쪽 구석으로 뺀다(x 45.0, z 45.0). z 로만 밀었더니
     * 이번엔 문을 막았다(실측) — 무릎 높이 장애물은 눈에 안 띄고 몸만 걸리므로 좌표로 검증해야 한다.
     */
    room(nDiv, mirrorWall, z0, corrZ0, -0.4, -1.3, 0.75);   // 객실2
    room(sDiv, mirrorWall, corrZ1, z1, 0.3);     // 객실3
    // 객실2 에만 단스 — 세 방이 같은 살림이면 무대 장치로 읽힌다
    /**
     * ---------- 와쿄(和鏡) — 객실1 좌탁 위 ----------
     * 손잡이 없는 옛 청동 거울. **여관에서 처음 들어가는 방**에 두는 이유는 도구가 퍼즐보다
     * 먼저 손에 들어와야 하기 때문이다(§5.3.5 「획득 전엔 벽거울」과 같은 원칙 — 잠금과 열쇠를
     * 같은 방에 넣으면 데드락이다, v5.16 실측). 절차 원반은 wakyo.glb 도착 시 교체된다.
     */
    const wkSpot = chabudaiSpots[0]!;
    this.wakyoPos = new THREE.Vector3(wkSpot.x + 0.12, floorY + 0.42, wkSpot.z - 0.08);
    const wakyoProc = new THREE.Group();
    const mBronze = new THREE.MeshStandardMaterial({ color: 0x6e5a34, roughness: 0.35, metalness: 0.85 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.018, 22), mBronze);
    disc.rotation.z = 0.06;
    wakyoProc.add(disc);
    wakyoProc.position.copy(this.wakyoPos);
    this.group.add(wakyoProc);
    this.wakyoProp = wakyoProc;
    void Props.loadNormalized('/models/props/wakyo.glb', 0.05, 0.9).then((m) => {
      // 원반이라 「높이」 정규화가 빗나간다 — XZ 지름 0.3 으로 다시 잰다
      const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
      m.scale.multiplyScalar(0.3 / Math.max(sz.x, sz.z, 0.01));
      m.position.copy(this.wakyoPos);
      m.rotation.y = 0.7;
      this.group.add(m);
      wakyoProc.visible = false;
      this.wakyoProp = m;
    }).catch((e) => console.warn('[inn] 와쿄 모델 로드 실패 — 절차 원반 유지:', e));

    // 단스도 통로(z 43.35~44.85) 밖으로 — z0+0.75 면 43.25 라 통로 입구를 스친다
    const tanX = mirrorWall - 0.65, tanZ = z0 + 0.42;
    kFurn.box(1.1, 0.85, 0.5, tanX, floorY + 0.425, tanZ, mFurn);
    kFurn.collide(tanX, floorY + 0.425, tanZ, 0.55, 0.425, 0.25);

    /**
     * ---------- 불의 흔적 ----------
     * 방을 어둡게 칠하는 것과 **탄 자국을 남기는 것**은 다르다. 셋만 있으면 읽힌다:
     *   ① 천장에서 내려앉은 서까래 — 사람 동선을 실제로 막아야 「무너졌다」가 몸으로 온다
     *   ② 재 무더기 — 무엇이 타서 남은 것인지 모를 형태여야 무섭다
     *   ③ 벽을 뚫고 지나간 불길 자국 — **거울 방향으로 번져 있다**(P2 의 복선: 불은 거울에서 났다)
     * 결정적 배치다(난수 없음). 같은 자리에 같은 잔해가 있어야 「퇴로 암기」(§5.3.5 실패 연출)가 성립한다.
     */
    const rng = seeded(4127);
    // ① 내려앉은 서까래 — 복도 두 곳, 객실 하나. 콜라이더를 달아 진짜로 돌아가게 한다
    const beam = (bx: number, bz: number, yaw: number, tilt: number, len: number) => {
      const g = new THREE.BoxGeometry(len, 0.16, 0.2);
      g.rotateZ(tilt); g.rotateY(yaw);
      g.translate(bx, floorY + 0.5 + Math.sin(Math.abs(tilt)) * len * 0.35, bz);
      // 서까래도 **색 속성이 있어야** mChar 배치에 낄 수 있다(없으면 그 재질 전체가 버려진다)
      g.translate(0, -gy, 0); projectUV(g, 1.2, 1.2); grunge(g, H_TOP); g.translate(0, gy, 0);
      k.add(g, mChar);
      k.collide(bx, floorY + 0.45, bz, 0.28, 0.45, 0.28, yaw);
    };
    /**
     * ⚠️ 잔해가 남기는 틈은 **캡슐 지름(0.70 m)보다 넉넉해야 한다.** 복도 한가운데(cz+0.1)에 두었더니
     * 회전된 콜라이더 폭까지 더해 북쪽 통로가 0.73 m 로 좁아져 사실상 못 지나갔다(실측: x 43 에서 멈춤).
     * 벽에 붙여 한쪽 차선을 확실히 비운다 — 「몸을 튼다」는 못 지나가는 것과 다르다.
     */
    beam(x0 + 3.1, corrZ1 - 0.35, 0.42, -0.55, 2.6);  // 복도 서쪽 — 남쪽 벽에 붙는다
    // ⚠️ 원래 (x0+6.4, cz−0.15) 였는데 **객실2 문 앞**(x 45.7~46.9)을 정확히 막아 비밀 통로로 가는
    // 유일한 길이 끊겼다(실측: 복도에서 북쪽으로 밀어도 z 46.37 에서 멈춤).
    // 잔해는 길을 **좁히는** 것이지 끊는 것이 아니다 — 남쪽 벽에 붙여 북쪽으로 지나갈 틈을 남긴다
    beam(x0 + 7.0, corrZ1 - 0.4, -0.3, 0.48, 2.2);   // 복도 동쪽 — 거울 방 문 앞
    beam(nDiv + 1.3, z0 + 1.1, 1.1, -0.4, 1.9);      // 객실2
    // ② 재 무더기 — 납작하게 눌린 원뿔. 무엇이 탔는지 알 수 없는 형태가 제일 무섭다
    for (const [ax, az, ar] of [
      [x0 + 2.2, cz + 0.35, 0.5], [x0 + 5.6, cz + 0.2, 0.38], [nDiv + 0.8, z0 + 1.9, 0.44],
      [sDiv + 1.4, z1 - 1.2, 0.36], [x0 + 1.4, z1 - 2.1, 0.3],
    ] as [number, number, number][]) {
      const g = new THREE.ConeGeometry(ar, 0.1 + rng() * 0.06, 7);
      g.scale(1, 1, 0.8 + rng() * 0.4);
      g.rotateY(rng() * 3);
      g.translate(ax, floorY + 0.04, az);
      k.add(g, mAsh);
    }
    // ③ 불길이 지나간 자국 — 거울 방 벽에서 시작해 복도로 번진 그을음 띠.
    // 방향이 있다는 것이 중요하다: 플레이어는 아직 모르지만 **불은 거울에서 났다**
    const scorch = textCanvas(256, 128, (ctx) => {
      // 0.92 로 두면 벽을 **가려 버린다** — 데칼은 자국이지 페인트가 아니다(실측: 비밀 벽이 통째로 검게 덮였다)
      const g2 = ctx.createLinearGradient(256, 0, 0, 0);
      g2.addColorStop(0, 'rgba(8, 5, 4, 0.58)');
      g2.addColorStop(0.45, 'rgba(20, 13, 8, 0.32)');
      g2.addColorStop(1, 'rgba(30, 20, 12, 0)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, 256, 128);
      // 혀처럼 날름거린 자국 — 직선 그라데이션만 두면 페인트칠로 보인다
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        const yy = (i / 14) * 128 + Math.sin(i * 2.3) * 6;
        ctx.ellipse(40 + Math.sin(i * 1.7) * 60, yy, 26 + (i % 3) * 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const mScorch = new THREE.MeshStandardMaterial({
      map: scorch, transparent: true, roughness: 1, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    for (const [sx, sz, syaw, sw] of [
      [x0 + 6.8, corrZ0 + 0.06, 0, 3.0], [x0 + 6.2, corrZ1 - 0.06, Math.PI, 2.6],
      // ⚠️ 이 자국은 **비밀 벽을 비켜 가야 한다**(z0+1.6). 처음엔 cz−2.2 에 뒀다가 정확히 그 위를 덮었다
      [mirrorWall - 0.09, cz + 2.4, -Math.PI / 2, 2.2],
    ] as [number, number, number, number][]) {
      const g = new THREE.PlaneGeometry(sw, 1.5);
      g.rotateY(syaw);
      g.translate(sx, floorY + 1.15, sz);
      this.group.add(new THREE.Mesh(g, mScorch));
    }

    /**
     * ---------- 거울 속 세계 (온전한 여관) ----------
     * **같은 평면을 한 벌 더 짓는다.** 다른 건물이면 대조가 성립하지 않는다 — 플레이어는
     * 「같은 자리인데 저기만 열려 있다」를 읽어야 하므로, 벽 좌표는 한 글자도 바꾸지 않고
     * **가짜 벽 자리만 문으로 비운다**.
     *
     * 콜라이더는 만들지 않는다(`ghost` 빌더) — 눈에만 있는 층이다. 별도 씬에 담아 손거울이
     * 그 씬만 렌더한다: 현실 씬에 섞어 두고 레이어로 거르는 방법보다, 안개·톤매핑이
     * 통째로 다른 세계를 따로 두는 쪽이 「거울 속은 다른 시간」이라는 문법에 맞다.
     */
    const kM = new PartsBuilder(physics, { ghost: true });
    /**
     * ⚠️ 거울 속은 **다른 방이 아니라 같은 방이다** (실측: 「다른 텍스처·조명도 다르고·소품도 안 보인다」).
     * 처음엔 텍스처 벽 + 텅 빈 방으로 지었는데, 대조 퍼즐은 **모든 것이 같아야** 차이(문·그을음·등불)가
     * 읽힌다. 규칙: 현실과 같은 팔레트를 「타기 전」 톤으로만 밝히고, 가구는 같은 좌표에 전부 놓고,
     * 조명도 현실 채움광과 같은 자리에 둔다. 다른 것은 셋뿐 — 그을음 없음 · 등불 켜짐 · 문 하나.
     */
    const mWallOk = kM.mat(0x8a7a5e, 0.95);    // 현실 0x554636 의 「타기 전」 — 같은 회벽, 그을음만 없다
    const mWoodOk = kM.mat(0x6b5334, 0.88);    // 현실 0x3d3022 의 타기 전
    const mDarkOk = kM.mat(0x4a3a26, 0.9);     // 현실 mChar 자리의 본래 목재
    const mp = makePartitions(kM, mWallOk, floorY);
    /**
     * 거울 방 벽 — **비밀 통로 자리를 비운다.** 이게 이 방 전체의 답이라, 여기를 안 비우면
     * 손거울은 「밝은 벽」만 보여 주는 장식이 된다(실측: 처음엔 정문 자리만 열어 두어
     * 거울에도 벽이 그대로 서 있었다). 정문은 현실에서도 열려 보이므로 거울이 알려 줄 것이 없다 —
     * 거울이 말하는 것은 **오직 여기 하나**여야 한다.
     */
    mp.partX(mirrorWall, z0, secZ - 0.75);
    mp.partX(mirrorWall, secZ + 0.75, z1, cz);
    mp.partZ(corrZ0, x0, nDiv, x0 + 2.1);
    mp.partZ(corrZ0, nDiv, mirrorWall, nDiv + 2.1);
    mp.partX(nDiv, z0, corrZ0);
    mp.partZ(corrZ1, x0, x0 + 0.6);
    mp.partZ(corrZ1, x0 + 2.6, sDiv);
    mp.partZ(corrZ1, sDiv, mirrorWall, sDiv + 1.9);
    mp.partX(sDiv, corrZ1, z1);
    // 마루·천장 — 거울 속에는 재도 그을음도 없다
    kM.box(w, 0.1, d, cx, floorY - 0.05, cz, mWoodOk);
    kM.box(w, 0.12, d, cx, floorY + 2.66, cz, mWoodOk);
    // ---- 가구: 현실과 **같은 좌표** (절차 버전 — GLB 도착 시 실물 클론으로 교체) ----
    const kMF = new PartsBuilder(physics, { ghost: true });
    // kMF = **GLB 짝이 있는 가구만** — 실물 클론 도착 시 통째로 숨긴다.
    // 계단·마주 거울 테는 GLB 가 없으니 kM(상시)에 남긴다 — 같이 숨기면 거울 속에서 사라진다
    kMF.box(1.9, 0.95, 0.6, counterX, floorY + 0.475, counterZ, mWoodOk);              // 접수대
    for (const sp2 of chabudaiSpots) kMF.cyl(0.42, 0.42, 0.32, sp2.x, floorY + 0.16, sp2.z, mDarkOk, 12);
    for (const sp2 of futonSpots) kMF.box(0.72, 0.4, 0.95, sp2.x, floorY + 0.2, sp2.z, mWallOk, sp2.yaw);
    kMF.box(1.1, 0.85, 0.5, tanX, floorY + 0.425, tanZ, mDarkOk);                      // 단스
    // 계단은 못질돼 있지 **않다** — 10년 전에는 올라갈 수 있었다 (판자 없음이 곧 이야기다)
    for (let i = 0; i < 3; i++) kM.box(1.1, 0.18, 0.3, stX, floorY + 0.09 + i * 0.18, stZ + 0.45 - i * 0.3, mWoodOk);
    /**
     * ---- 거울 속의 거울들 (실측: 「거울 속에는 현실의 거울도 안 보여」) ----
     * 거울이 있는 방을 거울로 보는데 그 거울들이 없으면 「같은 방」이 깨진다.
     * 현실의 세 거울(복도 벽거울 · 마주 거울 · 거울 방 큰 거울+화장대)을 같은 좌표에 세운다 —
     * 유리는 온전한(깨지지도 그을리지도 않은) 밝은 금속면이다.
     */
    const mGlassOk = new THREE.MeshStandardMaterial({ color: 0x39424c, roughness: 0.08, metalness: 0.9 });
    // ① 마주 거울 — 온전한 테 + 유리 (서쪽 = 객실2 를 본다). 현실과 같은 축: 폭은 Z, 두께는 X
    kM.box(0.07, 1.25, 0.9, mirrorWall - 0.06, floorY + 1.5, secZ, mDarkOk);
    const mgFace = new THREE.PlaneGeometry(0.72, 1.05);
    mgFace.rotateY(-Math.PI / 2);
    mgFace.translate(mirrorWall - 0.11, floorY + 1.5, secZ);
    kM.add(mgFace, mGlassOk);
    // ② 복도 벽거울 — 북벽, 남쪽을 본다
    kM.box(1.15, 1.5, 0.09, wmX, floorY + 1.45, wmZ, mDarkOk);
    const wmFace = new THREE.PlaneGeometry(0.95, 1.3);
    wmFace.translate(wmX, floorY + 1.45, wmZ + 0.06);
    kM.add(wmFace, mGlassOk);
    // ③ 거울 방 — 큰 거울 + 경대 + 화장대 (셸 `blockouts.ts` 와 같은 산식: mx = x1 − 0.24)
    const bmX = x1 - 0.24;
    kM.box(0.62, 0.76, 2.25, bmX - 0.34, floorY + 0.38, cz, mDarkOk);                  // 경대
    kM.box(0.82, 0.68, 0.82, bmX - 1.55, floorY + 0.34, cz + 1.85, mDarkOk);           // 화장대
    kM.box(0.08, 1.95, 2.6, bmX - 0.36, floorY + 1.35, cz, mWoodOk);                   // 큰 거울 테
    const bigFace = new THREE.PlaneGeometry(2.4, 1.75);
    bigFace.rotateY(-Math.PI / 2);
    bigFace.translate(bmX - 0.42, floorY + 1.12, cz);
    kM.add(bigFace, mGlassOk);
    const mirrorFurnProc = kMF.build('inn-mirror-furniture');
    this.mirrorScene.add(mirrorFurnProc);
    this.mirrorFurnProc = mirrorFurnProc;
    /**
     * ---- 조명: **현실과 같은 어둠** (실측: 「왜 거울 속엔 조명이 밝은 상태야?」) ----
     * 처음엔 「온전함 = 축제의 밤」으로 환하게 밝혔는데, 거울은 **같은 공간을 비추는 물건**이라
     * 조명까지 다르면 반사가 아니라 딴 세상이 된다. 어둠·채움광은 현실과 동일하게 복제하고,
     * 차이는 단 하나 — **등불에 불이 들어 있다**(작은 온기 점들). 미오의 초칭 빛도 거울 속에
     * 비친다(`mirrorChochin` — main 이 매 프레임 현실 초칭을 복사한다).
     */
    for (const [fx, fz] of [[x0 + 3.0, cz], [x0 + 7.0, cz], [x0 + 2.2, z1 - 1.6], [nDiv + 1.6, z0 + 1.6]] as [number, number][]) {
      const fill = new THREE.PointLight(0x33404f, 3.6, 9.5, 1.4);   // 현실과 **동일** — 자리·색·세기
      fill.position.set(fx, floorY + 2.2, fz);
      this.mirrorScene.add(fill);
    }
    // 등불 — 「온전하다」는 밝기가 아니라 **불이 켜져 있다**는 사실로 읽힌다. 빛은 좁고 약하게
    const mLantern = new THREE.MeshBasicMaterial({ color: 0xffc071 });
    for (const [lx, lz] of [[x0 + 2.4, cz], [x0 + 5.6, cz], [x0 + 8.0, cz]] as [number, number][]) {
      kM.cyl(0.16, 0.16, 0.3, lx, floorY + 2.15, lz, mLantern, 10);
      const gl = new THREE.PointLight(0xffb168, 1.3, 4.5, 1.8);
      gl.position.set(lx, floorY + 2.0, lz);
      this.mirrorScene.add(gl);
    }
    // 미오의 초칭이 거울에 비친 몫 — 값은 main 이 매 프레임 현실 초칭에서 복사한다
    this.mirrorChochin = new THREE.PointLight(0xffb063, 0, 15, 1.5);
    this.mirrorScene.add(this.mirrorChochin);
    /**
     * ---- 거울 속 축제 인파 (§5.3.5) ----
     * 얼굴을 만들지 않는다 — **등을 보이고 선 실루엣**이면 충분하고, 그래야 「돌아본다」가 사건이 된다.
     * 셋만 둔다: 로비 · 복도 · 거울 방. 각각 한 번씩 미오를 보고 이름을 부른다(금기 三 의 첫 무대).
     * 거울 세계에만 있으므로 와쿄를 들지 않으면 존재조차 모른다.
     */
    const mCrowd = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.95, metalness: 0 });
    for (const [px, pz, yaw] of [
      // ⚠️ **서로 3.5 m(시선 반경)보다 훨씬 멀리.** 처음엔 로비·복도가 4 m 였는데, 로비 인파 옆에 선
      // 플레이어가 복도 인파에도 3.06 m 라 두 이벤트가 연쇄로 터졌다(실측). 방을 하나씩 준다
      [x0 + 2.0, z1 - 2.4, 0.6],        // 로비 (서남)
      [x0 + 7.6, cz - 0.5, -1.9],       // 복도 동쪽
      [x1 - 0.8, cz + 2.8, 2.4],        // 거울 방 (남동 구석)
    ] as [number, number, number][]) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.3, 1.15, 10), mCrowd);
      body.position.y = 0.58;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mCrowd);
      head.position.y = 1.3;
      g.add(body, head);
      g.position.set(px, floorY, pz);
      g.rotation.y = yaw;                       // 등을 보이고 서 있다
      this.mirrorScene.add(g);
      this.crowd.push({ root: g, home: yaw, watching: false });
      this.crowdSpots.push(new THREE.Vector3(px, floorY + 1.3, pz));
    }

    this.mirrorScene.add(kM.build('inn-mirror-world'));
    this.mirrorScene.add(new THREE.HemisphereLight(0x9aa8b8, 0x1c1712, 0.12));   // 현실의 밤하늘 만큼만
    // 거울 속의 공기 — 현실과 같은 어두운 안개, 등불 온기만 아주 옅게 섞인다
    this.mirrorScene.fog = new THREE.FogExp2(0x16130e, 0.035);

    /**
     * ---------- 아주 약한 채움광 ----------
     * 「빛은 초칭뿐」이 설계였지만, 실제로 넣어 보니 **벽이 통째로 검게** 나와 거울과 대조가 불가능했다
     * (실측: 초칭 3.5 m 앞의 벽도 안 보였다 — 원인은 조명 부재였고, 지오메트리·재질은 멀쩡했다).
     * 석실(`wellShaft.ts`)에서 배운 것과 같다: **칠흑이면 퍼즐도 없다.**
     * 무너진 지붕으로 드는 달빛이라는 핑계가 이미 있으니, 차갑고 아주 약하게 깐다 —
     * 형태만 겨우 읽히고 여전히 초칭이 주광이다.
     */
    for (const [fx, fz] of [[x0 + 3.0, cz], [x0 + 7.0, cz], [x0 + 2.2, z1 - 1.6], [nDiv + 1.6, z0 + 1.6]] as [number, number][]) {
      // 1.35 로는 톤매핑을 거친 화면에서 여전히 검었다(실측). 손거울이 밝아 보이는 건
      // RT 렌더가 톤매핑을 건너뛰기 때문이지 거울이 밝아서가 아니다 — 현실 쪽을 올려야 대조가 된다
      const fill = new THREE.PointLight(0x33404f, 3.6, 9.5, 1.4);
      fill.position.set(fx, floorY + 2.2, fz);
      fill.castShadow = false;
      this.group.add(fill);
    }

    this.group.add(k.build('inn-interior', { spatialCellSize: 12 }));
    const furnProc = kFurn.build('inn-furniture', { spatialCellSize: 12 });
    this.group.add(furnProc);

    // ---------- 실물 교체 (폐교와 같은 패턴 — 전부 오면 절차 가구를 감춘다) ----------
    void Promise.all([
      Props.loadNormalized('/models/props/inn-counter.glb', 1.0, 0.45),
      Props.loadNormalized('/models/props/chabudai.glb', 0.34, 0.5),
      Props.loadNormalized('/models/props/futon.glb', 0.42, 0.55),
      Props.loadNormalized('/models/props/tansu.glb', 0.85, 0.5),
    ]).then(([counterM, chabuM, futonM, tansuM]) => {
      const clampXZ = (m: THREE.Group, max: number) => {
        const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
        m.scale.multiplyScalar(Math.min(1, max / Math.max(sz.x, sz.z)));
      };
      clampXZ(counterM, 2.1);
      counterM.position.set(counterX, floorY, counterZ);
      this.group.add(counterM);                 // 정면이 북쪽(입구)을 보게 — 축 확인 후 조정
      clampXZ(chabuM, 0.95);
      for (const sp of chabudaiSpots) {
        const m = chabuM.clone(true);
        m.position.set(sp.x, floorY, sp.z);
        this.group.add(m);
      }
      clampXZ(futonM, 1.1);
      for (const sp of futonSpots) {
        const m = futonM.clone(true);
        m.position.set(sp.x, floorY, sp.z);
        m.rotation.y = sp.yaw;
        this.group.add(m);
      }
      clampXZ(tansuM, 1.15);
      tansuM.position.set(tanX, floorY, tanZ);
      this.group.add(tansuM);
      furnProc.visible = false;
      /**
       * ---- 여관 전용 소품 (2차 확장으로 285 m² 가 되며 방이 비었다) ----
       * 넣는 기준은 **방마다 이야기 하나**다. 장식으로 채우면 넓은 방이 창고가 된다:
       *   · 게타바코 — 로비 입구. **신발이 아직 들어 있다**(숙박부의 「열넷, 퇴실란 공백」과 같은 말)
       *   · 병풍 — 객실3. 찢어진 종이 뒤가 보인다(가릴 것을 못 가리는 물건)
       *   · 히바치 — 객실2 좌탁 곁. 재가 식은 자리가 곧 「생활이 멈춘 시각」이다
       *   · 우산 — 복도 벽. 비 오는 날 두고 간 것이 10년째 그대로다
       * 실패해도 조용히 넘어간다 — 방은 이미 성립한다(`.catch` 없이 Promise.allSettled 로 개별 처리)
       */
      const put = (m: THREE.Group, x: number, z: number, yaw: number, maxXZ: number) => {
        clampXZ(m, maxXZ);
        m.position.set(x, floorY, z);
        m.rotation.y = yaw;
        this.group.add(m);
      };
      void Promise.allSettled([
        Props.loadNormalized('/models/props/getabako.glb', 1.35, 0.5),
        Props.loadNormalized('/models/props/byobu.glb', 1.5, 0.55),
        Props.loadNormalized('/models/props/hibachi.glb', 0.45, 0.5),
        Props.loadNormalized('/models/props/wagasa.glb', 1.05, 0.6),
      ]).then(([gb, by, hb, wg]) => {
        if (gb.status === 'fulfilled') put(gb.value, x0 + 0.9, corrZ1 + 1.2, Math.PI / 2, 1.1);
        if (by.status === 'fulfilled') put(by.value, mirrorWall - 1.2, z1 - 1.2, -0.7, 1.9);
        if (hb.status === 'fulfilled') {
          const c2 = chabudaiSpots[1];
          if (c2) put(hb.value, c2.x + 1.25, c2.z + 0.35, 0.4, 0.7);
        }
        if (wg.status === 'fulfilled') put(wg.value, x0 + 5.2, corrZ0 + 0.22, 0.15, 0.4);
      });
      /**
       * **같은 실물을 거울 속에도 놓는다** — 절차 복제로는 「같은 방」이 안 읽힌다(실측:
       * 소품이 안 보인다는 지적). 클론이라 지오메트리는 공유되고 배치 행렬만 든다.
       */
      const mirrorPut = (src: THREE.Object3D, x: number, z: number, yaw = 0) => {
        const m = src.clone(true);
        m.position.set(x, floorY, z);
        m.rotation.y = yaw;
        this.mirrorScene.add(m);
      };
      mirrorPut(counterM, counterX, counterZ);
      for (const sp of chabudaiSpots) mirrorPut(chabuM, sp.x, sp.z);
      for (const sp of futonSpots) mirrorPut(futonM, sp.x, sp.z, sp.yaw);
      mirrorPut(tansuM, tanX, tanZ);
      if (this.mirrorFurnProc) this.mirrorFurnProc.visible = false;
    }).catch((e) => console.warn('[inn] 가구 모델 로드 실패 — 절차 가구 유지:', e));

    scene.add(this.group);
  }
}

/** 결정적 난수 — 잔해가 매 실행 같은 자리에 있어야 「퇴로 암기」가 성립한다 */
function seeded(seed: number) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/** 폐여관 기록물 — 숙박부·계단 조사 대사 (§4.2 ACT 13: 명부 +14) */
export const INN_RECORDS = {
  register: [
    { text: L('접수대의 숙박부가 펼쳐진 채 그을렸다.', '帳場の宿帳が開いたまま焦げている。') },
    { text: L('마지막 장 날짜는 10년 전 피안제 전날이다. 이름이 열넷.', '最後の頁の日付は十年前の彼岸祭の前日。名前が十四。') },
    { text: L('열네 명 모두 퇴실란이 비어 있다.', '十四人とも、退室欄が空白のままだ。') },
  ],
  stairs: [
    { text: L('2층으로 오르는 계단이 판자로 못질돼 있다.', '二階へ上がる階段が板で打ちつけられている。') },
    { text: L('못은 **안쪽에서** 박혔다. 위층에 있던 누군가가 스스로 막았다.', '釘は**内側から**打たれている。上にいた誰かが自分で塞いだ。') },
    { text: L('판자 틈으로 탄내가 아직 내려온다.', '板の隙間から、焦げた匂いがまだ降りてくる。') },
  ],
};
