import * as THREE from 'three';
import type { HigasatoGround } from '@/world/higasato';

/**
 * 뒤쫓는 주민들 (ACT 1) — **보이지 않는 추격자**.
 *
 * 스토리보드는 뒤를 보여주지 않는다("보지 마!"). 그래서 모델을 만들지 않는다 —
 * 대신 **횃불 빛무리**만 뒤에 둔다. 돌아보면 안 되는 규칙 때문에 플레이어는 그것을
 * 곁눈으로만 보게 되고, 안 보이는 만큼 수가 많아 보인다.
 *
 * 압박 규칙: 이들은 플레이어보다 **조금 느리다**. 계속 달리면 멀어지고, 멈추면 붙는다.
 * 잡히지는 않는다(프롤로그니까) — 대신 가까울수록 화면이 붉어지고 목소리가 또렷해진다.
 */
export class Pursuers {
  /** ⚠️ 라이트가 들어 있다 — **절대 `visible = false` 로 숨기지 않는다** (아래 생성자 주석) */
  readonly group = new THREE.Group();
  /** 횃불 메시만 담는 자식 그룹. 보이고 안 보이고는 전부 이쪽으로 한다 */
  private meshes = new THREE.Group();
  private torches: { mesh: THREE.Mesh; light: THREE.PointLight | null; off: number; phase: number }[] = [];
  private active = false;
  private mat: THREE.MeshStandardMaterial;
  /** 참배로 위 진행 거리(호길이 기준) */
  private s = 0;
  private t = 0;
  /** 0(멀다) ~ 1(바로 뒤) */
  proximity = 0;
  /** 플레이어와의 거리(m) — 대사·소리의 거리감을 여기서 가져간다 */
  gap = 999;
  /** 횃불이 꺼져 가는 중 (1 = 완전히 밝음) */
  private snuffK = 1;
  private snuffRate = 0;

  constructor(scene: THREE.Scene, private ground: HigasatoGround, opts: { count?: number } = {}) {
    const n = opts.count ?? 5;
    this.mat = new THREE.MeshStandardMaterial({
      color: 0xffd9a0, emissive: new THREE.Color(0xff8828), emissiveIntensity: 2.4, roughness: 1,
    });
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), this.mat);
      mesh.castShadow = false;
      this.meshes.add(mesh);
      // 빛은 절반만 — 포인트라이트를 다섯 개 다 켜면 밤 셰이더 비용이 크다
      const light = i % 2 === 0 ? new THREE.PointLight(0xff7820, 0, 11, 2) : null;
      if (light) { light.castShadow = false; this.group.add(light); }
      this.torches.push({ mesh, light, off: (i - (n - 1) / 2) * 1.45, phase: Math.random() * 6.28 });
    }
    /**
     * ⚠️ **라이트가 든 그룹을 숨기면 안 된다.**
     * 예전엔 `this.group.visible = false` 로 통째로 숨겼다가 `begin()` 에서 켰다. 그런데 three 는
     * **보이는 라이트만** 세므로 그 순간 `NUM_POINT_LIGHTS` 가 +3 되고, 씬의 재질이 전부 셰이더
     * 재컴파일된다 — 제단에서 같은 원인으로 한 프레임 **8561 ms** 를 실측했다(`higasato/pedestals.ts`).
     * 프롤로그가 시작되는 바로 그 순간이라 가장 티가 나는 자리다.
     * 그래서 그룹은 처음부터 끝까지 보이는 채로 두고, **메시만 숨기고 라이트는 강도를 0 으로** 내린다.
     */
    this.group.add(this.meshes);
    this.meshes.visible = false;
    this.group.visible = true;
    scene.add(this.group);
  }

  /** 횃불을 끈다 — 라이트를 씬에서 빼지 않고 강도만 0 으로 (위 주석) */
  private douse() { for (const t of this.torches) if (t.light) t.light.intensity = 0; }

  /** 플레이어의 최고 속도(m/s). 추격 속도는 여기서 역산한다 — **조금 느리다**가 규칙이다 */
  private playerTop = 3.6;

  /** 플레이어 뒤 `behind` m 지점에서 시작 */
  begin(playerS: number, behind = 30, playerTop = 3.6) {
    this.playerTop = playerTop;
    this.s = playerS - behind;
    this.active = true;
    this.meshes.visible = true;
    this.proximity = 0;
    this.gap = behind;
    this.snuffK = 1;
    this.snuffRate = 0;
  }
  end() { this.active = false; this.meshes.visible = false; this.douse(); }

  /**
   * 횃불이 **꺼진다** — ACT 1 의 「갑자기 모든 소리가 끊긴다」에 짝을 맞춘다.
   * 그냥 `end()` 로 숨기면 한 프레임에 사라져 렌더 버그처럼 보인다. 잦아들어야 한다.
   */
  snuff(seconds = 0.8) { this.snuffRate = 1 / Math.max(0.05, seconds); }

  /** 뒤에서 나는 소리를 얼마나 크게 들려줄지 — 30 m 에서 0.35, 8 m 에서 1 */
  get voice() { return 0.35 + 0.65 * this.proximity; }

  /** 강제로 거리를 좁힌다 (넘어졌을 때처럼 긴장을 한 번 올릴 때) */
  closeTo(playerS: number, m: number) { this.s = Math.max(this.s, playerS - m); }

  /**
   * @param playerS  플레이어의 참배로 호길이
   * @param speed    플레이어 속도 — 느리면 붙는다
   */
  update(dt: number, playerS: number, speed: number) {
    if (!this.active) return;
    this.t += dt;
    if (this.snuffRate > 0) {
      this.snuffK = Math.max(0, this.snuffK - this.snuffRate * dt);
      if (this.snuffK <= 0) { this.active = false; this.meshes.visible = false; this.douse(); this.snuffRate = 0; }
    }
    // 추격 속도: 플레이어가 전력으로 달리면 **초당 0.65 m 씩** 멀어지고, 처지면 붙는다.
    // 플레이어 최고 속도에서 역산하므로 ACT 가 달리기를 올려도 압박의 세기가 그대로다
    const chase = (this.playerTop - 0.65) + THREE.MathUtils.clamp((this.playerTop - speed) * 0.55, 0, 1.5);
    this.s += chase * dt;
    // 너무 붙지는 않는다 — 프롤로그에서 잡히면 이야기가 끝난다
    let gap = playerS - this.s;
    if (gap < 7) { this.s = playerS - 7; gap = 7; }
    // 너무 멀어지면 긴장이 죽는다. 34 m — 안개(0.024) 속에서 횃불이 겨우 보이는 거리다.
    // 42 로 두면 전력으로 달리는 플레이어에게는 뒤가 통째로 비어 버린다(실측: 30 → 37 m)
    if (gap > 34) { this.s = playerS - 34; gap = 34; }
    this.gap = gap;
    // gap 30 m 에서 0, 8 m 에서 1. 시작 직후부터 화면이 붉으면 근접의 의미가 없어진다
    this.proximity = THREE.MathUtils.clamp(1 - (gap - 8) / 22, 0, 1);

    // 참배로 남단(s 0) **바깥**에서 시작할 수도 있다 — ACT 1 은 길 초입에서 달리기 시작하므로
    // 30 m 뒤는 길이 없는 자리다. `roadAt` 은 t 를 [0, 길이] 로 자르니, 잘린 만큼 진행 방향의
    // 반대로 밀어 외삽한다. 안 하면 횃불이 길 초입에 **붙박인 채** 몇 초간 서 있다
    const sc = Math.max(2, this.s);
    const p = this.ground.roadAt(sc);
    const back = sc - this.s;             // 길 밖으로 얼마나 벗어났는가
    if (back > 0) { p.x -= p.dirX * back; p.z -= p.dirZ * back; }
    const gy = this.ground.heightAt(p.x, p.z);
    // 길 진행 방향의 좌우 법선으로 흩어 세운다
    const nx = -p.dirZ, nz = p.dirX;
    for (const t of this.torches) {
      const jitter = Math.sin(this.t * 2.1 + t.phase) * 0.55;
      const lag = Math.abs(t.off) * 0.35 + Math.sin(this.t * 1.3 + t.phase) * 0.8;
      const x = p.x + nx * (t.off + jitter) - p.dirX * lag;
      const z = p.z + nz * (t.off + jitter) - p.dirZ * lag;
      const y = this.ground.heightAt(x, z) + 1.55 + Math.sin(this.t * 6.5 + t.phase) * 0.06;
      t.mesh.position.set(x, y, z);
      t.light?.position.set(x, y, z);
    }
    const flick = (0.82 + 0.18 * Math.sin(this.t * 9.3) * Math.sin(this.t * 3.7)) * this.snuffK;
    this.mat.emissiveIntensity = 2.4 * flick;
    for (const t of this.torches) if (t.light) t.light.intensity = 2.0 * flick * (0.5 + this.proximity * 0.9);
    void gy;
  }
}
