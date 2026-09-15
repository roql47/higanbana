import * as THREE from 'three';

/** Ground-level play needs nearby shadows, not the aerial preview's 460 m map. */
export class PlayRender {
  /**
   * 그림자 절두체 반폭(m). 항공 프리뷰의 230 m → 지상 플레이의 **18 m**.
   *
   * 1024² 를 ±40 m 에 펴면 텍셀이 7.8 cm 다 — 코앞의 사요와 등불 그림자가 계단으로 보인다.
   * ±18 m 면 **3.5 cm**. 그림자 패스 삼각형도 같이 빠져서(실측 30.6 만 → 20.3 만, −34 %)
   * 매 프레임 갱신을 감당할 수 있다.
   *
   * **더 줄여도 안 싸다.** ±10 m 로 내려 봤더니 드로우콜은 46 → 18 로 줄지만 삼각형은
   * 21.6 만으로 그대로였다 — 지형 트라이메시와 `frustumCulled=false` 인 스킨드 메시가
   * 절두체와 무관하게 통째로 그려지기 때문이다. 여기가 바닥이고, 그 아래는 그림자 사거리만 잃는다.
   *
   * 밤·비(`rainNight`, 안개 0.017)에서 18 m 밖의 달그림자는 안개에 먹혀 보이지 않는다.
   */
  private static readonly EXTENT = 18;
  private readonly offset = new THREE.Vector3(-250, 550, -350);
  /** 라이트 시선의 기저 — `offset` 이 상수라 한 번만 구하면 된다 */
  private readonly axisX = new THREE.Vector3();
  private readonly axisY = new THREE.Vector3();
  private readonly axisZ = new THREE.Vector3();
  private readonly texel: number;
  private readonly snapped = new THREE.Vector3();
  private elapsed = 0;
  private frames = 0;
  private readonly meter = document.createElement('span');

  constructor(renderer: THREE.WebGLRenderer, private sun: THREE.DirectionalLight) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    sun.shadow.map?.dispose(); sun.shadow.map = null;
    sun.shadow.mapSize.set(1024, 1024);
    const e = PlayRender.EXTENT;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e });
    sun.shadow.camera.updateProjectionMatrix();
    // The inherited shadow depth range is 1..1200 m. A bias of -.00012
    // displaces contact shadows by roughly 14 cm; keep depth and normal offsets millimetric.
    this.texel = (2 * e) / sun.shadow.mapSize.x;
    sun.shadow.bias = -0.000005;
    sun.shadow.normalBias = .003;
    /**
     * **매 프레임 갱신한다.** 20 Hz 로 던지던 동안 ① 3 프레임 중 1 프레임만 그림자 패스를
     * 돌아 삼각형이 +46 % 튀었고(실측 525 콜·103 만 → 456 콜·70.7 만), ② 그 사이 그림자
     * 카메라가 14 cm 씩(2.8 m/s × 50 ms) 점프해 그림자가 기어다녔다.
     * (`preview.ts` 는 정지 카메라라 `autoUpdate=false` 로 둔다 — 여기서 되돌린다)
     */
    renderer.shadowMap.autoUpdate = true;
    this.axisZ.copy(this.offset).normalize();
    this.axisX.set(0, 1, 0).cross(this.axisZ).normalize();
    this.axisY.copy(this.axisZ).cross(this.axisX);
    this.meter.style.cssText = 'display:block;margin-top:8px;font:11px monospace;opacity:.8';
    document.querySelector('header')?.append(this.meter);
  }

  update(position: THREE.Vector3) {
    /**
     * **텍셀 격자에 물린다.** 그림자 카메라가 플레이어를 따라 연속으로 움직이면 같은 모서리가
     * 매 프레임 다른 텍셀에 떨어져 그림자 윤곽이 들끓는다(shimmer). 라이트 시선 평면에서
     * 목표를 한 텍셀 단위로 반올림하면 화면이 흘러도 그림자 텍셀은 제자리에 선다.
     */
    const t = this.texel;
    const x = Math.round(position.dot(this.axisX) / t) * t;
    const y = Math.round(position.dot(this.axisY) / t) * t;
    const z = position.dot(this.axisZ);
    this.snapped.set(0, 0, 0)
      .addScaledVector(this.axisX, x)
      .addScaledVector(this.axisY, y)
      .addScaledVector(this.axisZ, z);
    this.sun.target.position.copy(this.snapped);
    this.sun.position.copy(this.snapped).add(this.offset);
  }

  record(dt: number) {
    this.elapsed += dt; this.frames++;
    if (this.elapsed < 1) return;
    this.meter.textContent = `${Math.round(this.frames / this.elapsed)} FPS · ${(this.elapsed * 1000 / this.frames).toFixed(1)} ms`;
    this.elapsed = 0; this.frames = 0;
  }
}
