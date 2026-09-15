import { L } from '@/core/i18n';
import type { PalmGestureSprites } from './palmGestureSprites';

const smooth = (p: number) => { const t = Math.max(0, Math.min(1, p)); return t * t * (3 - 2 * t); };
const TRACING_SCALE = 0.64;

/**
 * 자매의 신호 (ACT 12·13 → ACT 20·30): 검지로 손바닥을 두 번 쓸고 물러난다.
 * 피부에 선을 그리지 않는다. 원은 손의 동작이며, 접촉 뒤에는 아무 자국도 남지 않는다.
 */
export class PalmSign {
  private readonly root: HTMLElement;
  private readonly hand: HTMLImageElement;
  private readonly tracer: HTMLImageElement;
  private ready = false;
  private contact = { x: 0.5, y: 0.05 };
  private open = false;
  private raf = 0;
  private hideTimer = 0;
  private playback: Promise<void> | null = null;
  private settle: (() => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'palmsign hidden';
    this.root.innerHTML =
      '<div class="ps-stage" aria-hidden="true">' +
      '<img class="ps-hand-img" alt="" draggable="false" />' +
      '<img class="ps-tracing-hand" alt="" draggable="false" />' +
      '</div>' +
      `<div class="ps-cap">${L('손끝이 손바닥을 천천히 두 번 쓸고 지나간다.', '指先が手のひらを、ゆっくり二度なぞっていく。')}</div>`;
    document.body.appendChild(this.root);
    this.hand = this.root.querySelector('.ps-hand-img')!;
    this.tracer = this.root.querySelector('.ps-tracing-hand')!;
    this.tracer.style.width = `${TRACING_SCALE * 100}%`;
  }

  async setHandSprites(sprites: PalmGestureSprites) {
    this.hand.src = sprites.palm;
    this.tracer.src = sprites.tracing;
    await Promise.all([this.hand.decode(), this.tracer.decode()]);
    this.contact = sprites.contact;
    this.ready = true;
    // 재생 도중 로드가 끝나도 글로 진행하던 장면에 손을 갑자기 띄우지 않는다.
  }

  get isOpen() { return this.open; }

  /** 중복 호출은 같은 재생을 기다리고, 도중에 닫아도 후속 대사가 계속되도록 끝낸다. */
  play(): Promise<void> {
    if (this.playback) return this.playback;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced || !this.ready ? 2700 : 4700;
    this.open = true;
    clearTimeout(this.hideTimer);
    this.root.classList.toggle('has-model', this.ready);
    this.root.classList.remove('hidden');
    this.paint(0, reduced);
    void this.root.offsetWidth;
    this.root.classList.add('show');
    if (document.pointerLockElement) document.exitPointerLock();
    this.playback = new Promise<void>((resolve) => { this.settle = resolve; });
    let elapsed = 0, previous: number | null = null;
    const frame = (now: number) => {
      // 다른 탭에서 돌아왔을 때 동작 두 번을 통째로 건너뛰지 않는다.
      if (previous !== null && !document.hidden) elapsed += Math.min(50, Math.max(0, now - previous));
      previous = now;
      if (elapsed >= duration) { this.close(); return; }
      this.paint(elapsed, reduced);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    return this.playback;
  }

  private paint(ms: number, reduced: boolean) {
    if (!this.ready) return;
    let x = 0.565, y = 0.53, angle = -132, pressure = 0;
    let opacity: number;
    if (reduced) {
      opacity = smooth(ms / 350) * (1 - smooth((ms - 2200) / 350));
    } else {
      const first = ms >= 900 && ms <= 1950;
      const second = ms >= 2230 && ms <= 3410;
      // 두 번째 동작은 조금 작고 느리다. 동작 사이에는 손끝의 힘을 뺀다.
      const pass = ms < 2230 ? 0 : 1;
      const p = Math.max(0, Math.min(1, (ms - (pass ? 2230 : 900)) / (pass ? 1180 : 1050)));
      const a = -0.35 + smooth(p) * Math.PI * 2;
      const settle = smooth((ms - 1950) / 280);
      const rx = 0.065 - settle * 0.01, ry = 0.047 - settle * 0.007;
      x += Math.cos(a) * rx;
      y += Math.sin(a) * ry;
      angle += Math.sin(a) * 4;
      pressure = first || second ? Math.sin(Math.PI * p) : 0;
      const approach = 1 - smooth((ms - 330) / 570);
      const withdraw = smooth((ms - 3710) / 700);
      x += approach * 0.22 + withdraw * 0.30;
      y -= approach * 0.24 + withdraw * 0.25;
      opacity = smooth((ms - 300) / 350) * (1 - smooth((ms - 3980) / 450));
      this.hand.style.transform = `translate(${pressure * 0.35}%, ${pressure * 0.45}%) rotate(${pressure * 0.65}deg)`;
    }
    if (reduced) this.hand.style.transform = 'none';
    // 이동도 transform으로 합성한다. 매 프레임 left/top 레이아웃을 다시 계산하지 않는다.
    this.tracer.style.transform = `translate(${x / TRACING_SCALE * 100}%, ${y / TRACING_SCALE * 100}%) rotate(${angle}deg) translate(${-this.contact.x * 100}%, ${-this.contact.y * 100}%)`;
    this.tracer.style.opacity = String(opacity);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.root.classList.remove('show');
    this.hideTimer = window.setTimeout(() => this.root.classList.add('hidden'), 420);
    const settle = this.settle;
    this.settle = null;
    this.playback = null;
    settle?.();
  }
}
