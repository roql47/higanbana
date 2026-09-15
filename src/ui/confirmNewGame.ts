import { L } from '@/core/i18n';
import { modalInput } from './modalInput';

let pending: Promise<boolean> | null = null;

/** 새 게임만 저장을 삭제한다. 기본 포커스는 취소이며 Escape도 취소한다. */
export function confirmNewGame(): Promise<boolean> {
  if (pending) return pending;
  pending = new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'new-game-confirm';
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-labelledby', 'new-game-title');
    root.setAttribute('aria-describedby', 'new-game-description');
    root.innerHTML = `<div class="new-game-panel">
      <h2 id="new-game-title">${L('처음부터 시작할까요?', '最初から始めますか？')}</h2>
      <p id="new-game-description">${L('현재 체크포인트와 백업이 삭제됩니다. 진행을 유지하려면 취소하세요.', '現在のチェックポイントとバックアップが削除されます。進行を残す場合はキャンセルしてください。')}</p>
      <div><button type="button" data-cancel>${L('취소', 'キャンセル')}</button>
      <button type="button" data-confirm>${L('저장 삭제 후 새 게임', '保存を削除して開始')}</button></div></div>`;
    document.body.append(root);
    const finish = (confirmed: boolean) => {
      modalInput.close(root); root.remove(); pending = null; resolve(confirmed);
    };
    root.querySelector('[data-cancel]')!.addEventListener('click', () => finish(false));
    root.querySelector('[data-confirm]')!.addEventListener('click', () => finish(true));
    modalInput.open(root, () => finish(false));
  });
  return pending;
}
