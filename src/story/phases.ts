/**
 * 개정 스토리보드(`higanbana_full_storyboard_revised.md`)의 런타임 진행표.
 *
 * 35개 ACT를 그대로 한 덩어리로 다루면 구현된 구간과 아직 제작 전인 구간의 경계가
 * 흐려진다. 이야기가 방향을 바꾸는 지점을 기준으로 여섯 phase로 고정하고, 세이브에는
 * `chapter`와 함께 phase/act를 기록한다. `chapter`는 기존 세이브 호환을 위해 남긴다.
 */

export const STORYBOARD_REVISION = 2 as const;

export type StoryPhaseId =
  | 'arrival'
  | 'false_ritual'
  | 'truth'
  | 'restoration'
  | 'choice'
  | 'true_end';

export interface StoryPhaseDef {
  id: StoryPhaseId;
  no: number;
  acts: readonly [number, number];
  title: string;
  purpose: string;
  /** 현재 빌드에서 플레이 가능한가. 제작 범위 확인용이며 세이브 판정에는 쓰지 않는다. */
  implementation: 'playable' | 'partial' | 'planned';
}

export const STORY_PHASES: readonly StoryPhaseDef[] = [
  {
    id: 'arrival', no: 1, acts: [1, 5], title: '돌아오지 않은 여름',
    purpose: '붉은 꽃밭, 종점, 세 가지 금기, 거짓된 탈출법', implementation: 'playable',
  },
  {
    id: 'false_ritual', no: 2, acts: [6, 15], title: '일곱 공물',
    purpose: '탐색과 추격을 반복하며 자신도 모르게 봉인을 해제한다', implementation: 'partial',
  },
  {
    id: 'truth', no: 3, acts: [16, 23], title: '피안제의 진상',
    purpose: '참사의 진실, 사요와의 재회, 퀘스트 UI의 배신', implementation: 'planned',
  },
  {
    id: 'restoration', no: 4, acts: [24, 26], title: '일곱 개의 미련',
    purpose: '공물을 원래 자리로 돌리고 죽은 자의 이름을 되찾는다', implementation: 'planned',
  },
  {
    id: 'choice', no: 5, acts: [27, 27], title: '마지막 선택',
    purpose: '누구를 희생할지, 혹은 누구도 희생하지 않을지 선택한다', implementation: 'planned',
  },
  {
    id: 'true_end', no: 6, acts: [28, 35], title: '피안화',
    purpose: '백귀야행, 마지막 탈출, 자매의 작별과 에필로그', implementation: 'planned',
  },
] as const;

export interface StoryActDef {
  no: number;
  title: string;
  phase: StoryPhaseId;
}

/** 개정본 부록의 35 ACT 목록. 후속 구현은 임의 chapter 문자열 대신 이 표를 기준으로 붙인다. */
const ACT_TITLES = [
  '붉은 꽃밭', '종점', '세 가지 금기', '끝나지 않은 축제', '거짓된 탈출법',
  '붉은 방울', '첫 번째 봉인 해제', '얼굴 없는 학생', '어린아이의 글', '우물 아래의 목소리',
  '공물이 사라졌습니다', '죽은 아이들의 놀이', '거울 속 축제', '방울을 집은 아이', '촌장의 저택',
  '피안제 참사', '열면 안 되는 문', '퀘스트를 준 자', '자매의 재회', '언니가 있으니까',
  '살아남은 아이와 거짓된 기록', '이제는 알고 있잖아', '게임 시스템의 배신', '피안의 밤', '일곱 개의 미련',
  '귀신들이 길을 열다', '마지막 선택', '백귀야행', '피안화 길', '잊히는 것이 무서웠어',
  '행복하게 살아', '뒤돌아보지 마', '남은 방울', '1년 후', '한 송이',
] as const;

export const STORY_ACTS: readonly StoryActDef[] = ACT_TITLES.map((title, i) => {
  const no = i + 1;
  return { no, title, phase: phaseForActNumber(no).id };
});

export interface MutableStoryProgress {
  chapter: string;
  act: number;
  phase: StoryPhaseId;
  storyboardRevision: number;
}

export function phaseForAct(act: number): StoryPhaseDef {
  const n = clampAct(act);
  return phaseForActNumber(n);
}

export function actDef(act: number) { return STORY_ACTS[clampAct(act) - 1]!; }

export function actFromChapter(chapter: string): number {
  const match = /^act(\d{1,2})$/i.exec(chapter);
  return match ? clampAct(Number(match[1])) : 2;
}

/** ACT 전환의 단일 진입점. chapter/act/phase가 서로 어긋나지 않게 한 번에 갱신한다. */
export function setStoryAct(progress: MutableStoryProgress, act: number): StoryPhaseDef {
  const n = clampAct(act);
  const phase = phaseForAct(n);
  progress.act = n;
  progress.chapter = `act${String(n).padStart(2, '0')}`;
  progress.phase = phase.id;
  progress.storyboardRevision = STORYBOARD_REVISION;
  return phase;
}

/** v1 세이브처럼 chapter만 있는 데이터를 개정 진행 상태로 올린다. */
export function normalizeStoryProgress<T extends Partial<MutableStoryProgress> & { chapter?: string }>(progress: T): T & MutableStoryProgress {
  const act = typeof progress.act === 'number' ? clampAct(progress.act) : actFromChapter(progress.chapter ?? 'act02');
  const phase = phaseForAct(act);
  return Object.assign(progress, {
    act,
    chapter: `act${String(act).padStart(2, '0')}`,
    phase: phase.id,
    storyboardRevision: STORYBOARD_REVISION,
  });
}

function clampAct(act: number) {
  return Math.max(1, Math.min(35, Math.round(Number.isFinite(act) ? act : 2)));
}

function phaseForActNumber(act: number): StoryPhaseDef {
  return STORY_PHASES.find((p) => act >= p.acts[0] && act <= p.acts[1]) ?? STORY_PHASES[0]!;
}
