import type { Inventory } from './inventory';
import { L } from '@/core/i18n';

/**
 * 인벤토리 창의 조작 목록.
 *
 * 시작 화면의 힌트는 몇 초 뒤 사라지고 다시 볼 방법이 없었다 — 그래서 **언제든 열 수 있는 창**인
 * 인벤토리에 붙인다(사용자 요청 2026-08-22). **Esc** 줄이 핵심이다: 포인터락이 걸린 뒤
 * 마우스 커서를 어떻게 되찾는지 아무 데도 안 적혀 있었다.
 */
const KEYS: [string, string][] = [
  ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', L('이동', '移動')],
  ['<kbd>Shift</kbd>', L('달리기 (스태미나)', '走る（スタミナ）')],
  [L('<kbd>C</kbd>', '<kbd>C</kbd>'), L('웅크림 — 노점 아래·벼 사이·벽장에 숨는다', 'しゃがむ — 屋台の下・稲の間・押入れに隠れる')],
  [L('<kbd>마우스</kbd>', '<kbd>マウス</kbd>'), L('시점', '視点')],
  ['<kbd>P</kbd>', L('1인칭 / 3인칭 시점 전환', '一人称 / 三人称視点を切り替える')],
  [L('<kbd>휠</kbd>', '<kbd>ホイール</kbd>'), L('줌', 'ズーム')],
  ['<kbd>E</kbd>', L('줍기 · 봉납 · 조사 (꾹 누르는 것도 있다)', '拾う · 供える · 調べる（長押しのものもある）')],
  ['<kbd>Q</kbd>', L('초칭 밝기 — 끔 / 약 / 강', '提灯の明るさ — 消す / 弱 / 強')],
  ['<kbd>Tab</kbd>', L('인벤토리 — 기록물은 클릭해서 읽는다', '持ち物 — 記録はクリックして読む')],
  ['<kbd>O</kbd>', L('목표 패널 접기 / 펼치기', '目標パネルを畳む / 開く')],
  ['<kbd>J</kbd>', L('조사 기록과 현재 가설', '調査記録と現在の仮説')],
  ['<kbd>Esc</kbd>', L('<b>일시정지 · 설정</b> — 언어 · 화질 · 소리 · HUD (마우스 커서도 여기서 나온다)',
    '<b>一時停止 · 設定</b> — 言語 · 画質 · 音量 · HUD（マウスカーソルもここで出る）')],
  ['<kbd>R</kbd>', L('리셋', 'リセット')],
  ['<kbd>M</kbd>', L('음소거', '消音')],
  ['<kbd>F</kbd>', L('전체화면', '全画面')],
];

/**
 * Tab 으로 여닫는 인벤토리 오버레이. 열리면 포인터락 해제·게임 입력 차단(main 이 `isOpen` 확인).
 * 클릭: 기록물을 연다. 드래그로 슬롯을 교환한다.
 */
export class InventoryUI {
  readonly el: HTMLElement;
  private grid: HTMLElement;
  private detail: HTMLElement;
  private selectedIndex: number | null = null;
  private readonly readRecords = loadReadRecords();
  private dragFrom: number | null = null;
  isOpen = false;
  onToggle?: (open: boolean) => void;
  /** 지금 열어도 되는가 — 일시정지 메뉴가 떠 있으면 Tab 이 그 위로 열리면 안 된다 */
  canOpen?: () => boolean;
  /** 기록물(`type: 'record'`)을 클릭했을 때 — 전용 뷰어를 여는 쪽에서 붙인다 */
  onUse?: (itemId: string) => void;

  constructor(private inv: Inventory) {
    this.el = document.createElement('div');
    this.el.id = 'inventory';
    this.el.className = 'inv hidden';
    this.el.innerHTML = `
      <div class="inv-panel">
        <div class="inv-head"><span class="inv-title">${L('인벤토리', '持ち物')}</span><span class="inv-hint">${L('<kbd>Tab</kbd> 닫기 · 클릭 열기 · 드래그 이동', '<kbd>Tab</kbd> 閉じる · クリックで開く · ドラッグで移動')}</span></div>
        <div class="inv-body">
          <div class="inv-grid"></div>
          <div class="inv-detail" aria-live="polite"></div>
        </div>
        <details class="inv-keys">
          <summary><span>${L('조작 도움말', '操作ヘルプ')}</span><small>${L('필요할 때 펼치기', '必要な時に開く')}</small></summary>
          <dl>${KEYS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        </details>
      </div>`;
    document.body.appendChild(this.el);
    this.grid = this.el.querySelector('.inv-grid')!;
    this.detail = this.el.querySelector('.inv-detail')!;

    for (let i = 0; i < inv.slots.length; i++) {
      const s = document.createElement('div');
      s.className = 'inv-slot';
      s.dataset['index'] = String(i);
      s.draggable = true;
      s.tabIndex = 0;
      s.setAttribute('role', 'button');
      this.grid.appendChild(s);
    }
    const useSlot = (slot: HTMLElement) => {
      const idx = Number(slot.dataset['index']);
      this.selectedIndex = idx;
      this.showDetail(idx);
      const item = inv.item(inv.slots[idx]?.itemId ?? null);
      if (item?.type === 'weapon') inv.equip(idx);
      // 기록물은 장착하는 게 아니라 **여는** 물건이다 (가족사진·명부·일기·문서)
      else if (item?.type === 'record') {
        this.readRecords.add(item.id);
        saveReadRecords(this.readRecords);
        this.render();
        this.onUse?.(item.id);
      }
    };
    this.grid.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot');
      if (!slot) return;
      useSlot(slot);
    });
    this.grid.addEventListener('keydown', (e) => {
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot');
      if (!slot) return;
      e.preventDefault();
      useSlot(slot);
    });
    // 설명은 커서를 따라다니지 않고 같은 자리에 머문다. 패드·키보드 포커스에서도 같은 정보가 보인다.
    this.grid.addEventListener('pointerover', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot');
      if (slot) this.showDetail(Number(slot.dataset['index']));
    });
    this.grid.addEventListener('focusin', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot');
      if (slot) this.showDetail(Number(slot.dataset['index']));
    });
    // 드래그 교환
    this.grid.addEventListener('dragstart', (e) => { const s = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot'); this.dragFrom = s ? Number(s.dataset['index']) : null; });
    this.grid.addEventListener('dragover', (e) => e.preventDefault());
    this.grid.addEventListener('drop', (e) => { e.preventDefault(); const s = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot'); if (s && this.dragFrom !== null) inv.swap(this.dragFrom, Number(s.dataset['index'])); this.dragFrom = null; });
    inv.on('change', () => this.render());
    inv.on('equip', () => this.render());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!this.isOpen && this.canOpen && !this.canOpen()) return;
        this.toggle();
      }
      if (e.code === 'Escape' && this.isOpen) this.toggle(false);
    });
    this.render();
  }

  toggle(force?: boolean) {
    this.isOpen = force ?? !this.isOpen;
    // **열 때마다 다시 그린다.** 아이콘이 런타임에 바뀔 수 있다 — 가족사진은 로케 촬영이
    // 끝난 뒤에야 진짜 그림이 되고(`photoThumb()`), ACT 30 에서 얼룩이 걷히면 또 바뀐다.
    if (this.isOpen) this.render();
    this.el.classList.toggle('hidden', !this.isOpen);
    if (this.isOpen && document.pointerLockElement) document.exitPointerLock();
    this.onToggle?.(this.isOpen);
  }

  render() {
    const slots = this.grid.querySelectorAll<HTMLElement>('.inv-slot');
    slots.forEach((el, i) => {
      const s = this.inv.slots[i]!;
      const item = this.inv.item(s.itemId);
      el.classList.toggle('filled', !!item);
      el.classList.toggle('selected', i === this.selectedIndex && !!item);
      el.classList.toggle('unread', item?.type === 'record' && !this.readRecords.has(item.id));
      el.setAttribute('aria-label', item ? `${item.name}. ${item.desc}` : L('빈 슬롯', '空きスロット'));
      el.innerHTML = item
        ? `${iconHTML(item.icon)}${s.count > 1 ? `<span class="inv-count">${s.count}</span>` : ''}`
          + (item.type === 'record' && !this.readRecords.has(item.id) ? '<i class="inv-new">NEW</i>' : '')
        : '';
    });
    if (this.selectedIndex !== null && !this.inv.item(this.inv.slots[this.selectedIndex]?.itemId ?? null)) this.selectedIndex = null;
    this.showDetail(this.selectedIndex);
  }

  private showDetail(index: number | null) {
    const item = index === null ? null : this.inv.item(this.inv.slots[index]?.itemId ?? null);
    if (!item) {
      this.detail.classList.add('empty');
      this.detail.innerHTML = `<span>${L('아이템에 커서를 올리면 설명을 볼 수 있습니다.', 'アイテムを選ぶと説明を確認できます。')}</span>`;
      return;
    }
    this.detail.classList.remove('empty');
    this.detail.innerHTML = `<b>${item.name}</b><span>${item.desc}</span>`
      + (item.weapon ? `<i>${L(`피해 ${item.weapon.damage} · 사거리 ${item.weapon.reach} m`, `威力 ${item.weapon.damage} · 間合い ${item.weapon.reach} m`)}</i>` : '')
      + (item.type === 'record' ? `<small>${L('클릭하거나 Enter로 읽기', 'クリックまたは Enter で読む')}</small>` : '');
  }
}

const READ_RECORDS_KEY = '3dm.inventory.read-records.v1';
function loadReadRecords(): Set<string> {
  try {
    const ids = JSON.parse(localStorage.getItem(READ_RECORDS_KEY) ?? '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
  } catch { return new Set(); }
}
function saveReadRecords(ids: Set<string>) {
  try { localStorage.setItem(READ_RECORDS_KEY, JSON.stringify([...ids])); } catch { /* 저장 불가 환경 */ }
}

/**
 * 아이콘은 **이모지 또는 이미지**다(`items.ts` 의 `icon`).
 * 가족사진처럼 실제로 찍은 물건은 이모지로는 안 된다 — 인벤토리에 든 것이 그 사진 자체다
 * (`story/photo.ts` 의 `photoThumb()` 가 완성본을 잘라 data URL 로 준다).
 */
function iconHTML(icon: string) {
  const isImage = icon.startsWith('data:') || icon.startsWith('/') || icon.startsWith('http');
  return isImage ? `<img class="inv-img" src="${icon}" alt="" draggable="false">` : `<span class="inv-icon">${icon}</span>`;
}
