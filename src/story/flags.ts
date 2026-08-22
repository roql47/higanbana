/**
 * 스토리 플래그 + 체크포인트 저장 (PLAN-STORY §6.2, §7.1)
 *
 * 저장은 체크포인트 시점(지장 참배·봉납·ACT 전환)에만 한다 — 추격 중 상태(요괴 FSM·
 * 소음 이벤트)는 직렬화 대상이 아니다. 그래서 저장 데이터는 "플래그 + 월드 요약"이면 충분하다.
 */

/** 엔딩 분기의 입력 (PLAN-STORY §7.1). HUD 에 숫자를 노출하지 않는다 (§6.3) */
export interface StoryFlags {
  /** 1부: 신사에 봉납한 공물 수 (봉인 해제 단계) */
  offered: number;
  /** 2부: 원래 자리로 되돌린 공물 수 */
  seals: number;
  /** 원혼별 성불 여부 — key: 'shrine-hokora' | 'school' | 'well' | 'graveyard' | 'inn' | 'manor' */
  regrets: Record<string, boolean>;
  /** 수집한 명부 이름 id 목록 (0~87) */
  roster: string[];
  /** 사요의 일기 발견 */
  diary: boolean;
  /** 처마에서 초칭을 얻었는가 (각색 6 C안 — 미오는 빈손으로 내린다) */
  chochin: boolean;
  /** 폰을 한 번이라도 켜 봤는가 — 공고판 대사 한 줄이 이걸 읽는다 */
  phone: boolean;
  /** 봉인패로 강제 소멸시킨 원혼 수 — 1 이상이면 진엔딩 차단 */
  banished: number;
  /** 금기 三 위반(이름 부름에 대답) 횟수 */
  answered: number;
  /** 사망 횟수 */
  deaths: number;
  /** 최종장 종 (0~7) */
  bell: number;
  /** 현재 챕터 id (예: 'act05') — 로드 시 복귀 지점 */
  chapter: string;
}

export function defaultFlags(): StoryFlags {
  return {
    offered: 0,
    seals: 0,
    regrets: {},
    roster: [],
    diary: false,
    chochin: false,
    phone: false,
    banished: 0,
    answered: 0,
    deaths: 0,
    bell: 0,
    chapter: 'act02',
  };
}

export interface SavePayload {
  v: 1;
  t: number; // Date.now()
  flags: StoryFlags;
  /** 씬별 요약 상태 (수집된 공물 id, 열린 문 등) — 내용은 챕터 구현이 정한다 */
  world?: Record<string, unknown>;
}

export class StorySave {
  constructor(private slot = 0) {}
  private get key() { return `higanbana.save.${this.slot}`; }

  /** @returns 저장 성공 여부 (시크릿 모드 등 localStorage 불가 환경은 조용히 false) */
  checkpoint(flags: StoryFlags, world?: Record<string, unknown>): boolean {
    const payload: SavePayload = { v: 1, t: Date.now(), flags, ...(world ? { world } : {}) };
    try { localStorage.setItem(this.key, JSON.stringify(payload)); return true; }
    catch { return false; }
  }

  peek(): SavePayload | null {
    try {
      const s = localStorage.getItem(this.key);
      if (!s) return null;
      const p = JSON.parse(s) as SavePayload;
      return p && p.v === 1 ? p : null;
    } catch { return null; }
  }

  clear() { try { localStorage.removeItem(this.key); } catch { /* noop */ } }
}
