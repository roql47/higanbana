import type { Input } from './input';

/**
 * 터치 컨트롤: 화면 왼쪽 절반 = 가상 조이스틱(이동), 오른쪽 절반 = 시점 드래그, 우하단 점프 버튼.
 * 포인터 이벤트로 구현. 결과는 Input 의 touchAxis / inject / setKey 로 흘려보낸다.
 */
export function setupTouch(input: Input, canvas: HTMLCanvasElement) {
  const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!coarse) return null;
  document.body.classList.add('touch');

  const ui = document.createElement('div');
  ui.id = 'touch-ui';
  ui.innerHTML = `
    <div class="joy" id="joy"><div class="joy-knob" id="joy-knob"></div></div>
    <button class="jump-btn" id="jump-btn" aria-label="jump">↑</button>
    <button class="walk-btn" id="walk-btn" aria-label="walk">걷기</button>
    <button class="atk-btn" id="atk-btn" aria-label="attack">⚔</button>
    <button class="inv-btn" id="inv-btn" aria-label="inventory">☰</button>
  `;
  document.body.appendChild(ui);
  const joy = ui.querySelector<HTMLDivElement>('#joy')!;
  const knob = ui.querySelector<HTMLDivElement>('#joy-knob')!;
  const jumpBtn = ui.querySelector<HTMLButtonElement>('#jump-btn')!;
  const walkBtn = ui.querySelector<HTMLButtonElement>('#walk-btn')!;

  const R = 56; // 조이스틱 반경(px)
  let joyId: number | null = null, joyCx = 0, joyCy = 0;
  let lookId: number | null = null, lastX = 0, lastY = 0;

  const showJoy = (x: number, y: number) => {
    joy.style.display = 'block';
    joy.style.left = `${x - R}px`; joy.style.top = `${y - R}px`;
    knob.style.transform = 'translate(0px, 0px)';
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (e.clientX < window.innerWidth * 0.5 && joyId === null) {
      joyId = e.pointerId; joyCx = e.clientX; joyCy = e.clientY;
      showJoy(joyCx, joyCy);
    } else if (lookId === null) {
      lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
    }
    canvas.setPointerCapture(e.pointerId);
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === joyId) {
      let dx = e.clientX - joyCx, dy = e.clientY - joyCy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = 0.12;
      let ax = dx / R, ay = -dy / R;
      const m = Math.hypot(ax, ay);
      if (m < dead) { ax = 0; ay = 0; }
      else { const k = (m - dead) / (1 - dead) / m; ax *= k; ay *= k; }
      input.touchAxis.x = ax; input.touchAxis.y = ay;
    } else if (e.pointerId === lookId) {
      input.inject((e.clientX - lastX) * 1.6, (e.clientY - lastY) * 1.6);
      lastX = e.clientX; lastY = e.clientY;
    }
  });

  const end = (e: PointerEvent) => {
    if (e.pointerId === joyId) { joyId = null; input.touchAxis.x = 0; input.touchAxis.y = 0; joy.style.display = 'none'; }
    if (e.pointerId === lookId) lookId = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const press = (el: HTMLElement, code: string) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.setKey(code, true); el.classList.add('down'); }, { passive: false });
    const up = () => { input.setKey(code, false); el.classList.remove('down'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  };
  press(jumpBtn, 'Space');
  press(ui.querySelector<HTMLButtonElement>('#atk-btn')!, 'KeyJ');
  ui.querySelector<HTMLButtonElement>('#inv-btn')!.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab' })); }, { passive: false });
  // 걷기 토글
  let walking = false;
  walkBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); walking = !walking; input.setKey('ShiftLeft', walking); walkBtn.classList.toggle('down', walking); }, { passive: false });
  return ui;
}
