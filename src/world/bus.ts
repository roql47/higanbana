import * as THREE from 'three';
import { Props } from '@/world/props';
import { normalize } from './village/landmarks';
import { textCanvas } from './higasato/kit';
import { BusOutside } from './busOutside';

/**
 * 낡은 시골버스 내부 — ACT 2 의 무대.
 *
 * 스토리보드 ACT 2 는 통째로 **버스 안**에서 시작한다(사진 · 기사 · 백미러). 지금까지 그게
 * 전부 빠져 있었고 「종점이야.」부터 시작했다. 장면 목적 셋 중 둘(현재의 미오 소개 ·
 * 훼손된 사진)이 이 안에서 일어난다.
 *
 * ## 왜 버스가 움직이지 않는가
 * 히가사토 지형은 200 m 정사각이고 참배로는 z 94 에서 시작한다 — **버스가 달릴 길이 없다.**
 * 그래서 영화가 오래 써 온 방법을 쓴다: **버스는 서 있고 창밖이 흐른다.**
 * 지형에서 멀리 떨어진 곳(기본 y +300)에 자립 세트로 세우므로 지형·콜라이더·요괴와 완전히 무관하고,
 * 카메라가 안에 있는 동안 바깥은 스크롤 배경이 채운다.
 *
 * ## 구성
 *  - 차체: 바닥·천장·앞뒤 벽 + 좌우 벽을 **띠로 쪼개** 창 네 칸을 비운다
 *    (박스 하나에서 구멍을 도려내려면 CSG 가 필요한데 이 장면에는 과하다)
 *  - 좌석 4열 · 손잡이 · 운전석(핸들·어깨·뒤통수) · **백미러**(기사의 눈이 여기 있다)
 *    → 좌석·핸들·손잡이는 프리미티브로 세워 두고 `load()` 가 **Tripo GLB 로 갈아끼운다**
 *      (로드 실패 시 프리미티브가 그대로 남는다 — 장면이 비는 것보다 낫다)
 *  - 창밖: 삼나무 실루엣 두 줄(가깝고 빠른 줄 + 멀고 느린 줄) — 시차가 있어야 달리는 것으로 보인다
 *  - 흔들림: 저주파 롤·피치(노면) + 고주파 미세 진동(엔진). 낡은 버스는 이 둘이 다 있다
 */

const HALF_W = 1.15;           // 차체 반너비
const LEN = 7.4;               // 차체 길이 (뒤 −z … 앞 +z)
const CEIL = 2.15;
const WIN = { w: 1.05, h: 0.86, gap: 0.28, y: 1.28, first: 1.2 };
const WIN_LO = WIN.y - WIN.h / 2;   // 창 아래
const WIN_HI = WIN.y + WIN.h / 2;   // 창 위
/** 기사 유닛의 정면 보정 — 모델을 갈면 이 값부터 다시 확인한다 */
const DRIVER_YAW = Math.PI / 2;

export interface BusOpts {
  /** 세트를 놓을 자리. 지형에서 멀리 (기본 y +300) */
  origin?: THREE.Vector3;
}

export class Bus {
  readonly group = new THREE.Group();
  /** 흔들림이 적용되는 안쪽 — 카메라는 이 그룹의 좌표를 따라간다 */
  readonly cabin = new THREE.Group();
  /** 미오가 앉은 창가 자리 (로컬). 월드는 `seatWorld()` */
  readonly seat = new THREE.Vector3();
  /** 백미러 중심 (로컬) */
  readonly mirror = new THREE.Vector3();
  private speed = 0;
  private targetSpeed = 0;
  private t = 0;
  /** 창밖 — 실제 지오메트리가 흘러간다 (`busOutside.ts`) */
  private outside: BusOutside;
  private eyes: THREE.Mesh;
  private eyeMat: THREE.MeshBasicMaterial;
  private blinkT = 0;
  private staring = false;
  /** 하차문 — 판 + 유리칸 한 벌이라 Mesh 가 아니라 Group 이다 */
  private door: THREE.Group;
  private doorOpen = 0;
  private doorTarget = 0;
  /** 좌석 그룹들 — load() 가 안을 GLB 로 바꾼다. [0]번이 운전석 */
  private seats: THREE.Group[] = [];
  /** 손잡이 피벗(봉에 걸린 지점). 흔들림은 여기에 건다 — 에셋이 뭐든 그네처럼 돈다 */
  private straps: { g: THREE.Group; phase: number }[] = [];
  private wheelPrim: THREE.Mesh;
  private driverPrim: THREE.Mesh[] = [];
  private wheelGlb: THREE.Object3D | null = null;
  private doorZ0 = 0;
  /**
   * 실내 설비 — 요금함·정리권 발권기·운임 표시기·대시보드.
   * 시골버스에서 **기사 주변이 비어 있으면** 그건 버스가 아니라 좌석이 놓인 방이다.
   * 자리표시자를 세워 두고 `load()` 가 GLB 로 갈아끼운다 (좌석·손잡이와 같은 방식).
   */
  private fixtures: { g: THREE.Group; url: string; h: number }[] = [];

  constructor(scene: THREE.Scene, opts: BusOpts = {}) {
    this.group.position.copy(opts.origin ?? new THREE.Vector3(0, 300, 0));
    this.group.add(this.cabin);
    this.group.visible = false;
    scene.add(this.group);

    const mat = (c: number, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
    const mBody = mat(0x9aa093, 0.92);       // 낡은 크림/연두 도장 (기둥·앞뒤벽 등 좁은 조각용)
    // 바닥: 고무 리브 + 통로 가운데가 닳아 밝다. 바닥은 박스 하나라 UV 0..1 이 정확히 맞는다
    const mFloor = new THREE.MeshStandardMaterial({
      map: textCanvas(512, 1024, (c2) => {
        c2.fillStyle = '#2b2926'; c2.fillRect(0, 0, 512, 1024);
        // 세로(=차체 길이 방향) 고무 리브
        for (let x = 8; x < 512; x += 18) {
          c2.fillStyle = 'rgba(255,255,255,0.045)'; c2.fillRect(x, 0, 3, 1024);
          c2.fillStyle = 'rgba(0,0,0,0.28)'; c2.fillRect(x + 3, 0, 2, 1024);
        }
        // 통로 가운데 — 발자국에 닳았다
        const wear = c2.createLinearGradient(140, 0, 372, 0);
        wear.addColorStop(0, 'rgba(120,112,98,0)');
        wear.addColorStop(0.5, 'rgba(120,112,98,0.30)');
        wear.addColorStop(1, 'rgba(120,112,98,0)');
        c2.fillStyle = wear; c2.fillRect(140, 0, 232, 1024);
        // 흠집
        c2.strokeStyle = 'rgba(0,0,0,0.20)'; c2.lineWidth = 1;
        for (let i = 0; i < 40; i++) {
          const x = Math.random() * 512, y = Math.random() * 1024;
          c2.beginPath(); c2.moveTo(x, y); c2.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 24); c2.stroke();
        }
      }),
      roughness: 0.93, metalness: 0,
    });
    // 벽 패널: 이음매 + 리벳 (가로로 타일링). 조각 길이에 맞춰 repeat 를 걸어야 이음매 간격이 같다
    const panelTex = textCanvas(256, 256, (c2) => {
      const g2 = c2.createLinearGradient(0, 0, 0, 256);
      g2.addColorStop(0, '#a2a89a'); g2.addColorStop(0.75, '#99a092'); g2.addColorStop(1, '#8a9084');
      c2.fillStyle = g2; c2.fillRect(0, 0, 256, 256);
      c2.fillStyle = 'rgba(0,0,0,0.22)'; c2.fillRect(0, 0, 3, 256);          // 이음매
      c2.fillStyle = 'rgba(255,255,255,0.14)'; c2.fillRect(3, 0, 2, 256);
      c2.fillStyle = 'rgba(40,42,38,0.5)';                                    // 리벳
      for (const y of [26, 128, 230]) { c2.beginPath(); c2.arc(14, y, 3.2, 0, Math.PI * 2); c2.fill(); }
      c2.fillStyle = 'rgba(0,0,0,0.05)';                                      // 얼룩
      for (let i = 0; i < 14; i++) c2.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 30, 1 + Math.random() * 3);
    });
    panelTex.wrapS = THREE.RepeatWrapping;
    /** 벽 조각(길이 len)에 이음매 간격 ~0.62 m 로 패널 텍스처를 건다 */
    const panelMat = (len: number) => {
      const t = panelTex.clone();
      t.needsUpdate = true;
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, Math.round(len / 0.62)), 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, metalness: 0 });
    };
    const mCeil = mat(0xcac4b6, 0.9);   // 누렇게 뜬 크림색 천장
    const mSeat = mat(0x2f4a52, 0.85);       // 시골버스 특유의 청록 시트
    const mSeatBack = mat(0x263d44, 0.85);
    const mMetal = mat(0x6d7278, 0.4);
    const mDark = mat(0x1b1d1f, 0.9);
    const T = 0.06;                          // 벽 두께

    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      this.cabin.add(mesh);
      return mesh;
    };

    // --- 바닥·천장·앞뒤 ---
    box(HALF_W * 2, T, LEN, 0, -T / 2, 0, mFloor);
    box(HALF_W * 2, T, LEN, 0, CEIL + T / 2, 0, mCeil);
    // 천장 형광등 두 줄 — 시골버스 실내의 문법. 라이트는 안 켠다(대낮), 발광 재질만
    {
      const mLamp = new THREE.MeshStandardMaterial({ color: 0xf2ecd8, emissive: 0xfff3d8, emissiveIntensity: 0.85, roughness: 0.4 });
      for (const sideL of [-1, 1]) box(0.10, 0.03, LEN - 2.0, sideL * 0.34, CEIL - 0.015, -0.2, mLamp);
    }
    box(HALF_W * 2, CEIL, T, 0, CEIL / 2, -LEN / 2, mBody);            // 뒷벽

    // --- 좌우 벽 ---
    // 일본 버스는 **우측 핸들**이다: 운전석 오른쪽(+x), 하차문은 앞왼쪽(−x, 인도 쪽).
    // 왼쪽 벽은 창 3 + **문 개구부**(4번째 창 자리를 바닥까지 튼다), 오른쪽 벽은 창 4.
    // 처음엔 양쪽 다 창 4 로 두고 문 판만 벽 위에 붙였는데 — 문이 열려도 벽이라 못 내린다(그랬다)
    const winAt = (i: number): [number, number] => {
      const z0 = -LEN / 2 + WIN.first + i * (WIN.w + WIN.gap);
      return [z0, z0 + WIN.w];
    };
    const doorZ = winAt(3);   // 문 개구부 = 4번째 창 자리, 바닥 → WIN_HI
    for (const side of [-1, 1]) {
      const x = side * (HALF_W - T / 2);
      const wins: [number, number][] = [winAt(0), winAt(1), winAt(2)];
      if (side > 0) wins.push(winAt(3));
      // 창높이 띠의 개구부(창들 + 왼쪽이면 문)와 그 사이 기둥
      const openings = side < 0 ? [...wins, doorZ] : wins;
      let cursor = -LEN / 2;
      for (const [a, b] of openings) { if (a > cursor) box(T, WIN.h, a - cursor, x, WIN.y, (cursor + a) / 2, mBody); cursor = b; }
      if (cursor < LEN / 2) box(T, WIN.h, LEN / 2 - cursor, x, WIN.y, (LEN / 2 + cursor) / 2, mBody);
      // 허리 아래 띠 — 왼쪽은 문 자리를 비운다. 띠마다 **패널 텍스처 + 몰딩 + 킥플레이트**
      const lowerSegs: [number, number][] = side < 0
        ? [[-LEN / 2, doorZ[0]], [doorZ[1], LEN / 2]]
        : [[-LEN / 2, LEN / 2]];
      for (const [a, b] of lowerSegs) {
        const len = b - a, mid = (a + b) / 2;
        box(T, WIN_LO, len, x, WIN_LO / 2, mid, panelMat(len));
        // 크롬 몰딩 — 창 바로 아래를 한 줄로 지나간다
        box(T * 1.5, 0.028, len, x, WIN_LO - 0.09, mid, mMetal);
        // 킥플레이트 — 바닥과 만나는 자리의 어두운 스커트
        box(T * 1.6, 0.09, len, side * (HALF_W - T / 2 - 0.004), 0.045, mid, mDark);
      }
      box(T, CEIL - WIN_HI, LEN, x, (CEIL + WIN_HI) / 2, 0, panelMat(LEN));    // 창 위
      // 창틀 — 개구부 **사면**을 두른다 (가로 위·아래 + 세로 양옆)
      for (const [a, b] of wins) {
        box(T * 1.4, 0.035, b - a, x, WIN_LO, (a + b) / 2, mMetal);
        box(T * 1.4, 0.035, b - a, x, WIN_HI, (a + b) / 2, mMetal);
        for (const zz of [a, b]) box(T * 1.4, WIN.h + 0.07, 0.035, x, WIN.y, zz, mMetal);
      }
    }

    // --- 앞 벽 + 앞유리 ---
    // 백미러를 볼 때 시야에 들어오므로 앞도 비어 있으면 안 된다. 창을 하나 내고 그 너머에
    // **멀리 수렴하는 길**을 세운다 (옆 창처럼 흐를 필요는 없다 — 앞은 원래 거의 안 움직인다)
    box(HALF_W * 2, 0.62, T, 0, 0.31, LEN / 2, mBody);
    box(HALF_W * 2, CEIL - 1.62, T, 0, (CEIL + 1.62) / 2, LEN / 2, mBody);
    box(0.34, 1.0, T, HALF_W - 0.17, 1.12, LEN / 2, mBody);

    // --- 좌석 4열 --- 자리마다 그룹 하나. 그룹 원점 = 바닥의 좌석 중심이라
    //     load() 가 안을 GLB 로 바꿔도 배치 좌표는 여기 한 곳에만 있다
    const mkSeat = (x: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.5), mSeat);
      cushion.position.y = 0.46;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.62, 0.1), mSeatBack);
      back.position.set(0, 0.77, -0.24);
      back.rotation.x = -0.08;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), mMetal);
      leg.position.y = 0.2;
      g.add(cushion, back, leg);
      this.cabin.add(g);
      this.seats.push(g);
      return g;
    };
    for (let i = 0; i < 4; i++) {
      const z = -LEN / 2 + 1.35 + i * 1.33;
      for (const side of [-1, 1]) mkSeat(side * 0.72, z);
    }
    // 미오의 자리: 왼쪽 창가, 뒤에서 두 번째. 눈높이는 앉은 사람(바닥에서 1.18 m)
    this.seat.set(-0.7, 1.18, -LEN / 2 + 1.35 + 1.33);

    // --- 손잡이 (천장 봉 + 가죽끈) ---
    for (const side of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, LEN - 1.4, 8), mMetal);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(side * 0.86, CEIL - 0.22, 0);
      this.cabin.add(rod);
      for (let i = 0; i < 6; i++) {
        const z = -LEN / 2 + 1.1 + i * 1.0;
        // 피벗 = 봉에 걸린 지점. 손잡이는 여기 매달려 **차체 롤을 지연시켜 따라 흔들린다**
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.86, CEIL - 0.24, z);
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.03), mDark);
        strap.position.y = -0.10;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 12), mDark);
        ring.position.y = -0.25;
        pivot.add(strap, ring);
        this.cabin.add(pivot);
        this.straps.push({ g: pivot, phase: Math.random() * 6.28 });
      }
    }

    // --- 운전석 (오른쪽 — 일본은 우측 핸들) ---
    // 격벽은 **운전석 쪽 절반만**. 통로(왼쪽)는 하차문까지 뚫려 있어야 내릴 수 있다.
    // 자리는 기사 유닛(대략 z 2.05~3.25) **뒤** — 앞으로 두면 의자와 기사 사이를 가른다(그랬다)
    box(HALF_W, 1.06, 0.06, HALF_W / 2, 0.53, LEN / 2 - 1.85, panelMat(HALF_W));
    // 격벽 위 크롬 난간 — 승객이 잡는 봉
    {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, HALF_W, 8), mMetal);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(HALF_W / 2, 1.12, LEN / 2 - 1.85);
      this.cabin.add(rail);
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 20), mDark);
    wheel.position.set(0.62, 1.02, LEN / 2 - 0.75);
    wheel.rotation.set(-1.15, 0, 0);
    this.cabin.add(wheel);
    this.wheelPrim = wheel;
    // 운전석도 승객 좌석과 같은 그룹으로 — load() 가 같은 GLB 를 꽂는다
    mkSeat(0.62, LEN / 2 - 1.3);
    // 기사 임시 실루엣 — load() 가 Tripo 모델로 바꾼다
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.24), mDark);
    shoulders.position.set(0.62, 1.06, LEN / 2 - 1.18);
    const headBack = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mDark);
    headBack.position.set(0.62, 1.38, LEN / 2 - 1.2);
    this.cabin.add(shoulders, headBack);
    this.driverPrim = [shoulders, headBack];

    // --- 실내 설비 (자리표시자 → load() 가 GLB 로 교체) ---
    const mkFixture = (url: string, h: number, x: number, y: number, z: number, yaw: number, prim: THREE.Mesh[]) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = yaw;
      for (const m of prim) g.add(m);
      this.cabin.add(g);
      this.fixtures.push({ g, url, h });
    };
    const mBeige = mat(0xb9b2a0, 0.86);
    // 요금함 — 하차문 옆, 기사의 왼쪽. 내릴 때 반드시 지나치는 자리다
    mkFixture('/models/props/bus-farebox.glb', 0.95, -0.12, 0, LEN / 2 - 1.5, 0, [
      (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.3), mBeige); m.position.y = 0.62; return m; })(),
      (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.24), mDark); m.position.y = 0.16; return m; })(),
    ]);
    // 정리권 발권기 — 승차구 안쪽 기둥에. 시골버스는 여기서 번호표를 뽑는다
    mkFixture('/models/props/bus-ticket.glb', 1.15, -0.8, 0, LEN / 2 - 2.65, Math.PI / 2, [
      (() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.05, 8), mMetal); m.position.y = 0.52; return m; })(),
      (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.14), mBeige); m.position.y = 1.0; return m; })(),
    ]);
    // 운임 표시기 — 앞유리 위, 승객을 향한다. 정류장마다 숫자가 바뀌는 그 판
    mkFixture('/models/props/bus-faredisplay.glb', 0.3, -0.12, CEIL - 0.3, LEN / 2 - 0.22, Math.PI, [
      (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 0.07), mDark); return m; })(),
    ]);
    // 대시보드 — 기사 앞. 핸들만 있고 계기판이 없으면 운전석이 아니다
    mkFixture('/models/props/bus-dash.glb', 0.5, 0.62, 0.62, LEN / 2 - 0.3, 0, [
      (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.3), mBeige); return m; })(),
    ]);

    // --- 백미러: 기사의 **눈만** 있다 ---
    // 「기사는 백미러로 미오를 오래 바라보다 더 묻지 않는다」 — 이 ACT 의 서늘한 한 줄이
    // 얼굴이 아니라 **거울 속 눈 두 개**로 성립한다. 얼굴을 만들면 오히려 약해진다
    // 앞유리 바로 앞이 아니라 **조금 뒤**에 둔다 — 좌석에서 볼 때 거울이 너무 작으면
    // 그 안의 눈이 읽히지 않는다. 이 장면의 핵심이 거울 안에 있으므로 크기가 곧 연출이다
    this.mirror.set(0.26, CEIL - 0.42, LEN / 2 - 1.05);
    // 거울 = 검은 판이 아니다. 테두리(플라스틱) + **비치는 면**(금속성 유리) + 천장에 매단 팔.
    // 검은 박스 하나로 두면 앞유리 위에 빈 간판이 붙어 있는 것으로 보인다(실제로 그랬다)
    const mirrorBody = box(0.54, 0.20, 0.035, this.mirror.x, this.mirror.y, this.mirror.z, mDark);
    mirrorBody.rotation.y = 0.2;
    {
      const glassM = new THREE.MeshStandardMaterial({ color: 0x39424a, roughness: 0.10, metalness: 0.9 });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.15), glassM);
      face.position.set(this.mirror.x, this.mirror.y, this.mirror.z - 0.02);
      face.rotation.y = Math.PI + 0.2;
      this.cabin.add(face);
      // 천장에서 내려온 팔 — 거울이 공중에 떠 있지 않게
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), mMetal);
      arm.position.set(this.mirror.x, this.mirror.y + 0.13, this.mirror.z + 0.03);
      arm.rotation.x = 0.35;
      this.cabin.add(arm);
    }
    this.eyeMat = new THREE.MeshBasicMaterial({
      map: textCanvas(256, 96, (ctx) => {
        ctx.fillStyle = '#0a0b0d'; ctx.fillRect(0, 0, 256, 96);
        for (const cx of [82, 174]) {
          ctx.fillStyle = '#cfc4ae';
          ctx.beginPath(); ctx.ellipse(cx, 48, 27, 14, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3a2c1e';
          ctx.beginPath(); ctx.arc(cx, 48, 11, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#0b0906';
          ctx.beginPath(); ctx.arc(cx, 48, 5, 0, Math.PI * 2); ctx.fill();
          // 눈꺼풀 그림자 — 이게 없으면 눈알 두 개가 떠 있는 것으로 보인다
          ctx.fillStyle = 'rgba(10,9,7,0.55)';
          ctx.beginPath(); ctx.ellipse(cx, 34, 27, 9, 0, 0, Math.PI * 2); ctx.fill();
        }
      }),
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    this.eyes = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.135), this.eyeMat);
    this.eyes.position.set(this.mirror.x, this.mirror.y, this.mirror.z - 0.02);
    this.eyes.rotation.y = Math.PI + 0.2;
    this.eyes.renderOrder = 20;
    this.cabin.add(this.eyes);

    // --- 하차문(앞 왼쪽) — 종점에서 뒤로 미끄러져 열린다 ---
    // 판 하나가 아니다: 버스 문은 **아래가 판, 위가 유리**다. 통판으로 두면 문이 아니라 벽이고,
    // 「문이 열린다」가 벽 한 조각이 옆으로 사라지는 것으로 보인다
    this.doorZ0 = (doorZ[0] + doorZ[1]) / 2;
    {
      const dw = doorZ[1] - doorZ[0];
      const g = new THREE.Group();
      g.position.z = this.doorZ0;
      const skin = mat(0x8a9086, 0.9);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(T, WIN_LO, dw), skin);
      lower.position.set(-HALF_W + T / 2, WIN_LO / 2, 0);
      g.add(lower);
      // 유리칸 테두리
      const fh = WIN_HI - WIN_LO;
      for (const [y, h] of [[WIN_HI - 0.03, 0.06], [WIN_LO + 0.03, 0.06]] as [number, number][])
        { const m = new THREE.Mesh(new THREE.BoxGeometry(T * 1.2, h, dw), skin); m.position.set(-HALF_W + T / 2, y, 0); g.add(m); }
      for (const zz of [-dw / 2 + 0.03, dw / 2 - 0.03])
        { const m = new THREE.Mesh(new THREE.BoxGeometry(T * 1.2, fh, 0.06), skin); m.position.set(-HALF_W + T / 2, WIN_LO + fh / 2, zz); g.add(m); }
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(dw - 0.1, fh - 0.1),
        new THREE.MeshStandardMaterial({ color: 0xc2d0d6, roughness: 0.22, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      pane.position.set(-HALF_W + T * 0.5, WIN_LO + fh / 2, 0);
      pane.rotation.y = Math.PI / 2;
      pane.renderOrder = 3;
      g.add(pane);
      this.cabin.add(g);
      this.door = g;
    }

    // --- 창유리 --- 지금까지 창은 **뚫린 구멍**이었다. 유리가 있어야 먼지·반사가 생기고,
    // 무엇보다 「창밖」과 「창」이 분리된다. 아주 옅게 — 진하면 바깥이 안 보인다
    const glass = new THREE.MeshStandardMaterial({
      color: 0xc2d0d6, roughness: 0.22, metalness: 0,
      transparent: true, opacity: 0.13, depthWrite: false,
    });
    for (const side of [-1, 1]) {
      const x = side * (HALF_W - T * 0.5);
      // 왼쪽 네 번째 칸은 하차문이라 유리를 끼우지 않는다 (문짝이 그 자리를 덮는다)
      const panes: [number, number][] = side < 0 ? [winAt(0), winAt(1), winAt(2)] : [winAt(0), winAt(1), winAt(2), winAt(3)];
      for (const [a2, b2] of panes) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(b2 - a2 - 0.06, WIN.h - 0.05), glass);
        pane.position.set(x, WIN.y, (a2 + b2) / 2);
        pane.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        pane.renderOrder = 3;
        this.cabin.add(pane);
      }
    }

    // --- 하차 벨 (降車ボタン) --- 창 기둥마다 하나씩. 시골버스에서 이게 없으면
    // 승객이 내리겠다는 뜻을 전할 방법이 없다. 나중에 **저절로 울리는 날**을 위해서도 있어야 한다
    {
      const plate = mat(0xd8d2c4, 0.9);
      const btn = new THREE.MeshStandardMaterial({ color: 0xc23a2c, roughness: 0.5, emissive: new THREE.Color(0x3a0a06), emissiveIntensity: 0.4 });
      for (const side of [-1, 1]) {
        const x = side * (HALF_W - T * 0.9);
        for (let i = 0; i < 4; i++) {
          const z = -LEN / 2 + 0.9 + i * 1.55;
          const pl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.1), plate);
          pl.position.set(x, WIN_LO - 0.14, z);
          const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.016, 12), btn);
          bt.rotation.z = Math.PI / 2;
          bt.position.set(x - side * 0.016, WIN_LO - 0.14, z);
          this.cabin.add(pl, bt);
        }
      }
    }

    // --- 커튼 --- 창 위에 걷어 올려 묶어 둔 천. 오후 햇빛이 드는 쪽 창에만
    {
      const cloth = mat(0x8a8272, 0.98);
      for (const side of [-1, 1]) {
        const x = side * (HALF_W - T * 1.3);
        for (const [a2, b2] of (side < 0 ? [winAt(0), winAt(1), winAt(2)] : [winAt(0), winAt(1), winAt(2), winAt(3)])) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.17, (b2 - a2) * 0.34), cloth);
          c.position.set(x, WIN_HI - 0.09, a2 + (b2 - a2) * 0.22);
          this.cabin.add(c);
        }
      }
    }

    // --- 창밖: 실제 풍경이 흘러간다 ---
    // 캔버스 실루엣을 UV 로 흘리던 것을 걷어냈다. 창가에 앉아 35 초를 보는 장면에서는
    // 두께 없는 톱니가 **벽지**로 읽힌다 (`busOutside.ts`)
    this.outside = new BusOutside(this.cabin);
  }

  /** 세트를 켠다 */
  show(v: boolean) { this.group.visible = v; }

  /**
   * Tripo GLB 로 소품을 갈아끼운다 — 좌석(운전석 포함)·손잡이·핸들.
   * 프리미티브를 먼저 세워 두고 도착한 것만 바꾸므로, 실패해도 장면이 비지 않는다.
   */
  async load() {
    const loader = Props.loader();
    void this.outside.load();   // 창밖은 따로 — 실내 소품 로드를 기다리게 하지 않는다
    try {
      const [seatG, wheelG, strapG] = await Promise.all([
        loader.loadAsync('/models/props/bus-seat.glb'),
        loader.loadAsync('/models/props/bus-wheel.glb'),
        loader.loadAsync('/models/props/bus-strap.glb'),
      ]);
      // 좌석: 등받이 위 손잡이 바까지 0.95 m. 정면(Tripo +X → +Z)이 차량 앞을 본다.
      // 생성된 벤치는 2~3인용으로 길다 — **자리 폭에 맞게 눕히고 줄인다**:
      // 긴 수평축을 차체 가로(X)로 돌리고, X 를 0.82 m 로, 깊이는 0.6 m 상한으로 맞춘다
      const seatT = fitFootprint(normalize(seatG.scene, 0.95), 0.82, 0.6);
      // 생성된 벤치의 "정면"이 등받이 쪽이었다 — 뒤집어야 등받이가 차량 뒤(−z)를 본다(사용자 리포트)
      seatT.rotation.y = Math.PI;
      for (const g of this.seats) { g.clear(); g.add(seatT.clone(true)); }
      // 핸들+컬럼: 바닥에서 1.05 m. 토러스 핸들은 치운다
      const wheelT = normalize(wheelG.scene, 1.05);
      this.wheelPrim.visible = false;
      this.wheelGlb = wheelT.clone(true);
      this.wheelGlb.position.set(0.62, 0, LEN / 2 - 0.85);   // 우측 핸들
      this.cabin.add(this.wheelGlb);
      // 손잡이: 34 cm. normalize 원점은 **바닥**이라 피벗(봉)에서 그만큼 내려 단다
      const strapT = normalize(strapG.scene, 0.34);
      for (const st of this.straps) {
        st.g.clear();
        const c = strapT.clone(true);
        c.position.y = -0.34;
        st.g.add(c);
      }
    } catch (e) {
      console.warn('[bus] GLB 로드 실패 → 프리미티브 유지', e);
    }
    // 실내 설비 — 하나씩 따로. 하나가 없다고 나머지를 프리미티브로 두지 않는다
    await Promise.allSettled(this.fixtures.map(async (f) => {
      const g = await loader.loadAsync(f.url);
      const o = normalize(g.scene, f.h);
      f.g.clear();
      f.g.add(o);
    }));

    // 기사 — 따로 시도한다. 좌석·손잡이가 이미 왔는데 기사 하나 때문에 다 프리미티브면 아깝다.
    // "no chair, no steering wheel" 지시를 Tripo 가 무시하고 **시트+핸들까지 한 유닛**으로
    // 만들어 줬는데, 오히려 그게 낫다 — 유닛을 통째로 놓고 따로 꽂았던 운전석 의자·핸들을 숨긴다
    try {
      const driverG = await Props.loader().loadAsync('/models/props/bus-driver.glb');
      const driver = normalize(driverG.scene, 1.42);    // 모자 끝까지 (시트 포함 유닛)
      driver.position.set(0.62, 0, LEN / 2 - 1.05);
      // 유닛의 정면이 90° 틀어져 나온다(기사가 차창 왼쪽을 보고 앉아 있었다 — 사용자 리포트).
      // normalize 는 Tripo +X 를 +Z 로 돌리는데, 이 유닛은 +X 가 기사의 **옆모습**이었다
      driver.rotation.y = DRIVER_YAW;
      this.cabin.add(driver);
      for (const m of this.driverPrim) m.visible = false;
      this.wheelPrim.visible = false;
      if (this.wheelGlb) this.wheelGlb.visible = false;
      const dseat = this.seats[this.seats.length - 1];  // 운전석 그룹 — 유닛에 시트가 있다
      if (dseat) dseat.visible = false;
    } catch (e) {
      console.warn('[bus] 기사 GLB 없음 → 실루엣 유지', e);
    }
  }

  /** 달리는 속도 (0 = 정차). 급정거가 아니라 **감속**이라 목표만 준다 */
  drive(v: number) { this.targetSpeed = v; }
  get moving() { return this.speed > 0.05; }

  /** 문을 연다/닫는다 */
  setDoor(open: boolean) { this.doorTarget = open ? 1 : 0; }

  /**
   * 백미러 속 눈. `stare` 면 **깜빡이지 않는다** —
   * 「기사는 백미러로 미오를 오래 바라보다」가 여기서 서늘해진다
   */
  setEyes(v: number, stare = false) {
    this.eyeMat.opacity = THREE.MathUtils.clamp(v, 0, 1);
    this.staring = stare;
  }

  /** 미오의 자리(월드) — 흔들림이 반영된다 */
  seatWorld(out: THREE.Vector3) {
    this.cabin.updateWorldMatrix(true, false);
    return out.copy(this.seat).applyMatrix4(this.cabin.matrixWorld);
  }

  update(dt: number) {
    if (!this.group.visible) return;
    this.t += dt;
    this.speed += (this.targetSpeed - this.speed) * (1 - Math.exp(-dt * 1.5));

    // 창밖 — 세상이 뒤로 흘러간다
    this.outside.update(dt, this.speed);

    // 흔들림 — 노면(저주파)과 엔진(고주파)은 다른 진동이다. 정차하면 엔진만 남는다
    const road = Math.min(1, this.speed / 9);
    const idle = 0.3;
    const roll = (Math.sin(this.t * 1.7) * 0.011 + Math.sin(this.t * 3.1 + 1.2) * 0.006) * road
      + Math.sin(this.t * 27) * 0.0010 * (idle + road);
    const pitch = Math.sin(this.t * 2.3 + 0.7) * 0.008 * road + Math.sin(this.t * 31 + 2) * 0.0009 * (idle + road);
    const bump = Math.sin(this.t * 5.9) * Math.sin(this.t * 2.2) * 0.012 * road;
    this.cabin.rotation.set(pitch, 0, roll);
    this.cabin.position.set(0, bump, 0);

    // 손잡이 — 매달린 것은 차체와 **반대로** 기운다(관성). 위상을 흩어 제각각 흔들리게
    for (const st of this.straps) {
      st.g.rotation.z = -roll * 6 + Math.sin(this.t * 1.9 + st.phase) * 0.05 * (0.3 + road);
      st.g.rotation.x = -pitch * 5 + Math.sin(this.t * 2.6 + st.phase) * 0.04 * (0.3 + road);
    }

    // 문
    this.doorOpen += (this.doorTarget - this.doorOpen) * (1 - Math.exp(-dt * 3.4));
    this.door.position.z = this.doorZ0 - this.doorOpen * (WIN.w + 0.1);
    this.door.visible = this.doorOpen < 0.98;

    // 눈 깜빡임 — 바라보는 동안에는 깜빡이지 않는다
    if (this.eyeMat.opacity > 0.05 && !this.staring) {
      this.blinkT -= dt;
      if (this.blinkT < -0.11) this.blinkT = 2.6 + Math.random() * 2.4;
      this.eyes.scale.y = this.blinkT < 0 ? 0.12 : 1;
    } else this.eyes.scale.y = 1;
  }
}

/**
 * 소품의 바닥 자리(footprint)를 맞춘다. Tripo 는 크기 지시를 잘 안 듣는다 —
 * 벤치를 "한 자리"로 시켜도 2~3인용 길이로 나온다(실제로 그랬다: 통로까지 덮었다).
 * 긴 수평축이 X(차체 가로)가 되도록 눕힌 뒤, X 를 `w` 로, Z 는 `dMax` 상한으로 줄인다.
 * 축별 스케일이라 약간 눌리지만, 게임 스케일의 비닐 시트에서는 티가 안 난다.
 */
function fitFootprint(root: THREE.Object3D, w: number, dMax: number): THREE.Object3D {
  const bb = new THREE.Box3().setFromObject(root);
  const size = bb.getSize(new THREE.Vector3());
  const g = new THREE.Group();
  g.add(root);
  let sx = size.x, sz = size.z;
  if (size.z > size.x) { root.rotation.y = Math.PI / 2; sx = size.z; sz = size.x; }
  g.scale.set(w / Math.max(0.01, sx), 1, Math.min(1, dMax / Math.max(0.01, sz)));
  const out = new THREE.Group();
  out.add(g);
  (out as THREE.Object3D).userData['height'] = root.userData['height'];
  return out;
}
