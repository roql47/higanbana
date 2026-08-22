import * as THREE from 'three';

/**
 * 목표 지시자 — **지금 가야 할 곳이 화면 어느 쪽인가**.
 *
 * 이 게임의 길안내는 갈래길 입구의 팻말(`world/higasato/signposts.ts`)이 전부였다.
 * 팻말은 분위기에는 맞지만 **팻말을 지나친 뒤에는 아무것도 남지 않는다** — 목표가 「폐여관을
 * 조사하라」인데 폐여관이 어느 쪽인지 화면에 없으면, 플레이어는 지도를 외우는 게 아니라
 * 헤맨다(사용자 지적 2026-08-22 「퀘스트 위치… 접근성 올려줘야 할 듯」).
 *
 * 그래서 미니맵이 아니라 **표식 하나**만 놓는다. 미니맵은 시선을 화면 구석에 묶어 두는데,
 * 이 게임은 어두운 곳을 눈으로 훑는 게 재미다.
 *   · 목표가 화면 안이면 — 그 자리에 얇은 고리와 거리
 *   · 화면 밖이면 — 가장자리에 화살표로 붙어 방향을 가리킨다
 * 둘 다 아주 옅다. 등불보다 밝으면 안 된다.
 */
export class Waypoint {
  readonly el: HTMLElement;
  private arrow: HTMLElement;
  private label: HTMLElement;
  private target: THREE.Vector3 | null = null;
  private name = '';
  private cam = new THREE.Vector3();
  private ndc = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'wp';
    this.el.innerHTML = '<i class="wp-arrow"></i><i class="wp-ring"></i><span class="wp-label"></span>';
    this.arrow = this.el.querySelector('.wp-arrow') as HTMLElement;
    this.label = this.el.querySelector('.wp-label') as HTMLElement;
    parent.appendChild(this.el);
  }

  /** 목표를 바꾼다. `null` 이면 표식이 사라진다. 같은 목표를 매 프레임 넣어도 싸다 */
  set(target: THREE.Vector3 | null, name = '') {
    if (!target) { this.target = null; this.name = ''; return; }
    if (!this.target) this.target = target.clone();
    else this.target.copy(target);
    this.name = name;
  }

  /**
   * `view` 는 **캔버스가 실제로 차지하는 화면 사각형**이다. 창 크기를 그냥 쓰면 안 된다 —
   * 비율 고정(레터박스, `settings.hud.lockAspect`)일 때 캔버스가 창보다 작고 가운데 놓이므로,
   * 투영 좌표를 창에 매핑하면 표식이 그림에서 어긋난다.
   */
  update(camera: THREE.PerspectiveCamera, from: THREE.Vector3, visible = true,
         view: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }) {
    if (!this.target || !visible) { this.el.classList.remove('show'); return; }
    const w = view.w, h = view.h;
    // 카메라 공간에서 앞뒤를 먼저 가린다 — `project()` 만 쓰면 등 뒤의 목표가 화면 앞으로 뒤집힌다
    this.cam.copy(this.target).applyMatrix4(camera.matrixWorldInverse);
    const ahead = -this.cam.z > 0.05;
    let px: number, py: number;
    if (ahead) {
      this.ndc.copy(this.target).project(camera);
      px = (this.ndc.x * 0.5 + 0.5) * w;
      py = (-this.ndc.y * 0.5 + 0.5) * h;
    } else {
      // 등 뒤 — 좌우 어느 쪽인지만 의미가 있다
      px = this.cam.x > 0 ? w * 2 : -w;
      py = h * 0.5;
    }
    // 아래쪽 여백이 더 넓다 — 화면 밑단은 프롬프트·소금·스태미나가 이미 쓰고 있다
    const M = 46, MB = 84;
    const cx = Math.min(w - M, Math.max(M, px));
    const cy = Math.min(h - MB, Math.max(M, py));
    const off = !ahead || cx !== px || cy !== py;

    const dist = from.distanceTo(this.target);
    this.el.style.transform = `translate(${Math.round(view.x + cx)}px, ${Math.round(view.y + cy)}px)`;
    this.el.classList.toggle('off', off);
    this.el.classList.add('show');
    if (off) {
      // 화면 중앙에서 목표 쪽으로 — 삼각형의 기본 방향은 위쪽(−y)이라 +90° 를 더한다
      const a = Math.atan2(cy - h / 2, cx - w / 2) * (180 / Math.PI) + 90;
      this.arrow.style.transform = `rotate(${a}deg)`;
    }
    this.label.textContent = this.name ? `${this.name}  ${dist.toFixed(0)} m` : `${dist.toFixed(0)} m`;
  }
}
