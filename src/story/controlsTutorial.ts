import * as THREE from 'three';
import { L } from '@/core/i18n';

export interface ControlsTutorialInput {
  /** 하차 카메라 인계가 끝났는가. 자동 카메라 움직임을 시점 조작으로 오인하지 않는다. */
  cameraReady: boolean;
  /** 이 프레임에 플레이어가 직접 만든 마우스 이동량(px). */
  lookDelta: number;
  /** 이동 중 Shift를 누르고 있는가. */
  running: boolean;
  /** 가방을 직접 열었는가. 마지막 안내를 확인한 것으로도 인정한다. */
  inventoryOpen: boolean;
}

type TutorialState = 'idle' | 'wait' | 'move' | 'look' | 'actions' | 'complete' | 'done';

/**
 * 버스 하차 뒤의 짧은 조작 튜토리얼.
 *
 * 시간만 재고 넘기지 않고 `이동 → 시점`은 실제 입력을 확인한다. 다만 마지막 단축키 묶음은
 * 강제로 전부 누르게 하지 않는다 — 서사를 보기 전에 키 시험을 치르는 느낌이 되기 때문이다.
 * 달리거나 가방을 열면 바로 끝나고, 읽기만 해도 3.6초 뒤 완료돼 ACT 진행을 막지 않는다.
 */
export class ControlsTutorial {
  private state: TutorialState = 'idle';
  private origin = new THREE.Vector3();
  private lookTotal = 0;
  private stageT = 0;

  constructor(
    private root: HTMLElement,
    private onProgress: (step: number) => void,
    private onDone: (played: boolean) => void,
  ) {
    // 목표 패널의 숫자를 다시 읽지 않아도 현재 단계가 보이도록, 안내 자체에 짧은 진행 표시를 둔다.
    if (!root.querySelector('.hint-progress')) {
      const progress = document.createElement('div');
      progress.className = 'hint-progress';
      progress.setAttribute('aria-hidden', 'true');
      progress.innerHTML = '<i></i><i></i><i></i>';
      root.appendChild(progress);
    }
  }

  get active() { return this.state !== 'idle' && this.state !== 'done'; }

  begin(position: THREE.Vector3) {
    if (this.state !== 'idle') return;
    this.origin.copy(position);
    this.state = 'wait';
    this.stageT = 0;
    this.onProgress(0);
    this.showStep(-1);
    this.paint(L('잠시 주변을 살펴보세요', '少し周囲を見渡してください'), '');
  }

  /** 체크포인트·디버그 스킵은 튜토리얼을 재생하지 않고 스토리만 연다. */
  skip() {
    if (this.state === 'done') return;
    this.state = 'done';
    this.onDone(false);
  }

  update(dt: number, position: THREE.Vector3, input: ControlsTutorialInput) {
    if (!this.active) return;
    this.stageT += dt;

    if (this.state === 'wait') {
      if (!input.cameraReady) return;
      this.origin.copy(position);
      this.enterMove();
      return;
    }

    if (this.state === 'move') {
      const moved = Math.hypot(position.x - this.origin.x, position.z - this.origin.z);
      // 키보드가 없거나 입력 장치 포커스를 잡지 못한 환경도 스토리에서 영구히 막지 않는다.
      if (moved >= 1.35 || this.stageT >= 12) this.enterLook();
      return;
    }

    if (this.state === 'look') {
      this.lookTotal += input.lookDelta;
      // 한 번의 클릭 흔들림이 아니라 화면을 약 1/5바퀴 훑은 정도를 확인한다.
      // 포인터락이 불가능한 환경은 드래그 시점으로 같은 누적량에 도달한다.
      if (this.lookTotal >= 150 || this.stageT >= 8) this.enterActions();
      return;
    }

    if (this.state === 'actions') {
      if ((input.running && this.stageT >= 0.45) || input.inventoryOpen || this.stageT >= 3.6) {
        this.state = 'complete';
        this.stageT = 0;
        this.onProgress(3);
        this.showStep(3);
        this.paint(L('기본 조작 완료', '基本操作 完了'), L('마을 안으로 들어갑니다', '村へ入ります'));
      }
      return;
    }

    if (this.state === 'complete' && this.stageT >= 0.85) {
      this.state = 'done';
      this.onDone(true);
    }
  }

  private enterMove() {
    this.state = 'move';
    this.stageT = 0;
    this.onProgress(0);
    this.showStep(0);
    this.paint(
      L('앞으로 걸어 보세요', '前へ歩いてみてください'),
      L('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 또는 방향키 — 이동',
        '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> または矢印キー — 移動'),
    );
  }

  private enterLook() {
    this.state = 'look';
    this.stageT = 0;
    this.lookTotal = 0;
    this.onProgress(1);
    this.showStep(1);
    this.paint(
      L('주변을 둘러보세요', '周囲を見渡してください'),
      L('<kbd>클릭</kbd> 후 <kbd>마우스</kbd> — 시점 · 포인터락 없이 드래그해도 됩니다',
        '<kbd>クリック</kbd> 後 <kbd>マウス</kbd> — 視点 · ドラッグ操作もできます'),
    );
  }

  private enterActions() {
    this.state = 'actions';
    this.stageT = 0;
    this.onProgress(2);
    this.showStep(2);
    this.paint(
      L('조금 달려 보세요', '少し走ってみてください'),
      L('<kbd>Shift</kbd> 달리기 · <kbd>P</kbd> 1인칭/3인칭 전환 · 조사와 가방은 필요한 순간에 알려드립니다',
        '<kbd>Shift</kbd> 走る · <kbd>P</kbd> 一人称/三人称切替 · 調査と持ち物は必要な時に案内します'),
    );
  }

  private showStep(step: number) {
    const dots = this.root.querySelectorAll<HTMLElement>('.hint-progress i');
    dots.forEach((dot, i) => {
      dot.classList.toggle('done', step >= 3 || i < step);
      dot.classList.toggle('now', step >= 0 && step < 3 && i === step);
    });
  }

  private paint(title: string, keys: string) {
    const titleEl = this.root.querySelector<HTMLElement>('.hint-title');
    const keysEl = this.root.querySelector<HTMLElement>('.hint-keys');
    if (titleEl) titleEl.textContent = title;
    if (keysEl) keysEl.innerHTML = keys ? `<span>${keys}</span>` : '';
  }
}
