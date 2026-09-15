import { L } from '@/core/i18n';

/** 실패는 자동으로 숨기지 않는다. 재시도 성공 때만 정상 상태로 바뀐다. */
export class SaveStatus {
  private el = document.createElement('div');
  private text = document.createElement('span');
  private retry = document.createElement('button');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private recoveryUntil = 0;
  constructor(onRetry: () => void) {
    this.el.className = 'save-status';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.retry.type = 'button';
    this.retry.textContent = L('다시 저장', '再保存');
    this.retry.addEventListener('click', onRetry);
    this.el.append(this.text, this.retry);
    this.el.hidden = true;
    document.body.append(this.el);
  }
  update(success: boolean, savedAt?: number) {
    // 복구 직후 연출이 자동 저장해도 복구 안내를 읽을 시간을 확보한다. 실패는 즉시 알린다.
    if (success && Date.now() < this.recoveryUntil) return;
    if (!success) this.recoveryUntil = 0;
    const time = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const last = time ? L(` 마지막 저장: ${time}.`, ` 最終保存: ${time}。`) : '';
    this.show(success ? L(`체크포인트 저장됨 ${time}`, `チェックポイント保存済み ${time}`)
      : L('진행을 저장하지 못했습니다. 저장 공간·권한을 확인하고 다시 저장하세요.', '進行を保存できませんでした。保存領域・権限を確認して再保存してください。') + last, !success);
  }
  recovered() {
    this.recoveryUntil = Date.now() + 9000;
    this.show(L('최신 저장을 읽지 못해 이전 체크포인트로 복구했습니다.', '最新の保存を読み込めなかったため、前のチェックポイントを復元しました。'), false, 9000);
  }
  deletionFailed() {
    this.show(L('저장을 삭제하지 못해 새 게임을 취소했습니다.', '保存を削除できなかったため、新しいゲームを中止しました。'), false, 9000);
  }
  private show(message: string, failed: boolean, duration = 2500) {
    clearTimeout(this.timer);
    this.text.textContent = message;
    this.el.hidden = false;
    this.el.classList.toggle('failed', failed);
    this.retry.hidden = !failed;
    if (!failed) this.timer = setTimeout(() => { this.el.hidden = true; }, duration);
  }
}
