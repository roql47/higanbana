import * as THREE from 'three';

/**
 * 본전(本殿) 문 — **1부 전체가 읽는 계기판** (PLAN-STORY P3-1)
 *
 * ACT 5 에서 만드는 건 stage 0 하나다. 그런데 이 문은 ACT 5 의 물건이 아니라
 * **봉납이 쌓이는 동안 세계가 나빠지는 걸 보여 주는 눈금**이다(§1.2 난이도 곡선표).
 * 그래서 지금 5 단계를 전부 세워 두고, 6~15 는 `setStage(n)` 값만 올린다.
 *
 * | stage | 계기 | 무엇이 보이나 |
 * |---|---|---|
 * | 0 | 시작 | 굳게 잠김. 금줄 온전(시데 4) |
 * | 1 | 봉납 2 | 금줄이 삭기 시작(시데 3). 안에서 긁는 소리 |
 * | 2 | 봉납 4 | 문 틈 2 cm — 안은 새까맣다 |
 * | 3 | 봉납 4 이후 | 그 틈에 **흰 손** |
 * | 4 | ACT 17 | 개방. 금줄이 끊어진다 |
 *
 * ## 왜 「밀어본다」가 꾹 누르기인가
 * E 한 번에 「잠겨 있다」 자막이 뜨면 그건 **정보**다. 게이지가 끝까지 찼는데도 안 열리는 건
 * **경험**이다. `game/inspect.ts` 의 `hold` 를 그대로 쓰고, 게이지가 차는 동안 문이 2 cm 씩
 * 들썩이다가 만충에서 멈춘다.
 *
 * ## 2 cm 틈이 보이게 만드는 것은 틈이 아니라 어둠이다
 * 몇 미터 밖에서 2 cm 는 안 보인다. 문 뒤에 **검은 판**을 대 두면 그 틈이 검은 실선으로 읽히고,
 * stage 3 에서 그 실선 안에 흰 것이 들어온다. 그래서 어둠이 먼저다.
 */
export interface HondenDoorOpts {
  /** 본전 중심 x · 지면 y · 본전 중심 z */
  cx: number; gy: number; bz: number;
  /** 문이 붙는 정면(남쪽) 면의 z */
  faceZ: number;
  /** 문 아래 y (본전 몸통 바닥) */
  baseY: number;
}

const W = 1.62;          // 두 짝 합친 폭
const HGT = 1.9;         // 문 높이
const THICK = 0.07;
/** stage 2~3 의 틈 — 안쪽 모서리가 2 cm 벌어지는 각 (반폭 0.81 m 기준) */
const GAP_ANGLE = 0.02 / (W / 2);
const OPEN_ANGLE = 0.86;

export class HondenDoor {
  readonly group = new THREE.Group();
  /** 조사 지점(월드) — 석단 위, 문 앞에 서는 자리 */
  readonly pos = new THREE.Vector3();
  private pivotL = new THREE.Group();
  private pivotR = new THREE.Group();
  private rope: THREE.Mesh | null = null;
  private shide: THREE.Mesh[] = [];
  private hand: THREE.Mesh;
  private handMat: THREE.MeshBasicMaterial;
  private cur = 0;         // 현재 열림 각 (rad)
  private target = 0;
  /** 밀었을 때의 들썩임 — 스프링 (거부의 「덜컥」) */
  private wob = 0;
  private wobV = 0;
  /** 지금 미는 힘 0~1 (꾹 누르기 게이지가 그대로 들어온다) */
  private press = 0;
  private creakT = 0;
  private st = 0;
  private t = 0;
  /** 미는 동안 일정 간격으로 — 삐걱이는 소리를 내는 쪽에 알린다 */
  onCreak?: (p: number) => void;

  constructor(scene: THREE.Scene, o: HondenDoorOpts) {
    const midY = o.baseY + HGT / 2;
    const zFront = o.faceZ + THICK / 2 + 0.005;

    // --- 안쪽 어둠: 문보다 크고 살짝 뒤. 이게 있어야 2 cm 가 검은 실선으로 읽힌다 ---
    const dark = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 0.1, HGT + 0.06),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    dark.position.set(o.cx, midY, o.faceZ - 0.02);
    this.group.add(dark);

    // --- 흰 손: 어둠과 문 사이. stage 3 에서만 보인다 ---
    this.handMat = new THREE.MeshBasicMaterial({ map: makeHandTexture(), transparent: true, opacity: 0, depthWrite: false });
    this.hand = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5), this.handMat);
    this.hand.position.set(o.cx + 0.02, o.baseY + HGT * 0.56, o.faceZ - 0.012);
    this.hand.visible = false;
    this.group.add(this.hand);

    // --- 문 두 짝: 바깥 모서리를 축으로 (실제 여닫이) ---
    // 색은 신사의 목재(`shrine.ts` 의 `mTimber` 0x3a2a1c)에 맞춘다. 더 어둡게 잡았더니
    // 밤에 문이 아니라 **벽에 뚫린 구멍**으로 보였다(실측)
    const mDoor = new THREE.MeshStandardMaterial({ color: 0x33241a, roughness: 0.82, metalness: 0 });
    const mBatten = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.88, metalness: 0 });
    const mBrass = new THREE.MeshStandardMaterial({ color: 0x6a5a34, roughness: 0.55, metalness: 0.5 });
    for (const side of [-1, 1] as const) {
      const pivot = side < 0 ? this.pivotL : this.pivotR;
      pivot.position.set(o.cx + side * (W / 2), midY, zFront);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(W / 2, HGT, THICK), mDoor);
      panel.position.x = -side * (W / 4);      // 축에서 안쪽으로 반 짝
      panel.castShadow = true; panel.receiveShadow = true;
      pivot.add(panel);
      // 널문(板戸)의 가로 띠 셋 — 평평한 판 한 장이면 문이 아니라 판때기다.
      // 이게 있어야 두 짝이 각각 **문짝**으로 읽히고, 사이의 세로선도 눈에 잡힌다
      for (const oy of [-0.62, 0, 0.62]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.02, 0.055, THICK + 0.012), mBatten);
        b.position.set(-side * (W / 4), oy, 0);
        pivot.add(b);
      }
      // 문고리 — **안쪽 모서리** 가까이. 축(=바깥 모서리) 기준이라 안쪽은 `-side * (W/2 - 여유)` 다.
      // 0.12 로 뒀더니 바깥쪽 끝에 붙어 「밀어본다」의 대상이 문틀처럼 보였다(실측)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 14), mBrass);
      ring.position.set(-side * (W / 2 - 0.16), -0.05, THICK / 2 + 0.012);
      pivot.add(ring);
      this.group.add(pivot);
    }

    // --- 금줄(시메나와): 문을 가로지른다. 봉인의 시각화 ---
    const mRope = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.95 });
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, W + 0.24, 8), mRope);
    rope.rotation.z = Math.PI / 2;
    rope.position.set(o.cx, o.baseY + HGT * 0.86, zFront + THICK / 2 + 0.03);
    this.rope = rope;
    this.group.add(rope);
    const mShide = new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const sx = o.cx - 0.6 + i * 0.4;
      // 시데는 작아야 한다 — 0.13×0.34 로 뒀더니 어두운 문 위에서 **뚫린 창 넷**으로 보였다
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.26), mShide);
      s.position.set(sx, rope.position.y - 0.16, rope.position.z + 0.01);
      this.shide.push(s);
      this.group.add(s);
    }

    /**
     * 계단 맨 윗단에 서서 문을 마주 보는 자리.
     *
     * 석단 앞 **턱이 0.4 m 밖에 없다**(몸통이 석단보다 그만큼 안쪽이라). 그래서 실제로 서는 곳은
     * 마지막 계단 위고, 거기서 문까지가 0.6 m 다 — 1.1 m 로 잡았더니 판정 중심이 계단 중턱이었다
     */
    this.pos.set(o.cx, o.gy + 1.4, o.faceZ + 0.6);
    this.group.name = 'honden-door';
    scene.add(this.group);
  }

  get stage() { return this.st; }

  /** 봉납 단계에 물린다 (`game/rules.ts` 의 `onOffer`) */
  setStage(n: number) {
    const s = Math.max(0, Math.min(4, Math.floor(n)));
    if (s === this.st) return;
    this.st = s;
    this.target = s >= 4 ? OPEN_ANGLE : s >= 2 ? GAP_ANGLE : 0;
    // 금줄은 단계마다 한 가닥씩 삭는다. 4 에서 끊어진다
    for (let i = 0; i < this.shide.length; i++) this.shide[i]!.visible = s < 4 && i < 4 - s;
    if (this.rope) {
      this.rope.visible = s < 4;
      const k = 1 - s * 0.18;
      this.rope.scale.set(k, 1, k);
    }
    this.hand.visible = s === 3;
    if (s !== 3) this.handMat.opacity = 0;
  }

  /**
   * 미는 중. 꾹 누르기 게이지(0~1)를 **매 프레임 그대로** 넣는다.
   *
   * 처음엔 부를 때마다 스프링에 속도를 더했는데, `onHold` 가 매 프레임 불리므로
   * 힘이 누적돼 문이 발작을 일으켰다. 미는 것은 **충격이 아니라 지속되는 압력**이라
   * 값을 더하지 않고 **덮어쓴다** — 게이지가 차는 만큼 문이 기울고 떨림이 커진다.
   */
  push(p: number) { this.press = THREE.MathUtils.clamp(p, 0, 1); }

  /** 게이지가 끝까지 찼는데도 **안 열린다** — 걸림쇠에 부딪히는 「덜컥」 한 번 */
  refuse() { this.press = 0; this.wobV = 2.6; }

  update(dt: number) {
    this.t += dt;
    // 들썩임 스프링 — 밀면 튀고 바로 잦아든다. 문은 무거운 물건이라 감쇠가 세다
    this.wobV += (-160 * this.wob - 17 * this.wobV) * dt;
    this.wob += this.wobV * dt;
    if (Math.abs(this.wob) < 1e-5 && Math.abs(this.wobV) < 1e-4) { this.wob = 0; this.wobV = 0; }
    const wobA = THREE.MathUtils.clamp(this.wob, -0.012, 0.012);

    // 단계 전환은 천천히 — 틈이 툭 생기면 물건이 아니라 스위치다
    const k = 1 - Math.exp(-dt * 1.6);
    this.cur += (this.target - this.cur) * k;

    // 미는 동안: 기울기(누르는 만큼)와 떨림(걸림쇠가 버티는 소리). 둘 다 게이지에 비례한다
    const lean = this.press * 0.009;
    const judder = this.press > 0.02 ? Math.sin(this.t * 27) * 0.0045 * this.press : 0;
    if (this.press > 0.02) {
      this.creakT -= dt;
      if (this.creakT <= 0) { this.creakT = 0.34 - this.press * 0.13; this.onCreak?.(this.press); }
    } else this.creakT = 0;

    const a = this.cur + lean + judder + wobA;
    this.pivotL.rotation.y = a;
    this.pivotR.rotation.y = -a;

    // 흰 손: 아주 느리게 들어왔다 나간다. 규칙이 읽히면 소품이 되므로 주기를 둘로 곱한다
    if (this.st === 3) {
      const f = Math.sin(this.t * 0.31) * Math.sin(this.t * 0.13);
      this.handMat.opacity = Math.max(0, f) * 0.85;
    }
  }
}

/**
 * 문틈에서 나오는 손 — 손가락 넷이 모서리를 **잡고 있다**.
 * 2 cm 슬릿으로만 보이므로 형태를 정교하게 그릴 이유가 없다. 세로로 길쭉한 창백한 것 넷이면 된다.
 */
function makeHandTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 140;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  // 손등
  const grd = g.createLinearGradient(0, 0, c.width, 0);
  grd.addColorStop(0, 'rgba(226,222,214,0)');
  grd.addColorStop(0.45, 'rgba(232,228,220,0.92)');
  grd.addColorStop(1, 'rgba(198,192,184,0.98)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(c.width * 0.72, c.height * 0.62, 30, 46, 0, 0, Math.PI * 2);
  g.fill();
  // 손가락 넷 — 길이를 조금씩 다르게. 똑같으면 빗이 된다
  for (let i = 0; i < 4; i++) {
    const y = 22 + i * 26;
    const len = 44 + Math.sin(i * 1.7) * 9;
    g.fillStyle = 'rgba(236,232,224,0.96)';
    g.beginPath();
    g.roundRect(c.width * 0.62 - len, y, len, 17, 8);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
