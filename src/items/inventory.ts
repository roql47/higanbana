import { ITEMS, type ItemDef } from './items';

export interface InventorySlot { itemId: string | null; count: number }
export type InventoryEvent = 'change' | 'equip';

const STORAGE_KEY = '3dm.inventory.v1';

/** 12칸 격자 + 주무기 슬롯. localStorage 에 저장. */
export class Inventory {
  readonly slots: InventorySlot[] = Array.from({ length: 12 }, () => ({ itemId: null, count: 0 }));
  mainhand: string | null = null;
  private listeners: Record<InventoryEvent, Set<() => void>> = { change: new Set(), equip: new Set() };

  constructor() { this.load(); }

  on(ev: InventoryEvent, fn: () => void) { this.listeners[ev].add(fn); return () => this.listeners[ev].delete(fn); }
  private emit(ev: InventoryEvent) { for (const fn of this.listeners[ev]) fn(); this.save(); }

  item(id: string | null): ItemDef | null { return id ? ITEMS[id] ?? null : null; }
  get equipped(): ItemDef | null { return this.item(this.mainhand); }

  add(itemId: string, count = 1): boolean {
    if (!ITEMS[itemId]) return false;
    // 같은 아이템 스택(무기는 스택 안 함)
    const def = ITEMS[itemId]!;
    if (def.type !== 'weapon') {
      const s = this.slots.find((x) => x.itemId === itemId);
      if (s) { s.count += count; this.emit('change'); return true; }
    }
    const empty = this.slots.find((x) => !x.itemId);
    if (!empty) return false;
    empty.itemId = itemId; empty.count = count;
    this.emit('change');
    return true;
  }

  has(itemId: string) { return this.slots.some((s) => s.itemId === itemId) || this.mainhand === itemId; }

  /** 격자 슬롯 → 주무기. 기존 무기는 격자로 내려감 */
  equip(slotIndex: number) {
    const s = this.slots[slotIndex];
    if (!s?.itemId) return;
    const def = ITEMS[s.itemId]!;
    if (def.type !== 'weapon') return;
    const prev = this.mainhand;
    this.mainhand = s.itemId;
    s.itemId = prev; s.count = prev ? 1 : 0;
    this.emit('change'); this.emit('equip');
  }

  unequip() {
    if (!this.mainhand) return;
    const empty = this.slots.find((x) => !x.itemId);
    if (!empty) return;
    empty.itemId = this.mainhand; empty.count = 1;
    this.mainhand = null;
    this.emit('change'); this.emit('equip');
  }

  swap(a: number, b: number) {
    if (a === b) return;
    const sa = this.slots[a]!, sb = this.slots[b]!;
    const t = { ...sa }; sa.itemId = sb.itemId; sa.count = sb.count; sb.itemId = t.itemId; sb.count = t.count;
    this.emit('change');
  }

  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ slots: this.slots, mainhand: this.mainhand })); } catch { /* ignore */ }
  }
  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { slots?: InventorySlot[]; mainhand?: string | null };
      data.slots?.forEach((s, i) => { if (this.slots[i] && (!s.itemId || ITEMS[s.itemId])) { this.slots[i]!.itemId = s.itemId; this.slots[i]!.count = s.count; } });
      this.mainhand = data.mainhand && ITEMS[data.mainhand] ? data.mainhand : null;
    } catch { /* ignore */ }
  }
}
