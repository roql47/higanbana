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
  [L('<kbd>휠</kbd>', '<kbd>ホイール</kbd>'), L('줌', 'ズーム')],
  ['<kbd>E</kbd>', L('줍기 · 봉납 · 조사 (꾹 누르는 것도 있다)', '拾う · 供える · 調べる（長押しのものもある）')],
  ['<kbd>Q</kbd>', L('초칭 밝기 — 끔 / 약 / 강', '提灯の明るさ — 消す / 弱 / 強')],
  [L('<kbd>좌클릭</kbd>', '<kbd>左クリック</kbd>'), L('돌 던지기 (소리로 유인)', '石を投げる（音で誘う）')],
  ['<kbd>G</kbd>', L('소금 (격퇴)', '塩（追い払う）')],
  ['<kbd>Tab</kbd>', L('인벤토리 — 기록물은 클릭해서 읽는다', '持ち物 — 記録はクリックして読む')],
  ['<kbd>O</kbd>', L('목표 패널 접기 / 펼치기', '目標パネルを畳む / 開く')],
  ['<kbd>Esc</kbd>', L('<b>마우스 커서 꺼내기</b> (다시 클릭하면 조작으로 돌아온다)', '<b>マウスカーソルを出す</b>（もう一度クリックで操作に戻る）')],
  ['<kbd>R</kbd>', L('리셋', 'リセット')],
  ['<kbd>M</kbd>', L('음소거', '消音')],
  ['<kbd>F</kbd>', L('전체화면', '全画面')],
  ['<kbd>H</kbd>', L('설정 패널', '設定パネル')],
];

/**
 * Tab 으로 여닫는 인벤토리 오버레이. 열리면 포인터락 해제·게임 입력 차단(main 이 `isOpen` 확인).
 * 클릭: 격자의 무기 → 장착 / 장착 슬롯 클릭 → 해제. 드래그로 슬롯 교환.
 */
export class InventoryUI {
  readonly el: HTMLElement;
  private grid: HTMLElement;
  private equipSlot: HTMLElement;
  private tooltip: HTMLElement;
  private dragFrom: number | null = null;
  isOpen = false;
  onToggle?: (open: boolean) => void;
  /** 기록물(`type: 'record'`)을 클릭했을 때 — 전용 뷰어를 여는 쪽에서 붙인다 */
  onUse?: (itemId: string) => void;

  constructor(private inv: Inventory) {
    this.el = document.createElement('div');
    this.el.id = 'inventory';
    this.el.className = 'inv hidden';
    this.el.innerHTML = `
      <div class="inv-panel">
        <div class="inv-head"><span class="inv-title">${L('인벤토리', '持ち物')}</span><span class="inv-hint">${L('<kbd>Tab</kbd> 닫기 · 클릭 장착/열기 · 드래그 이동', '<kbd>Tab</kbd> 閉じる · クリックで装備/開く · ドラッグで移動')}</span></div>
        <div class="inv-body">
          <div class="inv-equip">
            <div class="inv-label">${L('주무기', '主武器')}</div>
            <div class="inv-slot inv-slot-equip" data-equip="1"></div>
            <div class="inv-equipname"></div>
          </div>
          <div class="inv-grid"></div>
        </div>
        <div class="inv-keys">
          <div class="inv-keys-title">${L('조작', '操作')}</div>
          <dl>${KEYS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        </div>
        <div class="inv-tooltip hidden"></div>
      </div>`;
    document.body.appendChild(this.el);
    this.grid = this.el.querySelector('.inv-grid')!;
    this.equipSlot = this.el.querySelector('.inv-slot-equip')!;
    this.tooltip = this.el.querySelector('.inv-tooltip')!;

    for (let i = 0; i < inv.slots.length; i++) {
      const s = document.createElement('div');
      s.className = 'inv-slot';
      s.dataset['index'] = String(i);
      s.draggable = true;
      this.grid.appendChild(s);
    }
    this.grid.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot');
      if (!slot) return;
      const idx = Number(slot.dataset['index']);
      const item = inv.item(inv.slots[idx]?.itemId ?? null);
      if (item?.type === 'weapon') inv.equip(idx);
      // 기록물은 장착하는 게 아니라 **여는** 물건이다 (가족사진·명부·일기·문서)
      else if (item?.type === 'record') this.onUse?.(item.id);
    });
    this.equipSlot.addEventListener('click', () => inv.unequip());
    // 드래그 교환
    this.grid.addEventListener('dragstart', (e) => { const s = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot'); this.dragFrom = s ? Number(s.dataset['index']) : null; });
    this.grid.addEventListener('dragover', (e) => e.preventDefault());
    this.grid.addEventListener('drop', (e) => { e.preventDefault(); const s = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot'); if (s && this.dragFrom !== null) inv.swap(this.dragFrom, Number(s.dataset['index'])); this.dragFrom = null; });
    // 툴팁
    this.el.addEventListener('mousemove', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.inv-slot');
      const id = slot ? (slot.dataset['equip'] ? inv.mainhand : inv.slots[Number(slot.dataset['index'])]?.itemId ?? null) : null;
      const item = inv.item(id);
      if (!item) { this.tooltip.classList.add('hidden'); return; }
      this.tooltip.classList.remove('hidden');
      this.tooltip.innerHTML = `<b>${item.name}</b><br><span>${item.desc}</span>`
        + (item.weapon ? `<br><i>${L(`피해 ${item.weapon.damage} · 사거리 ${item.weapon.reach} m`, `威力 ${item.weapon.damage} · 間合い ${item.weapon.reach} m`)}</i>` : '');
      const r = this.el.getBoundingClientRect();
      this.tooltip.style.left = `${e.clientX - r.left + 14}px`; this.tooltip.style.top = `${e.clientY - r.top + 14}px`;
    });
    this.el.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));

    inv.on('change', () => this.render());
    inv.on('equip', () => this.render());
    window.addEventListener('keydown', (e) => { if (e.code === 'Tab') { e.preventDefault(); this.toggle(); } if (e.code === 'Escape' && this.isOpen) this.toggle(false); });
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
      el.innerHTML = item ? `${iconHTML(item.icon)}${s.count > 1 ? `<span class="inv-count">${s.count}</span>` : ''}` : '';
    });
    const eq = this.inv.equipped;
    this.equipSlot.classList.toggle('filled', !!eq);
    this.equipSlot.innerHTML = eq ? iconHTML(eq.icon) : '';
    this.el.querySelector('.inv-equipname')!.textContent = eq ? eq.name : L('비어 있음', '空');
  }
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
