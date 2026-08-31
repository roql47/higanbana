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

import { L } from '@/core/i18n';

export type PhoneScreen = 'lock' | 'ready' | 'calling' | 'failed';

/**
 * 폰 화면의 글자. 날짜는 참사 10 주기 당일 — 공고판(`world/higasato/speaker.ts`)의
 * 2015-09-23 과 **같은 날**이다(10 년 차이로).
 *
 * **미오의 폰이니까 미오의 언어로 나온다.** 배경이 일본 시골이라 처음엔 전부 일본어로
 * 박아 뒀는데, 그래서 한국어판에서 화면 한복판의 물건만 일본어로 남았다
 * (사용자 리포트 2026-08-22 「한국어 버전에서 핸드폰은 아직도 일본어야」).
 * 「圏外」는 직역(권외)보다 한국 폰 화면에 실제로 뜨는 말로 옮긴다.
 */
const DATE = L('9월 23일 화요일', '9月23日 火曜日');
const TIME = '15:04';
const NO_SIGNAL = L('신호 없음', '圏外');
const SISTER = L('언니', '姉');
const MOTHER = L('엄마', '母');
const TAP_TO_CALL = L('클릭 / SPACE — 전화 걸기', 'クリック / SPACE — 発信');
const CALLING = L('발신 중…', '呼び出し中…');
const FAILED = L('연결할 수 없습니다', '圏外です');

export class Phone {
  private root: HTMLElement;
  private bigEl: HTMLElement;
  private subEl: HTMLElement;
  private noteEl: HTMLElement;
  private batteryEl: HTMLElement;
  private shown = false;
  private battery: number;
  private onBattery?: (value: number) => void;
  private inventoryTimer = 0;
  private distortionTimers: number[] = [];
  /** 한 번이라도 켜 봤는가 — 공고판이 이걸 읽는다(날짜가 겹치는 걸 알아채는 대사) */
  seen = false;

  constructor(opts: { battery?: number; onBattery?: (value: number) => void } = {}) {
    this.battery = Math.max(1, Math.min(100, Math.round(opts.battery ?? 92)));
    this.onBattery = opts.onBattery;
    this.root = document.createElement('div');
    this.root.className = 'phone';
    this.root.innerHTML =
      '<div class="scr">' +
        `<div class="bar"><span class="sig">${NO_SIGNAL}</span><span class="bat"></span></div>` +
        '<div class="mid"><div class="big"></div><div class="sub"></div></div>' +
        '<div class="note"></div>' +
      '</div>';
    document.body.appendChild(this.root);
    this.bigEl = this.root.querySelector('.big') as HTMLElement;
    this.subEl = this.root.querySelector('.sub') as HTMLElement;
    this.noteEl = this.root.querySelector('.note') as HTMLElement;
    this.batteryEl = this.root.querySelector('.bat') as HTMLElement;
    this.renderBattery();
    this.set('lock');
  }

  get visible() { return this.shown; }

  /**
   * 화면을 켜고 올린다.
   *
   * `body.phone-up` 을 같이 켠다 — **자막이 폰 위를 가로지르기 때문이다.**
   * 폰은 화면 오른쪽 아래(left 57 %, 세로로 길다)에 서고 자막은 가운데 정렬 86vw 라,
   * 실측 670×663 창에서 가로 156 px · 세로 49 px 가 겹쳤다. 게다가 폰이 z-index 43 으로
   * 자막(42) 위에 있어서 **자막 글자가 폰 뒤로 잘려 들어갔다**(사용자 리포트).
   * 폰이 떠 있는 동안만 자막을 왼쪽으로 비켜 세운다(`style.css` 의 `.phone-up .dialogue`).
   */
  show(screen: PhoneScreen = 'lock', drain = true) {
    this.seen = true;
    this.set(screen);
    if (this.shown) return;
    if (drain) this.setBattery(this.battery - 6);
    this.shown = true;
    this.root.classList.add('show');
    document.body.classList.add('phone-up');
  }

  hide() {
    if (this.inventoryTimer) window.clearTimeout(this.inventoryTimer);
    this.inventoryTimer = 0;
    if (!this.shown) return;
    this.shown = false;
    this.root.classList.remove('show');
    document.body.classList.remove('phone-up');
  }

  /** 인벤토리에서 다시 확인한다. 컷신이 아니므로 배터리는 소모하지 않고 잠시 뒤 닫힌다. */
  inspect() {
    this.show('lock', false);
    if (this.inventoryTimer) window.clearTimeout(this.inventoryTimer);
    this.inventoryTimer = window.setTimeout(() => this.hide(), 4200);
  }

  /** ACT 10 결말 — 새 알림이 아니라, 저장된 연락처 한 글자만 물에 번지듯 잘못 보인다. */
  showWellDistortion() {
    for (const timer of this.distortionTimers) window.clearTimeout(timer);
    this.distortionTimers.length = 0;
    this.show('lock');
    this.root.classList.add('well-distort');
    this.noteEl.textContent = SISTER;
    this.distortionTimers.push(window.setTimeout(() => {
      this.noteEl.textContent = MOTHER;
      this.root.classList.add('failed');
    }, 620));
    this.distortionTimers.push(window.setTimeout(() => {
      this.noteEl.textContent = SISTER;
      this.root.classList.remove('failed');
    }, 1850));
    this.distortionTimers.push(window.setTimeout(() => {
      this.root.classList.remove('well-distort');
      this.hide();
      this.distortionTimers.length = 0;
    }, 3600));
  }

  get batteryLevel() { return this.battery; }

  setBattery(value: number) {
    const next = Math.max(1, Math.min(100, Math.round(value)));
    if (next === this.battery) return;
    this.battery = next;
    this.renderBattery();
    this.onBattery?.(next);
  }

  private renderBattery() {
    this.batteryEl.textContent = `${this.battery}%`;
    this.root.classList.toggle('battery-low', this.battery <= 20);
  }

  set(screen: PhoneScreen) {
    // 잠금화면만 큰 글씨가 시각이다. 통화 화면에서 시각을 계속 띄우면
    // ③ 에서 "다시 본다"가 안 된다 — 내내 보고 있었던 게 되니까.
    if (screen === 'lock') {
      this.bigEl.textContent = TIME;
      this.subEl.textContent = DATE;
      this.noteEl.textContent = '';
    } else {
      this.bigEl.textContent = SISTER;
      this.subEl.textContent = screen === 'calling' ? CALLING : '';
      if (screen === 'ready') this.noteEl.textContent = TAP_TO_CALL;
      else this.noteEl.textContent = screen === 'failed' ? FAILED : '';
    }
    this.root.classList.toggle('failed', screen === 'failed');
    this.root.classList.toggle('ready', screen === 'ready');
  }

  dispose() {
    for (const timer of this.distortionTimers) window.clearTimeout(timer);
    this.distortionTimers.length = 0;
    this.root.remove(); document.body.classList.remove('phone-up');
  }
}
