import type { Inventory } from './inventory';

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
        <div class="inv-head"><span class="inv-title">인벤토리</span><span class="inv-hint"><kbd>Tab</kbd> 닫기 · 클릭 장착/열기 · 드래그 이동</span></div>
        <div class="inv-body">
          <div class="inv-equip">
            <div class="inv-label">주무기</div>
            <div class="inv-slot inv-slot-equip" data-equip="1"></div>
            <div class="inv-equipname"></div>
          </div>
          <div class="inv-grid"></div>
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
      this.tooltip.innerHTML = `<b>${item.name}</b><br><span>${item.desc}</span>` + (item.weapon ? `<br><i>피해 ${item.weapon.damage} · 사거리 ${item.weapon.reach} m</i>` : '');
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
    this.el.querySelector('.inv-equipname')!.textContent = eq ? eq.name : '비어 있음';
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
