/**
 * 키보드/마우스 입력.
 * - 키보드는 항상 동작. 마우스 시점은 포인터락 중이거나 캔버스를 드래그할 때 동작.
 * - 클릭(드래그 없이) → 포인터락 요청. Esc → 해제.
 * 프레임마다 `consumeMouseDelta()` / `consumeWheel()` 로 누적값을 꺼내 쓰고 비운다.
 */

/**
 * 포인터 캡처는 **던지는 API 다.**
 *   · `setPointerCapture` — 그 pointerId 가 이미 놓였으면 `InvalidStateError`
 *   · `releasePointerCapture` — 캡처 중이 아니면 `NotFoundError`
 * 둘 다 실제로 콘솔에 찍혔다 (사용자 리포트 2026-08-22). 포인터락으로 넘어가는 순간이나
 * 창 밖에서 버튼을 뗀 뒤 들어오는 이벤트에서 pointerId 가 이미 죽어 있다.
 * 캡처는 **드래그 오빗의 편의 기능일 뿐**이라 실패해도 조작에 지장이 없다 — 조용히 넘긴다.
 */
function capture(el: HTMLElement, id: number) {
  try { el.setPointerCapture(id); } catch { /* 이미 놓인 포인터 — 드래그는 그대로 동작한다 */ }
}
function release(el: HTMLElement, id: number) {
  try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch { /* 이미 풀렸다 */ }
}

export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private dragging = false;
  private dragMoved = 0;
  private lastX = 0;
  private lastY = 0;
  locked = false;
  /** 터치 조이스틱 축 (-1..1) — touch.ts 가 갱신 */
  readonly touchAxis = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) { this.keys.add('Mouse0'); this.pressedThisFrame.add('Mouse0'); }
      if (this.locked || e.pointerType !== 'mouse') return;
      this.dragging = true;
      this.dragMoved = 0;
      this.lastX = e.clientX; this.lastY = e.clientY;
      capture(canvas, e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
        return;
      }
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.mouseDX += dx;
      this.mouseDY += dy;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.keys.delete('Mouse0');
      if (this.locked || e.pointerType !== 'mouse') return;
      release(canvas, e.pointerId);
      const wasDrag = this.dragMoved > 4;
      this.dragging = false;
      if (!wasDrag) {
        try {
          const p = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
          p?.catch?.(() => { /* 포인터락 불가 환경(자동화 등) — 드래그 오빗으로 대체 */ });
        } catch { /* ignore */ }
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      document.body.classList.toggle('locked', this.locked);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += e.deltaY;
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.pressedThisFrame.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  isDown(code: string) { return this.keys.has(code); }
  /** 이번 프레임에 눌린 순간인지 (endFrame 전까지 유효) */
  justPressed(code: string) { return this.pressedThisFrame.has(code); }

  /** -1..1 (x: 우측+, y: 전방+) */
  moveAxis(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    x += this.touchAxis.x; y += this.touchAxis.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  consumeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }
  consumeWheel() {
    const w = this.wheel; this.wheel = 0; return w;
  }
  endFrame() { this.pressedThisFrame.clear(); }

  /** 개발/자동화용: 합성 입력 주입 */
  inject(dx: number, dy: number, wheel = 0) { this.mouseDX += dx; this.mouseDY += dy; this.wheel += wheel; }
  /** 개발/자동화용: 키 상태 강제 */
  setKey(code: string, down: boolean) {
    if (down) { if (!this.keys.has(code)) this.pressedThisFrame.add(code); this.keys.add(code); }
    else this.keys.delete(code);
  }
}
