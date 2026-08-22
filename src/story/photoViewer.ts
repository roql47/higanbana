import { makePhoto, modelPhotoFront } from './photo';
import { L } from '@/core/i18n';

/**
 * 가족사진 뷰어 — **이 게임의 열쇠 소품을 다시 여는 창구** (PLAN-STORY P2)
 *
 * ACT 2 에서 손에 들고 본 그 사진을, 인벤토리에서 언제든 다시 꺼내 본다.
 * 튜토리얼 표(§4.2)가 ACT 2~3 의 학습 목표로 「사진 확인」을 잡아 뒀는데
 * 정작 사진이 아이템이 아니었다 — 그 자리를 채운다.
 *
 * ## 새로 그리지 않는다
 * `story/photo.ts` 의 `makePhoto()` 가 **실제 씬에서 찍은** 텍스처를 이미 들고 있다
 * (도리이 앞·낮·10년 전 그 자리). 그 캔버스를 그대로 화면에 띄운다.
 * 다시 그리면 게임과 다른 화풍이 되고, 그건 이미 두 번 실패한 길이다(`photo.ts` 주석).
 *
 * ## 뒤집을 수 있어야 한다
 * 뒷면에는 연필 글씨가 있다. 앞면만 보여 주면 그건 **삽화**고, 뒤집히면 **물건**이 된다.
 * 클릭(또는 Space)으로 뒤집는다.
 *
 * ## ACT 30
 * `show(0)` 이면 얼룩이 걷힌 판이 나온다 — 사요의 얼굴이 드러나는 그 장면이
 * **같은 물건을 다시 여는 것**이어야 해서, 훼손도를 인자로 받는다.
 */
export class PhotoViewer {
  private root: HTMLElement;
  private card: HTMLElement;
  private frontEl: HTMLCanvasElement;
  private backEl: HTMLCanvasElement;
  private open = false;
  private flipped = false;
  /** 지금 띄워 둔 훼손도 — 같은 값이면 다시 굽지 않는다 */
  private drawn = -1;
  onClose?: () => void;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'photoview hidden';
    this.root.innerHTML =
      '<div class="pv-card">' +
        '<canvas class="pv-face pv-front"></canvas>' +
        '<canvas class="pv-face pv-back"></canvas>' +
      '</div>' +
      `<div class="pv-hint">${L('클릭 뒤집기 · <kbd>Esc</kbd> 닫기', 'クリックで裏返す · <kbd>Esc</kbd> 閉じる')}</div>`;
    document.body.appendChild(this.root);
    this.card = this.root.querySelector('.pv-card') as HTMLElement;
    this.frontEl = this.root.querySelector('.pv-front') as HTMLCanvasElement;
    this.backEl = this.root.querySelector('.pv-back') as HTMLCanvasElement;

    /**
     * **어디를 눌러도 뒤집는다. 닫기는 Esc 뿐이다.**
     *
     * 처음엔 「카드 = 뒤집기 · 바깥 = 닫기」로 뒀는데, 뒤집힌 상태에서 카드를 누르면 창이 닫혔다(실측).
     * `backface-visibility: hidden` 인 면은 히트 테스트에서도 빠져서, 뒤집힌 뒤의 클릭이
     * 카드를 통과해 배경으로 떨어진다. 판정을 면에 걸어 두는 한 계속 새는 구조라
     * **루트 하나로 합쳤다** — 힌트 줄에 적힌 것(「클릭 뒤집기 · Esc 닫기」)과도 그게 맞다.
     */
    this.root.addEventListener('click', () => this.flip());
  }

  get isOpen() { return this.open; }

  /** @param damaged 1 = 얼룩(기본) · 0 = 온전한 사진(ACT 30) */
  show(damaged = 1) {
    if (this.drawn !== damaged) {
      const { front, back } = makePhoto({ damaged });
      /**
       * 앞면은 **모델에서 딴 원판**을 먼저 쓴다(`captureModelPhoto`).
       * 인벤 아이콘만 모델로 바꿨더니 「클릭하면 옛날 사진이 나온다」는 리포트가 왔다 —
       * 가방 속 그림과 펼친 그림이 다른 물건일 수는 없다. 모델이 아직/못 왔으면 캔버스 사진으로 돈다.
       *
       * CanvasTexture 의 소스 캔버스를 **DOM 으로 옮기지 않는다** — 같은 노드를 three 가
       * 텍스처로 물고 있어서, 옮기면 ACT 2 의 사진 프롭이 빈 판이 된다. 픽셀만 베껴 온다
       * (`toDataURL` 도 되지만 768×512 두 장이 base64 2.3 MB 라 굳이)
       */
      blit(modelPhotoFront(damaged) ?? (front.image as HTMLCanvasElement), this.frontEl);
      blit(back.image as HTMLCanvasElement, this.backEl);
      this.drawn = damaged;
    }
    this.flipped = false;
    this.card.classList.remove('flipped');
    this.open = true;
    this.root.classList.remove('hidden');
    // **rAF 로 미루지 않는다.** 배경 탭이나 합성이 멈춘 창에서는 rAF 가 안 돌아 창이 영영 투명하다
    // (실측). 강제 리플로우로 트랜지션의 시작 상태를 확정하고 같은 틱에 얹는다
    void this.root.offsetWidth;
    this.root.classList.add('show');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  flip() {
    this.flipped = !this.flipped;
    this.card.classList.toggle('flipped', this.flipped);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('show');
    // 페이드가 끝난 뒤에 숨긴다 — 바로 hidden 이면 사라지는 게 아니라 툭 꺼진다
    setTimeout(() => { if (!this.open) this.root.classList.add('hidden'); }, 220);
    this.onClose?.();
  }

  /** 창이 열려 있을 때의 키 입력. 처리했으면 true */
  key(code: string): boolean {
    if (!this.open) return false;
    if (code === 'Escape' || code === 'KeyI') { this.close(); return true; }
    if (code === 'Space' || code === 'Enter') { this.flip(); return true; }
    return true;   // 열려 있는 동안 나머지 키는 게임으로 안 보낸다
  }
}

/** 소스 캔버스의 픽셀을 화면용 캔버스로 베낀다 (원본 노드는 three 가 텍스처로 물고 있다) */
function blit(src: HTMLCanvasElement, dst: HTMLCanvasElement) {
  dst.width = src.width;
  dst.height = src.height;
  dst.getContext('2d')?.drawImage(src, 0, 0);
}
