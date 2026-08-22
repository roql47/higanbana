/**
 * 퀘스트 보이스 — "UI 가 히간누시다" (PLAN-STORY §4.1, §4.4)
 *
 * 목표 문구는 세 목소리로 표시된다:
 *   gm   1부, 히간누시 — 명조(제의문) 서체의 기계적 명령문
 *   sayo 2부, 사요 — 손글씨 서체의 청유문
 *   none 시스템 서술 (엔딩·중립)
 *
 * glitchTo() 가 반전 장치의 본체: 문구가 깨지며(문자 치환 + 색수차 지터) 다른 문장으로
 * 바뀐다. DOM 텍스트라 셰이더 없이 싸게 만든다 (§4.4).
 */

export type QuestVoice = 'gm' | 'sayo' | 'none';

/** 치환 글리프 — 봉인·제문에서 나올 법한 자와 깨진 블록. 랜덤 조합만으로 "읽으면 안 되는 글"이 된다 */
const GLYPHS = '彼岸花朱禁忌壱弐参肆伍陸漆封呪血闇骨帰依澪紗▓▒░〼';

const rand = (s: string) => s[Math.floor(Math.random() * s.length)]!;
const strip = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent ?? ''; };

export class Quests {
  private html = '';
  private voice: QuestVoice = 'gm';
  // 글리치 진행 상태
  private pending: { html: string; voice: QuestVoice } | null = null;
  private gT = 0;
  private gDur = 0;
  private gAcc = 0;
  private from = '';
  private to = '';
  private done: (() => void) | null = null;

  constructor(private el: HTMLElement) {
    this.applyVoice('gm');
  }

  /** 즉시 교체 (일반 목표 갱신). 같은 내용이면 무시 */
  set(html: string, voice: QuestVoice = 'gm') {
    if (this.pending) this.finishGlitch(); // 글리치 중 정식 갱신이 오면 글리치를 접는다
    if (html === this.html && voice === this.voice) return;
    this.html = html;
    this.el.innerHTML = html;
    this.applyVoice(voice);
  }

  /**
   * 문구가 깨지며 다른 문장으로 바뀐다. resolve 는 정착 시점.
   * ACT 17 의 3단 변조는 glitchTo 를 체이닝하면 된다.
   */
  glitchTo(html: string, voice: QuestVoice = this.voice, dur = 1.2): Promise<void> {
    if (this.pending) this.finishGlitch();
    this.pending = { html, voice };
    this.gT = 0; this.gAcc = 0; this.gDur = dur;
    this.from = strip(this.html) || strip(html);
    this.to = strip(html);
    this.el.classList.add('glitching');
    return new Promise((r) => { this.done = r; });
  }

  update(dt: number) {
    if (!this.pending) return;
    this.gT += dt; this.gAcc += dt;
    if (this.gT >= this.gDur) { this.finishGlitch(); return; }
    if (this.gAcc < 0.05) return; // 20 fps 로만 갱신 — 더 빠르면 읽히지도 않고 비용만 든다
    this.gAcc = 0;
    const p = this.gT / this.gDur;
    // 길이는 from → to 로 보간, 앞에서부터 목표 문장이 "정착"한다
    const len = Math.max(1, Math.round(this.from.length + (this.to.length - this.from.length) * p));
    const settled = Math.floor(this.to.length * p * p); // 뒤늦게 확 정착 — 끝까지 불안하게
    let s = this.to.slice(0, Math.min(settled, len));
    while (s.length < len) s += Math.random() < 0.22 ? ' ' : rand(GLYPHS);
    this.el.textContent = s;
  }

  private finishGlitch() {
    const p = this.pending!;
    this.pending = null;
    this.html = p.html;
    this.el.innerHTML = p.html;
    this.el.classList.remove('glitching');
    this.applyVoice(p.voice);
    const d = this.done; this.done = null; d?.();
  }

  private applyVoice(v: QuestVoice) {
    this.voice = v;
    this.el.classList.remove('voice-gm', 'voice-sayo', 'voice-none');
    this.el.classList.add(`voice-${v}`);
  }
}
