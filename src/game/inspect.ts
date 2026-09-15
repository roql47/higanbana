import type * as THREE from 'three';
import { L } from '@/core/i18n';

/**
 * 조사 지점 레지스트리 (PLAN-STORY §4) — 비석·석판·기록물 같은 "E 로 읽는 것"의 공통 창구.
 * Rules(공물)와 별개다: 기본 E 키 처리는 main 에서 rules.interact 가 먼저, 실패하면 inspect.
 * 다만 조사점과 봉인된 공물이 겹치는 장소는 `inputPriority`로 조사 입력을 먼저 받을 수 있다.
 *
 * **꾹 누르기**(`hold`)는 ACT 3 이 요구한 것이다 — 스토리보드의 「플레이어가 표면을 닦으면」은
 * 한 번의 E 로는 성립하지 않는다. 닦는 데 시간이 걸려야 이끼가 벗겨지는 걸 **보게** 된다.
 * 이후 우물 밧줄·굳게 닫힌 문도 같은 장치를 쓴다.
 */
export interface InspectPoint {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  prompt: string;
  /** 1회성이면 사용 후 제거 */
  once: boolean;
  /** 발동. false 를 돌려주면 소모되지 않는다 (조건 미충족) */
  onUse: () => boolean | void;
  /** 조건부 노출 (없으면 항상) */
  enabled?: () => boolean;
  /** 공물 반경과 겹쳐도 이 조사점의 프롬프트·E 입력을 먼저 받는다 */
  inputPriority?: boolean;
  /** 바닥 기준 좌표를 쓰는 오브젝트의 표지자 높이. 기본 0.62 m. */
  markerLift?: number;
  /** >0 이면 그 초만큼 **꾹** 눌러야 발동한다. 손을 떼면 되감긴다 */
  hold?: number;
  /** 꾹 누르는 동안의 진행도 0~1 (되감김 포함). 소리·재질 갱신용 */
  onHold?: (p: number) => void;
}

export class Inspect {
  private points = new Map<string, InspectPoint>();
  private cells = new Map<string, Set<InspectPoint>>();
  private memberships = new Map<string, string[]>();
  private order = new Map<string, number>();
  private nextOrder = 0;
  private readonly cellSize = 8;
  private near: InspectPoint | null = null;
  private lastPrompt: string | null = null;
  /** 현재 대상의 꾹 누르기 진행도 0~1 */
  private hold = 0;

  constructor(private onPrompt: (t: string | null) => void) {}

  /** 조사 앵커는 고정 좌표다. 위치/반경을 바꿀 때는 같은 id로 add하여 공간 인덱스도 갱신한다. */
  add(p: InspectPoint) {
    const order = this.order.get(p.id) ?? this.nextOrder++;
    this.remove(p.id);
    this.points.set(p.id, p); this.order.set(p.id, order);
    if (p.radius <= 0 || ![p.pos.x, p.pos.z, p.radius].every(Number.isFinite)) return;
    const cells: string[] = [];
    for (let x = Math.floor((p.pos.x - p.radius) / this.cellSize); x <= Math.floor((p.pos.x + p.radius) / this.cellSize); x++) {
      for (let z = Math.floor((p.pos.z - p.radius) / this.cellSize); z <= Math.floor((p.pos.z + p.radius) / this.cellSize); z++) {
        const key = x + ':' + z;
        let bucket = this.cells.get(key);
        if (!bucket) this.cells.set(key, bucket = new Set());
        bucket.add(p); cells.push(key);
      }
    }
    this.memberships.set(p.id, cells);
  }
  remove(id: string) {
    const point = this.points.get(id);
    if (!point) return;
    for (const key of this.memberships.get(id) ?? []) {
      const cell = this.cells.get(key)!;
      cell.delete(point); if (!cell.size) this.cells.delete(key);
    }
    this.memberships.delete(id); this.order.delete(id); this.points.delete(id);
    if (this.near === point) {
      point.onHold?.(0); this.near = null; this.hold = 0; this.lastPrompt = null; this.onPrompt(null);
    }
  }
  /** HUD 게이지 — 대상이 없거나 꾹 누르기가 아니면 0 */
  get holdProgress() { return this.near?.hold ? this.hold : 0; }
  /** 월드 상호작용 표지자가 붙을 현재 조사점. 대상이 없으면 표시하지 않는다. */
  get targetPosition(): THREE.Vector3 | null { return this.near?.pos ?? null; }
  get targetMarkerLift() { return this.near?.markerLift ?? 0.62; }
  /** 현재 조사점이 Rules(공물)보다 입력 우선권을 요구하는가 */
  get hasInputPriority() { return this.near?.inputPriority === true; }

  /**
   * @param dt      꾹 누르기 진행에 쓴다 (0 이면 진행하지 않는다 — 사망·컷신 중)
   * @param holding E 를 누르고 있는가
   * @returns 현재 프롬프트 대상이 있는가
   */
  update(playerPos: THREE.Vector3, dt = 0, holding = false): boolean {
    const prev = this.near;
    this.near = null;
    let bestD = Infinity;
    let bestOrder = Infinity;
    const key = Math.floor(playerPos.x / this.cellSize) + ':' + Math.floor(playerPos.z / this.cellSize);
    for (const p of this.cells.get(key) ?? []) {
      const d = p.pos.distanceToSquared(playerPos);
      if (d >= p.radius * p.radius || (p.enabled && !p.enabled())) continue;
      const order = this.order.get(p.id)!;
      if (d < bestD || (d === bestD && order < bestOrder)) { bestD = d; bestOrder = order; this.near = p; }
    }
    // 대상이 바뀌면 진행도를 접는다 — 반쯤 닦다 자리를 뜨면 이끼는 그대로 있어야 한다
    if (this.near !== prev) { this.hold = 0; prev?.onHold?.(0); }
    const p = this.near;
    if (p?.hold) {
      // 되감김은 진행보다 **빠르다**(×2). 놓쳤을 때 처음부터가 아니라 "조금 되돌아간" 느낌이어야 한다
      const before = this.hold;
      this.hold = holding
        ? Math.min(1, this.hold + dt / p.hold)
        : Math.max(0, this.hold - (dt / p.hold) * 2);
      if (this.hold !== before) p.onHold?.(this.hold);
      if (this.hold >= 1) { this.hold = 0; this.fire(p); return this.near !== null; }
    }
    const prompt = p ? (p.hold ? L(`[E] 꾹 — ${p.prompt}`, `[E] 長押し — ${p.prompt}`) : `[E] ${p.prompt}`) : null;
    if (prompt !== this.lastPrompt) { this.lastPrompt = prompt; this.onPrompt(prompt); }
    return this.near !== null;
  }

  /** E 키 — 처리했으면 true. 꾹 누르기 지점은 update 가 맡으므로 소비만 한다 */
  interact(): boolean {
    if (!this.near) return false;
    if (this.near.hold) return true;
    this.fire(this.near);
    return true;
  }

  private fire(p: InspectPoint) {
    const r = p.onUse();
    if (r !== false && p.once) {
      // 완료한 닦기/열기 연출을 onHold(0)으로 되감지 않는다.
      this.near = null; this.hold = 0; this.lastPrompt = null;
      this.remove(p.id);
      this.onPrompt(null);
    }
  }
}
