import {
  STORYBOARD_REVISION,
  normalizeStoryProgress,
  type StoryPhaseId,
} from './phases';

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
  /** 휴대폰 배터리 잔량. 꺼내는 컷신마다 감소하며 체크포인트에 보존된다. */
  phoneBattery: number;
  /** 봉인패로 강제 소멸시킨 원혼 수 — 1 이상이면 진엔딩 차단 */
  banished: number;
  /** 금기 三 위반(이름 부름에 대답) 횟수 */
  answered: number;
  /** ACT 1~11 조사 퍼즐에서 확보한 단서 id. 공물 획득 게이트와 이어하기에 사용한다. */
  evidence: string[];
  /** 사망 횟수 */
  deaths: number;
  /** 최종장 종 (0~7) */
  bell: number;
  /** 현재 챕터 id (예: 'act05') — 로드 시 복귀 지점 */
  chapter: string;
  /** 개정 스토리보드의 현재 ACT (1~35). chapter는 구 세이브 호환용 문자열이다. */
  act: number;
  /** 35 ACT를 이야기 전환점으로 묶은 현재 phase */
  phase: StoryPhaseId;
  /** 적용된 `higanbana_full_storyboard_revised.md` 진행 스키마 버전 */
  storyboardRevision: number;
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
    // 첫 버스 컷신에서 6%가 빠져 기존 화면의 86%로 보이도록 시작값을 92로 둔다.
    phoneBattery: 92,
    banished: 0,
    answered: 0,
    evidence: [],
    deaths: 0,
    bell: 0,
    chapter: 'act02',
    act: 2,
    phase: 'arrival',
    storyboardRevision: STORYBOARD_REVISION,
  };
}

/** 체크포인트에서 되살릴 수 있는 최소 월드 상태. 추격 AI·소음처럼 순간적인 값은 저장하지 않는다. */
export interface StoryWorldState {
  offered?: string[];
  carried?: string[];
  rulesStarted?: boolean;
  fudaRefused?: boolean;
  player?: { x: number; y: number; z: number; yaw?: number; cameraYaw?: number };
  tabletRead?: boolean;
  tabletEventReady?: boolean;
  restoreWarningReady?: boolean;
  restoreFirstDone?: boolean;
  photoMessageRevealed?: boolean;
  wellPreludeHeard?: boolean;
  schoolPreludeHeard?: boolean;
  graveyardPreludeHeard?: boolean;
  /** ACT 6에서 플레이어가 실제로 금줄을 푼 순서(0=왼쪽 에마, 1=오른쪽 에마, 2=제단 측면). */
  suzuWardOrder?: number[];
  /** ACT 10 벽감 자유 조사 순서. 3번째는 침수되고 1번째 뒤에는 우회 포켓이 열린다. */
  wellNicheOrder?: number[];
}

export interface SavePayload {
  v: 1;
  t: number; // Date.now()
  flags: StoryFlags;
  /** 씬별 요약 상태 (수집된 공물 id, 열린 문 등) — 내용은 챕터 구현이 정한다 */
  world?: StoryWorldState;
}

export class StorySave {
  constructor(private slot = 0) {}
  private get key() { return `higanbana.save.${this.slot}`; }

  /** @returns 저장 성공 여부 (시크릿 모드 등 localStorage 불가 환경은 조용히 false) */
  checkpoint(flags: StoryFlags, world?: StoryWorldState): boolean {
    // 호출 뒤 flags/evidence가 바뀌어도 저장 스냅숏이 따라 변하지 않도록 JSON 직렬화 가능한 값만 복제한다.
    const frozenFlags = { ...flags, regrets: { ...flags.regrets }, roster: [...flags.roster], evidence: [...flags.evidence] };
    const frozenWorld = world ? JSON.parse(JSON.stringify(world)) as StoryWorldState : undefined;
    const payload: SavePayload = { v: 1, t: Date.now(), flags: frozenFlags, ...(frozenWorld ? { world: frozenWorld } : {}) };
    try { localStorage.setItem(this.key, JSON.stringify(payload)); return true; }
    catch { return false; }
  }

  peek(): SavePayload | null {
    try {
      const s = localStorage.getItem(this.key);
      if (!s) return null;
      const p = JSON.parse(s) as SavePayload;
      if (!p || p.v !== 1 || !p.flags) return null;
      if (!Array.isArray(p.flags.evidence)) p.flags.evidence = [];
      if (!Number.isFinite(p.flags.phoneBattery)) p.flags.phoneBattery = p.flags.phone ? 86 : 92;
      // 초창기 저장은 chapter만 갖고 있다. 읽는 순간 phase/act를 보강해 이후 코드는 한 계약만 쓴다.
      normalizeStoryProgress(p.flags);
      if (p.world) {
        if (!Array.isArray(p.world.offered)) p.world.offered = [];
        if (!Array.isArray(p.world.carried)) p.world.carried = [];
        if (!Array.isArray(p.world.suzuWardOrder)) p.world.suzuWardOrder = [];
        if (!Array.isArray(p.world.wellNicheOrder)) p.world.wellNicheOrder = [];
      }
      return p;
    } catch { return null; }
  }

  clear() { try { localStorage.removeItem(this.key); } catch { /* noop */ } }
}
