/**
 * 히간바나 사운드 소스 목록 — `node scripts/audio/fetch.ts` 가 읽는다.
 *
 * 키 하나 = 게임이 재생하는 소리 하나(variation 여러 개). 소스는 **우선순위 순서**로 적고,
 * 첫 번째로 성공한 소스만 쓴다 (Freesound 는 FREESOUND_API_KEY 가 없으면 건너뛰고 다음 소스로).
 *
 * 라이선스 정책: CC0 / Public domain 우선, CC BY(표기 필요)는 허용 — CREDITS.md 에 자동 기록.
 * CC BY-SA · NC 는 쓰지 않는다 (fetch.ts 가 거른다).
 *
 * provider:
 *   kenney    { pack, files }                       kenney.nl 팩(CC0). 페이지에서 zip 링크를 찾아 받는다
 *   zip       { url, files, license, author, source } 임의 zip 안의 파일들
 *   url       { url, license, author, source, title }  단일 파일
 *   wikimedia { title }                              Wikimedia Commons 파일 — 라이선스/저자를 API 에서 읽는다
 *   freesound { id } | { query, filter?, pick?, sort?, minDur?, maxDur? }  Freesound API (HQ preview ogg)
 */

export type Provider = 'kenney' | 'zip' | 'url' | 'wikimedia' | 'freesound';

export interface LoopSpec { start: number; end: number; xfade: number }

export interface SourceSpec {
  provider: Provider;
  // kenney
  pack?: string;
  // zip / kenney: 압축 안 경로 (정확한 경로, 또는 '*' 글롭)
  files?: string[];
  // url / zip
  url?: string;
  title?: string;
  license?: string;
  author?: string;
  source?: string;
  // wikimedia
  wmTitle?: string;
  // freesound
  id?: number;
  query?: string;
  filter?: string;
  sort?: string;
  pick?: number;
  minDur?: number;
  maxDur?: number;
  // 공통 가공
  trim?: [number, number];      // [시작, 끝] 초 — 이 구간만 쓴다
  slices?: [number, number][];  // 한 파일에서 여러 원샷을 잘라낸다 (trim 대신)
  loop?: LoopSpec;              // 크로스페이드 루프 구간 (loop 종류일 때)
  gainDb?: number;              // 정규화 뒤 추가 보정
  fadeIn?: number;              // 초 (원샷 기본 0)
  fadeOut?: number;             // 초 (원샷 기본 0.006 — 잘라낸 구간이 울림 중간이면 길게)
  rate?: number;                // 재생속도 배율 (피치도 같이 변함) — 0.9 = 10% 느리고 낮게
  hp?: number;                  // 하이패스 Hz
  lp?: number;                  // 로우패스 Hz
  note?: string;
}

export interface SoundDef {
  key: string;
  kind: 'oneshot' | 'loop';
  /** 런타임 기본 게인 (manifest 에 실린다) */
  gain?: number;
  /** 원샷 기본 true(패너 호환), 루프 기본 false. 위치 기반 루프는 true 로 */
  mono?: boolean;
  /** 최대 variation 개수 */
  max?: number;
  /** 원샷 앞뒤 무음 제거 (기본 true) */
  tight?: boolean;
  sources: SourceSpec[];
  note: string;
}

const KENNEY_IMPACT = (names: string[]): SourceSpec => ({ provider: 'kenney', pack: 'impact-sounds', files: names.map((n) => `Audio/${n}.ogg`) });
const KENNEY_RPG = (names: string[]): SourceSpec => ({ provider: 'kenney', pack: 'rpg-audio', files: names.map((n) => `Audio/${n}.ogg`) });
const seq = (prefix: string, n: number, pad = 3) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(pad, '0')}`);

/** OpenGameArt "Footsteps on different surfaces" (congusbongus) — 폴더별 라이선스가 다르다 (license.txt 확인됨) */
const OGA_FOOTSTEPS = 'https://opengameart.org/sites/default/files/footsteps_0.zip';
const OGA_FOOTSTEPS_PAGE = 'https://opengameart.org/content/footsteps-on-different-surfaces';

const CC0 = 'CC0 1.0';

export const SOUNDS: SoundDef[] = [
  // ───────────────────────── 발소리 (플레이어) ─────────────────────────
  {
    key: 'foot/gravel', kind: 'oneshot', gain: 0.9, note: '참배로 자갈 — 가장 많이 들리는 소리',
    sources: [
      { provider: 'freesound', query: 'footsteps gravel single', filter: 'tag:footsteps', pick: 8, minDur: 0.15, maxDur: 1.2 },
      { provider: 'zip', url: OGA_FOOTSTEPS, files: ['footsteps/gravel/*.ogg'], license: CC0, author: 'Ali_6868 (Freesound "Gravel Footsteps" pack) · mastered by congusbongus', source: OGA_FOOTSTEPS_PAGE, title: 'Footsteps on different surfaces — gravel' },
    ],
  },
  {
    key: 'foot/dirt', kind: 'oneshot', gain: 0.85, note: '마른 흙 논두렁·봉당',
    sources: [
      { provider: 'freesound', query: 'footsteps dirt path', filter: 'tag:footsteps', pick: 8, minDur: 0.15, maxDur: 1.2 },
      KENNEY_IMPACT(seq('footstep_carpet_', 5)),
    ],
  },
  {
    key: 'foot/grass', kind: 'oneshot', gain: 0.8, note: '들풀',
    sources: [
      { provider: 'freesound', query: 'footsteps grass single', filter: 'tag:footsteps', pick: 8, minDur: 0.15, maxDur: 1.2 },
      KENNEY_IMPACT(seq('footstep_grass_', 5)),
    ],
  },
  {
    key: 'foot/wood', kind: 'oneshot', gain: 0.85, note: '폐가 마루·툇마루',
    sources: [
      { provider: 'freesound', query: 'footsteps wooden floor creaky', filter: 'tag:footsteps', pick: 8, minDur: 0.15, maxDur: 1.2 },
      KENNEY_IMPACT(seq('footstep_wood_', 5)),
    ],
  },
  {
    key: 'foot/water', kind: 'oneshot', gain: 0.9, note: '논물 첨벙',
    sources: [
      { provider: 'freesound', query: 'footsteps water shallow splash', filter: 'tag:footsteps', pick: 6, minDur: 0.2, maxDur: 1.5 },
      { provider: 'zip', url: OGA_FOOTSTEPS, files: ['footsteps/water/*.ogg'], license: 'CC BY 3.0', author: 'EminYILDIRIM · swuing (Freesound) · mastered by congusbongus', source: OGA_FOOTSTEPS_PAGE, title: 'Footsteps on different surfaces — water' },
    ],
  },
  {
    key: 'foot/sand', kind: 'oneshot', gain: 0.8, note: '모래 (초원 sandbox 전용)',
    sources: [
      { provider: 'freesound', query: 'footsteps sand', filter: 'tag:footsteps', pick: 6, minDur: 0.15, maxDur: 1.2 },
      KENNEY_IMPACT(seq('footstep_snow_', 5)),
    ],
  },
  {
    key: 'foot/creak', kind: 'oneshot', gain: 0.5, note: '마루 삐걱 — 실내 wood 발소리에 가끔 겹친다',
    sources: [
      { provider: 'freesound', query: 'wood floor creak', filter: 'tag:creak', pick: 5, minDur: 0.2, maxDur: 2.0 },
      KENNEY_RPG(['creak1', 'creak2', 'creak3']),
    ],
  },
  {
    key: 'foot/jump', kind: 'oneshot', gain: 0.6, note: '점프 — 옷자락 스침',
    sources: [KENNEY_RPG(['cloth1', 'cloth2', 'cloth3'])],
  },
  {
    key: 'foot/land', kind: 'oneshot', gain: 0.8, note: '착지',
    sources: [KENNEY_IMPACT(seq('impactSoft_heavy_', 5))],
  },

  // ───────────────────────── 초칭·장비·전투(sandbox) ─────────────────────────
  {
    key: 'chochin/toggle', kind: 'oneshot', gain: 0.55, note: '초칭 밝기 전환 — 종이 부스럭',
    sources: [
      { provider: 'freesound', query: 'paper rustle short', pick: 4, minDur: 0.2, maxDur: 1.2 },
      KENNEY_RPG(['cloth1', 'cloth2', 'cloth3', 'cloth4']),
    ],
  },
  {
    key: 'combat/swing', kind: 'oneshot', gain: 0.7, note: '검 휘두름 (sandbox)',
    sources: [{ provider: 'zip', url: 'https://opengameart.org/sites/default/files/swishes.zip', files: ['swishes/swish-5.wav', 'swishes/swish-6.wav', 'swishes/swish-7.wav', 'swishes/swish-8.wav', 'swishes/swish-9.wav'], license: CC0, author: 'artisticdude', source: 'https://opengameart.org/content/swishes-sound-pack', title: 'Swishes Sound Pack' }],
  },
  { key: 'combat/hit', kind: 'oneshot', gain: 0.8, note: '타격 (허수아비)', sources: [KENNEY_IMPACT([...seq('impactPlank_medium_', 5)])] },
  { key: 'combat/down', kind: 'oneshot', gain: 0.8, note: '허수아비 쓰러짐', sources: [KENNEY_IMPACT(seq('impactWood_heavy_', 5))] },
  { key: 'combat/equip', kind: 'oneshot', gain: 0.6, note: '장착/줍기', sources: [KENNEY_RPG(['drawKnife1', 'drawKnife2', 'drawKnife3'])] },

  // ───────────────────────── H3 규칙: 던지기·소금·은신·숨 ─────────────────────────
  {
    key: 'throw/whoosh', kind: 'oneshot', gain: 0.7, note: '돌·오미쿠지 던지기 — 가벼운 휘익',
    sources: [
      { provider: 'freesound', query: 'whoosh throw light swish', filter: 'tag:whoosh', pick: 4, minDur: 0.15, maxDur: 1.2 },
      { provider: 'zip', url: 'https://opengameart.org/sites/default/files/swishes.zip', files: ['swishes/swish-1.wav', 'swishes/swish-2.wav', 'swishes/swish-3.wav', 'swishes/swish-4.wav'], license: CC0, author: 'artisticdude', source: 'https://opengameart.org/content/swishes-sound-pack', title: 'Swishes Sound Pack (light)' },
    ],
  },
  {
    key: 'salt/hit', kind: 'oneshot', gain: 0.8, note: '소금이 요괴에 닿음 — 치익',
    sources: [
      { provider: 'freesound', query: 'salt sprinkle sizzle', pick: 3, minDur: 0.3, maxDur: 2.5 },
      { provider: 'freesound', query: 'sand pour short', pick: 3, minDur: 0.3, maxDur: 2.5 },
    ],
  },
  {
    key: 'hide/cloth', kind: 'oneshot', gain: 0.7, note: '은신 들어가고 나올 때 옷자락',
    sources: [
      { provider: 'freesound', query: 'cloth rustle movement short', filter: 'tag:cloth', pick: 4, minDur: 0.2, maxDur: 1.5 },
      KENNEY_RPG(['cloth1', 'cloth2', 'cloth3']),
    ],
  },
  {
    key: 'breath/heavy', kind: 'oneshot', gain: 0.6, note: '스태미나 바닥 — 헐떡이는 숨 한 번(들숨+날숨)',
    sources: [
      { provider: 'freesound', query: 'heavy breathing exhausted single breath', filter: 'tag:breathing', pick: 4, minDur: 0.5, maxDur: 3 },
    ],
  },

  // ───────────────────────── 여름밤 앰비언스 ─────────────────────────
  {
    key: 'amb/higurashi', kind: 'loop', gain: 0.4, note: '쓰르라미(히구라시) 합창 — 숲·언덕 쪽에서, 멀리서 밀려오듯 (런타임 wander 0.1~1)',
    sources: [
      { provider: 'wikimedia', wmTitle: 'File:Tanna japonensis v01.ogg', loop: { start: 6, end: 92, xfade: 6 }, hp: 1200 },
      { provider: 'freesound', query: 'higurashi cicada evening', pick: 1, minDur: 20, maxDur: 240, loop: { start: 2, end: 60, xfade: 4 } },
    ],
  },
  {
    key: 'amb/suzumushi', kind: 'loop', gain: 0.5, note: '방울벌레(스즈무시) — 풀밭·논두렁 (짧은 녹음 → 런타임 scatter 로 반복 제거)',
    sources: [
      { provider: 'wikimedia', wmTitle: 'File:Suzumushi 06z3286.ogg', loop: { start: 0.5, end: 15.5, xfade: 2 }, hp: 1500 },
    ],
  },
  {
    key: 'amb/crickets', kind: 'loop', gain: 0.45, note: '귀뚜라미 바탕 — 어디서나 작게 (런타임 scatter)',
    sources: [
      { provider: 'freesound', query: 'crickets night loop', filter: 'tag:crickets', pick: 1, minDur: 15, maxDur: 180, loop: { start: 1, end: 40, xfade: 3 } },
      { provider: 'url', url: 'https://opengameart.org/sites/default/files/crickets_1.mp3', license: CC0, author: 'Wolfgang_', source: 'https://opengameart.org/content/crickets-ambient-noise-loopable', title: 'Crickets Ambient Noise', loop: { start: 0.3, end: 11.2, xfade: 1.5 }, hp: 1500 },
    ],
  },
  {
    key: 'amb/frogs', kind: 'loop', gain: 0.5, note: '개구리 합창 — 논 가까이서',
    sources: [
      { provider: 'freesound', query: 'frogs chorus night pond', filter: 'tag:frogs', pick: 1, minDur: 20, maxDur: 240, loop: { start: 2, end: 50, xfade: 4 } },
      { provider: 'wikimedia', wmTitle: 'File:Nature sounds ambience in a Dordogne pond.ogg', loop: { start: 3, end: 54, xfade: 4 }, hp: 150 },
    ],
  },
  {
    key: 'amb/wind', kind: 'loop', gain: 0.3, note: '밤바람 — 삼나무 숲을 스치는 잔잔한 바람. 샘플이 없으면 Sfx 의 합성 바람(더 조용함). Commons "Howling wind" 는 하울링이 너무 세서 뺐다 (2026-08-19 피드백)',
    sources: [
      { provider: 'freesound', query: 'wind trees night gentle', filter: 'tag:wind', pick: 1, minDur: 30, maxDur: 300, loop: { start: 2, end: 60, xfade: 5 }, lp: 1800 },
    ],
  },
  {
    key: 'amb/furin', kind: 'oneshot', gain: 0.5, mono: true, note: '풍경(風鈴) — 폐가 툇마루에서 가끔',
    sources: [
      { provider: 'freesound', query: 'furin wind chime japanese', pick: 4, minDur: 0.5, maxDur: 6 },
      { provider: 'wikimedia', wmTitle: 'File:Windchime.ogg', slices: [[5.9, 9.4], [10.9, 14.4], [22.9, 26.4], [36.9, 40.4], [46.9, 50.4], [51.9, 55.4]], hp: 500, fadeIn: 0.02, fadeOut: 1.6 },
    ],
  },
  {
    key: 'amb/bonsho', kind: 'oneshot', gain: 0.6, mono: true, note: '먼 절의 범종 — 아주 가끔 한 번',
    sources: [
      { provider: 'wikimedia', wmTitle: 'File:Bonsyou5599.ogg', trim: [0, 14], hp: 60, fadeOut: 4 },
    ],
  },
  {
    key: 'amb/hototogisu', kind: 'oneshot', gain: 0.45, mono: true, note: '두견새(호토토기스) — 여름밤 새 울음, 드물게',
    sources: [
      { provider: 'wikimedia', wmTitle: 'File:Hototogisu 07b8051.ogg', hp: 600 },
    ],
  },
  {
    key: 'amb/owl', kind: 'oneshot', gain: 0.45, mono: true, note: '부엉이 — 드물게, 숲 쪽',
    sources: [
      { provider: 'freesound', query: 'owl hoot night', filter: 'tag:owl', pick: 3, minDur: 0.5, maxDur: 6 },
    ],
  },

  // ───────────────────────── 마츠리바야시 (요괴 근접도) ─────────────────────────
  {
    key: 'matsuri/bed', kind: 'loop', gain: 0.8, mono: true, note: '마츠리바야시 실녹음 — 요괴 위치에서 나는 바탕. 멀면 북만(로우패스), 가까울수록 피리가 뚫고 나온다',
    sources: [
      { provider: 'freesound', query: 'matsuri bayashi festival drums flute', pick: 1, minDur: 15, maxDur: 240, loop: { start: 1, end: 40, xfade: 3 } },
      { provider: 'wikimedia', wmTitle: 'File:Drums and flute at Sanja Matsuri.ogg', loop: { start: 0.5, end: 20.4, xfade: 2.5 } },
    ],
  },
  {
    key: 'matsuri/taiko', kind: 'oneshot', gain: 0.9, note: '태고 단타 — 추격 중 빠른 북',
    sources: [
      { provider: 'freesound', query: 'taiko drum hit single', filter: 'tag:taiko', pick: 4, minDur: 0.2, maxDur: 3 },
    ],
  },
  {
    key: 'matsuri/suzu', kind: 'oneshot', gain: 0.7, note: '스즈(방울) — 16 m 이내',
    sources: [
      { provider: 'freesound', query: 'suzu bell shinto', pick: 3, minDur: 0.3, maxDur: 4 },
      { provider: 'freesound', query: 'kagura suzu bells', pick: 3, minDur: 0.3, maxDur: 4 },
    ],
  },
  {
    key: 'matsuri/geta', kind: 'oneshot', gain: 0.8, note: '게타(나막신) 발소리 — 9 m 이내, 음악을 뚫고 들어온다',
    sources: [
      { provider: 'freesound', query: 'geta wooden sandals footsteps', pick: 4, minDur: 0.1, maxDur: 1.5 },
      { provider: 'freesound', query: 'wooden clogs footsteps', pick: 4, minDur: 0.1, maxDur: 1.5 },
    ],
  },

  // ───────────────────────── 요괴·심장 ─────────────────────────
  {
    key: 'yokai/po', kind: 'oneshot', gain: 0.9, note: '팔척귀신 "뽀… 뽀… 뽀…" — 여성 허밍 단음',
    sources: [
      { provider: 'freesound', query: 'female voice hum short single note', filter: 'tag:voice', pick: 3, minDur: 0.3, maxDur: 2 },
    ],
  },
  {
    key: 'yokai/wail', kind: 'oneshot', gain: 0.9, note: '도로타보 울부짖음 ("논 돌려내라")',
    sources: [
      { provider: 'freesound', query: 'monster groan low moan', pick: 3, minDur: 0.8, maxDur: 4 },
    ],
  },
  {
    key: 'yokai/mud', kind: 'oneshot', gain: 0.9, note: '도로타보 — 진흙이 갈라지며 솟는 소리',
    sources: [
      { provider: 'freesound', query: 'mud squelch thick', filter: 'tag:mud', pick: 3, minDur: 0.5, maxDur: 4 },
    ],
  },
  {
    key: 'heart/beat', kind: 'oneshot', gain: 0.9, note: '심장 두근(lub-dub) 한 번',
    sources: [
      { provider: 'url', url: 'https://opengameart.org/sites/default/files/heartbeat.mp3_.flac', license: CC0, author: 'Independent.nu', source: 'https://opengameart.org/content/heartbeat-single-sound', title: 'Heartbeat (single sound)', trim: [0.08, 1.3], lp: 500, hp: 30, fadeOut: 0.3 },
      { provider: 'wikimedia', wmTitle: 'File:Human heart rate.flac', slices: [[0.28, 1.05]], lp: 450, hp: 30, fadeOut: 0.25 },
    ],
  },
];
