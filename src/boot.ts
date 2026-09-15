import { L, lang, langChosen, setLang, type Lang } from '@/core/i18n';
import titleBgmUrl from '@/assets/title-red-spider-lilies.mp3?url';
import titleStartKoUrl from '@/assets/title-menu-game-start-brush-v3.png?url';
import titleContinueKoUrl from '@/assets/title-menu-continue-brush-v1.png?url';
import titleSettingsKoUrl from '@/assets/title-menu-settings-brush-v1.png?url';
import titleCreditsKoUrl from '@/assets/title-menu-credits-brush-v1.png?url';
import titleStartJaUrl from '@/assets/title-menu-start-ja-brush-v1.png?url';
import titleContinueJaUrl from '@/assets/title-menu-continue-ja-brush-v1.png?url';
import titleSettingsJaUrl from '@/assets/title-menu-settings-ja-brush-v1.png?url';
import titleCreditsJaUrl from '@/assets/title-menu-credits-ja-brush-v1.png?url';
import { StorySave } from '@/story/flags';
import { modalInput } from '@/ui/modalInput';
import { isDesktop, isFullscreen, fullscreenAvailable, toggleFullscreen, closeDesktop, prepareLocalFonts, installDesktopDiagnostics } from '@/core/desktop';
import './fonts.css';
installDesktopDiagnostics();

/**
 * 부팅 — **언어를 먼저 정하고 그다음에 게임을 읽는다.**
 *
 * `main.ts` 를 `<script src>` 로 바로 걸면 모듈 최상단의 문자열(팻말 목록·아이템 이름 …)이
 * 선택보다 먼저 만들어져 버린다. 그래서 여기서 선택을 받은 뒤 `import('./main')` 한다.
 * 이미 고른 적이 있으면 첫 화면 없이 그대로 들어간다 (`core/i18n.ts` 참고).
 */

const $ = (id: string) => document.getElementById(id)!;

const TITLE_MENU_ART: Record<Lang, Readonly<Record<string, string>>> = {
  ko: {
    'start-btn': titleStartKoUrl,
    'continue-btn': titleContinueKoUrl,
    'title-settings-btn': titleSettingsKoUrl,
    'title-credits-btn': titleCreditsKoUrl,
  },
  ja: {
    'start-btn': titleStartJaUrl,
    'continue-btn': titleContinueJaUrl,
    'title-settings-btn': titleSettingsJaUrl,
    'title-credits-btn': titleCreditsJaUrl,
  },
};

const TITLE_VOLUME_KEY = '3dm.titleVolume';
const MOBILE_WARNING_SESSION_KEY = '3dm.mobileRenderWarningSeen';

/**
 * UA 문자열만 믿으면 iPad의 데스크톱 모드와 일부 인앱 브라우저를 놓친다.
 * 브라우저가 제공하는 mobile 힌트 → 알려진 모바일 UA → 터치 화면 순서로 좁게 판정한다.
 */
function isMobileClient(): boolean {
  const clientNavigator = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (clientNavigator.userAgentData?.mobile === true) return true;
  const ua = navigator.userAgent;
  if (/Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile|NAVER\(inapp/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true; // 데스크톱 UA를 쓰는 iPadOS
  return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 1024;
}

function readTitleVolume(): number {
  try {
    const raw = localStorage.getItem(TITLE_VOLUME_KEY);
    if (raw === null) return 0.42;
    const saved = Number(raw);
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.42;
  } catch { return 0.42; }
}

// 메인 타이틀 BGM. 브라우저가 자동재생을 막으면 첫 포인터/키 입력이 오자마자 다시 시도한다.
const titleBgm = new Audio(titleBgmUrl);
titleBgm.loop = true;
titleBgm.preload = 'auto';
titleBgm.volume = 0;

let titleBgmPending = false;
let titleBgmClosing = false;
let titleBgmFade = 0;
let titleBgmEnabled = false;
let titleBgmTargetVolume = readTitleVolume();

function removeTitleBgmUnlock() {
  window.removeEventListener('pointerdown', unlockTitleBgm);
  window.removeEventListener('keydown', unlockTitleBgm);
}

function fadeTitleBgm(target: number, duration: number, done?: () => void) {
  cancelAnimationFrame(titleBgmFade);
  const from = titleBgm.volume;
  const startedAt = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - startedAt) / duration);
    // 양 끝에서 기울기가 부드러운 smoothstep — 타이틀 전환 때 음량이 툭 끊기지 않는다.
    const eased = t * t * (3 - 2 * t);
    titleBgm.volume = from + (target - from) * eased;
    if (t < 1) titleBgmFade = requestAnimationFrame(tick);
    else done?.();
  };
  titleBgmFade = requestAnimationFrame(tick);
}

function playTitleBgm() {
  if (titleBgmClosing || titleBgmPending || !titleBgm.paused) return;
  titleBgmPending = true;
  void titleBgm.play().then(() => {
    titleBgmPending = false;
    if (titleBgmClosing) { titleBgm.pause(); return; }
    removeTitleBgmUnlock();
    fadeTitleBgm(titleBgmTargetVolume, 1200);
  }).catch(() => {
    // 자동재생 차단은 오류가 아니다. 아래에 등록한 첫 사용자 입력에서 다시 시도한다.
    titleBgmPending = false;
  });
}

function unlockTitleBgm() {
  // 페이지 진입 직후의 자동재생 Promise가 아직 대기 중이어도, 사용자 입력 권한으로 즉시 재시도한다.
  titleBgmPending = false;
  playTitleBgm();
}

function enableTitleBgm() {
  if (titleBgmEnabled) return;
  titleBgmEnabled = true;
  window.addEventListener('pointerdown', unlockTitleBgm);
  window.addEventListener('keydown', unlockTitleBgm);
  playTitleBgm();
}

function closeTitleBgm() {
  if (titleBgmClosing) return;
  titleBgmClosing = true;
  removeTitleBgmUnlock();
  fadeTitleBgm(0, 1000, () => {
    titleBgm.pause();
    titleBgm.currentTime = 0;
  });
}

/** 정적 껍데기(로딩 화면·조작 힌트·타이틀 카드)의 글자. 언어가 정해진 뒤 한 번만 채운다 */
function fillShell() {
  document.documentElement.lang = lang();
  for (const [buttonId, imageUrl] of Object.entries(TITLE_MENU_ART[lang()])) {
    for (const image of $(buttonId).querySelectorAll<HTMLImageElement>('.title-action-art')) image.src = imageUrl;
  }
  document.title = L('피안화 - 꺼지지 않는 등불', '彼岸花');
  $('loading-title').textContent = L('피안화', '彼岸花');
  $('loading-tagline').textContent = L('꺼지지 않는 등불', 'HIGANBANA');
  $('loading-chapter').textContent = L('PHASE 1 · 돌아오지 않은 여름', 'PHASE 1 · 帰らない夏');
  $('loading-sub').textContent = L('여름밤 마을로 들어서는 중…', '夏の夜の村へ入ってゆく…');
  const continueLabel = L('이어하기', '続きから');
  const continueButton = $('continue-btn');
  continueButton.querySelector<HTMLElement>('.title-action-label')!.textContent = continueLabel;
  continueButton.setAttribute('aria-label', continueLabel);
  const saved = new StorySave().peek();
  (continueButton as HTMLButtonElement).disabled = !saved;
  continueButton.title = saved
    ? L(`ACT ${saved.flags.act}에서 이어하기`, `ACT ${saved.flags.act}から続ける`)
    : L('저장된 진행이 없습니다', '保存された進行はありません');
  const startLabel = L('게임시작', 'はじめから');
  const startButton = $('start-btn');
  startButton.querySelector<HTMLElement>('.title-action-label')!.textContent = startLabel;
  startButton.setAttribute('aria-label', startLabel);
  const settingsLabel = L('설정', '設定');
  const settingsButton = $('title-settings-btn');
  settingsButton.querySelector<HTMLElement>('.title-action-label')!.textContent = settingsLabel;
  settingsButton.setAttribute('aria-label', settingsLabel);
  const creditsLabel = L('크레딧', 'クレジット');
  const creditsButton = $('title-credits-btn');
  creditsButton.querySelector<HTMLElement>('.title-action-label')!.textContent = creditsLabel;
  creditsButton.setAttribute('aria-label', creditsLabel);
  $('title-language-label').textContent = L('언어', '言語');
  $('title-build').textContent = L('싱글 플레이 · 스토리 데모', 'シングルプレイ · ストーリーデモ');
  $('title-headphones').textContent = L('헤드폰 사용을 권장합니다', 'ヘッドホンの使用を推奨します');
  $('mobile-render-warning-heading').textContent = L('모바일 환경 안내', 'モバイル環境について');
  $('mobile-render-warning-copy').textContent = L(
    '모바일 브라우저에서는 기기와 앱에 따라 3D 화면이 정상적으로 렌더링되지 않을 수 있습니다.',
    'モバイルブラウザでは、端末やアプリによって3D画面が正常に描画されない場合があります。');
  $('mobile-render-warning-note').textContent = L(
    '안정적인 플레이와 권장 그래픽 품질을 위해 가급적 PC의 최신 Chrome 또는 Edge로 접속해 주세요.',
    '安定したプレイと推奨画質のため、できるだけPC版の最新ChromeまたはEdgeをご利用ください。');
  $('mobile-render-warning-confirm').textContent = L('확인하고 계속', '確認して続ける');
  $('hint-title').textContent = L('클릭해서 조작 시작', 'クリックして操作開始');
  $('hint-keys').innerHTML = [
    L('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동 · <kbd>Shift</kbd> 달리기',
      '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動 · <kbd>Shift</kbd> 走る'),
    L('<kbd>마우스</kbd> 시점 · <kbd>P</kbd> 1인칭/3인칭 전환 · 필요한 조작은 가까이 가면 표시됩니다',
      '<kbd>マウス</kbd> 視点 · <kbd>P</kbd> 一人称/三人称切替 · 必要な操作は近づくと表示されます'),
  ].map((s) => `<span>${s}</span>`).join('');
  // 타이틀 카드 — **한 언어만.** 예전엔 「彼岸花」 아래에 「피안화」를 겹쳐 놓았고, 그게 이중표기의 상징이었다.
  // 일본어판만 읽기(かな)를 아래에 둔다 — 그건 일본어 타이틀의 관례이지 다른 언어 병기가 아니다
  $('tc-main').textContent = L('피안화', '彼岸花');
  $('tc-sub').textContent = L('꺼지지 않는 등불', 'ひがんばな');

  // 타이틀 메뉴의 설정·크레딧. 게임이 시작된 뒤의 세부 설정은 Esc 메뉴가 담당한다.
  $('title-settings-heading').textContent = L('설정', '設定');
  $('title-volume-label').textContent = L('타이틀 음악', 'タイトル音楽');
  // 화질·렌더 해상도 줄은 main.ts 가 로딩 중에 주입한다 (엔진에 바로 적용해야 해서)
  $('title-settings-note').textContent = L(
    '세부 음량과 HUD 표시는 게임 중 Esc 메뉴에서 변경할 수 있습니다.',
    '細かい音量・HUD 表示はゲーム中の Esc メニューで変更できます。');
  $('title-credits-heading').textContent = L('크레딧', 'クレジット');
  $('title-credit-game').textContent = L('피안화 — 꺼지지 않는 등불', '彼岸花');
  const creditRoles: ReadonlyArray<readonly [string, string]> = [
    ['총감독', '総監督'],
    ['기획', '企画'],
    ['게임 디자인', 'ゲームデザイン'],
    ['시나리오', 'シナリオ'],
    ['연출', '演出'],
    ['아트 디렉션', 'アートディレクション'],
    ['캐릭터 디자인', 'キャラクターデザイン'],
    ['3D 아트', '3Dアート'],
    ['애니메이션', 'アニメーション'],
    ['시네마틱', 'シネマティック'],
    ['영상', '映像'],
    ['UI·UX 디자인', 'UI・UXデザイン'],
    ['프로그래밍', 'プログラミング'],
    ['음악', '音楽'],
    ['사운드 디자인', 'サウンドデザイン'],
    ['품질 관리', '品質管理'],
    ['제작', '制作'],
  ];
  const creditList = $('title-credit-list');
  creditList.replaceChildren(...creditRoles.map(([ko, ja]) => {
    const row = document.createElement('div');
    row.className = 'title-credit-row';
    row.tabIndex = 0;
    const role = document.createElement('dt');
    role.textContent = L(ko, ja);
    const name = document.createElement('dd');
    name.textContent = '코딩하는 간호사';
    row.append(role, name);
    return row;
  }));
  $('title-credits-note').textContent = L(
    '독립 제작 공포게임 · © 2026 코딩하는 간호사',
    'インディーホラーゲーム · © 2026 코딩하는 간호사');
  for (const close of document.querySelectorAll<HTMLButtonElement>('[data-title-close]')) {
    close.setAttribute('aria-label', L('닫기', '閉じる'));
  }

  const volume = $('title-volume') as HTMLInputElement;
  const volumeValue = $('title-volume-value') as HTMLOutputElement;
  volume.value = String(titleBgmTargetVolume);
  const syncVolume = () => {
    titleBgmTargetVolume = Number(volume.value);
    volumeValue.value = String(Math.round(titleBgmTargetVolume * 100));
    try { localStorage.setItem(TITLE_VOLUME_KEY, String(titleBgmTargetVolume)); } catch { /* 저장 없이 이번 실행만 적용 */ }
    if (!titleBgm.paused && !titleBgmClosing) fadeTitleBgm(titleBgmTargetVolume, 160);
  };
  volume.addEventListener('input', syncVolume);
  syncVolume();

  const fullscreen = $('title-fullscreen') as HTMLButtonElement;
  const syncFullscreen = () => {
    fullscreen.textContent = isFullscreen()
      ? L('전체 화면 나가기', 'フルスクリーンを終了')
      : L('전체 화면', 'フルスクリーン');
    fullscreen.disabled = !fullscreenAvailable();
  };
  fullscreen.addEventListener('click', () => {
    void toggleFullscreen();
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  syncFullscreen();

  // 모바일 경고는 언어 선택 직후 타이틀 위에서 세션당 한 번만 보여 준다.
  // 앱 내 새로고침이나 화질 변경 재시작 때 같은 안내가 연속으로 플레이를 막지는 않는다.
  const mobileWarning = $('mobile-render-warning');
  const mobileWarningConfirm = $('mobile-render-warning-confirm') as HTMLButtonElement;
  let mobileWarningSeen = false;
  try { mobileWarningSeen = sessionStorage.getItem(MOBILE_WARNING_SESSION_KEY) === '1'; } catch { /* 비공개 모드 */ }
  const dismissMobileWarning = () => {
    if (mobileWarning.hidden) return;
    try { sessionStorage.setItem(MOBILE_WARNING_SESSION_KEY, '1'); } catch { /* 이번 화면에서만 닫는다 */ }
    mobileWarning.classList.remove('show');
    setTimeout(() => { if (!mobileWarning.classList.contains('show')) mobileWarning.hidden = true; }, 180);
  };
  mobileWarningConfirm.addEventListener('click', dismissMobileWarning);
  // 데스크톱에서도 반응형 화면을 검수할 수 있는 비파괴 QA 진입점.
  const forceMobileWarning = new URLSearchParams(location.search).get('mobileWarning') === 'on';
  if ((isMobileClient() && !mobileWarningSeen) || forceMobileWarning) {
    mobileWarning.hidden = false;
    requestAnimationFrame(() => {
      mobileWarning.classList.add('show');
      mobileWarningConfirm.focus();
    });
  }

  const settingsPanel = $('title-settings');
  const creditsPanel = $('title-credits');
  const panels = [settingsPanel, creditsPanel];
  const closeTitlePanel = (panel: HTMLElement) => {
    panel.classList.remove('show');
    modalInput.close(panel);
    setTimeout(() => { if (!panel.classList.contains('show')) panel.hidden = true; }, 180);
  };
  const openTitlePanel = (panel: HTMLElement) => {
    for (const other of panels) if (other !== panel && !other.hidden) closeTitlePanel(other);
    panel.hidden = false;
    modalInput.open(panel, () => closeTitlePanel(panel));
    requestAnimationFrame(() => {
      panel.classList.add('show');
    });
  };
  $('title-settings-btn').addEventListener('click', () => openTitlePanel(settingsPanel));
  $('title-credits-btn').addEventListener('click', () => openTitlePanel(creditsPanel));
  for (const panel of panels) {
    panel.addEventListener('pointerdown', (e) => { if (e.target === panel) closeTitlePanel(panel); });
    panel.querySelector('[data-title-close]')!.addEventListener('click', () => closeTitlePanel(panel));
  }
  const language = $('title-language');
  for (const b of language.querySelectorAll<HTMLButtonElement>('button[data-lang]')) {
    const buttonLang = b.dataset['lang'] as Lang;
    b.classList.toggle('active', buttonLang === lang());
    b.setAttribute('aria-pressed', String(buttonLang === lang()));
    b.addEventListener('click', () => {
      if (buttonLang === lang()) return;
      setLang(buttonLang);
      location.reload();
    });
  }

  // main.ts 가 로딩을 끝내고 버튼의 hidden 을 푸는 순간, 타이틀을 로딩 화면에서 메뉴로 전환한다.
  const loading = $('loading');
  const actions = $('title-actions');
  const start = $('start-btn') as HTMLButtonElement;
  window.addEventListener('game-started', closeTitleBgm, { once: true });
  const syncReady = () => {
    const ready = !start.hidden;
    loading.classList.toggle('ready', ready);
    actions.hidden = !ready;
    language.hidden = !ready;
  };
  new MutationObserver(syncReady).observe(start, { attributes: true, attributeFilter: ['hidden'] });
  syncReady();
}

async function boot() {
  fillShell();
  $('lang-gate').remove();
  if (isDesktop()) {
    const quit = document.createElement('button'); quit.className = 'title-native-quit';
    quit.textContent = L('게임 종료', 'ゲームを終了'); quit.addEventListener('click', () => { void closeDesktop(); });
    $('title-language').appendChild(quit);
  }
  await prepareLocalFonts(lang());
  void import('./main');
}

// 언어 선택 화면도 메인 타이틀의 일부다. 자동재생이 허용되면 즉시, 아니면 언어 버튼을
// 누르는 첫 포인터 입력에서 재생한다.
enableTitleBgm();

const gate = $('lang-gate');
if (langChosen()) {
  boot();
} else {
  gate.hidden = false;
  for (const b of gate.querySelectorAll<HTMLButtonElement>('button[data-lang]')) {
    b.addEventListener('click', () => { setLang(b.dataset['lang'] as Lang); boot(); }, { once: true });
  }
}
