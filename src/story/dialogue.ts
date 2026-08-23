/**
 * 자막·대사 시스템 (PLAN-STORY §8.3)
 *
 * 원칙: 보이스 없는 자막이 기본(§9.5). 걷는 중에도 재생되므로 화면 하단 중앙,
 * 타자기 출력으로 "말하는 중"을 표현한다. 시퀀서와 필드 연출이 같은 창구를 쓴다.
 */

/** 낭독이 끝나고 자막이 남아 있는 시간(초) — 말이 끝나자마자 글자가 사라지면 못 읽는다 */
const VOICE_TAIL = 0.45;

export interface DialogueLine {
  /** 화자 표기 (없으면 지문) */
  who?: string;
  text: string;
  /** 초. 없으면 글자 수로 추정. **더빙이 있으면 오디오 길이가 이걸 이긴다** */
  dur?: number;
  /**
   * 더빙 키 (`scripts/voice/build.ts` 가 만드는 `public/voice/<언어>/` 아래 경로).
   *
   * 붙인 줄만 목소리가 나온다 — 파일이 없으면 조용히 자막만 나온다(`SampleBank.has`).
   * 그래서 **한 줄씩 채워 넣을 수 있다**: 녹음이 없는 줄은 지금과 완전히 같게 동작한다.
   */
  id?: string;
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
  /**
   * 더빙 훅. 재생됐으면 **그 오디오의 길이(초)**, 없으면 null 을 돌려준다.
   * `Dialogue` 가 오디오를 직접 알지 않게 바깥(main)에서 꽂는다 — 순환 import 를 피한다.
   */
  onSpeak: ((id: string) => number | null) | null = null;
  /** 스킵·가로채기로 줄이 끊길 때 목소리도 같이 끊는다 */
  onStopSpeak: (() => void) | null = null;
  /** 지금 줄이 목소리로 재생 중이면 그 길이(초), 아니면 null */
  private spoken: number | null = null;

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

  /** 재생 중단 + 큐 비움 (스킵·가로채기) */
  clear() {
    this.queue.length = 0;
    this.cur = null;
    if (this.spoken !== null) { this.onStopSpeak?.(); this.spoken = null; }
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
      // 목소리가 있으면 **여기서** 시작한다 — 자막이 뜨는 순간과 같은 프레임이어야 입이 맞는다
      this.spoken = next.id && this.onSpeak ? this.onSpeak(next.id) : null;
      this.whoEl.textContent = next.who ?? '';
      this.whoEl.style.setProperty('--who', WHO_COLOR[next.who ?? ''] ?? 'rgba(243,234,214,0.6)');
      this.whoEl.style.display = next.who ? '' : 'none';
      this.lineEl.textContent = '';
      this.root.classList.add('show');
    }
    const cur = this.cur;
    this.t += dt;
    /**
     * 타자기: 다 찍힌 뒤에도 읽을 시간을 남긴다.
     * **목소리가 있으면 글자가 목소리를 따라간다** — 낭독의 75 % 지점에서 문장이 다 찍히게
     * 맞춘다. 고정 속도로 찍으면 짧은 외침("뛰어!")은 소리보다 한참 먼저 끝나고,
     * 긴 줄은 소리가 끝난 뒤에도 계속 찍힌다.
     */
    const cps = this.spoken !== null
      ? Math.max(4, cur.text.length / Math.max(0.2, this.spoken * 0.75))
      : this.cps * this.rate;
    const want = Math.min(cur.text.length, Math.floor(this.t * cps));
    if (want !== this.chars) {
      this.chars = want;
      this.lineEl.textContent = cur.text.slice(0, want);
    }
    /**
     * 표시 시간 = **둘 중 긴 쪽.**
     *
     * 손으로 맞춘 `dur` 은 자막 길이를 보고 정한 값이라 긴 낭독을 잘라먹고, 반대로 짧은 외침
     * ("뛰어!" 0.3 초)에 오디오만 따르면 연출 박자가 통째로 앞당겨진다. 그래서 낭독은
     * 반드시 끝까지 나오되(`spoken + 여운`), 원래 박자보다 짧아지지는 않게 한다.
     * 배속(`rate`)은 `dur` 쪽에만 걸린다 — 소리는 못 당긴다(재생속도를 올리면 피치가 따라 올라간다).
     */
    const authored = (cur.dur ?? Math.max(1.6, cur.text.length / this.cps + 1.3)) / this.rate;
    const dur = this.spoken !== null ? Math.max(this.spoken + VOICE_TAIL, authored) : authored;
    if (this.t >= dur) {
      this.cur = null;
      this.spoken = null;
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
