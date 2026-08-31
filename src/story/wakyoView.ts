import * as THREE from 'three';
import { L } from '@/core/i18n';

/**
 * 와쿄(和鏡) 렌즈 — 3차 개정 (ACT 13, §5.3.5)
 *
 * 사용자 결정으로 문법이 확정됐다:
 *   ① 현실은 그대로 보인다 — 화면 전체를 갈아치우지 않는다(2차의 전면 스왑 폐기)
 *   ② 거울 세계는 **와쿄의 원 거울 형태 안에만** 보인다 — 화면 중앙의 둥근 렌즈
 *   ③ 통로 이동은 걷는 게 아니라 **벽의 거울을 와쿄로 마주 보고(合わせ鏡) 사용할 때만** 열린다
 *
 * ## 거울 광학 (실측 교정: 「좌우반전이 아니라 캐릭터 **뒤쪽** 시야가 보여야」)
 * 마주 든 평면거울에 비치는 것은 전방이 아니라 **등 뒤의 반전상**이다. 그래서 렌즈 카메라는
 * 메인 카메라 자리에서 **로컬 Y 로 180° 돌려**(수평 유지) 뒤를 보고, 2D 드로우에서 좌우를
 * 뒤집는다 — 「뒤돌아 본 화면의 거울상」이 곧 평면거울의 반사다. 반전을 셰이더·카메라 스케일로
 * 하지 않는 이유: 삼각형 감김이 뒤집혀 backface culling 이 반대로 걸린다(three 고전 함정).
 * 현실 렌더(포스트FX)는 평소 그대로 돌므로 입력·카메라 계는 아무것도 건드리지 않는다.
 */
export class WakyoView {
  private on = false;
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private rt: THREE.WebGLRenderTarget;
  private cam = new THREE.PerspectiveCamera(58, 1, 0.05, 60);
  /** RT를 CPU로 읽지 않고 메인 WebGL 캔버스 위에 바로 합성하는 화면 사각형. */
  private overlayScene = new THREE.Scene();
  private overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private overlay: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private oldViewport = new THREE.Vector4();
  private oldScissor = new THREE.Vector4();

  constructor(size = 640) {
    this.rt = new THREE.WebGLRenderTarget(size, size);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.rt.texture.magFilter = THREE.LinearFilter;

    const overlayMat = new THREE.ShaderMaterial({
      uniforms: { tMirror: { value: this.rt.texture } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tMirror;
        varying vec2 vUv;
        void main() {
          vec2 d = vUv - 0.5;
          float edge = 1.0 - smoothstep(0.485, 0.5, length(d));
          if (edge <= 0.0) discard;
          // 평면거울의 좌우 반전. RT는 GPU 안에서 그대로 샘플링하므로 Y 행 복사도 필요 없다.
          vec3 col = texture2D(tMirror, vec2(1.0 - vUv.x, vUv.y)).rgb;
          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(luma), col, 0.88);
          col = (col - 0.5) * 1.04 + 0.5;
          gl_FragColor = vec4(col, edge);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), overlayMat);
    this.overlay.frustumCulled = false;
    this.overlayScene.add(this.overlay);

    this.root = document.createElement('div');
    this.root.className = 'wakyo-lens hidden';
    this.root.innerHTML =
      '<div class="wl-ring"><canvas class="wl-face"></canvas></div>' +
      `<div class="wl-label">${L('와쿄 너머 — 내리려면 [V]', '和鏡越し — 下ろすには [V]')}</div>`;
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('.wl-face') as HTMLCanvasElement;
    // 위치·크기는 CSS가 맡고, 픽셀 내용은 아래 GPU 오버레이가 그린다.
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  get active() { return this.on; }

  toggle(force?: boolean) {
    const want = force ?? !this.on;
    if (want === this.on) return;
    this.on = want;
    this.root.classList.toggle('hidden', !want);
    void this.root.offsetWidth;
    this.root.classList.toggle('show', want);
  }

  /** 매 프레임 — 들고 있을 때만 굽는다. 현실 렌더와 별개로 렌즈 안만 채운다 */
  private static FLIP_Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

  update(renderer: THREE.WebGLRenderer, mirrorScene: THREE.Scene, view: THREE.PerspectiveCamera) {
    if (!this.on) return;
    this.cam.position.copy(view.position);
    // 등 뒤를 본다 — 로컬 Y(카메라의 up) 기준 180°. 월드 Y 가 아니라 로컬이라 수평이 유지된다
    this.cam.quaternion.copy(view.quaternion).multiply(WakyoView.FLIP_Y);
    this.cam.fov = view.fov;
    this.cam.updateProjectionMatrix();
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(mirrorScene, this.cam);
    renderer.setRenderTarget(null);

    const face = this.canvas.getBoundingClientRect();
    const surface = renderer.domElement.getBoundingClientRect();
    const x = Math.round(face.left - surface.left);
    const y = Math.round(surface.bottom - face.bottom);
    const w = Math.round(face.width);
    const h = Math.round(face.height);
    if (w > 0 && h > 0) {
      renderer.getViewport(this.oldViewport);
      renderer.getScissor(this.oldScissor);
      const oldScissorTest = renderer.getScissorTest();
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      renderer.setScissorTest(true);
      renderer.render(this.overlayScene, this.overlayCam);
      renderer.setViewport(this.oldViewport);
      renderer.setScissor(this.oldScissor);
      renderer.setScissorTest(oldScissorTest);
      renderer.autoClear = oldAutoClear;
    }
    renderer.setRenderTarget(prevRT);
  }

  dispose() {
    this.rt.dispose();
    this.overlay.geometry.dispose();
    this.overlay.material.dispose();
    this.root.remove();
  }
}
