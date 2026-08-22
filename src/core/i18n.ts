/**
 * 언어 — **한국어 아니면 일본어. 섞지 않는다.**
 *
 * 이 게임은 일본 시골 마을이 무대라 간판·비석·공고문이 일본어였고 자막은 한국어였다.
 * 그래서 화면에 두 글자체가 늘 같이 떠 있었다(사용자 지시 2026-08-22:
 * 「일어로 할 거면 일어, 한글로 할 거면 한글로. 이중표기 하지 말고, 언어 선택은 처음 화면에서」).
 *
 * ## 설계
 * 키 사전(`t('quest.altar')`)이 아니라 **인라인 쌍**(`L('제단', '祭壇')`)을 쓴다.
 * 이 저장소의 문장은 대사·간판처럼 **문맥이 곧 의미**인 것들이라, 키로 한 번 접어 두면
 * 번역이 원문에서 떨어져 나가 금세 어긋난다. 쌍으로 두면 diff 에서 같이 보이고 grep 도 된다.
 *
 * ## 언제 정해지는가
 * **모듈이 로드되기 전에.** `signposts.ts` 의 팻말 목록이나 `items.ts` 의 이름처럼 모듈 최상단에서
 * 만들어지는 문자열이 있어서, 언어가 나중에 바뀌면 그것들만 옛 언어로 남는다.
 * 그래서 `boot.ts` 가 **선택을 받은 뒤에** `main.ts` 를 동적으로 import 한다.
 * (이미 고른 적이 있으면 저장값으로 즉시 부팅한다 — 첫 화면은 처음 한 번만 나온다.)
 */

export type Lang = 'ko' | 'ja';

const KEY = '3dm.lang';

/** 사파리 프라이빗 등에서 localStorage 접근 자체가 던진다 */
function read(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function detect(): Lang {
  const tags = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).join(',');
  return /(^|,)ja\b|-JP/i.test(tags) ? 'ja' : 'ko';
}

let current: Lang = (() => {
  const s = read();
  return s === 'ko' || s === 'ja' ? s : detect();
})();

/** 사용자가 **직접 고른 적이 있는가** (없으면 첫 화면에서 묻는다) */
export function langChosen(): boolean {
  const s = read();
  return s === 'ko' || s === 'ja';
}

export function lang(): Lang { return current; }

export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* 저장 못 해도 이번 판은 돌아간다 */ }
  document.documentElement.lang = l;
}

/** 두 언어의 같은 문장. 셋 이상으로 늘어날 일이 생기면 그때 객체로 바꾼다 */
export function L(ko: string, ja: string): string { return current === 'ja' ? ja : ko; }

/**
 * 캔버스에 글자를 그릴 때 쓰는 서체 스택 (`ctx.font`).
 * CSS 는 `html[lang]` 으로 갈라 주지만 캔버스는 문자열을 직접 받아야 한다.
 */
export function serifFamily(): string {
  return current === 'ja'
    ? '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif'
    : '"Noto Serif KR", "Apple SD Gothic Neo", serif';
}

/** 손글씨 스택 — 사요의 목소리(사진 뒷면·퀘스트 보이스). CSS 의 `--hand` 와 같은 것을 캔버스용으로 */
export function handFamily(): string {
  return current === 'ja'
    ? '"Yomogi", "Hiragino Maru Gothic ProN", cursive'
    : '"Nanum Pen Script", "Apple SD Gothic Neo", cursive';
}
