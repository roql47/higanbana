import {
  STORYBOARD_REVISION,
  normalizeStoryProgress,
  type StoryPhaseId,
} from './phases';
import type { Act17State } from './act17';

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
  /** 조사·기억 대조에서 확인한 단서와 해석 id. 획득/진행 게이트와 이어하기에 사용한다. */
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
  act17?: Act17State;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string'))] : [];
}

/** 저장 JSON은 구버전·부분 저장일 수 있으므로 런타임 타입을 그대로 신뢰하지 않는다. */
function readFlags(raw: Record<string, unknown>): StoryFlags {
  const flags = defaultFlags();
  for (const key of ['offered', 'seals', 'banished', 'answered', 'deaths', 'bell'] as const) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) flags[key] = v;
  }
  flags.offered = Math.min(6, flags.offered);
  flags.seals = Math.min(6, flags.seals);
  flags.bell = Math.min(7, flags.bell);
  for (const key of ['diary', 'chochin', 'phone'] as const) {
    if (typeof raw[key] === 'boolean') flags[key] = raw[key];
  }
  flags.phoneBattery = typeof raw.phoneBattery === 'number' && Number.isFinite(raw.phoneBattery)
    ? Math.max(0, Math.min(100, raw.phoneBattery)) : flags.phone ? 86 : 92;
  flags.roster = strings(raw.roster);
  flags.evidence = strings(raw.evidence);
  if (isRecord(raw.regrets)) {
    flags.regrets = Object.fromEntries(Object.entries(raw.regrets)
      .filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  }
  // 기본 act=2를 먼저 섞으면 chapter만 있는 구버전 저장의 진행을 잃는다.
  const progress = normalizeStoryProgress({
    chapter: typeof raw.chapter === 'string' ? raw.chapter : flags.chapter,
    ...(typeof raw.act === 'number' && Number.isFinite(raw.act) ? { act: raw.act } : {}),
  });
  return Object.assign(flags, progress);
}

function readWorld(raw: Record<string, unknown>): StoryWorldState {
  const world: StoryWorldState = { offered: strings(raw.offered), carried: strings(raw.carried) };
  if (raw.act17 === 'unseen' || raw.act17 === 'pending' || raw.act17 === 'complete') world.act17 = raw.act17;
  for (const key of ['rulesStarted', 'fudaRefused', 'tabletRead', 'tabletEventReady', 'restoreWarningReady',
    'restoreFirstDone', 'photoMessageRevealed', 'wellPreludeHeard', 'schoolPreludeHeard', 'graveyardPreludeHeard'] as const) {
    if (typeof raw[key] === 'boolean') world[key] = raw[key];
  }
  for (const key of ['suzuWardOrder', 'wellNicheOrder'] as const) {
    const value = raw[key];
    world[key] = Array.isArray(value)
      ? [...new Set(value.filter((v): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0))] : [];
  }
  const p = raw.player;
  if (isRecord(p) && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number'
    && [p.x, p.y, p.z].every((n) => Number.isFinite(n) && Math.abs(n) < 500)) {
    world.player = { x: p.x, y: p.y, z: p.z };
    if (typeof p.yaw === 'number' && Number.isFinite(p.yaw)) world.player.yaw = p.yaw;
    if (typeof p.cameraYaw === 'number' && Number.isFinite(p.cameraYaw)) world.player.cameraYaw = p.cameraYaw;
  }
  return world;
}

export class StorySave {
  constructor(private slot = 0) {}
  private get key() { return `higanbana.save.${this.slot}`; }
  private get backupKey() { return `${this.key}.backup`; }
  lastReadSource: 'primary' | 'backup' | null = null;
  lastSavedAt: number | undefined;

  /** @returns 저장 성공 여부 (시크릿 모드 등 localStorage 불가 환경은 조용히 false) */
  checkpoint(flags: StoryFlags, world?: StoryWorldState): boolean {
    // 동기 JSON 직렬화 자체가 스냅숏을 만든다. 복제→파싱→재직렬화를 할 필요가 없다.
    const payload: SavePayload = { v: 1, t: Date.now(), flags, ...(world ? { world } : {}) };
    try {
      const next = JSON.stringify(payload);
      const previous = localStorage.getItem(this.key);
      // 손상된 최신 저장으로 정상 백업을 덮지 않는다.
      if (parseSave(previous)) localStorage.setItem(this.backupKey, previous!);
      localStorage.setItem(this.key, next);
      this.lastSavedAt = payload.t;
      return true;
    }
    catch { return false; }
  }

  peek(): SavePayload | null {
    this.lastReadSource = null;
    for (const [key, source] of [[this.key, 'primary'], [this.backupKey, 'backup']] as const) {
      try {
        const payload = parseSave(localStorage.getItem(key));
        if (payload) {
          this.lastReadSource = source;
          this.lastSavedAt = payload.t > 0 ? payload.t : undefined;
          return payload;
        }
      } catch { /* 기본 저장 접근 실패 시에도 백업을 시도한다 */ }
    }
    return null;
  }

  clear(): boolean {
    try {
      // 백업 삭제 실패 시 최신 저장은 남겨 둔다. 새 게임은 실패를 확인하고 취소한다.
      localStorage.removeItem(this.backupKey);
      localStorage.removeItem(this.key);
      this.lastReadSource = null;
      this.lastSavedAt = undefined;
      return true;
    } catch { return false; }
  }
}

function parseSave(raw: string | null): SavePayload | null {
  if (!raw) return null;
  try {
    const p: unknown = JSON.parse(raw);
    if (!isRecord(p) || p.v !== 1 || !isRecord(p.flags)) return null;
    return {
      v: 1, t: typeof p.t === 'number' && Number.isFinite(p.t) ? p.t : 0,
      flags: readFlags(p.flags),
      ...(isRecord(p.world) ? { world: readWorld(p.world) } : {}),
    };
  } catch { return null; }
}
