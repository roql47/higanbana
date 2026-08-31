import type { Inspect } from '@/game/inspect';
import type { Dialogue, DialogueLine } from '@/story/dialogue';
import type * as THREE from 'three';

/**
 * 메인 진행과 분리된 선택 조사 이벤트.
 *
 * `StoryFlags.evidence` 에 넣으면 접두사를 잘못 고치는 순간 퀘스트 카운터나 공물 게이트에
 * 섞일 수 있다. 그래서 이 레지스트리는 현재 브라우저 세션의 별도 키만 사용한다.
 * 새 게임의 ACT·공물·엔딩 분기는 이 값을 읽지 않으며, 같은 세션에서 대사만 중복되지 않는다.
 */
const SESSION_KEY = 'higanbana.optional-foreshadows.v1';

export interface OptionalForeshadow {
  id: string;
  pos: THREE.Vector3;
  radius?: number;
  prompt: string;
  lines: DialogueLine[];
  enabled?: () => boolean;
  /** 조사 순간의 짧은 월드 반응. 진행 플래그를 바꾸는 용도로 쓰지 않는다. */
  onRead?: () => void;
}

export class OptionalForeshadows {
  private viewed = new Set<string>();

  constructor(private inspect: Inspect, private dialogue: Dialogue) {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) this.viewed = new Set(JSON.parse(raw) as string[]);
    } catch {
      // 저장소를 막은 브라우저에서도 조사 자체는 동작한다. 이 경우 현재 로드에서만 once가 보장된다.
    }
  }

  add(def: OptionalForeshadow) {
    this.inspect.add({
      id: `optional-foreshadow-${def.id}`,
      pos: def.pos,
      radius: def.radius ?? 1.7,
      prompt: def.prompt,
      once: true,
      enabled: () => !this.viewed.has(def.id) && (def.enabled?.() ?? true),
      onUse: () => {
        this.viewed.add(def.id);
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([...this.viewed])); } catch { /* 위와 동일 */ }
        def.onRead?.();
        void this.dialogue.say(...def.lines);
      },
    });
  }

  addAll(defs: OptionalForeshadow[]) { defs.forEach((def) => this.add(def)); }
}
