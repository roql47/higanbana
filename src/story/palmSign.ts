import { L } from '@/core/i18n';

/**
 * 손바닥의 원 — 자매의 신호 (ACT 12 → ACT 20 → ACT 30)
 *
 * 묘지의 가장 어린 아이가 미오의 손바닥에 손가락으로 원을 **두 번** 그린다.
 * 「무서울 때 사요 누나가 해줬어.」 — 미오는 기억하지 못하지만 플레이어는 본다.
 * 이 동작은 ACT 20(10년 전 마지막 밤)과 ACT 30(자매의 마지막 대화)에서 회수되므로,
 * **말로 흘리면 안 되고 화면에 남아야 한다.** 텍스트 한 줄로 지나간 복선은 회수될 때 아무도 못 알아본다.
 *
 * ## 왜 미오의 손이 아닌가
 * **미오 리그에는 손가락 본이 없다**(41 조인트, `L_Hand`/`R_Hand` 뿐) — 손바닥을 펼 수가 없다.
 * 그래서 본을 굽는 길은 처음부터 막혀 있고, 손은 별도 모델(`props/palm-a.glb`)을 구워서 쓴다.
 * 화면 오버레이인 이유는 가족사진 뷰어(`photoViewer.ts`)가 세운 「손에 든 것을 띄우는」 문법을 따르는 것.
 *
 * ## 원은 두 번이다
 * 한 번이면 우연이고 세 번이면 주문이다. **두 번**이어야 약속으로 읽힌다 —
 * 스토리보드가 두 번이라고 못박은 이유이고, 그래서 획이 끝난 뒤에도 잔상이 잠깐 남는다.
 */
export class PalmSign {
  private root: HTMLElement;
  private open = false;
  private hand: HTMLImageElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private strokes: { x: number; y: number; w: number }[][] = [[], []];
  private raf = 0;

  /**
   * 실물 손을 얹는다 — **이 프로젝트가 이미 배운 교훈**이다(`photo.ts`: 캔버스로 그린 사진은
   * 「이전 느낌 그대로」였고, 답은 이미 있는 모델을 찍는 것이었다). SVG 손은 그 그림 버전이라
   * 모델이 도착하면 물러난다. 실패하면 SVG 가 그대로 남으므로 연출이 비지는 않는다.
   */
  setHandSprite(dataUrl: string) {
    this.hand.src = dataUrl;
    this.root.classList.add('has-model');
  }

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'palmsign hidden';
    /**
     * **손은 그리지 않는다.** 예전엔 SVG 로 손 모양을 만들어 폴백으로 뒀는데, 그게 뜨는 순간이
     * 하필 「모델이 없을 때」다 — 게임에서 가장 중요한 복선 장면에 만화 같은 손이 뜨느니
     * 아무것도 없는 편이 낫다(사용자 지적). 이 연출의 알맹이는 손이 아니라 **원**이고,
     * 어둠 속에 원만 두 번 그려져도 「누가 내 손바닥에 뭘 그렸다」는 것은 전해진다.
     * 원 좌표(114,132)는 실물 스프라이트의 손바닥 중심 — 거리 변환으로 잰 값이다.
     */
    this.root.innerHTML =
      '<div class="ps-stage">' +
      '<img class="ps-hand-img" alt="" />' +
      '<canvas class="ps-canvas" width="480" height="520" aria-hidden="true"></canvas>' +
      '</div>' +
      `<div class="ps-cap">${L('무서울 때 사요 누나가 해줬어.', '怖いとき、サヨお姉ちゃんがしてくれた。')}</div>`;
    document.body.appendChild(this.root);
    this.hand = this.root.querySelector('.ps-hand-img') as HTMLImageElement;
    this.canvas = this.root.querySelector('.ps-canvas') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('손바닥 신호 캔버스를 만들 수 없다');
    this.ctx = ctx;
  }

  get isOpen() { return this.open; }

  /** 손바닥을 띄우고 원을 두 번 그린다. 끝나면 resolve — 대사 흐름이 이걸 기다린다 */
  async play(): Promise<void> {
    this.open = true;
    this.root.classList.remove('hidden');
    // photoViewer 와 같은 이유로 rAF 를 안 쓴다: 배경 탭에서는 rAF 가 멈춰 창이 영영 투명하다.
    // 강제 리플로우로 트랜지션 시작 상태를 확정하고 같은 틱에 얹는다
    void this.root.offsetWidth;
    this.root.classList.add('show');
    if (document.pointerLockElement) document.exitPointerLock();
    this.strokes = [[], []];
    this.paint();
    await wait(620);                       // 손이 올라오는 시간
    await this.drawCircle(0, 760);
    await wait(100);
    await this.drawCircle(1, 820);         // 두 번째 원 — 첫 압흔을 손끝이 다시 더듬는다
    await wait(1180);
    this.close();
  }

  /**
   * SVG dashoffset 대신 매 프레임 손끝 좌표를 쌓는다. 완벽한 타원이 아니라 손가락 압력에 따라
   * 폭이 달라지고 반경이 조금씩 흔들려, UI 선이 아니라 피부 위를 실제로 문지르는 동작으로 보인다.
   */
  private drawCircle(pass: 0 | 1, duration: number): Promise<void> {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduced ? 1 : duration;
    const start = performance.now();
    return new Promise((resolve) => {
      const frame = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const count = Math.max(2, Math.floor(eased * 116));
        const pts: { x: number; y: number; w: number }[] = [];
        for (let i = 0; i < count; i++) {
          const u = i / 115;
          const a = -0.16 + u * Math.PI * 2;
          // 두 번째 획은 첫 번째와 정확히 포개지지 않는다. 실제 손가락은 같은 선을 못 긋는다.
          const wobble = Math.sin(a * 5 + pass * 1.7) * 0.9 + Math.sin(a * 11 + 0.6) * 0.34;
          const rx = 34.5 + wobble + pass * 0.7;
          const ry = 29.5 + wobble * 0.55 - pass * 0.4;
          pts.push({
            x: 148 + Math.cos(a) * rx,
            y: 132 + Math.sin(a) * ry,
            w: 2.2 + Math.sin(u * Math.PI) * 1.45 + Math.sin(a * 3.2) * 0.3,
          });
        }
        this.strokes[pass] = pts;
        this.paint(p < 1 ? pts[pts.length - 1] : undefined);
        if (p < 1 && this.open) this.raf = requestAnimationFrame(frame);
        else { this.raf = 0; resolve(); }
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  private paint(finger?: { x: number; y: number; w: number }) {
    const c = this.ctx;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, 240, 260);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let pass = 0; pass < this.strokes.length; pass++) {
      const pts = this.strokes[pass]!;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!;
        // 손가락이 눌러 만든 어두운 가장자리와 중앙의 피부 윤기를 따로 그린다.
        c.strokeStyle = `rgba(63, 20, 18, ${pass ? 0.48 : 0.36})`;
        c.lineWidth = b.w + 2.6;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        c.strokeStyle = `rgba(220, 145, 121, ${pass ? 0.68 : 0.52})`;
        c.lineWidth = b.w;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        c.strokeStyle = `rgba(255, 220, 184, ${pass ? 0.30 : 0.20})`;
        c.lineWidth = Math.max(0.7, b.w * 0.28);
        c.beginPath(); c.moveTo(a.x - 0.6, a.y - 0.5); c.lineTo(b.x - 0.6, b.y - 0.5); c.stroke();
      }
    }
    if (finger) {
      c.save();
      c.translate(finger.x + 4, finger.y - 7);
      c.rotate(0.38);
      c.shadowColor = 'rgba(255, 179, 129, 0.35)'; c.shadowBlur = 7;
      const skin = c.createRadialGradient(-2, -3, 1, 0, 0, 10);
      skin.addColorStop(0, 'rgba(244, 196, 158, 0.94)');
      skin.addColorStop(0.72, 'rgba(174, 112, 92, 0.92)');
      skin.addColorStop(1, 'rgba(74, 40, 36, 0.08)');
      c.fillStyle = skin; c.beginPath(); c.ellipse(0, 0, 6.8, 10.5, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,232,205,0.48)'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(-0.7, -3.2, 3.5, 4.4, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      c.restore();
    }
  }

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.root.classList.remove('show');
    setTimeout(() => { if (!this.open) this.root.classList.add('hidden'); }, 420);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
