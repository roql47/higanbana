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

  constructor(private inv: Inventory) {
    this.el = document.createElement('div');
    this.el.id = 'inventory';
    this.el.className = 'inv hidden';
    this.el.innerHTML = `
      <div class="inv-panel">
        <div class="inv-head"><span class="inv-title">인벤토리</span><span class="inv-hint"><kbd>Tab</kbd> 닫기 · 클릭 장착/해제 · 드래그 이동</span></div>
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
      el.innerHTML = item ? `<span class="inv-icon">${item.icon}</span>${s.count > 1 ? `<span class="inv-count">${s.count}</span>` : ''}` : '';
    });
    const eq = this.inv.equipped;
    this.equipSlot.classList.toggle('filled', !!eq);
    this.equipSlot.innerHTML = eq ? `<span class="inv-icon">${eq.icon}</span>` : '';
    this.el.querySelector('.inv-equipname')!.textContent = eq ? eq.name : '비어 있음';
  }
}
