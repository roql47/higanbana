/**
 * 자막·대사 시스템 (PLAN-STORY §8.3)
 *
 * 원칙: 보이스 없는 자막이 기본(§9.5). 걷는 중에도 재생되므로 화면 하단 중앙,
 * 타자기 출력으로 "말하는 중"을 표현한다. 시퀀서와 필드 연출이 같은 창구를 쓴다.
 */

import { modalInput } from '@/ui/modalInput';

export interface DialogueLine {
  /** 화자 표기 (없으면 지문) */
  who?: string;
  text: string;
  /** 초. 없으면 글자 수로 추정 */
  dur?: number;
}

/**
 * 화자별 색 — 미오는 푸른 원피스(차안), 사요는 등불(피안)의 색 계열.
 * **두 언어의 이름을 다 넣는다.** 자막이 어느 언어로 오든 같은 사람은 같은 색이어야 한다
 * (`core/i18n.ts`). 키가 없으면 지문 색으로 떨어질 뿐이라 빠뜨려도 조용히 넘어가는데,
 * 그러면 「누가 말했는지」가 색에서 사라진다.
 */
const WHO_COLOR: Record<string, string> = {
  '미오': '#d9e6ef', 'ミオ': '#d9e6ef', '어린 미오': '#d9e6ef', '幼いミオ': '#d9e6ef',
  '사요': '#ffd9a0', 'サヨ': '#ffd9a0',
  '히간누시': '#e88a8a', '彼岸主': '#e88a8a',
  '???': '#e88a8a',
  '방송': '#9fb0c0', '放送': '#9fb0c0',
  '기사': '#c8c2b4', '運転手': '#c8c2b4',
  '뒤쪽': '#c09a9a', '背後': '#c09a9a',
  '땅 밑': '#8f7fa0', '地の底': '#8f7fa0',
};

export class Dialogue {
  private root: HTMLElement;
  private whoEl: HTMLElement;
  private lineEl: HTMLElement;
  private choicesEl: HTMLElement;
  private queue: DialogueLine[] = [];
  private cur: DialogueLine | null = null;
  private t = 0;
  private chars = 0;
  private resolvers: (() => void)[] = [];
  private choiceResolve: ((index: number) => void) | null = null;
  private choiceButtons: HTMLButtonElement[] = [];
  private choiceIndex = 0;
  private choiceKeyHandler: ((e: KeyboardEvent) => void) | null = null;
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
    this.root.innerHTML = '<div class="who"></div><div class="line"></div><div class="dialogue-choices" role="group"></div>';
    document.body.appendChild(this.root);
    this.whoEl = this.root.querySelector('.who') as HTMLElement;
    this.lineEl = this.root.querySelector('.line') as HTMLElement;
    this.choicesEl = this.root.querySelector('.dialogue-choices') as HTMLElement;
  }

  get choosing() { return this.choiceResolve !== null; }
  get busy() { return this.choosing || this.cur !== null || this.queue.length > 0; }

  /** 진행 배속 (1 = 기본). 장면이 끝나면 반드시 1 로 되돌린다 */
  setRate(v: number) { this.rate = Math.max(0.25, v); }

  /** preemptNext() 가 무장한 시각 — 이 창(120 ms) 안에 오는 say 가 남은 큐를 밀어낸다 */
  private preemptUntil = 0;

  /**
   * 다음 say() 가 **남은 대사를 밀어내고 즉시 시작**하게 한다 — 플레이어가 새 상호작용(E)을
   * 시작하는 순간 호출. 이전 이벤트의 대사가 큐에 남은 채 새 조사를 하면 새 자막이 그 뒤에
   * 붙어 한참 늦게 나오던 문제(사용자 리포트 2026-08-23)의 해법.
   * 창을 120 ms 로 짧게 잡는 이유: E 가 대사 없는 상호작용(문 밀기 등)이었다면 아무 일도
   * 없었던 것처럼 만료돼야 한다 — 몇 초 뒤의 무관한 방송을 밀어내면 안 된다.
   * 컷신 대사는 안전하다 — E 상호작용 자체가 gameplayLocked 로 막혀 있다.
   */
  preemptNext() { this.preemptUntil = performance.now() + 120; }

  /** 줄들을 순서대로 재생. 전부 끝나면 resolve — 시퀀서·스크립트 양쪽에서 await 가능 */
  say(...lines: DialogueLine[]): Promise<void> {
    if (performance.now() < this.preemptUntil && this.busy) {
      // 남은 줄을 버리고(기다리던 스크립트는 끝난 셈 쳐서 풀어 준다) 새 줄이 맨 앞에 선다
      this.preemptUntil = 0;
      this.queue.length = 0;
      this.cur = null;
      this.flushResolvers();
    }
    this.queue.push(...lines);
    return new Promise((r) => this.resolvers.push(r));
  }

  /**
   * 서사를 실제 플레이어 결정으로 바꾸는 2~4지선다. 포인터락 중에도 고를 수 있도록
   * 숫자키·방향키·Enter를 기본 입력으로 삼고, 포인터가 보이는 환경에서는 버튼 클릭도 받는다.
   * 호출부는 앞선 say()를 await한 뒤 사용한다 — 선택 중에는 새 자막 큐를 섞지 않는다.
   */
  choose(prompt: string, options: readonly string[]): Promise<number> {
    if (this.choosing) throw new Error('Dialogue choice is already open');
    if (this.cur || this.queue.length) throw new Error('Dialogue choice requires an idle dialogue');
    if (options.length < 2 || options.length > 4) throw new Error('Dialogue choice requires 2 to 4 options');

    this.choiceIndex = 0;
    this.whoEl.style.display = 'none';
    this.lineEl.textContent = prompt;
    this.choicesEl.replaceChildren();
    this.choiceButtons = options.map((label, index) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dialogue-choice';
      b.innerHTML = `<kbd>${index + 1}</kbd><span></span>`;
      (b.querySelector('span') as HTMLElement).textContent = label;
      b.addEventListener('pointerenter', () => { this.choiceIndex = index; this.syncChoiceSelection(); });
      b.addEventListener('click', () => this.finishChoice(index));
      this.choicesEl.appendChild(b);
      return b;
    });
    this.root.classList.add('show', 'choosing');
    this.syncChoiceSelection();

    this.choiceKeyHandler = (e) => {
      if (!this.choosing || !modalInput.allows(this.root) || e.repeat) return;
      const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      if (digit) {
        const index = Number(digit[1]) - 1;
        if (index < this.choiceButtons.length) this.finishChoice(index);
        else return;
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
        this.choiceIndex = (this.choiceIndex - 1 + this.choiceButtons.length) % this.choiceButtons.length;
        this.syncChoiceSelection();
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
        this.choiceIndex = (this.choiceIndex + 1) % this.choiceButtons.length;
        this.syncChoiceSelection();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        this.finishChoice(this.choiceIndex);
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', this.choiceKeyHandler, true);
    return new Promise<number>((resolve) => { this.choiceResolve = resolve; });
  }

  /** 재생 중단 + 큐 비움 (스킵) */
  clear() {
    if (this.choosing) this.finishChoice(0);
    this.queue.length = 0;
    this.cur = null;
    this.root.classList.remove('show');
    this.flushResolvers();
  }

  update(dt: number) {
    if (this.choosing) return;
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

  private syncChoiceSelection() {
    this.choiceButtons.forEach((b, i) => {
      b.classList.toggle('selected', i === this.choiceIndex);
      b.setAttribute('aria-selected', String(i === this.choiceIndex));
    });
  }

  private finishChoice(index: number) {
    const resolve = this.choiceResolve;
    if (!resolve) return;
    this.choiceResolve = null;
    if (this.choiceKeyHandler) window.removeEventListener('keydown', this.choiceKeyHandler, true);
    this.choiceKeyHandler = null;
    this.choiceButtons = [];
    this.choicesEl.replaceChildren();
    this.root.classList.remove('show', 'choosing');
    this.lineEl.textContent = '';
    resolve(index);
  }
}
