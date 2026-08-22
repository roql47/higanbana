/**
 * 아이템 정의. 무기는 손 본에 붙는 오프셋과 공격 데이터를 가진다.
 *
 * `record`(기록물) — **읽는 물건**이다. 장착하지 않고 인벤에서 클릭하면 전용 뷰어가 열린다.
 * 가족사진이 첫 번째고, 뒤에 명부·사요의 일기·저택 문서 3종이 전부 이 종류로 들어온다
 * (PLAN-STORY §4.3 수집물). 그래서 `misc` 에 섞지 않고 따로 뒀다 —
 * 「쓸 데 없는 물건」과 「이야기를 여는 물건」은 인벤에서 구분돼야 한다.
 */
export type ItemType = 'weapon' | 'misc' | 'record';

/** 하나의 긴 콤보 클립에서 잘라 쓰는 한 타 */
export interface ComboStep {
  from: number; // 클립 시간(초) 시작
  to: number;   // 끝 (다음 타의 from 과 이어짐 → 연타 시 끊김 없음)
  hitFrom: number; hitTo: number; // 판정 구간(클립 시간)
  dmg: number;  // 데미지 배율
  step: number; // 전진 임펄스(m/s)
  shake: number; hitstop: number;
}

export interface WeaponData {
  style?: 'clip' | 'slash-h' | 'clip-combo'; // clip-combo = Mixamo 콤보 클립 구간 재생(기본)
  /** style=clip-combo 일 때 사용할 클립과 구간들 */
  comboClip?: string;
  combo?: ComboStep[];
  clip: string; // 공격 애니 클립 이름 (style=clip 일 때)
  clipStart: number; // 클립에서 재생을 시작할 시간(초) — 프리셋 앞부분의 대기 구간을 건너뜀
  timeScale: number; // 재생 속도
  damage: number;
  reach: number; // 손 위치에서 칼끝까지의 판정 거리(m)
  radius: number; // 판정 구 반경(m)
  activeFrom: number; // 클립 시간(초) — 판정 시작
  activeTo: number; // 판정 끝
  duration: number; // 공격 총 길이(초, 이 시간 동안 재공격 불가)
  moveSlow: number; // 공격 중 이동속도 배율
}

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  desc: string;
  icon: string; // 이모지 또는 이미지 URL
  model?: string;
  /** 오른손(R_Hand) 본 기준 로컬 오프셋 — 무기별로 한 번 맞춘다 */
  grip?: { pos: [number, number, number]; rot: [number, number, number]; scale: number };
  /** 모델의 자루가 긴 축의 최대쪽에 있으면 true (자동 감지 실패 시 수동 지정) */
  hiltAtMax?: boolean;
  /** 칼집 위치 (Spine02 본 기준) */
  sheath?: { bone: string; pos: [number, number, number]; rot: [number, number, number] };
  weapon?: WeaponData;
}

export const ITEMS: Record<string, ItemDef> = {
  sword: {
    id: 'sword',
    name: '여행자의 검',
    type: 'weapon',
    desc: '가볍고 균형 잡힌 롱소드. 좌클릭/J 로 벤다.',
    icon: '🗡️',
    model: '/models/items/sword.glb',
    // 초기값 — 툴(H 패널 Weapon 폴더)로 맞춘 뒤 갱신
    grip: { pos: [0, -0.045, 0.02], rot: [0, 0, 0], scale: 0.92 }, // 자루가 주먹 안, 칼날은 손가락 방향(2026-08-18 확인)
    sheath: { bone: 'Spine02', pos: [-0.18, -0.3, 0.076], rot: [2.83, -0.26, -0.02] }, // 왼쪽 엉덩이, 아래·뒤로
    // Tripo preset:biped:slash 는 6.6 s 짜리(대기 1 s → 들어올림 1.0~1.9 s → 휘두름 2.0~2.2 s → 회수 ~2.7 s). 1.15 s 부터 1.6× 로 1.0 s 재생
    // Mixamo "One Hand Sword Combo" 를 우리 리그로 리타게팅한 5.6 s 클립에서 3타를 잘라 쓴다
    // (손 속도 분석: 타격 피크 1.15 / 2.42 / 3.73 s, 사이 골짜기 1.72 / 2.57 s)
    weapon: {
      style: 'clip-combo', comboClip: 'sword_combo',
      combo: [
        { from: 0.62, to: 1.72, hitFrom: 1.10, hitTo: 1.50, dmg: 1.0, step: 2.2, shake: 0.35, hitstop: 0.06 },
        { from: 1.72, to: 2.62, hitFrom: 2.30, hitTo: 2.60, dmg: 1.2, step: 2.4, shake: 0.45, hitstop: 0.07 },
        { from: 2.62, to: 4.30, hitFrom: 3.60, hitTo: 3.95, dmg: 1.6, step: 3.4, shake: 0.80, hitstop: 0.11 },
      ],
      clip: 'slash', clipStart: 1.15, timeScale: 1.6, damage: 25, reach: 1.35, radius: 0.62,
      activeFrom: 0.19, activeTo: 0.36, duration: 0.67, moveSlow: 0.5,
    },
  },
  apple: {
    id: 'apple',
    name: '들사과',
    type: 'misc',
    desc: '섬 어딘가에서 주웠다. 아직 쓸 데는 없다.',
    icon: '🍎',
  },
  photo: {
    id: 'photo',
    name: '가족사진',
    type: 'record',
    // 「기억하지 못한다」를 설명하지 않는다. 사진을 열면 보인다
    desc: '어린 미오와 언니. 언니의 얼굴만 물에 번진 것처럼 지워져 있다.',
    icon: '🖼️',
  },
};
