import { L, lang, setLang, type Lang } from '@/core/i18n';
import { settings } from '@/core/settings';
import { QUALITY_LEVELS, type QualityLevel } from '@/core/quality';
import { modalInput } from './modalInput';

/**
 * 일시정지 메뉴 — **Esc 로 열리는 것처럼 보이는 창**.
 *
 * ## 왜 Esc 를 직접 듣지 않는가
 * 포인터락이 걸린 동안 Esc 는 **브라우저가 먹는다.** 명세가 UA 에게 락을 푸는 기본 수단을
 * 제공하라고 요구하고, 크롬·파이어폭스·사파리 전부 Esc 를 거기에 쓴다 — keydown 이 페이지로
 * 오지 않고 `preventDefault()` 로 막히지도 않는다(보안 장치라 우회로가 없다).
 *
 * 그래서 키가 아니라 **락이 풀리는 순간**(`pointerlockchange`)을 듣는다. 플레이어 입장에서는
 * 구분이 안 된다: Esc → 커서가 나오고 → 메뉴가 뜬다. 덤으로 알트탭·창 포커스 이탈도
 * 락을 풀기 때문에 자동으로 일시정지가 된다 — 공포 게임에서는 오히려 맞는 동작이다.
 *
 * 닫는 쪽은 진짜 Esc 다. 이미 락이 풀려 있으므로 그때는 keydown 이 정상적으로 온다.
 *
 * ## 왜 「설정」이 아니라 「일시정지」인가
 * 락이 풀린 시점에 게임은 이미 멈춰 있다(`main.ts` 가 열려 있는 동안 시뮬레이션을 건너뛴다).
 * 그 화면을 설정 전용으로 두면 「계속하기」가 갈 곳이 없어진다.
 */

export interface PauseMenuHooks {
  /** 「계속하기」 — 포인터락을 다시 잡는다 */
  onResume(): void;
  /** 「처음부터」 — 저장 삭제 확인을 거친 새 게임 */
  onRestart(): void;
  onQuit?(): void;
  onQuality(level: QualityLevel): void;
  /** 렌더 해상도 배율이 바뀌었다 (0.5~1) — 저장 + 픽셀비 재계산은 바깥의 몫 */
  onRenderScale(v: number): void;
  /** 마스터 음량이 바뀌었다 (0~1) */
  onVolume(v: number): void;
  /** HUD 옵션이 바뀌었다 — 저장 + 뷰포트 재계산 */
  onHudChange(): void;
}

/** 타이틀 설정 모달(main.ts 주입)도 같은 표기를 쓴다 */
export const QUALITY_LABEL: Record<QualityLevel, string> = {
  low: L('낮음', '低'), medium: L('보통', '中'), high: L('높음', '高'), ultra: L('최고', '最高'),
};

export class PauseMenu {
  readonly el: HTMLElement;
  isOpen = false;
  private langNote: HTMLElement;
  private resInput: HTMLInputElement;
  private resVal: HTMLElement;

  constructor(private hooks: PauseMenuHooks, private currentQuality: QualityLevel) {
    this.el = document.createElement('div');
    this.el.className = 'pause hidden';
    this.el.innerHTML = `
      <div class="pause-panel">
        <div class="pause-eyebrow">${L('피안화 · 꺼지지 않는 등불', '彼岸花 · 消えない灯り')}</div>
        <h2 class="pause-title" id="pause-heading">${L('일시정지', '一時停止')}</h2>
        <button type="button" class="pause-resume">${L('계속하기', '続ける')}</button>
        <div class="pause-rows">
          ${this.rowSeg('lang', L('언어', '言語'), [['ko', '한국어'], ['ja', '日本語']], lang())}
          <div class="pause-note" hidden>${L('언어를 바꾸면 처음부터 다시 시작됩니다.', '言語を変えると最初からやり直しになります。')}</div>
          ${this.rowSeg('quality', L('화질', '画質'), QUALITY_LEVELS.map((q) => [q, QUALITY_LABEL[q]] as [string, string]), currentQuality)}
          <div class="pause-row">
            <span class="pause-label">${L('렌더 해상도', '描画解像度')}</span>
            <span class="pause-scale"><input class="pause-res" type="range" min="0.5" max="1" step="0.05" value="${settings.render.resolutionScale}"><span class="pause-res-val">${Math.round(settings.render.resolutionScale * 100)}%</span></span>
          </div>
          <div class="pause-row">
            <span class="pause-label">${L('소리', '音量')}</span>
            <input class="pause-vol" type="range" min="0" max="1" step="0.05" value="${settings.audio.master}">
          </div>
          <div class="pause-row">
            <span class="pause-label">${L('HUD 크기', 'HUD サイズ')}</span>
            <span class="pause-hud-scale"><input class="pause-hud-size" type="range" min="0.8" max="1.3" step="0.05" value="${settings.hud.scale}"><span class="pause-hud-size-val">${Math.round(settings.hud.scale * 100)}%</span></span>
          </div>
          ${this.rowToggle('highContrast', L('HUD 고대비', 'HUD 高コントラスト'), settings.hud.highContrast)}
          ${this.rowToggle('waypoint', L('목표 지시자', '目標マーカー'), settings.hud.waypoint)}
          ${this.rowToggle('signRead', L('팻말 읽어 주기', '道標を読み上げ'), settings.hud.signRead)}
          ${this.rowToggle('lockAspect', L('창 비율 고정', '画面比を固定'), settings.hud.lockAspect)}
        </div>
        <button type="button" class="pause-restart">${L('처음부터', '最初から')}</button>
        <div class="pause-hint">${L('<kbd>Esc</kbd> 또는 화면 클릭 — 게임으로', '<kbd>Esc</kbd> または画面クリック — ゲームへ')}</div>
      </div>`;
    document.body.appendChild(this.el);
    this.langNote = this.el.querySelector('.pause-note') as HTMLElement;
    this.el.setAttribute('aria-labelledby', 'pause-heading');
    const rows = this.el.querySelector('.pause-rows')!;
    for (const [title, selectors] of [
      [L('화면', '画面'), ['[data-seg="quality"]', '.pause-res', '[data-toggle="lockAspect"]']],
      [L('소리와 언어', '音と言語'), ['.pause-vol', '[data-seg="lang"]']],
      [L('안내 및 접근성', '案内とアクセシビリティ'), ['.pause-hud-size', '[data-toggle="highContrast"]', '[data-toggle="waypoint"]', '[data-toggle="signRead"]']],
    ] as const) {
      const section = document.createElement('fieldset'); section.className = 'pause-section';
      const legend = document.createElement('legend'); legend.textContent = title; section.append(legend);
      for (const selector of selectors) {
        const control = rows.querySelector(selector)!;
        section.append(control.closest('.pause-row')!);
      }
      if (selectors.some(s => s.includes('lang'))) section.append(this.langNote);
      rows.append(section);
    }
    for (const input of this.el.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
      input.setAttribute('aria-label', input.closest('.pause-row')!.querySelector('.pause-label')!.textContent!);
    }
    const volume = this.el.querySelector<HTMLInputElement>('.pause-vol')!;
    const volumeValue = document.createElement('output'); volumeValue.className = 'pause-vol-val';
    volumeValue.textContent = `${Math.round(settings.audio.master * 100)}%`;
    volume.after(volumeValue);

    this.el.querySelector('.pause-resume')!.addEventListener('click', () => this.close());
    this.el.querySelector('.pause-restart')!.addEventListener('click', () => hooks.onRestart());
    if (hooks.onQuit) {
      const quit = document.createElement('button'); quit.type = 'button'; quit.className = 'pause-quit';
      quit.textContent = L('게임 종료', 'ゲームを終了'); quit.addEventListener('click', () => hooks.onQuit!());
      this.el.querySelector('.pause-restart')!.after(quit);
    }
    // 패널 **바깥**을 눌러도 돌아간다 — 락이 풀린 화면에서 가장 먼저 하는 동작이다
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });

    this.el.querySelector('.pause-vol')!.addEventListener('input', (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      settings.audio.master = v;
      volumeValue.textContent = `${Math.round(v * 100)}%`;
      hooks.onVolume(v);
    });

    // 화질 프리셋(그림자·AO·소품)은 그대로 두고 해상도만 내리는 수동 배율 — 「무겁다」는 기기의 마지막 손잡이
    this.resVal = this.el.querySelector('.pause-res-val') as HTMLElement;
    this.resInput = this.el.querySelector('.pause-res') as HTMLInputElement;
    this.resInput.addEventListener('input', () => {
      const v = Number(this.resInput.value);
      settings.render.resolutionScale = v;
      this.resVal.textContent = `${Math.round(v * 100)}%`;
      hooks.onRenderScale(v);
    });

    const hudSize = this.el.querySelector('.pause-hud-size') as HTMLInputElement;
    const hudSizeVal = this.el.querySelector('.pause-hud-size-val') as HTMLElement;
    hudSize.addEventListener('input', () => {
      settings.hud.scale = Number(hudSize.value);
      hudSizeVal.textContent = `${Math.round(settings.hud.scale * 100)}%`;
      hooks.onHudChange();
    });

    this.onSeg('lang', (v) => {
      if (v === lang()) return;
      setLang(v as Lang);
      // 팻말·비석·아이템 이름은 **모듈이 로드될 때** 굳는다(`core/i18n.ts`). 다시 읽는 수밖에 없다
      this.langNote.hidden = false;
      setTimeout(() => location.reload(), 450);
    });
    this.onSeg('quality', (v) => {
      this.currentQuality = v as QualityLevel;
      hooks.onQuality(v as QualityLevel);
    });
    for (const k of ['highContrast', 'waypoint', 'signRead', 'lockAspect'] as const) {
      this.el.querySelector(`[data-toggle="${k}"]`)!.addEventListener('click', (e) => {
        const b = e.currentTarget as HTMLElement;
        settings.hud[k] = !settings.hud[k];
        b.classList.toggle('on', settings.hud[k]);
        b.setAttribute('aria-pressed', String(settings.hud[k]));
        b.textContent = settings.hud[k] ? L('켬', 'オン') : L('끔', 'オフ');
        hooks.onHudChange();
      });
    }
  }

  private rowSeg(key: string, label: string, opts: [string, string][], cur: string) {
    const buttons = opts.map(([v, t]) =>
      `<button type="button" data-seg="${key}" data-value="${v}" aria-pressed="${v === cur}" class="${v === cur ? 'on' : ''}">${t}</button>`).join('');
    return `<div class="pause-row"><span class="pause-label">${label}</span><div class="pause-seg">${buttons}</div></div>`;
  }
  private rowToggle(key: string, label: string, on: boolean) {
    return `<div class="pause-row"><span class="pause-label">${label}</span>`
      + `<button type="button" data-toggle="${key}" aria-label="${label}" aria-pressed="${on}" class="pause-toggle ${on ? 'on' : ''}">${on ? L('켬', 'オン') : L('끔', 'オフ')}</button></div>`;
  }
  private onSeg(key: string, fn: (value: string) => void) {
    for (const b of this.el.querySelectorAll<HTMLElement>(`[data-seg="${key}"]`)) {
      b.addEventListener('click', () => {
        for (const o of this.el.querySelectorAll(`[data-seg="${key}"]`)) { o.classList.remove('on'); o.setAttribute('aria-pressed', 'false'); }
        b.classList.add('on');
        b.setAttribute('aria-pressed', 'true');
        fn(b.dataset['value']!);
      });
    }
  }

  /** 렌더 해상도가 바깥(타이틀 설정)에서 바뀌었을 때 슬라이더 표시를 맞춘다 */
  syncRenderScale(v: number) {
    this.resInput.value = String(v);
    this.resVal.textContent = `${Math.round(v * 100)}%`;
  }

  /** 품질이 바깥에서 바뀌었을 때 (적응형 하향·H 패널·타이틀 설정) 버튼 상태를 맞춘다 */
  syncQuality(level: QualityLevel) {
    this.currentQuality = level;
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-seg="quality"]')) {
      b.classList.toggle('on', b.dataset['value'] === level);
      b.setAttribute('aria-pressed', String(b.dataset['value'] === level));
    }
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.el.classList.remove('hidden');
    modalInput.open(this.el, () => this.close());
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.add('hidden');
    modalInput.close(this.el);
    this.hooks.onResume();
  }
}
