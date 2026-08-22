import { L, lang, langChosen, setLang, type Lang } from '@/core/i18n';

/**
 * 부팅 — **언어를 먼저 정하고 그다음에 게임을 읽는다.**
 *
 * `main.ts` 를 `<script src>` 로 바로 걸면 모듈 최상단의 문자열(팻말 목록·아이템 이름 …)이
 * 선택보다 먼저 만들어져 버린다. 그래서 여기서 선택을 받은 뒤 `import('./main')` 한다.
 * 이미 고른 적이 있으면 첫 화면 없이 그대로 들어간다 (`core/i18n.ts` 참고).
 */

const $ = (id: string) => document.getElementById(id)!;

/** 정적 껍데기(로딩 화면·조작 힌트·타이틀 카드)의 글자. 언어가 정해진 뒤 한 번만 채운다 */
function fillShell() {
  document.documentElement.lang = lang();
  document.title = L('히간바나', '彼岸花');
  $('loading-title').textContent = L('히간바나', '彼岸花');
  $('loading-sub').textContent = L('여름밤 마을로 들어서는 중…', '夏の夜の村へ入ってゆく…');
  $('start-btn').textContent = L('클릭해서 시작', 'クリックして開始');
  $('hint-title').textContent = L('클릭해서 조작 시작', 'クリックして操作開始');
  $('hint-keys').innerHTML = [
    L('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동 · <kbd>Shift</kbd> 달리기(스태미나) · <kbd>C</kbd> 웅크림',
      '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動 · <kbd>Shift</kbd> 走る（スタミナ） · <kbd>C</kbd> しゃがむ'),
    L('<kbd>Q</kbd> 초칭 밝기 · <kbd>E</kbd> 줍기/봉납/조사 · <kbd>Tab</kbd> 인벤토리 · <kbd>좌클릭</kbd> 돌 던지기 · <kbd>G</kbd> 소금',
      '<kbd>Q</kbd> 提灯の明るさ · <kbd>E</kbd> 拾う/供える/調べる · <kbd>Tab</kbd> 持ち物 · <kbd>左クリック</kbd> 石を投げる · <kbd>G</kbd> 塩'),
    L('<kbd>마우스</kbd> 시점 · <kbd>휠</kbd> 줌 · 웅크려서 노점 아래·벼 사이·벽장에 숨을 수 있다',
      '<kbd>マウス</kbd> 視点 · <kbd>ホイール</kbd> ズーム · しゃがめば屋台の下・稲の間・押入れに隠れられる'),
    L('<kbd>O</kbd> 목표 접기 · <kbd>Esc</kbd> 마우스 커서 · <kbd>R</kbd> 리셋 · <kbd>M</kbd> 음소거 · <kbd>F</kbd> 전체화면 · <kbd>H</kbd> 설정',
      '<kbd>O</kbd> 目標を畳む · <kbd>Esc</kbd> マウスカーソル · <kbd>R</kbd> リセット · <kbd>M</kbd> 消音 · <kbd>F</kbd> 全画面 · <kbd>H</kbd> 設定'),
  ].map((s) => `<span>${s}</span>`).join('');
  // 타이틀 카드 — **한 언어만.** 예전엔 「彼岸花」 아래에 「피안화」를 겹쳐 놓았고, 그게 이중표기의 상징이었다.
  // 일본어판만 읽기(かな)를 아래에 둔다 — 그건 일본어 타이틀의 관례이지 다른 언어 병기가 아니다
  $('tc-main').textContent = L('히간바나', '彼岸花');
  $('tc-sub').textContent = L('', 'ひがんばな');
}

function boot() {
  fillShell();
  $('lang-gate').remove();
  void import('./main');
}

const gate = $('lang-gate');
if (langChosen()) {
  boot();
} else {
  gate.hidden = false;
  for (const b of gate.querySelectorAll<HTMLButtonElement>('button[data-lang]')) {
    b.addEventListener('click', () => { setLang(b.dataset['lang'] as Lang); boot(); }, { once: true });
  }
}
