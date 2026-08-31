import * as THREE from 'three';
import { L } from '@/core/i18n';

/**
 * 손거울 — 폐여관의 파훼 도구 (ACT 13, PLAN-STORY §5.3.5)
 *
 * 「손거울로 현실-거울을 대조하며 이동」. 이 한 줄이 요구하는 것은 **동시성**이다 —
 * 현실을 보면서 거울을 봐야 대조가 된다. 그래서 전체 화면 전환이 아니라
 * **화면 한구석의 작은 창**이다: 눈앞은 그을린 벽인데 손 안에서는 그 자리가 문이다.
 *
 * ## 왜 실시간 반사(Reflector)가 아닌가
 * 거울에 비치는 것은 **지금 이 방이 아니라 10년 전의 이 방**이다. 반사가 아니라 **다른 세계**라서,
 * 별도 씬(`inn.mirrorScene`)을 플레이어 시점으로 렌더한다. 좌우만 뒤집어 거울처럼 보이게 한다.
 *
 * ## 비용
 * 들고 있는 동안에만 렌더한다(내리면 0). 해상도는 512²로 고정 — 거울 속을 정밀하게 보라는 게
 * 아니라 **벽이 있냐 없냐**만 읽으면 되고, 작고 흐릴수록 「거울 속」답다.
 */
export class HandMirror {
  private rt: THREE.WebGLRenderTarget;
  private cam = new THREE.PerspectiveCamera(62, 1, 0.05, 60);
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buf: Uint8Array;
  private img: ImageData;
  private offCanvas: HTMLCanvasElement;
  private off: CanvasRenderingContext2D;
  private size: number;
  private raised = false;
  private have = false;

  constructor(size = 512) {
    this.size = size;
    this.rt = new THREE.WebGLRenderTarget(size, size);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.buf = new Uint8Array(size * size * 4);
    this.img = new ImageData(size, size);
    this.root = document.createElement('div');
    this.root.className = 'handmirror hidden';
    this.root.innerHTML =
      '<div class="hm-frame"><canvas class="hm-face"></canvas></div>' +
      `<div class="hm-hint">${L('놓으면 내린다', '離すと下ろす')}</div>`;
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('.hm-face') as HTMLCanvasElement;
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.offCanvas = document.createElement('canvas');
    this.offCanvas.width = this.offCanvas.height = size;
    this.off = this.offCanvas.getContext('2d')!;
  }

  /** 화장대에서 손거울을 집었다 */
  acquire() { this.have = true; }
  get owned() { return this.have; }
  get isRaised() { return this.raised; }

  raise(on: boolean) {
    if (on && !this.have) return;
    if (this.raised === on) return;
    this.raised = on;
    this.root.classList.toggle('hidden', !on);
    void this.root.offsetWidth;
    this.root.classList.toggle('show', on);
  }

  /** 매 프레임 — 들고 있을 때만 굽는다 */
  update(renderer: THREE.WebGLRenderer, mirrorScene: THREE.Scene, view: THREE.PerspectiveCamera) {
    if (!this.raised) return;
    this.cam.position.copy(view.position);
    this.cam.quaternion.copy(view.quaternion);
    this.cam.fov = view.fov;
    this.cam.updateProjectionMatrix();
    /**
     * 좌우 반전은 **투영에서** 한다(`scale.x = -1` 대신). 카메라를 뒤집으면 삼각형 감김이
     * 뒤집혀 backface culling 이 반대로 걸리고, 벽 안쪽이 통째로 사라진다(three 의 고전 함정).
     * 캔버스에서 그리는 단계에 뒤집으면 그 문제가 없다 — 아래 `drawImage` 의 −1 스케일.
     */
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(mirrorScene, this.cam);
    renderer.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, this.buf);
    renderer.setRenderTarget(prevRT);
    // WebGL 은 아래에서 위로 읽는다 — 행을 뒤집어 캔버스 좌표계로 옮긴다
    const row = this.size * 4;
    for (let y = 0; y < this.size; y++) {
      this.img.data.set(this.buf.subarray((this.size - 1 - y) * row, (this.size - y) * row), y * row);
    }
    /**
     * `putImageData` 는 **transform 을 무시한다**(사양). 그래서 뒤집으려면 한 번 거쳐야 한다 —
     * 오프스크린에 원본을 얹고, 표시용 캔버스에 −1 배로 그린다.
     * 같은 캔버스에 자기를 다시 그리면 읽기·쓰기가 겹쳐 결과가 정의되지 않는다.
     */
    this.off.putImageData(this.img, 0, 0);
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.size, this.size);
    c.save();
    c.scale(-1, 1);
    c.drawImage(this.offCanvas, -this.size, 0);
    c.restore();
  }

  dispose() { this.rt.dispose(); }
}
