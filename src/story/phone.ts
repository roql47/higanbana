/**
 * 미오의 휴대폰 — **광원이 아니라 규칙이다** (각색 6 C안, PLAN-STORY P1-1)
 *
 * 스토리보드는 손전등을 준다. 그런데 이 게임의 빛은 초칭이고, 초칭은 광원이자
 * 난이도 다이얼이다(`light/chochin.ts`). 손전등을 따로 만들면 그 배선을 한 벌 더 만들거나
 * "빛이 있는데 아무 규칙도 없는" 30 분이 생긴다.
 *
 * 그래서 손전등이 하던 진짜 일 — *전기가 죽는다* — 만 폰이 가져온다.
 * **씬에는 아무것도 넣지 않는다.** 라이트도 메시도 셰이더도 없이 DOM 한 장이다.
 *
 * ## 세 번에 나눠 규칙 한 줄을 세운다
 *   ① 버스 안 — 시각 확인 **15:04**
 *   ② 언니에게 전화 → **圏外**. 미오는 「산속이니까」 하고 넘긴다
 *   ③ 마을 — 해가 다 졌는데 시계가 **여전히 15:04**
 *
 * ②는 흔하다(산골이니까). ③이 규칙이다. 그리고 화면의 날짜 **9月23日** 은
 * 공고판의 「二〇一五年 九月 二十三日」과 **같은 날**이다 — 10 년 차이로.
 * 그 짝은 설명하지 않는다. 본 사람만 가져간다.
 *
 * ## 시계를 굳이 흐르게 만들지 않는다
 * 분침을 돌려 놓고 나중에 멈추는 편이 정직해 보이지만, 플레이어는 1 분이 흐르는 걸 못 본다.
 * **하늘이 대신 증언한다** — 오후에 내려서 밤에 마을에 닿는데 시계가 그대로다.
 * 그래서 값은 처음부터 고정이고, 연출은 *언제 다시 보게 하느냐* 로만 만든다.
 */

export type PhoneScreen = 'lock' | 'calling' | 'failed';

/** 참사 10 주기 당일. 공고판(`world/higasato/speaker.ts`)의 2015-09-23 과 같은 날짜다 */
const DATE_JP = '9月23日 火曜日';
const TIME = '15:04';

export class Phone {
  private root: HTMLElement;
  private bigEl: HTMLElement;
  private subEl: HTMLElement;
  private noteEl: HTMLElement;
  private shown = false;
  /** 한 번이라도 켜 봤는가 — 공고판이 이걸 읽는다(날짜가 겹치는 걸 알아채는 대사) */
  seen = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'phone';
    this.root.innerHTML =
      '<div class="scr">' +
        '<div class="bar"><span class="sig">圏外</span><span class="bat">86%</span></div>' +
        '<div class="mid"><div class="big"></div><div class="sub"></div></div>' +
        '<div class="note"></div>' +
      '</div>';
    document.body.appendChild(this.root);
    this.bigEl = this.root.querySelector('.big') as HTMLElement;
    this.subEl = this.root.querySelector('.sub') as HTMLElement;
    this.noteEl = this.root.querySelector('.note') as HTMLElement;
    this.set('lock');
  }

  get visible() { return this.shown; }

  /** 화면을 켜고 올린다 */
  show(screen: PhoneScreen = 'lock') {
    this.seen = true;
    this.set(screen);
    if (this.shown) return;
    this.shown = true;
    this.root.classList.add('show');
  }

  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.root.classList.remove('show');
  }

  set(screen: PhoneScreen) {
    // 잠금화면만 큰 글씨가 시각이다. 통화 화면에서 시각을 계속 띄우면
    // ③ 에서 "다시 본다"가 안 된다 — 내내 보고 있었던 게 되니까.
    if (screen === 'lock') {
      this.bigEl.textContent = TIME;
      this.subEl.textContent = DATE_JP;
      this.noteEl.textContent = '';
    } else {
      this.bigEl.textContent = '姉';
      this.subEl.textContent = screen === 'calling' ? '呼び出し中…' : '';
      this.noteEl.textContent = screen === 'failed' ? '圏外です' : '';
    }
    this.root.classList.toggle('failed', screen === 'failed');
  }

  dispose() { this.root.remove(); }
}
