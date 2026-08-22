/**
 * 자막·대사 시스템 (PLAN-STORY §8.3)
 *
 * 원칙: 보이스 없는 자막이 기본(§9.5). 걷는 중에도 재생되므로 화면 하단 중앙,
 * 타자기 출력으로 "말하는 중"을 표현한다. 시퀀서와 필드 연출이 같은 창구를 쓴다.
 */

export interface DialogueLine {
  /** 화자 표기 (없으면 지문) */
  who?: string;
  text: string;
  /** 초. 없으면 글자 수로 추정 */
  dur?: number;
}

/** 화자별 색 — 미오는 푸른 원피스(차안), 사요는 등불(피안)의 색 계열 */
const WHO_COLOR: Record<string, string> = {
  '미오': '#d9e6ef',
  '사요': '#ffd9a0',
  '히간누시': '#e88a8a',
  '???': '#e88a8a',
  '방송': '#9fb0c0',
};

export class Dialogue {
  private root: HTMLElement;
  private whoEl: HTMLElement;
  private lineEl: HTMLElement;
  private queue: DialogueLine[] = [];
  private cur: DialogueLine | null = null;
  private t = 0;
  private chars = 0;
  private resolvers: (() => void)[] = [];
  /** 타자기 속도 (자/초) — 한글은 라틴보다 글자당 정보가 많아 느리게 */
  private cps = 26;
  /**
   * 진행 배속. 타자 속도와 표시 시간에 **동시에** 걸린다 (1.2 면 20 % 빨리 찍히고 20 % 빨리 사라진다).
   *
   * ACT 1 이 이걸 쓴다. 거리로 짠 비트에서는 **자막이 화면에 떠 있는 시간이 곧 거리**라
   * 달리기 속도를 올리면 줄들이 뒤로 밀려 서로 잘린다. 배속을 달리기 배율에 묶어 두면
   * 한 줄이 먹는 **거리**가 고정되어, 속도를 올려도 비트 표를 다시 짤 필요가 없다.
   */
  private rate = 1;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'dialogue';
    this.root.innerHTML = '<div class="who"></div><div class="line"></div>';
    document.body.appendChild(this.root);
    this.whoEl = this.root.querySelector('.who') as HTMLElement;
    this.lineEl = this.root.querySelector('.line') as HTMLElement;
  }

  get busy() { return this.cur !== null || this.queue.length > 0; }

  /** 진행 배속 (1 = 기본). 장면이 끝나면 반드시 1 로 되돌린다 */
  setRate(v: number) { this.rate = Math.max(0.25, v); }

  /** 줄들을 순서대로 재생. 전부 끝나면 resolve — 시퀀서·스크립트 양쪽에서 await 가능 */
  say(...lines: DialogueLine[]): Promise<void> {
    this.queue.push(...lines);
    return new Promise((r) => this.resolvers.push(r));
  }

  /** 재생 중단 + 큐 비움 (스킵) */
  clear() {
    this.queue.length = 0;
    this.cur = null;
    this.root.classList.remove('show');
    this.flushResolvers();
  }

  update(dt: number) {
    if (!this.cur) {
      const next = this.queue.shift();
      if (!next) return;
      this.cur = next;
      this.t = 0;
      this.chars = 0;
      this.whoEl.textContent = next.who ?? '';
      this.whoEl.style.setProperty('--who', WHO_COLOR[next.who ?? ''] ?? 'rgba(243,234,214,0.6)');
      this.whoEl.style.display = next.who ? '' : 'none';
      this.lineEl.textContent = '';
      this.root.classList.add('show');
    }
    const cur = this.cur;
    this.t += dt;
    // 타자기: 다 찍힌 뒤에도 읽을 시간을 남긴다
    const want = Math.min(cur.text.length, Math.floor(this.t * this.cps * this.rate));
    if (want !== this.chars) {
      this.chars = want;
      this.lineEl.textContent = cur.text.slice(0, want);
    }
    const dur = (cur.dur ?? Math.max(1.6, cur.text.length / this.cps + 1.3)) / this.rate;
    if (this.t >= dur) {
      this.cur = null;
      if (this.queue.length === 0) {
        this.root.classList.remove('show');
        this.flushResolvers();
      }
    }
  }

  private flushResolvers() {
    const rs = this.resolvers;
    this.resolvers = [];
    for (const r of rs) r();
  }
}
