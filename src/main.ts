import * as THREE from 'three';
import { FrameClock } from '@/core/frameClock';
import { GameClock } from '@/core/gameClock';
import { modalInput } from '@/ui/modalInput';
import { confirmNewGame } from '@/ui/confirmNewGame';
import { SaveStatus } from '@/ui/saveStatus';
import { Act17Conclusion } from '@/story/act17';
import { Act18Revelation, CRYPT_TRACES } from '@/story/act18';
import { isDesktop, toggleFullscreen, closeDesktop } from '@/core/desktop';
import { TruthReconstruction, TRUTH_RECORDS } from '@/story/truthReconstruction';
import { MirrorMemory } from '@/story/mirrorMemory';
import { InvestigationCase, type InvestigationCaseDef } from '@/story/investigationCase';
import { GRAVEYARD_CASE, INN_CASE, MANOR_CASE } from '@/story/actInvestigations';
import { INN_AFTERIMAGE_CASE, innAfterimageActive } from '@/story/innAfterimage';
import { ManorDispatch, DISPATCH_CLUES, DISPATCH_DIALS, DISPATCH_SETTING, dispatchRequired } from '@/story/manorDispatch';
import { createRenderer, createCamera, enableExperimentalPointLightEarlyOut } from '@/core/renderer';
import { createPostFX, probePostFxSupport } from '@/core/postfx';
import { Physics } from '@/core/physics';
import { Input } from '@/core/input';
import { createTweaks } from '@/core/tweaks';
import { settings, applyDayPreset, loadHudPrefs, saveHudPrefs } from '@/core/settings';
import { L, lang } from '@/core/i18n';
import { createSky } from '@/world/sky';
import { createNightSky } from '@/world/nightSky';
import { Crows } from '@/world/village/crows';
import { ROUTES, type Route, Higasato, asGround, asVillage } from '@/world/higasato';
import { Chochin } from '@/light/chochin';
import { FaceFill } from '@/light/faceFill';
import { createPlayground } from '@/world/playground';
import { Island, loadTerrainTextures } from '@/world/terrain';
import { Water } from '@/world/water';
import { Grass } from '@/world/grass';
import { PROP_DEFS } from '@/world/propDefs';
import { CharacterController } from '@/character/controller';
import { PlaceholderCharacter } from '@/character/placeholder';
import { CharacterModel } from '@/character/model';
import { CharacterAnimator } from '@/character/animator';
import { CrouchPose } from '@/character/crouchPose';
import { Sfx, type Surface } from '@/audio/sfx';
import type { AudioRegion } from '@/audio/regions';
import { PathQueue } from '@/ai/pathQueue';
import { CHARACTER, MIO } from '@/character/config';
import { ThirdPersonCamera } from '@/camera/thirdPerson';
import { detectQuality, effectivePixelRatio, saveQuality, loadRenderScale, saveRenderScale, lowerLevel, profileFor, QUALITY_LEVELS, type QualityLevel, type QualityProfile } from '@/core/quality';
import { setupTouch } from '@/core/touch';
import { Inventory } from '@/items/inventory';
import { InventoryUI } from '@/items/inventoryUI';
import { ITEMS } from '@/items/items';
import { Equipment } from '@/character/equipment';
import { Combat } from '@/character/combat';
import { Dummies } from '@/world/dummies';
import { Popups } from '@/ui/popups';
import { Waypoint } from '@/ui/waypoint';
import { PauseMenu, QUALITY_LABEL } from '@/ui/pauseMenu';
import { LightPool } from '@/light/lightPool';
import { Props } from '@/world/props';
import { NavGrid } from '@/ai/navgrid';
import { Senses } from '@/ai/senses';
import { Hunter } from '@/ai/hunter';
import { Dorotabo } from '@/ai/dorotabo';
import { RokuroKubi } from '@/ai/rokurokubi';
import { Yuri } from '@/ai/yuri';
import { WellWoman, type WellFirstAnswer } from '@/ai/wellWoman';
import { SCHOOL_RECORDS } from '@/world/higasato/school';
import { WELL_RECORDS } from '@/world/higasato/wellShaft';
import { INN_RECORDS } from '@/world/higasato/inn';
import { Matsuri } from '@/audio/matsuri';
import { Ambience } from '@/audio/ambience';
import type { ZoneName } from '@/audio/space';
import { Scares } from '@/world/village/scares';
import { Rules, type OfferingDef } from '@/game/rules';
import { Hiding } from '@/game/hiding';
import { Inspect } from '@/game/inspect';
import { Dialogue, type DialogueLine } from '@/story/dialogue';
import { OptionalForeshadows } from '@/story/optionalForeshadows';
import { EvidenceJournal } from '@/story/evidenceJournal';
import { Phone } from '@/story/phone';
import { PhotoViewer } from '@/story/photoViewer';
import { PalmSign } from '@/story/palmSign';
import { GraveyardPassage, HOLLOW_CLUES } from '@/story/graveyardPassage';
import { loadPalmGestureSprites } from '@/story/palmGestureSprites';
import { WakyoView } from '@/story/wakyoView';
import { modelSprite } from '@/story/modelSprite';
import { Quests } from '@/story/quests';
import { Sequencer, type Sequence } from '@/story/sequencer';
import { WellCinematics } from '@/story/wellCinematics';
import { StorySave, defaultFlags, type SavePayload } from '@/story/flags';
import { StoryTelemetry } from '@/story/telemetry';
import { STORY_ACTS, STORY_PHASES, setStoryAct } from '@/story/phases';
import { buildDemoSeq } from '@/story/demo';
import { playPrologue } from '@/story/prologue';
import { FirstPerson } from '@/story/firstPerson';
import { Sayo } from '@/story/sayo';
import { Pursuers } from '@/story/pursuers';
import { Lightning } from '@/world/lightning';
import { Bus } from '@/world/bus';
import {
  preparePhoto,
  photoThumb,
  photoThumbFromModel,
  loadPhotoFront,
  photoDamageForOfferings,
  setPhotoStoryState,
} from '@/story/photo';
import type { Act2 } from '@/story/act2';
import type { Act1 } from '@/story/act1';
import { Act3 } from '@/story/act3';
import { Act4 } from '@/story/act4';
import { ControlsTutorial } from '@/story/controlsTutorial';
import { LifeSigns } from '@/world/higasato/lifesigns';
import { Rain } from '@/world/rain';
import { TimeOfDayController } from '@/world/timeOfDay';
import { GpuFrameTimer } from '@/core/gpuTimer';
import { configureGLTFTextureCompression, preferGpuCompressedModel } from '@/core/gltf';

/**
 * 어느 쪽인가를 화살표 한 글자로. **화면 기준**이다 — 팻말이 「→」라고 해도 플레이어가
 * 반대로 서 있으면 그건 왼쪽이다(그게 팻말의 한계라 HUD 가 보완한다).
 *
 * 카메라 전방은 (−sin yaw, −cos yaw) 이고(`camera/thirdPerson.ts`), yaw 가 커지면 왼쪽으로 돈다.
 * 그래서 화면각 = −(목표 yaw − 카메라 yaw) 다.
 */
const BEARINGS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function bearingGlyph(dx: number, dz: number, camYaw: number): string {
  let rel = Math.atan2(-dx, -dz) - camYaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const i = ((Math.round(-rel / (Math.PI / 4)) % 8) + 8) % 8;
  return BEARINGS[i]!;
}

/** 화자 이름 — 자막에 반복해서 나오는 것만 상수로 (`story/*` 도 같은 이름을 쓴다) */
const MIO_NAME = L('미오', 'ミオ');
const BROADCAST = L('방송', '放送');

interface CharacterVisual {
  update(dt: number, ctrl: CharacterController): void;
  setVisibility(v: number): void;
}

/**
 * 히가사토 식생 상한(높음 기준).
 * 벼는 한 포기당 9 tris 인 인스턴스지만 기존 8,196포기는 야간·안개 장면에 과했다.
 * 3,000포기면 논 7배미의 은신 실루엣은 유지하면서 정점·바람 셰이더·양면 오버드로를 63% 줄인다.
 * 삼나무 420그루는 마을 외곽선은 닫되, 기존 700그루의 임포스터 면적과 정적 콜라이더를 40% 덜 쓴다.
 */
const HIGASATO_RICE_HIGH = 3000;
const HIGASATO_CEDARS_HIGH = 420;

/** HUD 접근성 옵션은 월드 좌표 투영을 건드리지 않고 각 DOM 요소의 시각 크기만 바꾼다. */
function applyHudAccessibility() {
  settings.hud.scale = Math.max(0.8, Math.min(1.3, settings.hud.scale));
  document.documentElement.style.setProperty('--hud-scale', String(settings.hud.scale));
  document.body.classList.toggle('hud-high-contrast', settings.hud.highContrast);
}

async function main() {
  const canvas = document.getElementById('app') as HTMLCanvasElement;
  const hint = document.getElementById('hint')!;
  const statsEl = document.getElementById('stats')!;
  const loadingEl = document.getElementById('loading')!;
  const loadingFill = document.getElementById('loading-fill')!;
  const loadingPct = document.getElementById('loading-pct')!;
  let lightPool: LightPool | null = null;
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const continueBtn = document.getElementById('continue-btn') as HTMLButtonElement;
  let hintExpired = false;
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
  loadHudPrefs(); // 목표 지시자·팻말 읽기·창 비율 고정 — 저장된 취향을 먼저 되살린다
  applyHudAccessibility();

  // --- 배포 하위 경로 보정: 코드 곳곳의 '/models/…' 류 절대 경로를 BASE_URL 로 리라이트 ---
  // (GitHub Pages 는 /higanbana/ 하위라 루트 절대 경로가 404 난다. 개발 서버는 BASE_URL='/' 라 무변화)
  const BASE = import.meta.env.BASE_URL;
  if (BASE !== '/') {
    THREE.DefaultLoadingManager.setURLModifier((url) =>
      url.startsWith('/') && !url.startsWith(BASE) && !url.startsWith('//') ? BASE + url.slice(1) : url);
  }
  const withBase = (u: string) => (BASE !== '/' && u.startsWith('/') ? BASE + u.slice(1) : u);
  /**
   * 프롤로그 스킵 — **`?debug` 를 명시했을 때만** 작동한다 (사용자 지시 2026-08-22 「항상 처음부터」).
   *
   * 원래 `?skip=intro` 단독으로 동작하는 개발용 편의였는데, 브라우저가 주소를 자동완성해
   * **일반 플레이에서도 소리 없이 프롤로그가 건너뛰어졌다**. 안내 문구·「처음부터 하기」 링크로
   * 달래 봤지만 애초에 일반 경로에서 스킵이 가능한 것 자체가 문제다 — 이제 debug 없이는 무시된다.
   * QA(`?at=rokuro&skip=intro&debug` 등)는 그대로 돈다.
   */
  const qsEarly = new URLSearchParams(location.search);   // urlParams(아래) 선언 전이라 따로 읽는다
  const skipIntro = qsEarly.has('debug') && qsEarly.get('skip') === 'intro';
  /** 동일 장면 A/B 계측용. 일반 플레이는 항상 켜지고, 명시한 디버그 URL에서만 옛 경로로 돌아간다. */
  const losslessGpu = !(debug && qsEarly.has('nogpuopt'));
  /** 문제가 있는 WebView·GPU를 위한 명시적 복구 경로. 저장된 최고 화질보다 우선한다. */
  const forceGpuCompatibility = qsEarly.get('gpu') === 'safe';
  /** 특정 드라이버에서 표준 재질이 검게 빠졌던 전역 ShaderChunk 실험은 개발 URL에서만 재현한다. */
  if (debug && qsEarly.has('pointlightopt')) enableExperimentalPointLightEarlyOut();
  const fpsQa = Number(qsEarly.get('fps'));
  if (debug && qsEarly.has('fps') && Number.isFinite(fpsQa) && fpsQa >= 0) settings.render.maxFps = fpsQa;

  /**
   * 로딩 진행률 (three 의 기본 LoadingManager 를 모든 로더가 공유).
   *
   * 퍼센트만 보여 주면 **바가 뒤로 간다**. 로더가 도중에 새 파일을 발견할 때마다 분모(total)가
   * 커지기 때문인데, 화면에 분모가 없으니 그냥 고장으로 보인다(사용자 지적 2026-08-22).
   * 그래서 두 가지를 바꾼다:
   *   ① 숫자를 **56 / 147** 로 보여 준다 — 분모가 늘어난 게 눈에 보이면 되돌아간 게 아니라 "더 찾았다"로 읽힌다
   *   ② 막대는 **뒤로 가지 않는다** — 분모가 커지면 잠시 멈췄다가 다시 찬다
   */
  let loadedItems = 0, totalItems = 0;
  let progressShown = 0;
  const setProgress = (p: number) => {
    progressShown = Math.max(progressShown, Math.min(1, p));
    loadingFill.style.width = `${Math.round(progressShown * 100)}%`;
    loadingPct.textContent = totalItems
      ? `${loadedItems} / ${totalItems}${loadedItems < totalItems ? '' : L('  ·  마무리', '  ·  仕上げ')}`
      : `${Math.round(progressShown * 100)}%`;
  };
  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => { loadedItems = loaded; totalItems = total; setProgress(0.1 + 0.85 * (total ? loaded / total : 0)); };
  THREE.DefaultLoadingManager.onError = (url) => console.warn('[load] 실패:', url);
  setProgress(0.03);

  const renderer = createRenderer(canvas, losslessGpu);
  configureGLTFTextureCompression(renderer, !forceGpuCompatibility);
  // 비동기 query라 CPU/GPU 동기 대기가 없다. 지원 브라우저에서는 HUD뿐 아니라 90~100%
  // 미세 동적 해상도의 판단값으로 상시 쓴다.
  const gpuTimer = new GpuFrameTimer(renderer);
  let adaptiveRenderScale = 1;
  const postFxSupport = probePostFxSupport(renderer);
  let quality = detectQuality(renderer.getContext());
  if (forceGpuCompatibility || !postFxSupport.halfFloatColorBuffer) quality = profileFor('low');
  settings.render.resolutionScale = loadRenderScale(); // Esc 메뉴 슬라이더 저장값 — 첫 픽셀비 계산 전에
  renderer.setPixelRatio(effectivePixelRatio(quality, window.innerWidth, window.innerHeight, window.devicePixelRatio, settings.render.resolutionScale));
  settings.render.shadowRadius = quality.shadowRadius;
  console.info('[quality]', quality.level, quality);
  console.info('[gpu] postfx', forceGpuCompatibility || !postFxSupport.halfFloatColorBuffer ? 'compatibility-rgba8' : 'hdr-half-float');

  /**
   * **화면만 죽는 고장을 말로 만들어 준다.**
   *
   * GPU 가 리셋되면(`webglcontextlost`) three 는 그것을 스스로 잡아 **조용히 렌더를 멈춘다** —
   * 예외도 안 나고 콘솔도 조용하다. 그동안 자막(DOM)과 소리(WebAudio)는 아무 일 없이 계속 흐른다.
   * 그래서 플레이어에게는 「검은 화면에 자막과 소리만 끝까지」로 보인다
   * (사용자 리포트 2026-08-26 — 높음으로 두면 어떤 PC 에서 그랬다).
   * 원인은 대개 **한 프레임이 드라이버 감시 시간(윈도우 TDR ≈ 2 s)을 넘기는 것**이고,
   * 예방은 프리워밍 쪽에 있다(`bakeFrom` 주석). 그래도 났을 때 여기서 **보이게** 한다.
   * 렌더 루프가 매 프레임 예외를 던지는 경우도 화면상으로는 같은 증상이라 같은 안내로 묶는다.
   */
  let breakdownShown = false;
  const showBreakdown = (headline: string, detail: string) => {
    if (breakdownShown) return;
    breakdownShown = true;
    const el = document.createElement('div');
    el.className = 'breakdown';
    const h = document.createElement('h2');
    h.textContent = headline;
    const p = document.createElement('p');
    p.textContent = detail;
    const row = document.createElement('div');
    row.className = 'breakdown-actions';
    if (!forceGpuCompatibility) {
      const safe = document.createElement('button');
      safe.textContent = L('그래픽 호환 모드로 다시 시작', 'グラフィック互換モードで再起動');
      safe.addEventListener('click', () => {
        const url = new URL(location.href);
        url.searchParams.set('gpu', 'safe');
        url.searchParams.delete('pointlightopt');
        location.href = url.toString();
      });
      row.append(safe);
    }
    const next = lowerLevel(quality.level);
    if (next) {
      const lower = document.createElement('button');
      lower.textContent = L(`화질을 «${next}» 로 낮추고 다시 시작`, `画質を «${next}» に下げて再起動`);
      lower.addEventListener('click', () => { saveQuality(next); location.reload(); });
      row.append(lower);
    }
    const again = document.createElement('button');
    again.textContent = L('그대로 다시 시작', 'このまま再起動');
    again.addEventListener('click', () => location.reload());
    row.append(again);
    el.append(h, p, row);
    document.body.appendChild(el);
  };
  canvas.addEventListener('webglcontextlost', () => {
    console.warn('[gpu] WebGL 컨텍스트 손실');
    showBreakdown(
      L('그래픽 장치가 초기화됐습니다', 'グラフィックデバイスがリセットされました'),
      L('화면 그리기가 멈췄습니다 (소리와 자막만 남습니다). 화질을 한 단계 낮추면 대부분 해결됩니다.',
        '描画が停止しました（音声と字幕だけが残ります）。画質を一段下げると多くの場合は解消します。'));
  });
  canvas.addEventListener('webglcontextrestored', () => console.info('[gpu] 컨텍스트 복구'));

  const scene = new THREE.Scene();
  const camera = createCamera();

  // --- 스토리 상태 + 체크포인트 저장 (PLAN-STORY S0). 재개 흐름은 스토리 챕터와 함께 연결한다 ---
  const storyFlags = defaultFlags();
  const storySave = new StorySave();
  let started = false;
  const saveStatus = new SaveStatus(() => { saveCheckpoint(); });
  const telemetry = new StoryTelemetry();

  /**
   * 웹폰트가 붙기를 기다린다. 팻말·비석·공고문의 글자는 **캔버스에 한 번 구워지는** 텍스처라,
   * 서체가 아직 안 왔으면 폴백으로 구워지고 나중에 서체가 와도 다시 그려지지 않는다.
   * (실측: 명조로 재단한 글자 폭이 시스템 고딕으로 구워져 판자 밖으로 넘쳤다)
   * 3 초를 넘기면 그냥 진행한다 — 오프라인에서 로딩이 멈추는 쪽이 더 나쁘다.
   */
  await Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => { /* 서체가 없어도 게임은 돌아간다 */ });

  const physics = await Physics.create();

  // --- 씬: 기본은 마을(공포). ?scene=sandbox = v0.8 초원 섬, ?scene=playground = 테스트 지형 ---
  // 기본 씬 = 스토리 맵 히가사토. ?scene=village 는 기존 공포 맵(v0.12) 그대로, sandbox/playground 는 v0.8 초원
  const urlParams = new URLSearchParams(location.search);
  const sceneName = urlParams.get('scene') ?? 'higasato';
  const at = urlParams.get('at');
  /** 프롤로그만 건너뛰고 하차 튜토리얼부터 검증하는 개발용 진입점. */
  const tutorialQa = debug && at === 'tutorial';
  const rokuroQa = at === 'rokuro' || at === 'rokuro-post';
  /** 새 우물 요괴의 크기·방향·클립을 지하 방에서 바로 보는 전용 QA 진입점. */
  const wellWomanQa = debug && at === 'well-woman';
  const isVillage = sceneName === 'higasato';
  if (!isVillage) applyDayPreset(); // 초원·테스트 지형은 낮 세팅으로 되돌린다
  // 밤 씬의 달빛 그림자는 품질에 따라 켜진다 (0 = 끔) — 낮 씬은 항상 태양 그림자
  const sky = isVillage
    ? createNightSky(renderer, scene, quality.moonShadow && settings.night.moonShadow ? quality.shadowMap : 0)
    : createSky(renderer, scene, quality.shadowMap);

  let island: Island | null = null;
  let water: Water | null = null;
  let props: Props | null = null;
  let grass: Grass | null = null;
  let village: Higasato | null = null;
  const spawn = new THREE.Vector3(0, 0.05, 0);
  if (sceneName === 'playground') {
    createPlayground(scene, physics);
    scene.fog = new THREE.Fog(0xd7e3ec, 70, 240);
  } else if (isVillage) {
    const tex = await loadTerrainTextures(renderer);
    village = new Higasato(scene, physics, tex, {
      riceBudget: Math.round(HIGASATO_RICE_HIGH * quality.treeScale),
      treeBudget: Math.round(HIGASATO_CEDARS_HIGH * quality.treeScale),
      // 삼나무 수와 대숲·희귀 바위 밀도를 분리한다. cedar 기준값을 700→420으로 바꿨다고
      // 대숲까지 40% 비면 ACT의 시야 차단과 길 찾기 난도가 함께 변한다.
      vegetationScale: quality.treeScale,
    });
    await village.loadAssets();
    spawn.copy(village.spawn);
    if (at === 'house') {
      spawn.copy(village.house.entrance);
      spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
    } else if (at === 'chochin') {
      // 처마 초칭 QA — 등불 바로 아래에서 시작해 모델·광원·획득 교체를 반복 확인한다.
      spawn.copy(village.eaveChochin.pos);
      const path = village.ground.nearestPathPoint(spawn.x, spawn.z);
      const dx = path.x - spawn.x, dz = path.z - spawn.z;
      const d = Math.max(0.001, Math.hypot(dx, dz));
      spawn.x += dx / d * 1.7;
      spawn.z += dz / d * 1.7;
      spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
    } else if (at === 'hokora') {
      // 사당 보스전 반복 검증용 진입점. 전정에서 시작해 건물 규모와 계단·출구를 먼저 읽고
      // 안으로 들어가 방울을 집는 동선까지 그대로 시험한다.
      spawn.copy(village.hokora.ejectPos);
    } else if (at === 'well' || wellWomanQa) {
      // 우물 보스전 QA — 우물가에서 시작. 선행 봉납 2(방울·머리빗)는 시작 시 자동 처리
      if (wellWomanQa) {
        const chamber = village.wellShaft.chamber;
        spawn.set(chamber.cx + Math.max(1.2, chamber.r - 1.5), chamber.floorY + 0.05, chamber.cz);
      } else {
        spawn.set(village.well.pos.x + 2.2, 0, village.well.pos.z + 1.2);
        spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
      }
    } else if (at === 'school') {
      // 폐교 보스전 QA — 자동 검증에서도 입장 방송과 선택 UI가 즉시 발동하도록 문턱 안쪽에서 시작한다.
      // 일반 게임 진입점(village.school.doorPos)은 건드리지 않는다.
      const sb = village.schoolInterior.bounds;
      spawn.set(sb.minX + 0.8, sb.floorY + 0.05, (sb.minZ + sb.maxZ) / 2);
    } else if (at === 'manor') {
      // ACT 15 QA — 저택 현관. 대청 문서 3 → 마루 뚜껑 → 지하 기록 3 동선을 그대로 시험한다
      spawn.copy(village.manor.doorPos);
      spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
    } else if (at === 'inn') {
      // ACT 13 QA — 여관 정문 앞. 복도를 걸어 들어가며 잔해·그을음·거울을 순서대로 만난다
      // 셸이 이미 정문 위치를 알고 있다 — SITES 를 다시 import 하지 않는다
      const ic = village.inn.featurePos;
      spawn.set(ic.x - 9.5, 0, ic.z);
      spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
    } else if (at === 'graveyard') {
      // ACT 12 미로 QA — 북서쪽 진입로(뒷산길이 묘지에 닿는 지점)에서 시작한다.
      // 미로 경계 바깥에서 걸어 들어와야 첫 루프 판정이 실제 플레이와 같아진다
      const gc = village.graveyard.center;
      spawn.set(gc.x - 13, 0, gc.z + 11);
      spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
    } else if (at === 'bamboo') {
      // 대숲 LOD QA — 여관과 폐교 사이 동쪽 대숲길 한가운데에서 시작한다.
      // 숲 안 임의 좌표는 줄기 콜라이더에 겹칠 수 있어 가장 가까운 갈래길 중심으로 붙인다.
      const bp = village.ground.nearestPathPoint(52, 31);
      spawn.set(bp.x, 0, bp.z);
      spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
    } else if (at === 'bus-stop') {
      // ACT 2 하차 지점 QA — 표지의 글자면(+z)과 벤치·금줄을 한 프레임에 확인한다.
      const bp = village.busStop.pos;
      spawn.set(bp.x, 0, bp.z + 4.4);
      spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
    } else if (rokuroQa) {
      // 자동 추격 QA: 서쪽 제단 앞에서 동쪽 정문을 막고 나타나는 로쿠로쿠비를 본다.
      const a = village.hokora.chaseArena;
      if (at === 'rokuro-post') {
        // 첫 내부 기둥이 정확히 몸통↔플레이어 선분을 막는 우회 회귀 테스트.
        const o = a.blockers[0]!, home = village.hokora.rokuroSpawn;
        const dx = o.x - home.x, dz = o.z - home.z, d = Math.hypot(dx, dz);
        spawn.set(o.x + dx / d * 1.8, a.floorY + 0.05, o.z + dz / d * 1.8);
      } else spawn.set(a.minX + 3.1, a.floorY + 0.05, village.hokora.center.z);
    }
    settings.movement.jumpHeight = 1.05; // 마을: 점프는 살리되 낮게 — 공포 톤 유지 (사용자 피드백으로 제거→복원)
    console.info('[higasato] 논 배미', village.ground.paddyCells().length, '· 벼', village.paddy.riceCount, '· 토리이', village.torii.count, '· 삼나무', village.cedars.count);
  } else {
    const tex = await loadTerrainTextures(renderer);
    island = new Island(scene, physics, tex, { size: 180, resolution: 180, waterLevel: 0 });
    water = new Water(scene, 0);
    scene.fog = new THREE.Fog(0xd7e3ec, 70, 240);
    spawn.set(0, island.heightAt(0, 0) + 0.1, 0);
    grass = new Grass(scene, island, quality.grassCount);
    props = new Props(scene, physics, island);
    const defs = PROP_DEFS.map((d) => ({ ...d, count: Math.max(1, Math.round(d.count * quality.treeScale)) }));
    await props.load(defs);
    await props.addPushables('/models/props/rock-mossy.glb', [[4, 4.5], [-4.5, 5], [5, -3]], 0.9);
  }

  const detailsReady = village?.prepareDetails(spawn) ?? Promise.resolve();
  const sfx = new Sfx();
  const hunterPaths = new PathQueue();
  let wellAudio = false, schoolAudio = false, audioRegionT = 0;
  const syncAudioRegions = (p: THREE.Vector3) => {
    const regions: AudioRegion[] = [isVillage ? 'village' : 'sandbox'];
    if (village) {
      if (!skipIntro && storyFlags.act <= 2) regions.push('prologue');
      const well = village.wellShaft.landing;
      wellAudio = Math.hypot(p.x - well.x, p.z - well.z) < (wellAudio ? 52 : 38);
      const b = village.schoolInterior.bounds;
      const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
      const dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
      schoolAudio = Math.hypot(dx, dz) < (schoolAudio ? 38 : 24);
      if (wellAudio) regions.push('well');
      if (schoolAudio) regions.push('school');
    }
    void sfx.bank.setRegions(regions);
  };
  syncAudioRegions(spawn);
  void sfx.preload(); // 초기 구간만 선로드. 다른 구간은 접근하면서 준비한다.
  const unlockAudio = () => sfx.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  // 구역별 실녹음 앰비언스 (쓰르라미·방울벌레·개구리·바람·풍경·범종) — 마을에서만
  const ambience = village ? new Ambience(sfx, {
    paddyMask: (x, z) => village!.ground.paddyMask(x, z),
    heightAt: (x, z) => village!.heightAt(x, z),
    isIndoors: (p) => village!.isIndoors(p),
    house: village.house.entrance,
    shrine: village.shrine.center,
  }) : null;

  const controller = new CharacterController(physics, spawn);
  const tpCam = new ThirdPersonCamera(camera, physics, controller.body);
  if (at === 'chochin' && village) {
    tpCam.yaw = ThirdPersonCamera.yawToward(spawn, village.eaveChochin.pos);
    tpCam.pitch = 0.08;
    controller.yaw = tpCam.yaw;
  } else if (at === 'bus-stop' && village) {
    tpCam.yaw = ThirdPersonCamera.yawToward(spawn, village.busStop.pos);
    tpCam.pitch = 0.16;
    controller.yaw = tpCam.yaw;
  } else if (at === 'hokora') {
    tpCam.yaw = Math.PI / 2;       // 동쪽에서 서쪽 사당 내부를 본다
    controller.yaw = -Math.PI / 2;
  } else if (rokuroQa) {
    tpCam.yaw = -Math.PI / 2;      // 제단 쪽에서 동쪽 정문과 로쿠로쿠비를 본다
    controller.yaw = Math.PI / 2;
  } else if (wellWomanQa && village) {
    const targetYaw = ThirdPersonCamera.yawToward(spawn, new THREE.Vector3(village.wellShaft.chamber.cx, spawn.y, village.wellShaft.chamber.cz));
    // startIntro가 현재 yaw에서 +162° 회전하므로, 끝점이 요괴 쪽을 향하도록 시작각을 역산한다.
    tpCam.yaw = targetYaw - Math.PI * 0.9;
    tpCam.pitch = 0.08;
    controller.yaw = targetYaw;
  }
  /** 발밑 표면: 마을은 자갈/흙/논물, 섬은 수면 근처가 물/모래 */
  const surfaceAt = (p: THREE.Vector3): Surface => {
    if (surfaceOverride) return surfaceOverride;
    if (village) return village.surfaceAt(p);
    if (!island) return 'grass';
    const h = p.y - island.waterLevel;
    if (h < 0.12) return 'water';
    if (h < 1.1) return 'sand';
    return 'grass';
  };

  // 캐릭터 비주얼: GLB 가 있으면 로드, 없으면 캡슐 플레이스홀더
  // 주인공 모델은 씬에 따라 다르다 — 스토리 맵(히가사토)은 **미오**, 구 맵(village/sandbox/playground)은
  // v0.8 부터 쓰던 기존 캐릭터. 둘 다 tripo 스펙 41본이라 애니 클립과 컨트롤러는 그대로 공유된다.
  const characterCfg = sceneName === 'higasato' ? MIO : CHARACTER;
  let visual: CharacterVisual = new PlaceholderCharacter(scene);
  let model: CharacterModel | null = null;
  let animator: CharacterAnimator | null = null;
  let rokuro: RokuroKubi | null = null;
  let yuri: Yuri | null = null;
  let wellWoman: WellWoman | null = null;
  let suzuRingT = 0;
  try {
    // Native asset protocols can label GLB as application/octet-stream. Let the
    // GLTF loader validate the actual bytes instead of rejecting a valid model by MIME.
    model = await CharacterModel.load({ ...characterCfg, url: preferGpuCompressedModel(characterCfg.url) }, renderer);
    scene.remove((visual as PlaceholderCharacter).root);
    scene.add(model.root);
    visual = model;
    if (model.clipNames.includes('idle')) model.play('idle', 0);
    if (model.clipNames.length > 0) {
      animator = new CharacterAnimator(model, {
        onFootstep: (foot, speed, position) => {
          // 1인칭 구간에서는 몸이 보이지 않고 클립 배속도 잘려 있어 소리가 어긋난다 —
          // 그때는 카메라 흔들림에 물린 `FirstPerson.onStep` 이 대신 낸다
          if (firstPerson?.active) return;
          const surface = surfaceAt(position);
          sfx.footstep(speed, surface, foot);
          // 발소리 = 소음 이벤트. 논물 첨벙은 반경 2배 (기획 3.4)
          const base = crouching ? settings.ai.noiseCrouch : speed > 2.5 ? settings.ai.noiseRun : settings.ai.noiseWalk;
          const inWater = surface === 'water';
          senses?.emitNoise(position, base * (inWater ? 2 : 1));
        },
        onJump: () => sfx.jump(),
        onLand: (impact) => sfx.land(impact),
      });
    }
    console.info('[character] loaded', characterCfg.url, 'clips:', model.clipNames);
  } catch (e) {
    console.warn('[character] GLB 로드 실패 → 캡슐 유지', e);
  }

  // --- 초칭(왼손 등불) — 마을의 유일한 그림자 광원 ---
  let chochin: Chochin | null = null;
  let faceFill: FaceFill | null = null;
  let crouchPose: CrouchPose | null = null;
  if (isVillage && model) {
    chochin = new Chochin(model.root, quality.shadowMap >= 3072 ? 1024 : 512);
    faceFill = new FaceFill(scene);
    console.info('[chochin] level', chochin.level);
    crouchPose = new CrouchPose(model);
    const mdl = model;
    mdl.postPose = (pdt) => crouchPose!.apply(pdt, controller.yaw, controller.horizontalSpeed);
  }

  /**
   * **요괴 전면 비활성** (사용자 지시 2026-08-20: "내가 다시 얘기할 때까지 귀신·요괴는 안 나오게").
   * 숨기는 것으로는 부족했다 — `Scares.load()` 가 놋페라보를 로드 시점에 씬에 세워 두기 때문에
   * 프롤로그 도중에도 광장에 서 있었다. 그래서 **생성 자체를 건너뛴다**.
   * 되살릴 때는 `?yokai=on` 또는 이 상수를 true 로.
   */
  const YOKAI_ON = new URLSearchParams(location.search).get('yokai') === 'on';

  // --- 요괴 (H2: 팔척귀신 + 여우 요괴) ---
  let navgridRef: NavGrid | null = null;   // DEV: 도달성 검증용
  let senses: Senses | null = null;
  let hunters: Hunter[] = [];
  let dorotabo: Dorotabo | null = null;
  let matsuri: Matsuri | null = null;
  const deathEl = document.createElement('div');
  deathEl.className = 'death-fade';
  deathEl.innerHTML = '<div class="death-text">잡혔다</div>';
  document.body.appendChild(deathEl);
  let deathT = 0;
  if (village && model) {
    // Rapier 는 새로 추가된 콜라이더를 **다음 step 에서야** 브로드페이즈에 넣는다.
    // 그 전에 나브그리드를 구우면 `intersectionsWithShape` 가 건물을 못 봐서 **모든 건물이
    // 통행 가능으로 기록된다** — 요괴가 집·신사를 뚫고 다니게 되는 원인(실측: 민가 12채가
    // 막은 셀 0). 굽기 직전에 한 번 돌려 공간 질의 구조를 갱신한다
    physics.step(1 / 240);
    const grid = new NavGrid(physics, asGround(village.ground));
    if (import.meta.env.DEV) navgridRef = grid;
    senses = new Senses(physics);
    matsuri = new Matsuri(sfx);
    /**
     * 순찰 앵커. **길마다 주인이 다르다** — 어느 길을 고르든 안전하지 않아야 하고,
     * 동시에 "이 길엔 누가 있다"를 배울 수 있어야 한다(외운 만큼 유리해지는 게 재미다).
     * 갈래길 폴리라인에서 등간격으로 점을 뽑아 쓴다.
     */
    const alongRoute = (id: Route['id'], count: number): THREE.Vector3[] => {
      const r = ROUTES.find((x) => x.id === id)!;
      let total = 0;
      for (let i = 1; i < r.pts.length; i++) total += Math.hypot(r.pts[i]![0] - r.pts[i - 1]![0], r.pts[i]![1] - r.pts[i - 1]![1]);
      const out: THREE.Vector3[] = [];
      for (let k = 0; k < count; k++) {
        let want = (total * (k + 0.5)) / count, acc = 0;
        for (let i = 1; i < r.pts.length; i++) {
          const ax = r.pts[i - 1]![0], az = r.pts[i - 1]![1];
          const len = Math.hypot(r.pts[i]![0] - ax, r.pts[i]![1] - az);
          if (acc + len >= want) {
            const t = len > 0 ? (want - acc) / len : 0;
            out.push(new THREE.Vector3(ax + (r.pts[i]![0] - ax) * t, 0, az + (r.pts[i]![1] - az) * t));
            break;
          }
          acc += len;
        }
      }
      return out;
    };
    // 팔척귀신: 참배로와 논두렁길 — 마을 한복판을 오간다
    const anchors: THREE.Vector3[] = [
      ...alongRoute('sando', 4),
      ...alongRoute('aze', 4),
      ...alongRoute('bamboo', 2),
      village.house.entrance.clone(),
      // 마츠리 광장 — 불 켜진 빈 축제를 가로지른다
      new THREE.Vector3(31, 0, 30), new THREE.Vector3(22, 0, 38),
    ];
    const events = {
      onSpotted: () => matsuri?.onSpotted(),
      onLost: () => { if (!hunters.some((h) => h.state === 'CHASE')) matsuri?.onLost(); },
      onGrab: () => {
        deathT = 3.0;
        storyFlags.deaths++; // 숨은 카운터 (§6.3) — HUD 비표시, 엔딩·대사 변주 입력
        telemetry.recordDeath('village-hunter', storyFlags.act);
        deathEl.classList.add('show');
      },
    };
    if (YOKAI_ON) {
    // 팔척귀신: 참배로 북쪽 끝 스폰(플레이어 스폰에서 약 80 m), 마을 전역 순찰
    const hs = village.ground.roadAt(village.ground.roadLength - 6);
    hunters.push(new Hunter(physics, asGround(village.ground), grid, senses, {
      url: '/models/yokai-hasshaku.glb',
      height: 2.4,
      spawn: new THREE.Vector3(hs.x, 0, hs.z),
      patrolAnchors: anchors,
      events,
      paths: hunterPaths,
    }));
    // 여우 요괴: 센본토리이·신사 언덕의 주인 — 참배로 상류만 배회
    // 여우 요괴: 참배로 상류 + 뒷산 오솔길·돌계단 뒷길 — 신사로 가는 **모든** 길을 지킨다
    const shrineAnchors: THREE.Vector3[] = [];
    for (const t of [village.ground.sAtZ(0), village.ground.sAtZ(-15), village.ground.sAtZ(-30), village.ground.sAtZ(-43)]) {
      const rp = village.ground.roadAt(Math.min(t, village.ground.roadLength - 3));
      shrineAnchors.push(new THREE.Vector3(rp.x, 0, rp.z));
    }
    shrineAnchors.push(...alongRoute('ridge', 3).slice(1), ...alongRoute('stair', 3));
    const ks = village.ground.roadAt(village.ground.roadLength - 16);
    hunters.push(new Hunter(physics, asGround(village.ground), grid, senses, {
      url: '/models/yokai-kitsune.glb',
      height: 1.78,
      spawn: new THREE.Vector3(ks.x + 2, 0, ks.z),
      patrolAnchors: shrineAnchors,
      events,
      paths: hunterPaths,
    }));
    for (const h of hunters) scene.add(h.root);
    // 도로타보: 논의 주인 — 추격자가 아니라 영역 규칙 (논 은신 남용 → 출현 + 소음으로 추격자를 부른다)
    dorotabo = new Dorotabo(asGround(village.ground), senses, sfx, { url: '/models/yokai-dorotabo.glb', height: 1.7 });
    scene.add(dorotabo.root);
    } else {
      console.info('[yokai] 비활성 — ?yokai=on 으로 켠다');
    }
  }
  // --- 비: 프롤로그(ACT 1) 전용. 평소엔 꺼져 있다 ---
  const rain = isVillage ? new Rain(scene) : null;
  // --- 프롤로그 1인칭 리그 + 뒤쫓는 횃불 (ACT 1) ---
  const firstPerson = isVillage ? new FirstPerson(scene, camera, { eye: 1.05 }) : null;
  if (firstPerson) {
    firstPerson.onStep = (foot, speed) => sfx.footstep(speed, surfaceAt(controller.position), foot);
  }
  /**
   * **사요** — ACT 1 에서 미오 앞을 달리는 언니(`story/sayo.ts`).
   *
   * 프롤로그를 건너뛰어도 읽는다 — **가족사진의 언니가 이 모델**이라(`story/photo.ts`),
   * 안 읽으면 건너뛴 사람만 다른 사진을 갖게 된다. 촬영이 끝나면 바로 정리한다.
   * 실패해도 ACT 1 은 그대로 돌아간다(손은 원래 상태 플래그였다).
   */
  let sayo: Sayo | null = null;
  if (isVillage) {
    try {
      sayo = await Sayo.load(scene, { url: withBase(preferGpuCompressedModel('/models/sayo.glb')) });
      console.info('[sayo] loaded, clips:', sayo.clipNames);
    } catch (e) {
      console.warn('[sayo] GLB 로드 실패 → 손만 남는다', e);
    }
  }
  const pursuers = village ? new Pursuers(scene, village.ground, { count: 5 }) : null;
  // 번개는 **광원을 새로 만들지 않는다** — 이미 있는 달빛·반구광 세기를 순간적으로 끌어올린다.
  // (라이트를 하나 더 켜면 밤 셰이더가 통째로 재컴파일된다)
  const lightning = isVillage
    ? new Lightning(
        (sky as unknown as { moon: THREE.DirectionalLight }).moon,
        sky.hemi, sfx,
        (v) => { flashEl.style.opacity = String(v); },
        scene,
      )
    : null;
  let act1: Act1 | null = null;
  let act2: Act2 | null = null;
  /** ACT 3 「세 가지 금기」 — 비석을 닦고, 이름이 불리고, 대답한다 (`story/act3.ts`) */
  let act3: Act3 | null = null;
  /** ACT 4 「끝나지 않은 축제」 — 마을에 들어서면 켜지는 방송 (`story/act4.ts`) */
  let act4: Act4 | null = null;
  let controlsTutorial: ControlsTutorial | null = null;
  /** ACT 4 의 생활 흔적 — 김 나는 찻잔·TV·젖은 게다·풍경·골목 끝의 사람 */
  let lifesigns: LifeSigns | null = null;
  /**
   * ACT 2a 의 무대 — **지형 밖(y +300)** 에 세운 자립 세트.
   * 히가사토에는 버스가 달릴 길이 없어서, 버스는 서 있고 창밖이 흐른다(`world/bus.ts`).
   */
  const bus = isVillage ? new Bus(scene) : null;
  // 버스는 ACT 2에서만 보인다. 초기 로딩에서 읽지 않고 ACT 1 플레이와 겹쳐 프리패치한다.
  let busLoadPromise: Promise<void> | null = null;
  const prefetchBus = () => {
    if (!bus) return Promise.resolve();
    busLoadPromise ??= bus.load().catch((e) => console.warn('[bus] 실내 소품 로드 실패', e));
    return busLoadPromise;
  };
  /**
   * 요괴 활성 스위치. **프롤로그는 10년 전 밤**이라 팔척귀신도 여우도 도로타보도 없다 —
   * 그날 미오를 쫓은 건 마을 사람들이다(`pursuers.ts`). 프롤로그가 끝나야 켜진다.
   */
  let yokaiActive = false;
  const setYokaiActive = (on: boolean) => {
    yokaiActive = on;
    for (const h of hunters) { h.root.visible = on; if (!on) h.reset(); }
    if (dorotabo) dorotabo.root.visible = on;
    if (!on) matsuri?.onLost();
  };
  /** ACT 1 은 참배로 자갈이 아니라 진흙·빗물 소리여야 한다 */
  let surfaceOverride: Surface | null = null;
  const dreadEl = document.createElement('div'); dreadEl.className = 'dread'; document.body.appendChild(dreadEl);
  // 번개 — 씬 조명 스파이크(`world/lightning.ts`)와 짝을 이루는 화면 번쩍임. 잠식(23) 위에 얹는다
  const flashEl = document.createElement('div'); flashEl.className = 'flash'; document.body.appendChild(flashEl);
  /** 시간대 — 장면마다 하늘·빛·안개·색보정을 한 벌로 바꾼다 (world/timeOfDay.ts) */
  let timeOfDay: TimeOfDayController | null = null;

  // --- 까마귀: 삼나무에 앉았다가 다가가면 날아오른다 ---
  let crows: Crows | null = null;
  if (village) {
    crows = new Crows(scene, village.cedars.perches, sfx, { count: 22 });
    await crows.load().catch((e) => { console.warn('[crows]', e); crows = null; });
  }

  // --- 연출형 요괴: 움직이는 지장 · 놋페라보 · 초칭오바케 ---
  let scares: Scares | null = null;
  if (village && YOKAI_ON) {
    scares = new Scares(scene, village.landmarks, village.square, village.house, chochin, sfx, senses);
    scares.setupHouse();
    // await — void 로 두면 setProgress(1) 뒤에 DefaultLoadingManager.onProgress 가 다시 불려 로딩 바가 95% 로 되돌아간다
    await scares.load().catch((e) => console.warn('[scares]', e));
  }

  // --- 게임 규칙: 공물 5 → 봉납 → 탈출 ---
  let rules: Rules | null = null;
  let hiding: Hiding | null = null;
  let inspect: Inspect | null = null;
  let crouching = false;
  let stamina = settings.stamina.max;
  let exhausted = false; // 소진 후 30% 이상 회복해야 다시 달릴 수 있다
  const staminaEl = document.createElement('div'); staminaEl.className = 'stamina';
  staminaEl.innerHTML = '<div class="stamina-fill"></div>';
  document.getElementById('hud')!.appendChild(staminaEl);
  const staminaFill = staminaEl.querySelector('.stamina-fill') as HTMLElement;
  /**
   * 손거울 조작 안내 — **대사 한 줄로는 안 남는다.** 벽거울에서 「[F] 를 누르고 있으면」이라고
   * 한 번 말하고 사라지니 플레이어가 방법을 잃는다(실측: 「F 로 하라는데 어떻게 하는지 모르겠어」).
   * 여관 안에서 거울을 가진 동안에만 상시로 띄운다 — 다른 방에서는 쓸 데가 없으니 나오지 않는다.
   */
  const mirrorHintEl = document.createElement('div');
  mirrorHintEl.className = 'mirror-hint hidden';
  document.getElementById('hud')!.appendChild(mirrorHintEl);
  const hiddenEl = document.createElement('div'); hiddenEl.className = 'hidden-badge'; hiddenEl.textContent = L('숨었다', '隠れた');
  document.getElementById('hud')!.appendChild(hiddenEl);
  /**
   * 우상단 미션 패널: 현재 목표 한 줄 + 공물 체크리스트 (단계 변화 시 renderHud 가 갱신).
   *
   * 체크리스트 7 행은 화면 오른쪽 위를 꽤 크게 먹는다 — 길을 다 외운 뒤에는 방해다.
   * 그래서 **접을 수 있다**(사용자 요청 2026-08-22): 제목줄을 누르거나 `O`.
   * 접어도 **목표 한 줄은 남는다** — 그게 이 패널의 본체이고, 접었다는 사실이 보여야 한다.
   * 선택은 localStorage 에 남는다 (다음 판에도 접혀 있다).
   */
  const missionEl = document.createElement('div'); missionEl.className = 'mission';
  missionEl.innerHTML =
    `<button class="mission-head" type="button" title="${L('O — 접기/펼치기', 'O — 畳む/開く')}">`
    + `<span class="mission-title">${L('현재 목표', '現在の目標')}</span><span class="mission-disclosure"><kbd>O</kbd><span class="mission-caret">▾</span></span></button>`
    + '<div class="mission-goal"></div><ul class="mission-list" id="mission-offerings"></ul>';
  document.getElementById('hud')!.appendChild(missionEl);
  const missionGoal = missionEl.querySelector('.mission-goal') as HTMLElement;
  const missionList = missionEl.querySelector('.mission-list') as HTMLElement;
  const missionHead = missionEl.querySelector('.mission-head') as HTMLButtonElement;
  const MISSION_FOLD_KEY = '3dm.mission.folded';
  let missionFolded = true;
  try { missionFolded = localStorage.getItem(MISSION_FOLD_KEY) !== '0'; } catch { /* 저장소 없이도 HUD를 만든다 */ }
  const applyMissionFold = () => {
    missionEl.classList.toggle('folded', missionFolded);
    missionHead.setAttribute('aria-expanded', String(!missionFolded));
    missionHead.setAttribute('aria-controls', 'mission-offerings');
    (missionEl.querySelector('.mission-caret') as HTMLElement).textContent = missionFolded ? '▸' : '▾';
  };
  const toggleMissionFold = () => {
    missionFolded = !missionFolded;
    try { localStorage.setItem(MISSION_FOLD_KEY, missionFolded ? '1' : '0'); } catch { /* 이번 실행만 적용 */ }
    applyMissionFold();
  };
  missionHead.addEventListener('click', toggleMissionFold);
  applyMissionFold();
  /**
   * --- 길안내 (사용자 지시 2026-08-22 「표지판 알림이나 퀘스트 위치같은건 접근성 올려줘야할듯」) ---
   *
   * 두 겹이다. 미니맵은 놓지 않는다 — 어두운 데를 눈으로 훑는 게 이 게임의 재미다.
   *   ① **목표 지시자**(`ui/waypoint.ts`) — 지금 목표가 화면 어느 쪽인지 + 몇 m
   *   ② **팻말 읽어 주기** — 팻말 6 m 안에 들어가면 그 문구가 화면 아래에 뜬다.
   *      판자는 밤에 읽기 어렵고, 읽으려면 정면으로 서야 했다
   */
  const waypoint = new Waypoint(document.getElementById('hud')!);
  const signReadEl = document.createElement('div'); signReadEl.className = 'signread';
  document.getElementById('hud')!.appendChild(signReadEl);
  /** 포인터락 직후 잠깐 뜨는 Esc 안내 — 커서를 되찾는 법이 어디에도 없었다 */
  const escHintEl = document.createElement('div'); escHintEl.className = 'esc-hint';
  escHintEl.innerHTML = L('<kbd>Esc</kbd> 일시정지 · 설정', '<kbd>Esc</kbd> 一時停止 · 設定');
  document.getElementById('hud')!.appendChild(escHintEl);
  let escHintT = 0;
  /**
   * **Esc = 일시정지** (사용자 요청 2026-08-22).
   *
   * 포인터락 중에는 Esc keydown 이 페이지로 오지 않는다 — 브라우저가 락을 푸는 데 쓴다.
   * 그래서 키가 아니라 **락이 풀리는 순간**을 듣는다 (`ui/pauseMenu.ts` 주석 참고).
   * 우리가 스스로 푼 경우(인벤토리·사진 뷰어)에는 열지 않는다: 그 창들은 `isOpen` 이
   * `exitPointerLock()` 보다 **먼저** 켜지고 `pointerlockchange` 는 다음 태스크에 오므로,
   * 여기서 상태만 확인하면 플래그 없이 갈린다.
   */
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      escHintT = 4.5; escHintEl.classList.add('show');
      return;
    }
    escHintEl.classList.remove('show');
    if (!started || modalInput.active || invUI.isOpen || photoViewer.isOpen || palmSign.isOpen || evidenceJournal.isOpen || deathT > 0) return;
    pauseMenu.open();
  });

  // 월드 상호작용 표지자 — E 안내는 화면 구석이 아니라 실제 대상 위에 붙는다.
  const hudEl = document.createElement('div'); hudEl.className = 'game-hud';
  hudEl.innerHTML = '<div class="prompt-anchor"><i class="prompt-marker"></i><div class="prompt-line"><span class="prompt-text"></span></div></div>';
  document.getElementById('hud')!.appendChild(hudEl);
  const promptAnchor = hudEl.querySelector('.prompt-anchor') as HTMLElement;
  const promptLine = hudEl.querySelector('.prompt-line') as HTMLElement;
  const promptText = hudEl.querySelector('.prompt-text') as HTMLElement;
  // 프롬프트는 두 출처(공물 rules / 조사 inspect)가 한 줄을 나눠 쓴다.
  // 기본은 rules 우선이고, 봉인 공물과 겹치는 필수 조사점만 명시적으로 inspect가 앞선다.
  let rulesPrompt: string | null = null;
  let inspectPrompt: string | null = null;
  const renderPrompt = () => {
    /**
     * 금기 三 시선 중에는 **대답 버튼만** 보인다(§5.5). 조사 프롬프트가 옆에 같이 뜨면
     * 무엇이 금기인지 흐려진다 — 이 순간만큼은 선택지가 하나여야 유혹이 된다.
     * `promptText` 를 직접 덮어쓰면 시선이 끝난 뒤 복구가 안 된다(실측: 계속 남아 있었다).
     */
    if (gazeIdx >= 0) {
      promptText.textContent = L('[E] 대답한다', '[E] 答える');
      promptAnchor.classList.add('show');
      return;
    }
    const t = inspect?.hasInputPriority ? inspectPrompt : (rulesPrompt ?? inspectPrompt);
    promptText.textContent = t ?? '';
    promptAnchor.classList.toggle('show', !!t);
  };
  // --- 스토리 시스템 (PLAN-STORY S0): 자막 · 퀘스트 보이스(목표 문구를 넘겨받는다) · 시퀀서 ---
  const hudRoot = document.getElementById('hud')!;
  const dialogue = new Dialogue();
  // 「전기가 죽는다」 — 씬에 아무것도 안 넣는 DOM 한 장 (각색 6 C안)
  const phone = new Phone({
    battery: storyFlags.phoneBattery,
    onBattery: (value) => { storyFlags.phoneBattery = value; },
  });
  const quests = new Quests(missionGoal);
  const sequencer = new Sequencer(camera, dialogue);
  const wellCinematics = new WellCinematics(village?.wellShaft.chamber);
  const endEl = document.createElement('div'); endEl.className = 'ending';
  document.body.appendChild(endEl);
  const gameClock = new GameClock();
  const showChapterEnding = () => {
      endEl.innerHTML = L(
        '<div class="ending-title">퀘스트를 준 자</div><div class="ending-sub">ACT 18 완료 · 다음 장 「자매의 재회」는 개발 중입니다.</div>',
        '<div class="ending-title">クエストを与えた者</div><div class="ending-sub">ACT 18 完了 · 次章「姉妹の再会」は開発中です。</div>');
      const title = document.createElement('button');
      title.textContent = L('타이틀로', 'タイトルへ');
      title.addEventListener('click', () => location.reload());
      const fresh = document.createElement('button');
      fresh.textContent = L('처음부터', '最初から');
      fresh.addEventListener('click', () => { void requestNewGame(true); });
      const explore = document.createElement('button');
      explore.textContent = L('계속 둘러보기', '探索を続ける');
      explore.addEventListener('click', () => { endEl.classList.remove('show'); modalInput.close(endEl); renderHud(); });
      endEl.append(explore, title, fresh);
      endEl.classList.add('show');
      if (document.pointerLockElement) document.exitPointerLock();
      modalInput.open(endEl, () => location.reload());
  };
  const act17 = new Act17Conclusion({
    dialogue, quests, wait: ms => gameClock.wait(ms), checkpoint: () => { saveCheckpoint(); },
    onComplete: () => { beginAct18(); },
  });
  const toastEl = document.createElement('div'); toastEl.className = 'pickup-toast'; document.body.appendChild(toastEl);
  let toastT = 0;
  /** 받침침 조사(을/를) — 이름 끝 글자의 받침 유무 */
  const eul = (w: string) => {
    const c = w.charCodeAt(w.length - 1);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '을' : '를';
  };
  /** 스토리 진행 단계 (S1): 비석을 읽었는가 — 석판(퀘스트 개시) 전까지의 목표 문구를 가른다 */
  let tabletRead = false;
  /** 버스 하차 뒤 첫 마을 방송과 미오의 코멘트가 모두 끝나야 비석을 만질 수 있다. */
  let tabletEventReady = false;
  /** 정상 새 게임은 하차 튜토리얼을 마쳐야 ACT 3 이후가 열린다. QA 스킵·다른 씬은 즉시 통과. */
  let tutorialDone = !isVillage || (skipIntro && !tutorialQa);
  let tutorialProgress = tutorialDone ? 3 : 0;
  /** ACT 11 방송 뒤, 이미 놓은 공물을 되찾으려는 플레이어 통제 구간을 연다. */
  let restoreWarningReady = false;
  /** ACT 11 방송이 진행 중인 동안은 다음 지역 목표를 먼저 노출하지 않는다. */
  let restoreWarningPlaying = false;
  /** 방울을 당긴 뒤 미오의 결심까지 끝나기 전에 퀘스트가 다음 공물로 튀는 것을 막는다. */
  let restoreResolutionPlaying = false;
  let restoreFirstDone = false;
  let photoMessageRevealed = false;
  /**
   * ACT 13 금기 三 — 거울 속 인파의 시선(§5.3.5). 와쿄를 든 채 각 인파에 다가가면 한 번씩 돌아본다.
   * `gazeIdx` = 지금 보고 있는 인파(−1 없음) · `gazeT` = 대답을 받는 창(초) · `gazeDone` = 소진한 인파.
   * 대답하면 금기 三 위반: 잠식 +1 과 함께 여관이 10초간 화재로 점멸한다(퇴로 암기 강제).
   */
  let gazeIdx = -1;
  let gazeT = 0;
  /** 「대답한다」 프롬프트의 자리 — 이름이 불린 인파를 따라간다(원점에 두면 거리 판정이 어긋난다) */
  const answerPos = new THREE.Vector3();
  const gazeDone = new Set<number>();
  let innFireT = 0;
  let wellPreludeHeard = false;
  let wellClimbInProgress = false;
  let wellQuestionPlaying = false;
  let wellOutroPlaying = false;
  let wellCinematicPlaying = false;
  /** 자유 조사 순서가 곧 침수 벽감(마지막)과 우회 포켓(첫 번째)을 정한다. */
  let wellNicheOrder: number[] = [];
  /** 바닥에서 한 번에 세 개를 집는다. J(터치 공격 버튼)·G 어느 쪽도 같은 유인 행동이다. */
  let wellPebbles = 0;
  let maybeBeginWellQuestion: () => Promise<void> = async () => {};
  let schoolPreludeHeard = false;
  let schoolWasInside = false;
  /** 구역 경계를 넘을 때만 목표 마커를 다시 계산한다. 실내에 들어오면 세부 좌표 표식을 끈다. */
  let guideZone = 'field';
  let graveyardPreludeHeard = false;
  const evidence = new Set(storyFlags.evidence);
  const cryptFade = document.createElement('div'); cryptFade.className = 'crypt-transition'; document.body.appendChild(cryptFade);
  let cryptItemsReady: Promise<void> | null = null;
  const act18 = new Act18Revelation({
    evidence, dialogue, quests,
    canEnter: () => act17.state === 'complete' && !!rules?.carried.includes('fuda'),
    inside: () => !!village?.crypt.contains(controller.position),
    remember: id => { rememberEvidence(id); }, checkpoint: () => { saveCheckpoint(); },
    wait: ms => gameClock.wait(ms),
    travel: async down => {
      if (!village) return;
      const c = village.crypt;
      cryptFade.classList.add('show');
      try {
        if (down) await c.revelation.prepare();
        await gameClock.wait(350);
        const destination = down ? c.landing.clone().add(new THREE.Vector3(0, 0.12, 0))
          : c.entryTop.clone().add(new THREE.Vector3(1.15, 0.15, 0));
        controller.teleport(destination); spawn.copy(destination);
        c.setOpen(true); tpCam.yaw = down ? Math.PI / 2 : -Math.PI / 2; tpCam.pitch = 0.06;
        await village.prepareDetails(destination);
        await gameClock.wait(250); sfx.doorPush(c.entryTop.x, c.entryTop.y, c.entryTop.z);
      } finally { cryptFade.classList.remove('show'); }
      renderHud();
    },
    stage: stage => {
      village?.crypt.revelation.setStage(stage);
      if (stage !== 'hidden') void village?.crypt.revelation.prepare();
      if (stage === 'waiting' && village?.crypt.contains(controller.position)) {
        tpCam.setView('first'); tpCam.yaw = 0; tpCam.pitch = 0.06;
      }
    },
    prepareOfferings: () => cryptItemsReady ??= (async () => {
      if (!village || !rules) return;
      const ids = ['suzu', 'kushi', 'coins', 'geta', 'kagami'];
      const models = await Promise.all(ids.map(async id => {
        const def = rules!.offerings.find(o => o.id === id)!;
        const prototype = await rules!.prototype(def); return prototype?.clone(true) ?? null;
      }));
      village.crypt.revelation.setOfferings(models);
    })(),
    descendOfferings: progress => {
      village?.crypt.revelation.setDescent(progress);
      village?.pedestals.setRelocated(progress > 0);
    },
    finish: () => { renderHud(); showChapterEnding(); },
  });
  function beginAct18() {
    if (storyFlags.act < 18) setStoryAct(storyFlags, 18);
    setYokaiActive(false);
    matsuri?.onOffered();
    if (chochin) chochin.threat = 0;
    village?.shrine.honden.setStage(4); village?.crypt.setOpen(true);
    renderHud(); saveCheckpoint();
    void act18.resume().catch(error => { console.warn('[act18] 복원 중단', error); renderHud(); });
  }

  const VILLAGE_EVIDENCE = ['village:tea', 'village:tv', 'village:geta', 'village:furin', 'village:watcher'] as const;
  const SUZU_EVIDENCE = ['suzu:ema-left', 'suzu:ema-right', 'suzu:altar-back'] as const;
  /** 플레이어가 실제로 세 금줄을 푼 순서. 추격에서는 이 배열의 역순으로 되묶는다. */
  let suzuWardOrder: number[] = [];
  type RokuroTrialPhase = 'idle' | 'waking' | 'binding' | 'escape';
  let rokuroTrialPhase: RokuroTrialPhase = 'idle';
  let rokuroRebindStep = 0;
  let rokuroTrialCleared = false;
  let rokuroEncounterSeen = false;
  /** setTimeout으로 늦게 내려오는 보스가 실패·리셋 뒤 다시 켜지지 않게 하는 세대 번호. */
  let rokuroWakeToken = 0;
  let syncSuzuWardVisuals: () => void = () => {};
  let beginRokuroTrial: (source: 'pickup' | 'resume') => void = () => {};
  const normalizedSuzuWardOrder = () => {
    const out: number[] = [];
    for (const i of suzuWardOrder) if (Number.isInteger(i) && i >= 0 && i < SUZU_EVIDENCE.length && !out.includes(i)) out.push(i);
    // 구 세이브·QA는 조사 완료 플래그만 있고 당시 순서는 없다. 그 경우 기존 안내 순서를 쓴다.
    for (let i = 0; i < SUZU_EVIDENCE.length; i++) if (!out.includes(i)) out.push(i);
    return out;
  };
  const suzuRebindOrder = () => normalizedSuzuWardOrder().reverse();
  const nextSuzuWard = () => suzuRebindOrder()[rokuroRebindStep];
  const SCHOOL_EVIDENCE = ['school:journal', 'school:attendance', 'school:desk-name', 'school:crayon'] as const;
  const WELL_SURFACE_EVIDENCE = ['well:surface-tray', 'well:surface-rope', 'well:surface-footprints'] as const;
  const WELL_EVIDENCE = ['well:niche-0', 'well:niche-1', 'well:niche-2'] as const;
  const WELL_ANSWER_EVIDENCE = ['well:answer-death', 'well:answer-voice', 'well:answer-silence', 'well:answer-truth'] as const;
  const WELL_ESCAPE_EVIDENCE = ['well:escape-voice', 'well:escape-stone', 'well:escape-truth'] as const;
  const wellSurfaceComplete = () => countOf(WELL_SURFACE_EVIDENCE) === WELL_SURFACE_EVIDENCE.length;
  const wellAnswer = (): WellFirstAnswer | null => {
    const index = WELL_ANSWER_EVIDENCE.findIndex((id) => evidence.has(id));
    return index < 0 ? null : (['death', 'voice', 'silence', 'truth'] as const)[index]!;
  };
  /** 우물 숏의 카메라·자막 수명을 묶고, 마지막 프레임을 3인칭 카메라에 인계한다. */
  const playWellCinematic = async (sequence: Sequence, lines: readonly DialogueLine[] = []) => {
    const previousView = { yaw: tpCam.yaw, pitch: tpCam.pitch, distance: tpCam.currentDistance };
    wellCinematicPlaying = true;
    try {
      const playing: Promise<void>[] = [sequencer.play(sequence)];
      if (lines.length) playing.push(dialogue.say(...lines));
      await Promise.all(playing);
    } finally {
      tpCam.adoptCurrentView(controller.position, previousView);
      wellCinematicPlaying = false;
    }
  };
  /**
   * 폐여관은 **도구를 얻어야 목적지에 닿는** 유일한 구역이라 단계가 넷이다(§5.3.5):
   * 벽거울(배운다) → 와쿄(도구) → 마주 거울(통과) → 큰 거울(목표).
   * 이 순서를 지시자에 그대로 태우지 않으면 **아직 못 가는 큰 거울만** 가리키게 된다.
   */
  const INN_EVIDENCE = ['inn:wall-mirror', 'inn:wakyo', 'inn:passage', 'inn:mirror'] as const;
  const MANOR_EVIDENCE = ['manor:seal', 'manor:substitute', 'manor:search'] as const;
  /**
   * 지하 기록실 3종 (ACT 15) — 대청 문서의 내용을 물증으로 보강하는 **선택 조사**다.
   * 개정 스토리보드의 필수 순서는 대청 문서 3 → 봉인패 획득 → ACT 16 이므로, 이 목록은
   * 봉인패 획득이나 ACT 전환을 막지 않는다. ACT 20의 혈족 대리 반전도 여기서 미리 밝히지 않는다.
   */
  const ARCHIVE_EVIDENCE = ['manor:roster', 'manor:minutes', 'manor:ihai'] as const;
  const evidenceCount = (prefix: string) => [...evidence].filter((id) => id.startsWith(prefix)).length;
  const missingEvidence = (ids: readonly string[]) => ids.find((id) => !evidence.has(id));
  /**
   * 진행도는 **목록 기준**으로 센다. 접두사(`evidenceCount('inn:')`)로 세면 같은 구역의
   * 목록 밖 증거까지 딸려 온다 — 여관은 숙박부·계단이 있어 **6/4** 가 되고, 폐교도 `school:called`·
   * `school:crayon-recalled` 때문에 4 를 넘길 수 있었다(코드 감사에서 발견).
   * 우물만 `well:niche-` 라는 좁은 접두사로 우연히 피해 가고 있었다.
   */
  const countOf = (ids: readonly string[]) => ids.filter((id) => evidence.has(id)).length;
  const truth = new TruthReconstruction(evidence, dialogue, (id) => rememberEvidence(id));
  const mirrorMemory = new MirrorMemory({
    evidence, dialogue,
    begin: () => { setStoryAct(storyFlags, 14); village?.inn.showMirrorMemory(45); saveCheckpoint(); },
    remember: (id) => rememberEvidence(id),
  });
  const reconstructingTruth = () => !!rules?.carried.includes('fuda') && !rules.fudaRefused && !truth.complete;
  const makeCase = (def: InvestigationCaseDef) => new InvestigationCase(def, evidence, dialogue,
    (id) => rememberEvidence(id), () => { if (storyFlags.act < def.act) setStoryAct(storyFlags, def.act); });
  const graveyardCase = makeCase(GRAVEYARD_CASE), innCase = makeCase(INN_CASE), manorCase = makeCase(MANOR_CASE);
  const innAfterimage = makeCase(INN_AFTERIMAGE_CASE);
  let syncDispatchPrompts = () => {};
  const manorDispatch = new ManorDispatch({
    evidence, dialogue, remember: (id) => rememberEvidence(id),
    begin: () => { if (storyFlags.act < 15) setStoryAct(storyFlags, 15); },
    canUse: () => dispatchRequired(rules?.stateOf('fuda') === 'open', evidence)
      && MANOR_EVIDENCE.every(id => evidence.has(id)),
    saveSetting: (code) => {
      for (const id of evidence) if (id.startsWith(DISPATCH_SETTING)) evidence.delete(id);
      evidence.add(DISPATCH_SETTING + code); storyFlags.evidence = [...evidence];
      saveCheckpoint(); syncDispatchPrompts(); renderHud();
    },
    proof: (values, matches) => {
      const device = village?.manorInterior.dispatch;
      device?.showProof(values, matches);
      if (device) sfx.doorPush(device.pressPos.x, device.pressPos.y, device.pressPos.z);
      if (matches) sfx.bellAfterimage(0.14);
    },
  });
  const inGraveyardHollow = () => village?.graveyard.hollow.contains(controller.position) ?? false;
  const graveyardFold = document.createElement('div'); graveyardFold.className = 'graveyard-fold'; document.body.appendChild(graveyardFold);
  let graveyardGateHold = 0;
  const graveyardPassage = new GraveyardPassage({
    evidence, dialogue, remember: (id) => rememberEvidence(id), inside: inGraveyardHollow,
    hasGeta: () => !!rules?.carried.includes('geta'),
    canEnter: () => rules?.stateOf('geta') === 'open' && (graveyardCase.complete || evidence.has('graveyard:palm')),
    travel: async (to) => {
      if (!village) return;
      graveyardFold.classList.add('show');
      sfx.bellAfterimage(0.24);
      try {
        await gameClock.wait(380);
        const grave = village.graveyard, hollow = grave.hollow;
        const destination = to === 'outside' ? grave.returnPos : hollow.landing;
        if (to !== 'outside') await hollow.detail.prepare(destination);
        controller.teleport(destination);
        spawn.copy(destination);
        tpCam.snapBehind(destination, to === 'outside' ? grave.getaPos : hollow.getaPos);
        village.update(0, controller.position);
        graveyardGateHold = 0;
        renderHud(); saveCheckpoint();
        await gameClock.wait(180);
      } finally { graveyardFold.classList.remove('show'); }
      await gameClock.wait(340);
    },
    farewell: () => playGraveyardFarewell(),
  });
  async function playGraveyardFarewell() {
    const vv = village;
    if (!vv || evidence.has('graveyard:palm')) return;
    vv.graveyard.beginHaunt();
    vv.graveyard.disperse(controller.position);
    sfx.bellAfterimage(0.2);              // 웃음이 끊긴 자리의 잔향
    await dialogue.say(
      { text: L('붉은 매듭을 건너 돌아오자 아이들의 웃음이 동시에 멎었다.', '赤い結び目を越えて戻ると、子供たちの笑い声が一斉に止んだ。') },
      { text: L('둘은 붉은 꽃잎이 되어 흩어지고, 가장 어린 아이 하나만 남는다.', '二人は赤い花弁になって散り、いちばん幼い子だけが残る。') },
    );
    sfx.voice(0.3, 'girl');
    await dialogue.say(
      { who: L('아이', '子供'), text: L('사요 누나는?', 'サヨお姉ちゃんは?') },
      { who: MIO_NAME, text: L('너…… 우리 언니 알아?', 'あなた……わたしの姉を知ってるの?') },
      { who: L('아이', '子供'), text: L('사요 누나는 아직 신사에 있잖아.', 'サヨお姉ちゃんは、まだ社にいるじゃない。') },
      { who: MIO_NAME, text: L('뭐?', 'なに?') },
      // 이 사이에 아이가 발소리 없이 1.15 m 앞까지 와 있다 (graveyard.update)
      { text: L('아이가 소리 없이 코앞까지 와 있다. 작은 손이 미오의 손을 펴게 한다.', '子供が音もなく目の前まで来ている。小さな手がミオの掌を開かせる。') },
    );
    await palmSign.play();
    await dialogue.say(
      { who: L('아이', '子供'), text: L('무서울 때 사요 누나가 해줬어.', '怖いとき、サヨお姉ちゃんがしてくれた。') },
      ...(evidence.has('inn:mirror') ? [{ who: MIO_NAME, text: L('거울 속 언니도 똑같이 했어. 나한테만 해 준 게 아니었구나.', '鏡の中の姉も同じことをしてた。私にだけしてくれたんじゃなかったんだ。') }] : []),
    );
    rememberEvidence('graveyard:palm');
    vv.graveyard.dismissLast();          // 고개를 들면 그 자리에 없다
    sfx.bellAfterimage(0.14);
    await dialogue.say(
      { text: L('고개를 들자 아이는 없다. 붉은 꽃잎만 아직 떠 있다.', '顔を上げると子供はいない。赤い花弁だけがまだ漂っている。') },
      { who: MIO_NAME, text: L('언니는 이 아이들도 달래 줬던 거구나. 아직 신사에 있다면…… 직접 확인해야 해.', '姉はこの子たちも慰めていたんだ。まだ社にいるなら……自分で確かめなきゃ。') },
    );
  }
  const investigationsBusy = () => act18.busy || graveyardCase.busy || innCase.busy || innAfterimage.busy || manorCase.busy || manorDispatch.busy || graveyardPassage.busy;
  // 이미 공물/통로를 얻은 구버전 저장에는 새로운 획득 조건을 소급하지 않는다.
  const graveyardCaseActive = () => rules?.stateOf('geta') === 'open' && !evidence.has('graveyard:palm') && !graveyardCase.complete;
  const innCaseActive = () => rules?.stateOf('kagami') === 'open' && !evidence.has('inn:passage') && !evidence.has('inn:mirror') && !innCase.complete;
  const innWaitingActive = () => innAfterimageActive(rules?.stateOf('kagami') === 'open', evidence);
  const manorDispatchActive = () => dispatchRequired(rules?.stateOf('fuda') === 'open', evidence)
    && MANOR_EVIDENCE.every(id => evidence.has(id));
  const manorCaseActive = () => !!rules && !rules.fudaRefused && !manorCase.complete
    && (rules.stateOf('fuda') === 'open' || rules.carried.includes('fuda')) && MANOR_EVIDENCE.every((id) => evidence.has(id));
  const inManorArchive = () => !!village && controller.position.y < village.manorInterior.archiveFloorY + 2
    && controller.position.y > village.manorInterior.archiveFloorY - 1
    && controller.position.distanceToSquared(village.manorInterior.archiveEnter) < 7 * 7;
  const dispatchGuide = () => {
    if (!village || !manorDispatchActive()) return null;
    const mi = village.manorInterior, device = mi.dispatch, p = controller.position;
    if (!village.manor.contains(p) && !inManorArchive()) return { pos: village.manor.doorPos, label: L('촌장집의 결재함을 조사하자', '村長の家の決裁箱を調べよう') };
    const i = manorDispatch.nextClue;
    let pos = manorDispatch.hasKey ? device.unlockPos : manorDispatch.printed ? device.keyPos
      : i >= 0 ? device.cluePositions[i]! : device.pressPos;
    let label = manorDispatch.hasKey ? L('열쇠로 대청 불단의 봉인패 덮개를 연다', '鍵で広間の仏壇の覆いを開く')
      : manorDispatch.printed ? L('열린 결재함 서랍에서 불단 열쇠를 집는다', '開いた決裁箱の引き出しから仏壇の鍵を取る')
      : i >= 0 ? DISPATCH_CLUES[i]!.prompt
      : L('인장판 세 개를 최초 배부본에 맞추고 손잡이를 누른다', '三枚の印字板を最初の控えに合わせて取っ手を押す');
    const below = p.y < mi.archiveFloorY + 2;
    if (below !== (pos.y < mi.archiveFloorY + 2)) {
      pos = below ? mi.archiveEnter : mi.hatchPos;
      label = below ? L('사다리로 대청에 올라간다', '梯子で広間へ上がる') : L('마루 뚜껑을 열고 지하 기록실로 내려간다', '床の蓋を開けて地下の記録室へ下りる');
    }
    return { pos, label };
  };
  const investigationGuide = () => {
    if (!village) return null;
    const p = controller.position;
    const selected = graveyardCaseActive() && village.graveyard.contains(p, 18)
      ? { story: graveyardCase, clues: village.graveyard.playCluePositions, steps: village.graveyard.playResolvePositions }
      : innCaseActive() && village.inn.contains(p)
        ? { story: innCase, clues: village.innInterior.guestCluePositions, steps: village.innInterior.guestResolvePositions }
        : innWaitingActive() && village.inn.contains(p)
          ? { story: innAfterimage, clues: village.innInterior.memoryCluePositions, steps: village.innInterior.memoryResolvePositions }
        : manorCaseActive() && (village.manor.contains(p) || inManorArchive()) && (manorCase.started || inManorArchive())
          ? { story: manorCase, clues: village.manorInterior.orderCluePositions, steps: village.manorInterior.orderResolvePositions }
          : null;
    if (!selected) return null;
    const { story, clues, steps } = selected;
    const index = story.nextClue;
    let pos = (index >= 0 ? clues[index] : steps[story.nextStep])!;
    let label = index >= 0 ? story.def.clues[index]!.prompt : story.def.steps[story.nextStep]!.prompt;
    if (story === innCase && index === 2 && !inventory.has('wakyo')) {
      pos = village.innInterior.wakyoPos; label = L('객실의 와쿄를 찾는다', '客室の和鏡を探す');
    }
    if (story === innAfterimage) {
      const inn = village.innInterior;
      if ((p.x > inn.secretPos.x) !== (pos.x > inn.secretPos.x)) {
        const inside = p.x > inn.secretPos.x;
        pos = inside ? inn.passageReturnPos : inn.passageEntryPos;
        label = inside ? L('안쪽 벽거울에 와쿄를 마주 대고 객실로 돌아간다', '内側の壁鏡に和鏡を合わせ、客室へ戻る')
          : L('벽거울에 와쿄를 마주 대고 보관함으로 돌아간다', '壁鏡に和鏡を合わせ、預かり箱へ戻る');
      }
    }
    if (story === manorCase) {
      const below = p.y < village.manorInterior.archiveFloorY + 2;
      const targetBelow = pos.y < village.manorInterior.archiveFloorY + 2;
      if (below !== targetBelow) {
        pos = below ? village.manorInterior.archiveEnter : village.manorInterior.hatchPos;
        label = below ? L('서재로 올라간다', '書斎へ上がる') : L('지하 접수 대장을 확인한다', '地下の受理台帳を確かめる');
      }
    }
    return { story, pos, label };
  };
  const graveyardGuide = () => {
    if (!village || !rules) return null;
    const h = village.graveyard.hollow;
    if (inGraveyardHollow()) {
      if (rules.carried.includes('geta')) return { pos: h.exit, label: L('게다를 가지고 붉은 매듭의 문으로 돌아가자', '下駄を持って赤い結び目の門へ戻ろう') };
      if (graveyardPassage.matched) return { pos: h.getaPos, label: L('짝이 맞는 아이의 게다를 집는다', '揃った子供の下駄を拾う') };
      const i = graveyardPassage.nextClue;
      return i >= 0 ? { pos: h.clues[i]!, label: HOLLOW_CLUES[i]!.prompt }
        : { pos: null, label: L('돌아오는 발자국을 따라 수선한 게다의 짝을 찾는다', '戻ってくる足跡を辿り、直した下駄の片割れを探す') };
    }
    if (rules.stateOf('geta') === 'open' && (graveyardCase.complete || evidence.has('graveyard:palm')) && village.graveyard.contains(controller.position, 22)) {
      // 관찰 퍼즐의 정답 좌표를 화살표로 공개하지 않는다. 실제 여섯 얼굴의 방향을 읽는다.
      return { pos: null, label: L('여섯 지장의 시선이 모이는 빈자리에 서 보자', '六体の地蔵の視線が集まる空きに立ってみよう') };
    }
    return null;
  };
  const renderHud = () => {
    if (!rules) return;
    const investigation = investigationGuide();
    const graveGuide = graveyardGuide();
    const manorGuide = dispatchGuide();
    const innReturnGuide = village?.inn.contains(controller.position)
      && controller.position.x > village.innInterior.secretPos.x + 0.12 && rules.carried.includes('kagami')
      ? { pos: village.innInterior.passageReturnPos, label: L('안쪽 벽거울에 와쿄를 마주 대고 객실로 돌아가자', '内側の壁鏡に和鏡を合わせて客室へ戻ろう') } : null;
    village?.graveyard.hollow.setProgress(graveyardPassage.matched, !!rules.carried.includes('geta') || rules.offeredSet.has('geta'));
    village?.graveyard.setPlayReconstructed(graveyardCase.nextStep > 0 || graveyardCase.complete);
    village?.innInterior.setGuestRouteKnown(innCase.complete || evidence.has('inn:passage'));
    village?.innInterior.setMemoryProgress(innAfterimage.hasClue(0), innAfterimage.nextStep > 0 || innAfterimage.complete, innAfterimage.complete);
    village?.manorInterior.dispatch.setProgress(manorDispatch.setting, DISPATCH_CLUES.map(c => evidence.has(c.id)),
      manorDispatch.printed, manorDispatch.hasKey,
      !dispatchRequired(true, evidence) || rules.carried.includes('fuda') || rules.offeredSet.has('fuda') || rules.fudaRefused,
      evidence.has('manor:hatch'));
    // 목표 문구 = 히간누시의 명령문 (PLAN-STORY §4.1 — UI 가 히간누시다)
    if (!tutorialDone) {
      quests.set(L(`기본 조작을 익혀라  <b>${tutorialProgress}</b> / 3`, `基本操作を覚えよ  <b>${tutorialProgress}</b> / 3`), 'none');
    } else if (restoreResolutionPlaying) {
      quests.set(L('【완료한 목표는 되돌릴 수 없습니다】', '【完了した目標は取り消せません】'), 'none');
    } else if (restoreWarningPlaying) {
      // 방송이 끝나기 전까지 UI는 아무 일도 없었다는 듯 기존 명령을 고집한다.
      quests.set(L('7개의 공물을 찾아라  <b>3</b> / 7', '七つの供物を探せ  <b>3</b> / 7'), 'gm');
    } else if (restoreWarningReady && !restoreFirstDone) {
      quests.set(L('놓아둔 공물을 되찾아라', '供えた供物を取り戻せ'), 'none');
    } else if (act17.state === 'complete') {
      if (!act18.busy) quests.set(act18.complete
        ? L('ACT 18 완료 · 남은 흔적을 둘러볼 수 있다', 'ACT 18 完了 · 残された痕を探索できる')
        : !rules.carried.includes('fuda') ? L('촌장집에서 봉인패를 되찾아라', '村長屋敷で封印札を取り戻せ')
        : !village?.crypt.contains(controller.position) ? L('신사 동쪽 마루 아래로 내려가라', '社の東側、床下へ下りよ')
        : act18.nextTrace >= 0 ? L(`지하에서 명령의 근원을 확인하라  <b>${3 - CRYPT_TRACES.filter(t => !evidence.has(t.id)).length}</b> / 3`, `地下で命令の根源を確かめよ  <b>${3 - CRYPT_TRACES.filter(t => !evidence.has(t.id)).length}</b> / 3`)
        : L('검은 문 앞의 형체를 확인한다', '黒い門の前の姿を確かめる'), 'none');
    } else if (rules.fudaRefused) {
      // ACT 17 — 글리치 시퀀스가 목표를 잡고 있다. 여기서 덮지 않는다
    } else if (!rules.started) {
      const found = evidenceCount('village:');
      quests.set(!tabletEventReady
        ? L('방송을 들으며 참배로를 따라 마을로 들어가라', '放送を聞きながら参道を辿り、村へ入れ')
        : tabletRead && found < 3
        ? L(`사람이 사라지기 직전의 흔적을 조사하라  <b>${found}</b> / 3`, `人が消える直前の痕跡を調べよ  <b>${found}</b> / 3`)
        : tabletRead
          ? L('마을 한가운데의 제단으로 가라', '村の真ん中の祭壇へ行け')
          : L('참배로의 돌비석을 찾아 이끼를 닦아라', '参道の石碑を探し、苔を拭え'), 'gm');
    } else if (rokuroTrialPhase === 'waking') {
      quests.set(L('닫힌 사당에서 살아남아라', '閉ざされた祠で生き延びよ'), 'gm');
    } else if (rokuroTrialPhase === 'binding') {
      quests.set(L(`푼 매듭을 역순으로 되묶어라  <b>${rokuroRebindStep}</b> / 3`, `解いた結びを逆順に結び直せ  <b>${rokuroRebindStep}</b> / 3`), 'gm');
    } else if (rokuroTrialPhase === 'escape') {
      quests.set(L('열린 문으로 탈출하라', '開いた戸から逃げろ'), 'gm');
    } else if (rules.carried.includes('coins') && village?.wellShaft.inChamber(controller.position)) {
      quests.set(L(`물소리가 끊긴 틈에 밧줄로 돌아가라  ·  조약돌 ${wellPebbles}`, `水音が途切れた隙に縄へ戻れ  ·  小石 ${wellPebbles}`), 'none');
    } else if (graveGuide) {
      quests.set(graveGuide.label, 'none');
    } else if (innReturnGuide) {
      quests.set(innReturnGuide.label, 'none');
    } else if (manorGuide) {
      quests.set(`${L('세 겹의 결재인', '三重の決裁印')} · ${manorDispatch.nextClue >= 0 ? `${manorDispatch.clueCount}/3` : L('원본 복원', '原本の復元')}<br>${manorGuide.label}`, 'none');
    } else if (investigation) {
      const c = investigation.story;
      const prefix = c.def.optional ? L('[선택 조사] ', '[任意調査] ') : '';
      quests.set(`${prefix}${c.def.title} · ${c.nextClue >= 0 ? `${c.clueCount}/${c.def.clues.length}` : L('흔적 대조', '痕の照合')}<br>${investigation.label}`, 'none');
    } else if (reconstructingTruth()) {
      quests.set(L(`저택의 기록과 기억을 대조하자  <b>${truth.next}</b> / 3`, `屋敷の記録と記憶を照合しよう  <b>${truth.next}</b> / 3`), 'none');
    } else if (rules.carried.includes('fuda')) {
      quests.set(L('봉인패를 지닌 채 제단의 문양을 확인하자', '封印札を持ち、祭壇の紋を確かめよう'), 'none');
    } else if (rules.carrying) {
      const def = rules.offerings.find((o) => o.id === rules!.carried[0])!;
      quests.set(L(`${def.name}${eul(def.name)} 제단으로 가져와라`, `${def.name}を祭壇へ運べ`), 'gm');
    } else {
      const avail = rules.available();
      const GOALS: Record<string, string> = {
        suzu: L('오래된 사당을 조사하라', '古い祠を調べよ'), kushi: L('폐교를 조사하라', '廃校を調べよ'),
        coins: L('공동우물을 조사하라', '共同井戸を調べよ'), geta: L('공동묘지를 조사하라', '無縁墓地を調べよ'),
        kagami: L('폐여관을 조사하라', '廃旅館を調べよ'), fuda: L('촌장의 저택을 조사하라', '村長の屋敷を調べよ'),
      };
      const first = avail[0];
      if (first === 'suzu' && countOf(SUZU_EVIDENCE) < SUZU_EVIDENCE.length) {
        quests.set(L(`방울을 묶은 금기를 조사하라  <b>${countOf(SUZU_EVIDENCE)}</b> / 3`, `鈴を縛る禁を調べよ  <b>${countOf(SUZU_EVIDENCE)}</b> / 3`), 'gm');
      } else if (first === 'kushi' && !evidence.has('school:called')) {
        const n = countOf(SCHOOL_EVIDENCE);
        quests.set(n < SCHOOL_EVIDENCE.length
          ? L(`폐교에서 지워진 이름의 단서를 찾아라  <b>${n}</b> / 4`, `廃校で消された名の手掛かりを探せ  <b>${n}</b> / 4`)
          : L('방송실에서 지워진 이름을 불러라', '放送室で消された名を呼べ'), 'gm');
      } else if (first === 'coins' && countOf(WELL_EVIDENCE) < WELL_EVIDENCE.length) {
        const below = village?.wellShaft.inChamber(controller.position) ?? false;
        const surfaceFound = countOf(WELL_SURFACE_EVIDENCE);
        quests.set(!below && surfaceFound < WELL_SURFACE_EVIDENCE.length
          ? L(`우물가의 장례 흔적을 대조하라  <b>${surfaceFound}</b> / 3  ·  하강은 언제든 가능`, `井戸端の葬送痕を照合せよ  <b>${surfaceFound}</b> / 3  ·  いつでも下降可`)
          : L(`우물 벽감에 남은 흔적을 확인하라  <b>${countOf(WELL_EVIDENCE)}</b> / 3`, `井戸の壁龕に残る痕跡を確かめよ  <b>${countOf(WELL_EVIDENCE)}</b> / 3`), 'gm');
      } else if (first === 'kagami' && !evidence.has('inn:mirror')) {
        const n = countOf(INN_EVIDENCE);
        quests.set(L(`폐여관의 거울을 따라가라  <b>${n}</b> / 4`, `廃旅館の鏡をたどれ  <b>${n}</b> / 4`), 'gm');
      } else if (first === 'fuda' && countOf(MANOR_EVIDENCE) < MANOR_EVIDENCE.length) {
        quests.set(L(`촌장 저택의 기록을 조사하라  <b>${countOf(MANOR_EVIDENCE)}</b> / 3`, `村長屋敷の記録を調べよ  <b>${countOf(MANOR_EVIDENCE)}</b> / 3`), 'gm');
      } else if (avail.length >= 2) quests.set(L('공동묘지와 폐여관을 조사하라', '無縁墓地と廃旅館を調べよ'), 'gm');
      else if (avail.length === 1) quests.set(GOALS[avail[0]!] ?? L('공물을 찾아라', '供物を探せ'), 'gm');
      else quests.set(L(`7개의 공물을 찾아라  <b>${rules.offered}</b> / 7`, `七つの供物を探せ  <b>${rules.offered}</b> / 7`), 'gm');
    }
    // 가짜 퀘스트를 받기 전에는 미오도 ‘일곱 공물’을 모른다. 프레임부부터 체크리스트를
    // 전부 보여 주면 ACT 5 의 계시가 메뉴에서 먼저 스포일러되고, 첫 자유 조작 화면도 무겁다.
    // 제단이 명령을 내린 순간에만 목록이 처음 펼쳐진다.
    missionEl.classList.toggle('prelude', !rules.started);
    missionList.innerHTML = rules.started ? rules.offerings.map((o) => {
      const st = rules!.stateOf(o.id);
      const label = st === 'offered' ? L('봉납', '奉納') : st === 'carried' ? L('운반 중', '運搬中') : st === 'open' ? o.where : '─';
      const cls = st === 'offered' ? 'got' : st === 'carried' ? 'carry' : st === 'locked' ? 'lock' : '';
      return `<li class="${cls}" style="--c:#${o.color.toString(16).padStart(6, '0')}"><span class="dot"></span><span class="nm">${o.name}</span><span class="where">${label}</span></li>`;
    }).join('') : '';
    missionEl.classList.toggle('done', rules.fudaRefused);
    // 목표 지시자는 **목표 문구와 같은 판단**에서 나온다 — 따로 적어 두면 반드시 어긋난다
    if (village) {
      const vv2 = village;
      if (!tutorialDone) waypoint.set(null);
      else if (restoreWarningPlaying || restoreResolutionPlaying) waypoint.set(null);
      else if (restoreWarningReady && !restoreFirstDone) waypoint.set(vv2.pedestals.slots[0]!, L('붉은 방울', '赤い鈴'));
      else if (act17.state === 'complete') {
        const c = vv2.crypt;
        waypoint.set(act18.busy || act18.complete ? null : !rules.carried.includes('fuda') ? vv2.manor.featurePos
          : !c.contains(controller.position) ? c.entryTop : controller.position.x > c.gatePos.x + 1.1 && controller.position.z > c.entryTop.z - 1.1
            ? new THREE.Vector3(c.gatePos.x, c.floorY + 0.3, c.entryTop.z)
            : act18.nextTrace >= 0 ? c.revelation.traces[act18.nextTrace]! : c.revelation.encounterPos,
        !rules.carried.includes('fuda') ? L('봉인패', '封印札') : !c.contains(controller.position)
          ? L('신사 지하 입구', '社の地下入口') : L('명령이 내려오는 길', '命令の下りてくる道'));
      }
      else if (rules.fudaRefused) waypoint.set(null);
      else if (!rules.started) {
        if (!tabletEventReady) {
          waypoint.set(vv2.tablet.pos, L('참배로', '参道'));
          return;
        }
        const found = evidenceCount('village:');
        const missing = missingEvidence(VILLAGE_EVIDENCE);
        const firstClue = missing ? lifesigns?.cluePositions.get(missing.split(':')[1]!) : null;
        /**
         * 남은 흔적을 **끝까지 가리킨다.** 예전엔 첫 하나만 정확히 짚고 그다음부터 「마을 골목」
         * 중심만 보여 줬는데, 흔적은 마을 전체(골목 여섯)에 흩어져 있어 두 번째부터는 사실상 안내가
         * 없는 것과 같았다(사용자 리포트: 「세 번째 흔적이 안 보인다」).
         * 좌표를 모르는 흔적만 골목 중심으로 떨어진다.
         */
        const villageArea = vv2.speakers.noticePos;
        waypoint.set(tabletRead && found < 3
          ? (firstClue ?? villageArea)
          : (tabletRead ? vv2.pedestals.slabPos : vv2.tablet.pos),
        tabletRead && found < 3
          ? (firstClue ? L(`생활 흔적 ${found + 1}/3`, `生活痕 ${found + 1}/3`) : L('마을 골목', '村の路地'))
          : (tabletRead ? L('제단', '祭壇') : L('돌비석', '石碑')));
      }
      else if (rokuroTrialPhase === 'waking') waypoint.set(null);
      else if (rokuroTrialPhase === 'binding') {
        const next = nextSuzuWard();
        waypoint.set(next === undefined ? null : vv2.hokora.wardPositions[next]!, L('되묶을 매듭', '結び直す結び目'));
      }
      else if (rokuroTrialPhase === 'escape') waypoint.set(vv2.hokora.ejectPos, L('사당 밖', '祠の外'));
      else if (graveGuide) waypoint.set(graveGuide.pos, graveGuide.label);
      else if (innReturnGuide) waypoint.set(innReturnGuide.pos, innReturnGuide.label);
      else if (manorGuide) waypoint.set(manorGuide.pos, manorGuide.label);
      else if (investigation) waypoint.set(investigation.pos, investigation.label);
      else if (inManorArchive()) waypoint.set(vv2.manorInterior.archiveEnter, L('사다리로 대청에 올라간다', '梯子で広間へ上がる'));
      else if (reconstructingTruth()) waypoint.set(vv2.manor.contains(controller.position)
        ? vv2.manor.recordPositions[truth.next]! : vv2.manor.doorPos, L('기억이 겹치는 기록', '記憶が重なる記録'));
      else if (rules.carrying) waypoint.set(vv2.pedestals.slabPos, L('제단', '祭壇'));
      else {
        const avail = rules.available();
        const first = avail[0];
        let clue: THREE.Vector3 | undefined;
        let clueLabel = '';
        let zonePuzzle = false;
        /**
         * **건물에 들어가면 지시자가 사라지던 문제** (사용자 리포트: 「사당 안 금기 조사가 안 보인다」).
         * 밖에서는 건물로, 안에서는 **남은 조사점 하나로** 이어서 가리킨다 — 저택 분기가 이미
         * 그렇게 하고 있었는데 사당·폐교·우물만 안쪽 안내가 비어 있었다(들어서는 순간 clue 가 undefined).
         * 넓힌 실내(폐교 378 · 여관 285 m²)에서 작은 조사점을 맨눈으로 찾으라는 건 탐색이 아니라 술래잡기다.
         */
        const zoneStep = <T extends readonly string[]>(
          list: T, inside: boolean, gate: THREE.Vector3, gateLabel: string,
          spots: (THREE.Vector3 | undefined)[], innerLabel: string,
          extra?: { spot: THREE.Vector3; label: string },
        ) => {
          const id = missingEvidence(list);
          if (!id && !extra) return;
          zonePuzzle = true;
          if (!inside) { clue = gate; clueLabel = gateLabel; return; }
          const i = id ? list.indexOf(id) : -1;
          /**
           * 목록 뒤의 추가 단계(`extra`)도 **좌표째** 받는다. 예전에는 불리언이라 이 단계에
           * 목적지가 없었고, `clue` 가 비면 지시자는 이름조차 없이 **통째로 꺼진다** —
           * 문구만 「방송실에서 불러라」로 바뀌고 화면에는 아무 안내도 남지 않았다
           * (사용자 리포트 2026-08-27 「목표지시자가 안 뜨는 것들」, 폐교 실내에서 재현).
           */
          const spot = i >= 0 ? spots[i] : extra?.spot;
          if (spot) { clue = spot; clueLabel = i >= 0 ? innerLabel : extra!.label; }
          else clueLabel = gateLabel;
        };
        if (first === 'geta') {
          clue = vv2.graveyard.playCluePositions[0]!; clueLabel = L('공동묘지의 돌탑', '墓地の石塔'); zonePuzzle = true;
        } else if (first === 'suzu') {
          zoneStep(SUZU_EVIDENCE, vv2.hokora.contains(controller.position),
            vv2.hokora.ejectPos, L('오래된 사당 내부', '古い祠の内部'),
            vv2.hokora.wardPositions, L('금기 매듭', '禁の結び'));
        } else if (first === 'kushi') {
          const si = vv2.schoolInterior;
          // 단서 4/4 뒤의 「이름을 불러라」까지 방송실 좌표로 잇는다 — 확장된 폐교(378 m²)에서
          // 방송실은 맨눈으로 찾는 대상이 아니다. 밖에 있으면 여전히 문이 먼저다.
          zoneStep(SCHOOL_EVIDENCE, si.contains(controller.position),
            vv2.school.doorPos, L('폐교 내부', '廃校の内部'),
            [si.journalPos, si.attendancePos, si.deskNamePos, si.crayonPos],
            L('남은 기록', '残る記録'),
            evidence.has('school:called') ? undefined : { spot: si.broadcastPos, label: L('방송실', '放送室') });
        } else if (first === 'coins') {
          // 개정 ACT 10: 지상에서는 우물까지 안내하지만 **지하에서는 지시자를 끈다**.
          // 달빛·서로 다른 실물 벽감·물방울 반향으로 읽는 첫 공간이며, 마지막 조사 순서가
          // 탈출 동선을 바꾸므로 정답 좌표를 UI가 미리 정해 주면 안 된다.
          if (vv2.wellShaft.inChamber(controller.position)) zonePuzzle = true;
          else {
            zonePuzzle = true;
            clue = vv2.well.pos;
            clueLabel = L('공동우물 내부', '共同井戸の内部');
          }
        } else if (first === 'kagami') {
          const ii2 = vv2.innInterior;
          zoneStep(INN_EVIDENCE, vv2.inn.contains(controller.position),
            vv2.inn.doorPos, L('폐여관 내부', '廃旅館の内部'),
            [ii2.wallMirrorPos, ii2.wakyoPos, ii2.secretPos, vv2.inn.mirrorPos ?? undefined],
            L('다음 거울', '次の鏡'));
        } else if (first === 'fuda') {
          if (countOf(MANOR_EVIDENCE) < MANOR_EVIDENCE.length) {
            // 대청 단계 — 밖에서는 현관, 안에서는 남은 기록 하나
            zoneStep(MANOR_EVIDENCE, vv2.manor.contains(controller.position),
              vv2.manor.doorPos, L('촌장의 저택 내부', '村長屋敷の内部'),
              vv2.manor.recordPositions, L('촌장의 기록', '村長の記録'));
          }
        }
        const def = rules.available().map((id) => rules!.offerings.find((o) => o.id === id)).find((o) => o?.pos);
        if (zonePuzzle) waypoint.set(clue ?? null, clue ? clueLabel : '');
        else waypoint.set(clue ?? def?.pos ?? vv2.pedestals.slabPos, clue ? clueLabel : (def ? def.where : L('제단', '祭壇')));
      }
    }
  };
  /**
   * 저장 지점의 단일 계약. 플래그만 저장하면 이어하기 때 받침대·운반품·조사 게이트가 서로
   * 다른 ACT를 가리키므로, 플레이어 위치와 월드 요약을 항상 한 스냅숏으로 묶는다.
   */
  const saveCheckpoint = () => {
    // 로딩 중 QA 스킵과 이어하기의 월드 복원 콜백은 아직 실행 중인 게임이 아니다.
    // 초기 상태나 부분 복원 상태로 기존 체크포인트를 덮지 않는다.
    if (!started) return false;
    const saved = storySave.checkpoint(storyFlags, {
      act17: act17.state,
      offered: rules ? [...rules.offeredSet] : [],
      carried: rules ? [...rules.carried] : [],
      rulesStarted: rules?.started ?? false,
      fudaRefused: rules?.fudaRefused ?? false,
      player: {
        x: controller.position.x,
        y: controller.position.y,
        z: controller.position.z,
        yaw: controller.yaw,
        cameraYaw: tpCam.yaw,
      },
      tabletRead,
      tabletEventReady,
      restoreWarningReady,
      restoreFirstDone,
      photoMessageRevealed,
      wellPreludeHeard,
      schoolPreludeHeard,
      graveyardPreludeHeard,
      // 조사 전 세이브에 기본 순서를 써 버리면 이후 실제 입력 순서를 기록할 수 없다. 원본만 저장한다.
      suzuWardOrder: [...suzuWardOrder],
      wellNicheOrder: [...wellNicheOrder],
    });
    telemetry.flush();
    saveStatus.update(saved, storySave.lastSavedAt);
    return saved;
  };
  const rememberEvidence = (id: string) => {
    if (evidence.has(id)) return false;
    evidence.add(id);
    storyFlags.evidence = [...evidence];
    telemetry.recordEvidence(id, storyFlags.act);
    saveCheckpoint();
    evidenceJournal.record(id);
    renderHud();
    return true;
  };
  if (village) {
    const g = village.ground;
    const vv = village;
    const onGround = (v: THREE.Vector3) => { v.y = g.heightAt(v.x, v.z); return v; };
    // --- 7공물 — 위치는 스토리 고정 (PLAN-STORY §2.1, 각색 1·5. 랜덤화는 폐기) ---
    // `model`·`size` 는 실물 소품(Tripo). 없으면 발광 구슬 자리표시자가 남는다.
    // `size` = **가장 긴 변**(m). 실물 치수에 맞춘다 — 아이 게다 23 cm · 얼레빗 12 cm · 손거울 20 cm
    const offerings: OfferingDef[] = [
      { id: 'suzu', name: L('붉은 방울', '赤い鈴'), where: L('오래된 사당', '古い祠'), color: 0xff4a3c, pos: vv.hokora.suzuPos.clone(), model: '/models/props/offer-suzu.glb', size: 0.12 },
      { id: 'kushi', name: L('붉은 머리빗', '赤い櫛'), where: L('폐교', '廃校'), color: 0xe06a8a, pos: vv.schoolInterior.kushiPos.clone(), model: '/models/props/offer-kushi.glb', size: 0.12 },
      { id: 'coins', name: L('동전 세 닢', '三枚の銭'), where: L('공동우물', '共同井戸'), color: 0xd8c25e, pos: vv.wellShaft.altarPos.clone(), model: '/models/props/offer-coins.glb', size: 0.09 },
      // 게다는 지장의 시선으로 건너간 숨은 묘역의 받침대 위에 있다.
      // 지상의 시선은 진입 지점, 안쪽의 발자국과 수선 흔적은 짝을 고르는 단서다(§5.3.4).
      { id: 'geta', name: L('아이의 게다', '子どもの下駄'), where: L('공동묘지', '無縁墓地'), color: 0xd08a4a, pos: vv.graveyard.hollow.getaPos.clone(), model: '/models/props/offer-geta.glb', size: 0.23 },
      { id: 'kagami', name: L('깨진 거울', '割れた鏡'), where: L('폐여관', '廃旅館'), color: 0x9ac8e0, pos: vv.inn.featurePos.clone(), model: '/models/props/offer-kagami.glb', size: 0.20 },
      { id: 'fuda', name: L('제문과 봉인패', '祭文と封印札'), where: L('촌장의 저택', '村長の屋敷'), color: 0xc05a2a, pos: vv.manor.featurePos.clone(), model: '/models/props/offer-fuda.glb', size: 0.28 },
      { id: 'sayo', name: '？？？', where: '', color: 0x8a8a9a, pos: null },
    ];
    const pickupBlockSpoken = new Set<string>();
    syncSuzuWardVisuals = () => {
      const rebound = new Set(suzuRebindOrder().slice(0, rokuroRebindStep));
      for (let i = 0; i < SUZU_EVIDENCE.length; i++) {
        const state = rokuroTrialCleared || rebound.has(i)
          ? 'restored'
          : evidence.has(SUZU_EVIDENCE[i]!) || rokuroTrialPhase !== 'idle' ? 'loose' : 'sealed';
        vv.hokora.setWardState(i, state);
      }
      vv.hokora.setWardTarget(rokuroTrialPhase === 'binding' ? (nextSuzuWard() ?? null) : null);
    };
    beginRokuroTrial = (source: 'pickup' | 'resume') => {
      const first = !rokuroEncounterSeen;
      rokuroEncounterSeen = true;
      rokuroTrialCleared = false;
      rokuroRebindStep = 0;
      rokuroTrialPhase = 'waking';
      const token = ++rokuroWakeToken;
      rokuro?.setEscapeEnabled(false);
      vv.hokora.closeDoor();
      syncSuzuWardVisuals();
      sfx.doorPush(vv.hokora.center.x, vv.hokora.center.y + 1.2, vv.hokora.center.z, 1);
      let introDone: Promise<void> = Promise.resolve();
      if (source === 'pickup') {
        sfx.suzuRing(0.44);
        setTimeout(() => sfx.suzuRing(0.44), 360);
        introDone = dialogue.say(...(first ? [
          { text: L('어린아이의 손이 같은 방울을 집는다 — 기억이 스친다.', '幼い手が同じ鈴を掴む — 記憶がよぎる。') },
          { who: L('어린 미오', '幼いミオ'), text: L('예쁘다…….', 'きれい……。') },
          { text: L('사당 문이 닫힌다. 천장에서 검은 머리카락이 내려온다.', '祠の戸が閉じる。天井から黒い髪が垂れてくる。') },
          { who: MIO_NAME, text: L('금줄이 문까지 이어져 있어. 마지막에 푼 매듭부터 되묶어야 해.', '注連縄が戸まで続いてる。最後に解いた結びから戻さなきゃ。') },
        ] : [
          { text: L('방울이 다시 울리자 사당 문이 닫힌다.', '鈴が再び鳴ると、祠の戸が閉じる。'), dur: 1.7 },
          { who: MIO_NAME, text: L('이번에는 마지막 매듭부터.', '今度は、最後の結びから。'), dur: 1.5 },
        ]));
      }
      renderHud();
      const wake = () => {
        if (token !== rokuroWakeToken || rokuroTrialPhase !== 'waking' || !rules?.carried.includes('suzu')) return;
        rokuroTrialPhase = 'binding';
        rokuro?.configureWardResult(evidence.has('consequence:suzu-disturbed'));
        rokuro?.activate(vv.hokora.suzuPos);
        syncSuzuWardVisuals();
        renderHud();
      };
      // 첫 기억과 규칙 설명을 읽는 동안 공격하지 않는다. 재도전 대사는 짧아 곧바로 본전으로 돌아간다.
      if (source === 'resume') setTimeout(wake, 1200);
      else void introDone.then(() => setTimeout(wake, 220));
    };
    // 봉납 판정 = 받침대 반원의 석판
    rules = new Rules(scene, offerings, vv.pedestals.slabPos, {
      canPresentFuda: () => truth.complete,
      onFudaBlocked: () => void dialogue.say({ who: MIO_NAME, text: L('아직 저택의 기록에 이어지는 기억이 있어. 무슨 일이 있었는지 확인하고 와야 해.', 'まだ屋敷の記録に続く記憶がある。何があったのか確かめてこなきゃ。') }),
      canPickup: (o) => {
        if (o.id === 'suzu') return SUZU_EVIDENCE.every((id) => evidence.has(id));
        if (o.id === 'kushi') return evidence.has('school:called');
        if (o.id === 'coins') return WELL_EVIDENCE.every((id) => evidence.has(id)) && wellAnswer() !== null && !wellQuestionPlaying;
        if (o.id === 'geta') return inGraveyardHollow() && graveyardPassage.matched;
        if (o.id === 'kagami') return evidence.has('inn:mirror');
        // 결재함의 원본 복원 → 열쇠 → 불단 덮개. 이미 운반 중인 저장에는 소급하지 않는다.
        if (o.id === 'fuda') return MANOR_EVIDENCE.every((id) => evidence.has(id)) && !dispatchRequired(true, evidence);
        return true;
      },
      onPickupBlocked: (o) => {
        const first = !pickupBlockSpoken.has(o.id);
        pickupBlockSpoken.add(o.id);
        if (o.id === 'suzu') void dialogue.say(first
          ? { text: L('방울을 감싼 붉은 끈이 세 방향으로 이어진다. 억지로 당기면 끈이 더 조인다.', '鈴を巻く赤い紐が三方へ伸びている。無理に引けば、さらに締まる。') }
          : { text: L(`아직 풀리지 않은 매듭이 ${SUZU_EVIDENCE.length - countOf(SUZU_EVIDENCE)}개 남아 있다.`, `まだ解けていない結びが${SUZU_EVIDENCE.length - countOf(SUZU_EVIDENCE)}つ残っている。`) });
        if (o.id === 'kushi') void dialogue.say(first
          ? { text: L('피아노 뚜껑 안쪽에서 누군가 누르고 있다. 학교에 남은 이름을 먼저 찾아야 한다.', 'ピアノの蓋を内側から誰かが押さえている。校内に残る名を先に探さなければ。') }
          : { text: countOf(SCHOOL_EVIDENCE) < SCHOOL_EVIDENCE.length
              ? L(`이름의 단서가 ${SCHOOL_EVIDENCE.length - countOf(SCHOOL_EVIDENCE)}개 부족하다.`, `名の手掛かりがあと${SCHOOL_EVIDENCE.length - countOf(SCHOOL_EVIDENCE)}つ足りない。`)
              : L('단서는 모였다. 방송실이라면 학교 전체에 이름을 들려줄 수 있다.', '手掛かりは揃った。放送室なら、校内全体に名を届けられる。') });
        if (o.id === 'coins') {
          if (countOf(WELL_EVIDENCE) === WELL_EVIDENCE.length && !wellAnswer()) {
            void maybeBeginWellQuestion();
          } else void dialogue.say(first
            ? { text: L('동전 아래의 검은 물막이 세 벽감의 홈으로 이어진다. 모두 확인하기 전에는 손이 닿지 않는다.', '銭を覆う黒い水膜が三つの壁龕の溝へ続く。すべて確かめるまで手は届かない。') }
            : { text: L(`확인하지 않은 벽감이 ${WELL_EVIDENCE.length - countOf(WELL_EVIDENCE)}곳 남아 있다.`, `確かめていない壁龕があと${WELL_EVIDENCE.length - countOf(WELL_EVIDENCE)}か所ある。`) });
        }
        if (o.id === 'geta') void graveyardPassage.inspectGeta(1).finally(renderHud);
        if (o.id === 'kagami') void dialogue.say({ text: innWaitingActive()
          ? L('큰 거울 속 얼굴이 아직 보이지 않는다. 경대 보관함에서 이어진 네 흔적을 먼저 맞춰 보자.', '大鏡の顔はまだ見えない。鏡台の預かり箱から続く四つの痕を先に合わせよう。')
          : L('손거울 조각에는 방 안이 아니라 10년 전 축제가 비친다. 벽의 큰 거울부터 확인해야 한다.', '手鏡の欠片には部屋ではなく十年前の祭が映る。壁の大鏡を先に確かめなければ。') });
        if (o.id === 'fuda') void dialogue.say({
          text: countOf(MANOR_EVIDENCE) < MANOR_EVIDENCE.length
            ? L(`먼저 대청의 기록을 확인하자. 읽지 않은 문서가 ${MANOR_EVIDENCE.length - countOf(MANOR_EVIDENCE)}개다.`, `先に広間の記録を確かめよう。未読の文書はあと${MANOR_EVIDENCE.length - countOf(MANOR_EVIDENCE)}つ。`)
            : manorDispatch.hasKey ? L('불단 앞 자물쇠에 열쇠를 꽂아 덮개를 먼저 열자.', '仏壇の錠に鍵を差し、先に覆いを開こう。')
            : L('봉인패 앞에 덮개가 잠겼다. 서재 압흔판과 지하 결재함에서 열쇠를 찾아야 한다.', '封印札の前の覆いは施錠されている。書斎の圧痕と地下の決裁箱から鍵を探そう。'),
        });
      },
      onPrompt: (t) => { rulesPrompt = t; renderPrompt(); },
      onPickup: (o, _carried) => {
        // 공물도 실제 운반품이다. 획득 즉시 가방에 들어가고 봉납·강탈 때 같은 항목이 빠진다.
        if (!inventory.has(o.id)) inventory.add(o.id);
        renderHud(); sfx.pickup();
        const pickupAct: Partial<Record<string, number>> = {
          suzu: 6, kushi: 8, coins: 10, geta: 12, kagami: 13, fuda: 16,
        };
        const nextAct = pickupAct[o.id];
        if (nextAct && nextAct > storyFlags.act) setStoryAct(storyFlags, nextAct);
        toastEl.textContent = L(`${o.name}${eul(o.name)} 손에 넣었다`, `${o.name}を手に入れた`);
        toastEl.classList.add('show'); toastT = 3.0;
        // 공물이 운다 — 줍는 순간 큰 소음 이벤트 = 운반 구간의 시작 (§3.2)
        senses?.emitNoise(controller.position, 26);
        if (o.id === 'suzu') {
          // 문은 자동으로 다시 열리지 않는다. 자신이 푼 순서의 역순으로 세 매듭을 되묶어야 한다.
          beginRokuroTrial('pickup');
        }
        if (o.id === 'kushi') {
          void dialogue.say(
            { text: L('머리빗을 집는 순간 — 복도의 형광등이 일제히 떨었다.', '櫛を取った瞬間 — 廊下の蛍光灯が一斉に震えた。') },
            { text: L('모든 교실에서 책상이 차례로 넘어지는 소리. 복도 끝의 학생이 고개를 든다.', 'すべての教室で机が順に倒れる音。廊下の端の生徒が顔を上げる。') },
          );
          // 정적인 책상 메시를 억지로 움직이지 않고, 방마다 다른 위치에서 충격이 연쇄되게 해
          // 학교 전체가 깨어났다는 크기를 공간 음향으로 만든다.
          vv.schoolInterior.deskPositions.filter((_, i) => i % 2 === 0).forEach((p, i) => {
            setTimeout(() => sfx.deskScrape(p.x, p.y, p.z, 0.68), i * 145);
          });
          yuri?.activate(controller.position);
        }
        if (o.id === 'coins') {
          // 7~10초 마이크로 컷: 픽업 프레임에 실체가 솟고, 조작이 돌아오는 순간 추격이 시작된다.
          wellQuestionPlaying = true;
          sfx.wellCoins(vv.wellShaft.altarPos.x, vv.wellShaft.altarPos.y, vv.wellShaft.altarPos.z, 0.92);
          wellWoman?.beginPickupReveal(controller.position);
          tpCam.shake(0.32);
          void (async () => {
            try {
              const womanFocus = wellWoman?.cinematicFocus()
                ?? new THREE.Vector3(vv.wellShaft.chamber.cx, vv.wellShaft.chamber.waterY + 1.42, vv.wellShaft.chamber.cz);
              await playWellCinematic(
                wellCinematics.coinPickup(controller.position, vv.wellShaft.altarPos, womanFocus),
                [
                  { text: L('동전을 들어 올리는 순간, 아이의 울음이 완전히 멎었다.', '銭を持ち上げた瞬間、子供の泣き声が完全に止んだ。'), dur: 2.2 },
                  { text: L('젖은 동전 세 닢이 손바닥 위에서 서로 부딪힌다. 등 뒤의 수면이 사람 키만큼 솟는다.', '濡れた三枚の銭が掌で触れ合う。背後の水面が人の背丈まで立ち上がる。'), dur: 2.8 },
                  { who: '???', text: L('그 애를 어디로 데려가려고?', 'あの子をどこへ連れて行くの?'), dur: 2.4 },
                ],
              );
            } finally {
              wellWoman?.endPickupReveal();
              wellQuestionPlaying = false;
              wellPebbles = Math.max(wellPebbles, 3);
              toastEl.textContent = L('J / G — 조약돌을 던져 반대편에 물소리를 만든다', 'J / G — 小石を投げ、反対側に水音を作る');
              toastEl.classList.add('show'); toastT = 4.5;
              renderHud();
            }
          })();
        }
        if (o.id === 'geta') {
          void dialogue.say(
            { text: L('게다를 들자 다른 두 받침대가 비어 버린다. 양쪽 문에서 누군가 이쪽으로 오라고 부른다.', '下駄を持つと他の二つの台が空になる。両脇の門から誰かがこちらへ来いと呼ぶ。') },
            { who: MIO_NAME, text: L('들어올 때 붉은 매듭을 봤어. 소리 말고 그 문으로 돌아가자.', '入った時に赤い結び目を見た。声じゃなく、あの門へ戻ろう。') },
          );
        }
        if (o.id === 'kagami') {
          // 공물이 곧 도구다 — 깨진 거울을 집는 순간부터 **현실-거울 대조**가 가능해진다(§5.3.5 파훼)
          vv.inn.showMirrorMemory(15);
          sfx.bellAfterimage();
          void mirrorMemory.play();
        }
        if (o.id === 'fuda' && !rules!.fudaRefused) {
          // 봉인패 획득 순간 위 `pickupAct`가 ACT 16 진상편을 시작한다.
          // 지하 선택 조사가 ACT 번호를 선점하지 않는다.
          vv.manor.showPastEcho(14);
          sfx.rumble(2.8, 0.5);
          tpCam.shake(0.26);
          void dialogue.say(
            { text: L('봉인패를 들어 올리는 순간 저택의 불탄 벽 위로 10년 전 복도가 겹친다.', '封印札を持ち上げた瞬間、屋敷の焼けた壁に十年前の廊下が重なる。') },
            { text: L('복도 밖에서 주민들의 목소리가 겹친다. 「미오를 찾아! 아이를 신사로 데려가!」', '廊下の外で住民の声が重なる。「ミオを探せ! 子供を社へ連れて行け!」') },
            { who: MIO_NAME, text: truth.complete
              ? L('그날의 기록은 확인했어. 이번에는 누구에게도 이 패를 넘기지 않을 거야.', 'あの夜の記録は確かめた。今度は誰にもこの札を渡さない。')
              : L('글자를 읽었을 때와 달라. 패를 들고 세 기록을 다시 보면, 그날 일이 이어질 것 같아.', '文字を読んだ時と違う。札を持って三つの記録を見直せば、あの夜が繋がりそう。') },
          );
        }
        // 획득 뒤 강제 종료돼도 지역 퍼즐을 다시 하지 않게 운반 상태까지 저장한다.
        saveCheckpoint();
      },
      onOffer: (o, n, slot) => {
        inventory.remove(o.id);
        sfx.offer(); matsuri?.onOffered(); renderHud();
        vv.pedestals.place(slot, o.color, rules!.cloneModel(o.id));
        vv.hamlet.setStoryStage(n);
        lifesigns?.setStoryStage(n);
        if (n >= 3) vv.pedestals.setRootsLocked(true);
        // 신사 아래에서 여자 목소리가 숫자를 센다 (ACT 7~)
        const count = (lang() === 'ja' ? ['ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ'] : ['하나', '둘', '셋', '넷', '다섯'])[n - 1];
        if (count) void dialogue.say(
          { who: L('땅 밑', '地の底'), text: `……${count}.` },
          ...(n === 1 ? [
            { who: MIO_NAME, text: L('누구야?', '誰?') },
            { text: L('돌 틈이 벌어지며 붉은 피안화 새싹이 차례로 솟는다.', '石の隙間が割れ、赤い彼岸花の芽が順に伸びる。') },
            { who: MIO_NAME, text: L('돌아갈 길이 열린다더니…… 왜 문 안쪽에서 세고 있지?', '帰る道が開くって……どうして戸の内側で数えてるの？') },
            { who: MIO_NAME, text: L('한 개만으로는 모자란 건가. 다음에도 바뀌면, 어디가 변하는지 봐야겠어.', '一つでは足りないのかな。次も変わるなら、どこが変わるか見ておこう。') },
          ] : []),
        );
        // 봉인 해제 단계별 월드 반응 (PLAN-STORY §1.2) — S1 은 텍스트·AI 반응까지, 비주얼은 후속
        const stage: Record<number, string> = {
          1: L('땅이 울렸다. 마을 어딘가에서 오래 잠긴 문이 열리는 소리가 났다.', '地が鳴った。村のどこかで、長く閉ざされた戸が開く音がした。'),
          2: L('본전 문 안쪽에서 손톱으로 긁는 소리가 난다.', '本殿の戸の内側で、爪が引っ掻く音がする。'),
          4: L('본전 문에 작은 틈이 생겼다.', '本殿の戸に小さな隙間ができた。'),
          5: L('마을의 공기가 달라졌다 — 어디에도 안전한 길이 없다.', '村の空気が変わった — どこにも安全な道はない。'),
        };
        if (stage[n]) { toastEl.textContent = stage[n]!; toastEl.classList.add('show'); toastT = 4.2; }
        // ACT 7 — 첫 봉납. 「땅이 울렸다」를 자막이 아니라 **배로** 듣게 한다 (§1.2)
        if (n === 1) { sfx.rumble(2.6, 0.55); tpCam.shake(0.22); setStoryAct(storyFlags, 7); }
        if (n === 3) { sfx.rumble(4.2, 0.86); tpCam.shake(0.48); }
        // **본전 문이 계기판이다** (PLAN-STORY P3-1). 위 자막이 말한 것을 문이 실제로 한다 —
        // 봉납 2 에 금줄이 삭고, 4 에 틈이 벌어지고, 그 뒤에 흰 손이 든다.
        // 자막만 있고 물건이 안 변하면 그건 알림이지 세계가 아니다
        if (vv.shrine) vv.shrine.honden.setStage(n >= 5 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0);
        if (n === 3) {
          // ACT 11 — 경고가 세계를 바꾼다. ACT 24의 붉은 달과는 다른, 달이 사라진 붕괴 직전 하늘.
          timeOfDay?.set('breach', 5);
          restoreWarningPlaying = true;
          restoreWarningReady = false;
          renderHud();
          const horn = vv.speakers.nearestHorn(controller.position).clone();
          sfx.paOn(horn.x, horn.y, horn.z);
          sfx.paNoise(horn.x, horn.y, horn.z, 1.15, 0.72);
          // 방송과 미오의 반응이 모두 끝난 뒤에만 회수 목표를 연다. 말하는 도중 마커가 먼저 뜨면
          // 플레이어는 경고를 듣는 대신 곧바로 뛰어가 버리고 ACT 11의 의심이 잘린다.
          void (async () => {
            await new Promise((resolve) => setTimeout(resolve, 520));
            sfx.paVoice(horn.x, horn.y, horn.z, 22);
            const villageReaction = evidence.has('inference:village-complete')
              ? { who: MIO_NAME, text: L('흔적은 누군가 보여 주려는 것 같았어. 하지만 이 방송은 목표와 반대야. 같은 뜻으로 남은 게 아닐 수도 있어.', '痕跡は誰かが見せようとしていた。でも、この放送は目標と逆。同じ意図で残ったとは限らない。') }
              : evidence.has('inference:village-mimic')
                ? { who: MIO_NAME, text: L('또 사람 목소리를 흉내 내고 있어. 어느 쪽도 바로 믿으면 안 돼.', 'また人の声を真似してる。どちらもすぐ信じちゃだめ。') }
                : evidence.has('inference:village-simultaneous')
                  ? { who: MIO_NAME, text: L('TV는 같은 시각에서 멎었는데, 이 방송은 내가 옮긴 공물 수를 알아. 녹음만 반복하는 게 아니야.', 'テレビは同じ時刻で止まっていたのに、この放送は私が動かした供物の数を知ってる。録音を繰り返しているだけじゃない。') }
                  : { who: MIO_NAME, text: L('마을 안에 붙잡힌 목소리들이 서로 다른 명령을 하고 있어.', '村に閉じ込められた声が、別々の命令をしてる。') };
            await dialogue.say(
              { who: BROADCAST, text: L('주민 여러분께 알려드립니다.', '住民の皆様にお知らせします.') },
              { who: BROADCAST, text: L('공물이 세 개 사라졌습니다.', '供物が三つ失われました.') },
              villageReaction,
              { who: BROADCAST, text: L('발견 즉시 원래 장소로 돌려놓으십시오. 반복합니다. 공물을 신사로 옮기지 마십시오.', '発見次第、元の場所へお戻しください。繰り返します。供物を社へ運ばないでください.') },
              { who: L('겹친 방송', '重なる放送'), text: L('돌려놓으십시오.　／　……신사로 가져오십시오.', '戻してください。　／　……社へお持ちください.') },
              { text: L('두 목소리가 서로의 끝을 잡아당기다 동시에 끊긴다. 목표창만 아무 일도 없었다는 듯 남아 있다.', '二つの声が互いの語尾を引き裂き、同時に途切れる。目標欄だけが何事もなかったように残る.') },
            );
            sfx.paOff();
            restoreWarningPlaying = false;
            restoreWarningReady = true;
            renderHud();
          })();
        }
        if (n === 4 && hunters[1]) {
          // 여우 요괴가 마을로 내려온다 (§1.2 — 봉납 4)
          const a: THREE.Vector3[] = [];
          for (const z of [60, 35, 10, -12, -35]) { const rp = g.roadAt(g.sAtZ(z)); a.push(new THREE.Vector3(rp.x, 0, rp.z)); }
          a.push(new THREE.Vector3(31, 0, 30));
          hunters[1].setAnchors(a);
          toastEl.textContent += L('  …토리이 쪽에서 방울 소리가 난다', '  …鳥居のほうで鈴の音がする');
        }
        // 봉납 = 자동 체크포인트 (§6.2). 재개 흐름은 스토리 챕터에서 연결한다
        storyFlags.offered = n;
        if (n === 2) setStoryAct(storyFlags, 9);
        else if (n === 3) setStoryAct(storyFlags, 11);
        else if (n === 5) setStoryAct(storyFlags, 15);
        setPhotoStoryState(n, photoMessageRevealed);
        ITEMS['photo']!.icon = photoThumb(photoDamageForOfferings(n));
        if (invUI.isOpen) invUI.render();
        saveCheckpoint();
      },
      onFudaRefused: () => {
        setStoryAct(storyFlags, 17);
        // ACT 17 — 봉인패 거절과 UI 3단 변조 뒤 신사 지하로 이어진다
        renderHud();
        void act17.play();
      },
      onDrop: (o) => { inventory.remove(o.id); },
    });
    rules.onChange = renderHud;
    if (at === 'school') rules.seedOfferedForQa(['suzu']);
    else if (at === 'well' || wellWomanQa) rules.seedOfferedForQa(['suzu', 'kushi']);
    else if (at === 'graveyard') rules.seedOfferedForQa(['suzu', 'kushi', 'coins']);
    else if (at === 'inn') rules.seedOfferedForQa(['suzu', 'kushi', 'coins', 'geta']);
    else if (at === 'manor') rules.seedOfferedForQa(['suzu', 'kushi', 'coins', 'geta', 'kagami']);
    /**
     * QA 진입은 처마 초칭 픽업(ACT 3)을 건너뛴다 — 그러면 **손에 등불이 없어** 실내가 통째로 칠흑이다
     * (실측: `?at=inn` 에서 화면이 완전히 검었고, 초칭 광원 intensity 가 0 이었다).
     * 봉납을 미리 채워 주는 것과 같은 이유로 등불도 쥐여 준다 — 그게 그 시점의 정상 상태다.
     */
    if (at && at !== 'house') storyFlags.chochin = true;
    // 초칭 지급과 공물 규칙 시작은 독립이다. `else if`로 묶으면 모든 QA 주소가 첫 if에서
    // 끝나 `?at=rokuro`의 방울이 스폰되지 않는다.
    if (at === 'hokora' || rokuroQa) rules.begin();
    renderHud();
    hiding = new Hiding(asVillage(village));

    // --- 하차 튜토리얼 → ACT 3 「세 가지 금기」 · ACT 4 「끝나지 않은 축제」 ---
    controlsTutorial = new ControlsTutorial(
      hint,
      (step) => { tutorialProgress = step; renderHud(); },
      (played) => {
        tutorialDone = true;
        tutorialProgress = 3;
        hintExpired = true;
        // 정상 새 게임만 여기서 ACT 3 으로 넘어간다. 체크포인트 복원은 저장된 ACT를 보존한다.
        if (played) setStoryAct(storyFlags, 3);
        if (played) setYokaiActive(true); // 튜토리얼 중에는 입구를 안전 구역으로 둔다
        renderHud();
      },
    );
    act3 = new Act3({
      tablet: vv.tablet, ground: vv.ground, dialogue, sfx, cam: tpCam,
      // 위치·바라보는 방향·속도를 **참조로** 넘긴다 — ACT 3 이 비석/목소리 쪽으로 몸을 돌린다
      body: controller,
      setDread: (v) => { dreadEl.style.opacity = String(v); },
      // 「플레이어는 아직 모르지만, 미오는 게임 시작 직후 세 번째 금기를 어겼다」
      onViolate: () => { storyFlags.answered++; },
      onDone: () => {
        tabletRead = true;
        // 방송을 먼저 들어도 생활 흔적을 대조하는 ACT 4는 여기서 시작한다.
        setStoryAct(storyFlags, 4);
        saveCheckpoint();
        renderHud();
      },
    });
    act4 = new Act4({
      speakers: vv.speakers, dialogue, sfx, phone, player: controller.position,
      // ACT 3 이 도는 중에는 방송을 미룬다. 비석 앞에서 「미오야」를 듣는 동안
      // 머리 위에서 안내방송이 겹치면 둘 다 죽는다
      ready: () => tutorialDone && !(act3?.running ?? false),
      onDone: () => {
        // 방송이 끝났다는 사실이 비석 상호작용의 열쇠다. 여기 전에는 근처에 가도 프롬프트가 없다.
        tabletEventReady = true;
        saveCheckpoint();
        renderHud();
      },
    });
    // 디버그 스킵 모드에서는 첫 방송도 건너뛴다 — 프롤로그를 건너뛰는 사람이 기다릴 이유가 없다
    if (skipIntro && !tutorialQa) act4.skip();
    // 생활 흔적은 상시 월드다 — 스크립트가 아니라 **걷다가 스치는 것**이라야 한다.
    // (Scares 와 같은 이유로 main 에서 만든다: 월드 소품인데 sfx 가 필요하다)
    lifesigns = new LifeSigns(scene, vv.ground, vv.hamlet, sfx);
    lifesigns.setStoryStage(rules.offered);

    // --- 조사 지점 (PLAN-STORY §4): 돌비석(ACT 3) · 공고판(ACT 4) · 석판(ACT 5 퀘스트 개시) ---
    inspect = new Inspect((t) => { inspectPrompt = t; renderPrompt(); });
    const crypt = vv.crypt;
    const cryptAction = (action: () => Promise<void>) => {
      void action().catch(error => {
        console.warn('[act18] 진행 중단 — 같은 지점에서 재시도 가능', error);
        toast(L('잠시 멈췄다. 같은 지점을 다시 조사하자.', '一度止まった。同じ場所をもう一度調べよう。'));
      }).finally(renderHud);
    };
    inspect.add({
      id: 'crypt-descend', pos: crypt.entryTop, radius: 1.8, hold: 1.3, once: false, inputPriority: true,
      prompt: L('격자 뚜껑 아래로 내려간다', '格子の蓋の下へ下りる'),
      enabled: () => act17.state === 'complete' && !!rules?.carried.includes('fuda') && !act18.busy && !crypt.contains(controller.position),
      onUse: () => { cryptAction(() => act18.enter()); },
    });
    inspect.add({
      id: 'crypt-ascend', pos: crypt.landing.clone().add(new THREE.Vector3(0.65, 0.2, 0)), radius: 1.1, hold: 1.2, once: false,
      prompt: L('사다리를 타고 신사로 올라간다', '梯子で社へ上がる'),
      enabled: () => crypt.contains(controller.position) && !act18.busy,
      onUse: () => { cryptAction(() => act18.leave()); },
    });
    CRYPT_TRACES.forEach((trace, i) => inspect!.add({
      id: `crypt-trace-${i}`, pos: crypt.revelation.traces[i]!, radius: 1.75, once: false,
      prompt: trace.prompt, inputPriority: true,
      enabled: () => act17.state === 'complete' && crypt.contains(controller.position) && !act18.busy && !act18.complete && !evidence.has(trace.id),
      onUse: () => { cryptAction(() => act18.read(i)); },
    }));
    inspect.add({
      id: 'crypt-encounter', pos: crypt.revelation.encounterPos, radius: 1.65, once: false,
      prompt: L('검은 문 앞에 선다', '黒い門の前に立つ'),
      enabled: () => act18.nextTrace < 0 && crypt.contains(controller.position) && !act18.busy && !act18.complete,
      onUse: () => { cryptAction(() => act18.encounter()); },
    });
    // --- 선택 복선: 퀘스트·공물·ACT 플래그를 전혀 건드리지 않는 곁가지 조사 ---
    // 같은 세션의 중복 재생만 `OptionalForeshadows`가 별도 기록한다. StorySave/evidence에는 들어가지 않는다.
    const optionalForeshadows = new OptionalForeshadows(inspect, dialogue);
    optionalForeshadows.addAll([
      {
        id: 'terminal-one-way', pos: vv.busStop.schedulePos, radius: 1.65,
        prompt: L('빛바랜 운행표를 읽는다', '色褪せた時刻表を読む'),
        enabled: () => tabletEventReady,
        lines: [
          { text: L('다른 시각은 칼로 긁어 지웠는데, 마지막 한 칸만 비를 맞지 않은 듯 선명하다.', 'ほかの時刻は刃物で削られ、最後の一枠だけ雨を受けなかったように鮮明だ。') },
          { text: L('「9월 23일 18시 12분 — 히가사토행. 귀로 운행 없음.」', '「九月二十三日 十八時十二分 — 彼ヶ里行。復路運行なし。」') },
          { who: MIO_NAME, text: L('승객 수가…… 처음부터 ‘1’로 적혀 있어.', '乗客数が……最初から「一名」って書いてある。') },
        ],
      },
      {
        id: 'paired-ribbons', pos: vv.foreshadowProps.pairedRibbonPos, radius: 1.45,
        prompt: L('꽃 사이의 두 천 조각을 살핀다', '花の間の二枚の布を調べる'),
        enabled: () => tabletRead,
        lines: [
          { text: L('붉은 천과 푸른 천이 한 매듭에 묶여 있다. 푸른 쪽의 사람 얼굴만 손톱으로 닳도록 문질렀다.', '赤い布と青い布が一つの結びに繋がれている。青い方の人の顔だけ、爪で擦り減らされている。') },
          { text: L('매듭 아래의 뿌리는 신사가 아니라 마을 밖을 향해 뻗었다.', '結びの下の根は、社ではなく村の外へ伸びている。') },
          { who: MIO_NAME, text: L('같이 묶어 둔 게 아니야. 붉은 쪽이…… 푸른 쪽을 놓지 않는 모양이야.', '一緒に結んだんじゃない。赤い方が……青い方を離さないみたい。') },
        ],
      },
      {
        id: 'human-seventh-slot', pos: vv.pedestals.slots[6]!, radius: 1.9,
        prompt: L('넓은 일곱 번째 받침대를 살핀다', '幅広い七つ目の台を調べる'),
        enabled: () => rules!.started,
        lines: [
          { text: L('여섯 받침대에는 물건을 올린 둥근 마모가 있다. 일곱째에만 작은 맨발 두 짝이 배어 있다.', '六つの台には物を置いた丸い摩耗がある。七つ目だけに、小さな裸足が二つ染みついている。') },
          { text: L('발끝은 달아나는 방향이 아니라 중앙 석판을 향한다.', '爪先は逃げる方角ではなく、中央の石板を向いている。') },
          { who: MIO_NAME, text: L('여긴 공물을 놓는 자리가 아니야. 누군가 직접 서는 자리야.', 'ここは供物を置く場所じゃない。誰かが自分で立つ場所だ。') },
        ],
      },
      {
        id: 'hokora-double-circle', pos: vv.hokora.childMarkPos, radius: 1.6,
        prompt: L('문틀 아래의 겹원을 만진다', '戸枠の下の重なった円に触れる'),
        enabled: () => rules!.started,
        lines: [
          { text: L('아이 손바닥 높이에 원 두 개가 겹쳐 있다. 첫 원은 급하고, 둘째 원은 손가락을 떼지 않고 천천히 덧그었다.', '子供の掌の高さに円が二つ重なる。最初の円は荒く、二つ目は指を離さずゆっくり重ねてある。') },
          { text: L('두 원 사이에 붉은 실 한 올. 누군가에게 보이기 위한 신호처럼 남았다.', '二つの円の間に赤い糸が一本。誰かに見せるための合図のように残っている。') },
          { who: MIO_NAME, text: L('……왜 이 모양을 알고 있는 것 같지?', '……どうして、この形を知っている気がするの？') },
        ],
      },
      {
        id: 'well-rescue-knot', pos: vv.well.ropeKnotPos, radius: 1.35,
        prompt: L('끊어진 금줄의 매듭을 살핀다', '切れた注連縄の結びを調べる'),
        enabled: () => tabletRead,
        onRead: () => vv.well.flashFace(),
        lines: [
          { text: L('말뚝에 남은 고리는 손목을 조이는 올가미가 아니다. 작은 몸을 겨드랑이 아래서 받쳐 올리는 구조다.', '杭に残る輪は手首を締める罠ではない。小さな身体を脇の下から支えて引き上げる結びだ。') },
          { text: L('매듭 안쪽에 낡은 여성용 소매 천이 끼어 있다. 아래에서 위로 힘껏 당긴 흔적.', '結びの内側に古い女物の袖布が挟まっている。下から上へ、必死に引いた跡。') },
          { who: MIO_NAME, text: L('우물 아래의 것이 아이를 끌어내린 게 아니라면…….', '井戸の下のものが、子供を引きずり込んだんじゃないなら……。') },
        ],
      },
      {
        id: 'school-missing-shoe-box', pos: vv.schoolInterior.getabakoPos, radius: 2.2,
        prompt: L('신발장의 이름표를 본다', '下駄箱の名札を見る'),
        enabled: () => rules!.stateOf('kushi') === 'open',
        lines: [...SCHOOL_RECORDS.getabako],
      },
    ]);
    inspect.add({
      // 「플레이어가 표면을 닦으면 글자가 나타난다」 — 한 번의 E 가 아니라 **꾹**. 2.4 초 동안
      // 이끼가 위에서부터 벗겨지고, 마지막에 드러나는 문장이 세 번째 금기다
      id: 'tablet', pos: vv.tablet.pos, radius: 2.4, prompt: L('비석을 닦는다', '石碑を拭く'), once: true,
      enabled: () => tabletEventReady && !tabletRead,
      hold: 2.4,
      onHold: (p) => act3!.wipe(p),
      onUse: () => { act3!.begin(); },
    });
    inspect.add({
      // 「방송 장치에 적힌 날짜는 10년 전 피안제 당일이다」
      id: 'notice', pos: vv.speakers.noticePos, radius: 2.2, prompt: L('공고문을 읽는다', '掲示を読む'), once: true,
      enabled: () => tabletRead,
      onUse: () => {
        vv.speakers.reveal();
        void (async () => {
          await dialogue.say(
            { text: L('종이는 새것처럼 빳빳하다. 풀이 아직 마르지 않았다.', '紙は新品のように張っている。糊がまだ乾いていない。') },
            { text: L('「히가사토 추계 피안제 — 2015년 9월 23일」', '「彼ヶ里 秋季 彼岸祭 — 二〇一五年 九月 二十三日」') },
            { who: MIO_NAME, text: L('……10년 전 날짜잖아.', '……十年前の日付じゃない。') },
            { who: MIO_NAME, text: L('방금 금일이라고 했어. 오늘이라고.', 'さっき本日って言った。今日だって。') },
            // 폰을 본 사람만 받는 줄. 「방송이 틀렸다」가 「오늘이 정말 그날이다」로 바뀐다.
            // 안 본 사람에게는 설명이 되므로 붙이지 않는다
            ...(phone.seen ? [{ who: MIO_NAME, text: L('……내 폰도 9월 23일이었어.', '……わたしの携帯も九月二十三日だった。') }] : []),
          );
        })();
      },
    });
    // ACT 4 확장 — 마을을 그냥 통과하지 않고, "조금 전까지 사람이 있었다"는 흔적을
    // 플레이어가 직접 세 곳 이상 대조해야 중앙 제단의 명령이 열린다. 다섯 곳 중 셋만
    // 필수라 동선 선택은 남기고, 나머지는 이후에도 발견할 수 있는 선택 기록으로 둔다.
    const villageClues = {
      tea: {
        prompt: L('찻잔을 살핀다', '湯呑みを調べる'),
        lines: [
          { text: L('찻잔 가장자리에 입술 자국이 선명하다. 김도 아직 가늘게 오른다.', '湯呑みの縁に唇の跡が鮮明に残り、まだ細い湯気が立っている。') },
          { who: MIO_NAME, text: L('버린 지 몇 분도 안 됐어. 그런데 대문은 안에서 잠겼어.', '置かれて数分も経っていない。でも門は内側から閉まってる。') },
        ],
      },
      tv: {
        prompt: L('텔레비전 불빛을 확인한다', 'テレビの明かりを確かめる'),
        lines: [
          { text: L('장지문 너머 화면은 2015년 피안제 중계를 반복한다. 시간 표시는 18시 12분에서 멎었다.', '障子越しの画面は二〇一五年の彼岸祭中継を繰り返し、時刻は十八時十二分で止まっている。') },
          { text: L('푸른 화면에 비친 미오 뒤로 누군가 지나간다. 돌아보면 골목은 비어 있다.', '青い画面に映るミオの背後を誰かが横切る。振り返っても路地は空だ。') },
        ],
      },
      geta: {
        prompt: L('젖은 게다를 살핀다', '濡れた下駄を調べる'),
        lines: [
          { text: L('아이용 게다 밑에서 새 물이 번진다. 발자국은 현관으로 들어가지만 나온 자국은 없다.', '子供用の下駄から新しい水が滲む。足跡は玄関へ入るだけで、出た跡はない。') },
          { who: MIO_NAME, text: L('발자국이 집 안에서 갑자기 끊겼어. 숨은 것과도 달라.', '足跡が家の中で急に途切れてる。隠れたのとも違う。') },
        ],
      },
      furin: {
        prompt: L('풍경을 살핀다', '風鈴を調べる'),
        lines: [
          { text: L('바람은 없는데 풍경만 집 안쪽으로 기울어 울린다.', '風はないのに、風鈴だけが家の内側へ傾いて鳴る。') },
          { text: L('종이 쪽지에는 아이 글씨로 「대답하지 마」라고 적혀 있다.', '短冊には子供の字で「へんじをしないで」と書かれている。') },
        ],
      },
      watcher: {
        prompt: L('골목 끝의 흔적을 확인한다', '路地の奥の跡を確かめる'),
        lines: [
          { text: L('진흙 위에 맨발 자국 한 쌍. 발끝은 줄곧 마을 쪽을 향하고 있다.', '泥に裸足の跡が一組。爪先はずっと村の方を向いている。') },
          { text: L('다가온 자국도, 돌아간 자국도 없다. 여기서 처음 생겨난 것처럼.', '近づいた跡も、戻った跡もない。ここで初めて生まれたように。') },
        ],
      },
    } as const;
    for (const [id, pos] of lifesigns.cluePositions) {
      const clue = villageClues[id as keyof typeof villageClues];
      if (!clue) continue;
      const key = `village:${id}`;
      inspect.add({
        id: `village-clue-${id}`, pos, radius: 1.9, prompt: clue.prompt, once: true,
        enabled: () => tabletRead && !evidence.has(key),
        onUse: () => {
          rememberEvidence(key);
          const found = evidenceCount('village:');
          const inferenceLines: { who?: string; text: string }[] = [];
          if (found >= 3 && ![...evidence].some((e) => e.startsWith('inference:village-'))) {
            const has = (...ids: string[]) => ids.every((clueId) => evidence.has(`village:${clueId}`));
            if (has('tea', 'tv', 'geta')) {
              rememberEvidence('inference:village-simultaneous');
              inferenceLines.push(
                { who: MIO_NAME, text: L('따뜻한 차, 막 생긴 물자국, 18시 12분에 멎은 화면……. 서로 다른 집의 시간이 같은 순간에 잘렸어.', '温かい茶、新しい水跡、十八時十二分で止まった画面……別々の家の時間が同じ瞬間に切れてる。') },
                { who: MIO_NAME, text: L('도망친 게 아니야. 마을 전체에서 한꺼번에 사라진 거야.', '逃げたんじゃない。村中から一斉に消えたんだ。') },
              );
            } else if (has('tv', 'furin', 'watcher')) {
              rememberEvidence('inference:village-mimic');
              inferenceLines.push(
                { who: MIO_NAME, text: L('화면 속 사람, 안쪽으로 울리는 풍경, 시작점 없는 발자국……. 전부 사람이 아니라 사람 흉내야.', '画面の人影、内へ鳴る風鈴、始まりのない足跡……全部、人じゃなく人の真似だ。') },
                { who: MIO_NAME, text: L('목소리를 들어도 바로 믿으면 안 돼.', '声を聞いても、すぐ信じちゃだめ。') },
              );
            } else {
              rememberEvidence('inference:village-sealed');
              inferenceLines.push(
                { who: MIO_NAME, text: L('흔적은 전부 집과 마을 안쪽을 향해 있어. 밖으로 나간 사람은 하나도 없어.', '痕跡は全部、家と村の内側を向いてる。外へ出た人は一人もいない。') },
                { who: MIO_NAME, text: L('사라진 게 아니라, 이 안에 붙잡힌 걸지도 몰라.', '消えたんじゃなく、この中に捕まってるのかもしれない。') },
              );
            }
          }
          if (found === VILLAGE_EVIDENCE.length && rememberEvidence('inference:village-complete')) {
            inferenceLines.push(
              { text: L('다섯 흔적의 날짜와 물자국을 다시 맞춰 본다. 어느 것도 자연스럽게 끝난 것이 없다.', '五つの痕跡の日付と水跡を照らし直す。自然に終わったものは一つもない。') },
              { who: MIO_NAME, text: L('누군가 보여 주려는 것 같아. 하지만 경고를 남긴 쪽도 같은 존재일까?', '誰かが見せようとしてるみたい。でも警告を残したのも同じ者なの？') },
            );
          }
          void dialogue.say(...clue.lines, ...inferenceLines);
        },
      });
    }
    // 지나간 ACT 4를 일회용 세트로 버리지 않는다. 봉납 단계마다 이미 조사했던 물건의
    // 상태가 달라지고, 되돌아온 플레이어만 짧은 후속 기록을 얻는다. 메인 진행에는 불필수다.
    const villageRevisits = [
      {
        id: 'tea-1', clue: 'tea', stage: 1, prompt: L('식은 찻잔을 다시 본다', '冷えた湯呑みを見直す'),
        lines: [
          { text: L('조금 전까지 오르던 김이 완전히 끊겼다. 찻잔 표면에는 검은 재가 얇게 내려앉았다.', 'さっきまで立っていた湯気が消え、湯呑みには薄い黒灰が積もっている。') },
          { who: MIO_NAME, text: L('시간이 흐른 게 아니야. 방울을 놓은 뒤에만 변했어.', '時間が進んだんじゃない。鈴を置いた後だけ、変わった。') },
        ],
      },
      {
        id: 'tv-1', clue: 'tv', stage: 1, prompt: L('바뀐 화면을 확인한다', '変わった画面を確かめる'),
        lines: [
          { text: L('2015년 축제 중계가 사라졌다. 화면에는 지금 이 집 앞에 서 있는 미오의 뒷모습이 나온다.', '二〇一五年の祭中継は消え、画面には今この家の前に立つミオの背中が映っている。') },
          { text: L('화면 속 미오는 현실보다 반 박자 늦게 고개를 돌린다.', '画面のミオは現実より半拍遅れて振り向く。') },
        ],
      },
      {
        id: 'geta-2', clue: 'geta', stage: 2, prompt: L('옮겨진 게다를 확인한다', '移された下駄を確かめる'),
        lines: [
          { text: L('현관에 가지런히 있던 게다가 골목 쪽으로 한 걸음 옮겨져 있다. 새 물자국은 공동묘지 방향으로 이어진다.', '玄関に揃っていた下駄が路地へ一歩移り、新しい水跡が共同墓地へ続いている。') },
          { who: MIO_NAME, text: L('누가 가져간 게 아니라…… 스스로 걸어 나간 것처럼.', '誰かが運んだんじゃない……自分で歩き出したみたい。') },
        ],
      },
      {
        id: 'furin-3', clue: 'furin', stage: 3, prompt: L('계속 울리는 풍경을 본다', '鳴り続ける風鈴を見る'),
        lines: [
          { text: L('풍경은 쉬지 않고 울린다. 「대답하지 마」였던 쪽지 위로 젖은 글씨가 번진다.', '風鈴は休まず鳴り、「返事をしないで」の短冊に濡れた字が滲む。') },
          { text: L('「미오야.」 글씨가 아니라, 방금 들은 목소리의 흔적처럼 보인다.', '「ミオ。」文字ではなく、さっき聞いた声の跡のように見える。') },
        ],
      },
      {
        id: 'watcher-3', clue: 'watcher', stage: 3, prompt: L('다시 생긴 맨발 자국을 본다', '戻った裸足の跡を見る'),
        lines: [
          { text: L('사라졌던 맨발 자국이 다시 생겼다. 이번에는 마을이 아니라 미오가 걸어온 길을 향한다.', '消えた裸足の跡が戻っている。今度は村ではなく、ミオが歩いてきた道を向いている。') },
          { who: MIO_NAME, text: L('나가는 길을 보고 있어. 내가 돌아가지 못하게.', '帰り道を見てる。わたしを戻さないために。') },
        ],
      },
    ] as const;
    for (const revisit of villageRevisits) {
      const pos = lifesigns.cluePositions.get(revisit.clue);
      if (!pos) continue;
      const key = `revisit:${revisit.id}`;
      inspect.add({
        id: `village-revisit-${revisit.id}`, pos, radius: 1.9, prompt: revisit.prompt, once: true,
        enabled: () => rules!.offered >= revisit.stage && !evidence.has(key),
        onUse: () => { rememberEvidence(key); void dialogue.say(...revisit.lines); },
      });
    }
    // ACT 6 확장 — 방울은 단순 루팅이 아니라 사당의 세 금기를 읽고 푸는 첫 지역 퍼즐이다.
    const suzuWardLines = [
      [
        { text: L('에마의 이름이 전부 칼끝으로 긁혀 있다. 뒤쪽에는 같은 문장이 남아 있다.', '絵馬の名はすべて刃先で削られ、裏には同じ文が残っている。') },
        { text: L('「돌아가고 싶다. 내 이름이 없어져도 좋으니.」', '「帰りたい。わたしの名がなくなってもいい。」') },
      ],
      [
        { text: L('필체가 다른 소원 스물여섯 장이 끝부분만 똑같아진다.', '筆跡の違う二十六枚の願いが、末尾だけ同じ字に変わっている。') },
        { text: L('「방울이 울리면 길이 열린다.」 누군가 마지막 한 줄만 대신 썼다.', '「鈴が鳴れば道が開く。」誰かが最後の一行だけを代わりに書いた。') },
      ],
      [
        { text: L('제단 측판의 볏짚 매듭은 방울을 지키도록 안쪽으로 묶인 게 아니다. 무언가가 나오지 못하게 바깥쪽으로 조여 있다.', '祭壇側面の藁縄は鈴を守るよう内へ結ばれていない。何かが出られぬよう外へ締められている。') },
        { who: MIO_NAME, text: L('공물이 아니라…… 자물쇠였어.', '供物じゃない……錠前だった。') },
      ],
    ] as const;
    const suzuWardPrompts = [L('이름이 지워진 에마의 금줄을 푼다', '名を削られた絵馬の注連縄を解く'), L('붉은 에마의 금줄을 푼다', '赤い絵馬の注連縄を解く'), L('제단 측면의 금줄을 푼다', '祭壇側面の注連縄を解く')];
    vv.hokora.wardPositions.forEach((pos, i) => {
      const key = SUZU_EVIDENCE[i]!;
      inspect!.add({
        id: `suzu-ward-${i}`, pos, radius: 1.7, prompt: suzuWardPrompts[i]!, once: true, inputPriority: true,
        enabled: () => rules!.stateOf('suzu') === 'open' && !evidence.has(key),
        onUse: () => {
          if (!suzuWardOrder.includes(i)) suzuWardOrder.push(i);
          const disturbed = i === 2 && (!evidence.has(SUZU_EVIDENCE[0]) || !evidence.has(SUZU_EVIDENCE[1]));
          if (disturbed && rememberEvidence('consequence:suzu-disturbed')) {
            sfx.suzuRing(0.55);
            senses?.emitNoise(pos, 18);
            tpCam.shake(0.12);
          }
          rememberEvidence(key);
          syncSuzuWardVisuals();
          const done = countOf(SUZU_EVIDENCE) === SUZU_EVIDENCE.length;
          void dialogue.say(
            ...(disturbed ? [{ text: L('금줄을 먼저 건드리자 묶여 있던 방울이 저절로 한 번 울린다. 천장 위에서 무거운 것이 몸을 돌렸다.', '注連縄を先に触ると、縛られた鈴がひとりでに一度鳴る。天井の上で重いものが身を返した。') }] : []),
            ...suzuWardLines[i]!,
            ...(done ? [{ text: evidence.has('consequence:suzu-disturbed')
              ? L('세 끈은 풀렸지만 천장 위의 숨소리는 이미 가까워져 있다.', '三本の紐は解けたが、天井の息遣いはもう近い。')
              : L('세 방향의 볏짚 매듭이 소리 없이 느슨해진다. 천장 위의 숨소리도 한 걸음 물러난다.', '三方の藁縄が音もなく緩み、天井の息遣いも一歩遠のく。') }] : []),
            ...(done ? [{ who: MIO_NAME, text: L('매듭이 겹친 방향이 보여. 되돌릴 땐 마지막에 푼 것부터야.', '結びが重なった向きが見える。戻すなら、最後に解いたものから。') }] : []),
          );
        },
      });
    });
    // 방울을 든 뒤에는 같은 세 지점이 ‘조사’에서 ‘되묶기’로 바뀐다. 다음 차례 하나만
    // 활성화해 역순 규칙은 유지하되, 추격 중 픽셀 헌팅이나 오입력으로 실패시키지는 않는다.
    vv.hokora.wardPositions.forEach((pos, i) => {
      inspect!.add({
        id: `suzu-rebind-${i}`, pos, radius: 1.72,
        prompt: L('금줄 매듭을 되묶는다', '注連縄の結びを戻す'), once: false,
        inputPriority: true, hold: 0.82,
        enabled: () => rokuroTrialPhase === 'binding' && nextSuzuWard() === i,
        onUse: () => {
          if (rokuroTrialPhase !== 'binding' || nextSuzuWard() !== i) return false;
          rokuroRebindStep++;
          sfx.suzuRing(0.28 + rokuroRebindStep * 0.05);
          senses?.emitNoise(pos, 7);
          tpCam.shake(0.12 + rokuroRebindStep * 0.04);
          rokuro?.bindWard(rokuroRebindStep);

          if (rokuroRebindStep >= SUZU_EVIDENCE.length) {
            rokuroTrialPhase = 'escape';
            rokuroTrialCleared = true;
            rokuro?.setEscapeEnabled(true);
            vv.hokora.openDoor();
            sfx.doorPush(vv.hokora.center.x, vv.hokora.center.y + 1.2, vv.hokora.center.z, 0.72);
            void dialogue.say(
              { text: L('마지막 매듭이 조여지자 긴 목이 제단 쪽으로 거칠게 끌려간다.', '最後の結びが締まると、長い首が祭壇へ荒々しく引かれる。'), dur: 1.4 },
              { who: MIO_NAME, text: L('문이 열렸어. 지금 나가야 해.', '戸が開いた。今のうちに。'), dur: 1.2 },
            );
          } else if (rokuroRebindStep === 1) {
            void dialogue.say({ who: MIO_NAME, text: L('하나…… 목이 매듭에 끌려가고 있어.', 'ひとつ……首が結びに引かれてる。'), dur: 2.0 });
          } else {
            void dialogue.say({ text: L('두 번째 매듭이 조여지며 문 안쪽의 빗장이 떨린다.', '二つ目の結びが締まり、戸の内側の閂が震える。'), dur: 2.0 });
          }
          syncSuzuWardVisuals();
          renderHud();
        },
      });
    });
    // --- 로쿠로쿠비 (ACT 6~7, §5.3.1) — 정문에서 dormant. 방울을 집으면 출구를 막고 activate ---
    // 옛 4.2 m 사당에서는 몸통을 고정했지만, 확장 제당에서는 네 기둥·제단을 피해 실내를 활주한다.
    // 정문에서 서쪽 제단(-X)을 바라본다: 모델 정면(+Z) → yaw -π/2.
    {
      rokuro = new RokuroKubi({
        url: '/models/yokai-rokurokubi.glb', height: 2.15,
        pos: vv.hokora.rokuroSpawn,
        yaw: -Math.PI / 2,
        arena: vv.hokora.chaseArena,
      }, sfx);
      void rokuro.load().catch((e) => console.warn('[rokuro]', e));
      scene.add(rokuro.root);
      rokuro.onCatch = () => {
        // §5.3.1 — 죽이지 않고 방울과 역순 매듭 진행만 되돌린다. 조사 기록은 반복하지 않는다.
        rokuroWakeToken++;
        rokuroTrialPhase = 'idle';
        rokuroTrialCleared = false;
        rokuroRebindStep = 0;
        rules?.dropCarried();
        controller.teleport(vv.hokora.ejectPos);
        tpCam.shake(0.5);
        vv.hokora.openDoor();
        rokuro!.setEscapeEnabled(false);
        rokuro!.deactivate();
        syncSuzuWardVisuals();
        renderHud();
        saveCheckpoint();
        dialogue.preemptNext();
        void dialogue.say(
          { text: L('긴 목이 가방을 낚아채, 몸이 문밖으로 떠밀렸다.', '長い首が鞄を掠め、体が戸口の外へ押し出された。') },
          { text: L('막 되묶은 매듭들이 검은 머리카락에 걸려 차례로 다시 풀린다.', '結び直したばかりの結び目が黒い髪に絡み、順にほどけていく。') },
          { text: L('방울은 제단 위로 되돌아가 있다. 다시 들면 매듭도 처음부터다.', '鈴は祭壇へ戻っている。もう一度取れば、結びも最初からだ。') },
        );
      };
      rokuro.onEscape = () => {
        rokuroWakeToken++;
        rokuroTrialPhase = 'idle';
        rokuroTrialCleared = true;
        syncSuzuWardVisuals();
        renderHud();
        saveCheckpoint();
        toastEl.textContent = L('목이 문턱에서 멈췄다. 방울은 아직 손안에 있다.', '首は敷居で止まった。鈴はまだ手の中にある。');
        toastEl.classList.add('show'); toastT = 3.2;
        void dialogue.say({ who: '???', text: L('놓고 가.', '置いていけ。') });
      };
    }

    // --- 우물의 여자 (ACT 10~11, §5.3.3) — 동전을 집으면 등 뒤의 물이 일어선다 ---
    {
      wellWoman = new WellWoman(vv.wellShaft, sfx);
      scene.add(wellWoman.root);
      await wellWoman.ready;
      const restoredWellAnswer = wellAnswer();
      if (restoredWellAnswer) wellWoman.restoreAnswer(restoredWellAnswer);
      if (wellWomanQa) wellWoman.activate(controller.position);
      wellWoman.onCatch = (n) => {
        if (n === 0) {
          // 동전을 들기 전의 경고 접촉. 조사 도중부터 위험을 보여 주되 실패·사망으로 끊지 않는다.
          tpCam.shake(0.35);
          sfx.hit();
          void dialogue.say(
            { text: L('발목 옆 수면에서 긴 손가락이 솟았다가 벽감 앞에서 멈춘다.', '足首の脇から長い指が水面を破り、壁龕の前で止まる。') },
            { who: '???', text: L('……하루?', '……ハル?') },
            { who: '???', text: L('너는 아니야.', 'おまえじゃない。') },
            { text: L('이름을 확인하듯 손가락이 한 번 떨리고 물속으로 가라앉는다.', '名を確かめるように指が一度震え、水へ沈む。') },
          );
        } else if (n === 1) {
          // 얼굴을 확인하고 — 「너는 아니야」. 방 반대편으로 던져버린다 (§5.3.3)
          const c = vv.wellShaft.chamber;
          const caughtAt = controller.position.clone();
          const womanFocus = wellWoman!.cinematicFocus();
          const dx = caughtAt.x - c.cx, dz = caughtAt.z - c.cz;
          const dd = Math.max(0.1, Math.hypot(dx, dz));
          const throwTarget = new THREE.Vector3(c.cx - dx / dd * (c.r - 1.0), c.floorY + 0.4, c.cz - dz / dd * (c.r - 1.0));
          wellWoman!.holdForCinematic();
          tpCam.shake(0.8);
          sfx.hit();
          dreadEl.style.opacity = '0.9';
          void (async () => {
            try {
              await playWellCinematic(
                wellCinematics.firstCapture(caughtAt, womanFocus, throwTarget, () => controller.teleport(throwTarget)),
                [
                  { text: L('젖은 손이 얼굴을 붙잡는다. 긴 손가락이 뺨을 더듬는다.', '濡れた手が顔を掴む。長い指が頬をなぞる。'), dur: 1.65 },
                  { who: '???', text: L('너도 아니야.', 'おまえも違う。'), dur: 1.05 },
                  { who: '???', text: L('그런데 왜 그 애 냄새가 나?', 'なのに、どうしてあの子の匂いがする?'), dur: 1.45 },
                  { text: L('내던져졌다. 물이 등을 때린다.', '投げ捨てられた。水が背を打つ。'), dur: 1.0 },
                ],
              );
              controller.teleport(throwTarget);
              tpCam.snapBehind(throwTarget, new THREE.Vector3(c.cx, c.floorY + 0.8, c.cz));
              sequencer.setFade(0, 0.34);
            } finally {
              wellWoman?.releaseFromCinematic(1.15);
              dreadEl.style.opacity = '0';
            }
          })();
        } else {
          // 2회째 — 즉사. 우물가 체크포인트 (§5.3.3)
          const caughtAt = controller.position.clone();
          const womanFocus = wellWoman!.cinematicFocus();
          wellWoman!.holdForCinematic();
          tpCam.shake(0.9);
          sfx.hit();
          void (async () => {
            await playWellCinematic(
              wellCinematics.submerge(caughtAt, womanFocus, vv.wellShaft.chamber.waterY, () => wellWoman?.sinkForCinematic()),
              [
                { who: '???', text: L('너도… 데려간 거지.', 'おまえも…連れて行ったんだろう。'), dur: 1.9 },
                { text: L('젖은 손이 정수리를 누른다. 숨이 물속에서 끊긴다.', '濡れた手が頭を押さえる。息が水中で途切れる。'), dur: 2.2 },
              ],
            );
            storyFlags.deaths += 1;
            telemetry.recordDeath('well-woman', storyFlags.act);
            const checkpoint = vv.wellShaft.topPos.clone().add(new THREE.Vector3(1.6, 0.3, 0.6));
            controller.teleport(checkpoint);
            // 우물가 체크포인트에서 곧장 신사로 달아나 추격을 생략할 수 없게 동전만 제단으로 돌린다.
            // 조사 순서·첫 대답은 evidence/world에 남아 재진입 시 그대로 복원된다.
            rules?.dropCarried();
            renderHud();
            saveCheckpoint();
            wellWoman!.deactivate();
            tpCam.snapBehind(checkpoint, vv.wellShaft.topPos);
            sequencer.setFade(0, 0.85);
            await dialogue.say({ text: L('정신이 들자 우물가다.', '気づけば井戸端だ。'), dur: 1.7 });
          })();
        }
      };
      maybeBeginWellQuestion = async () => {
        if (wellQuestionPlaying || wellAnswer() || countOf(WELL_EVIDENCE) < WELL_EVIDENCE.length || !wellWoman) return;
        wellQuestionPlaying = true;
        wellWoman.beginQuestion(controller.position);
        await playWellCinematic(
          wellCinematics.firstQuestion(controller.position, wellWoman.cinematicFocus()),
          [
            { text: L('우물의 여자가 제단과 미오 사이에서 일어난다. 두 팔은 보이지 않는 아이를 안고 있다.', '井戸の女が祭壇とミオの間で立ち上がる。両腕は見えない子を抱いている。'), dur: 2.7 },
            { who: '???', text: L('우리 애 못 봤니?', 'うちの子を見なかった?'), dur: 2.0 },
            { who: '???', text: L('분명 여기 있었는데.', 'たしかにここにいたのに。'), dur: 2.0 },
          ],
        );
        const choices: { answer: WellFirstAnswer; text: string; evidence: string }[] = [
          { answer: 'death', text: L('하루는 이미 죽었어요.', 'ハルはもう亡くなっています。'), evidence: 'well:answer-death' },
          { answer: 'voice', text: L('아래에서 하루 목소리를 들었어요.', '下でハルの声を聞きました。'), evidence: 'well:answer-voice' },
          { answer: 'silence', text: L('침묵한다.', '黙る。'), evidence: 'well:answer-silence' },
        ];
        if (wellSurfaceComplete()) choices.push({
          answer: 'truth',
          text: L('당신이 쓴 경고예요. 그 목소리는 하루가 아니에요.', 'あなたが書いた警告です。その声はハルじゃない。'),
          evidence: 'well:answer-truth',
        });
        const selected = choices[await dialogue.choose(
          L('여자의 시선이 미오의 얼굴과 세 벽감 사이를 오간다.', '女の視線がミオの顔と三つの壁龕を行き来する。'),
          choices.map((choice) => choice.text),
        )]!;
        rememberEvidence(selected.evidence);
        if (selected.answer === 'death') await dialogue.say(
          { who: '???', text: L('거짓말하지 마.', '嘘をつかないで。') },
          { text: L('여자가 아이를 감싸듯 팔을 굽힌 채 물 위로 솟는다.', '女は子を庇うように腕を曲げたまま水上へ立ち上がる。') },
        );
        else if (selected.answer === 'voice') await dialogue.say(
          { who: '???', text: L('그럼…… 데려가 줘.', 'なら……連れていって。') },
          { text: L('여자가 제단까지의 물길을 비킨다. 목소리를 믿은 눈이다.', '女が祭壇までの水路を空ける。声を信じた目だ。') },
        );
        else if (selected.answer === 'silence') await dialogue.say(
          { text: L('대답하지 않는다. 여자는 잠기지만, 수면 아래의 그림자는 미오에게서 떨어지지 않는다.', '答えない。女は沈むが、水面下の影はミオから離れない。') },
        );
        else {
          vv.wellShaft.showFalseHaru(5.4);
          await dialogue.say(
            { text: L('여자가 처음으로 보이지 않는 아이를 안은 팔을 조금 내린다.', '女が初めて、見えない子を抱く腕を少し下ろす。') },
            { who: '???', text: L('그럼…… 내가 따라온 건 누구야?', 'それなら……わたしがついて来たのは誰?') },
            { text: L('중앙의 아이 얼굴에 피안화 뿌리가 번지고, 석실의 물이 한꺼번에 솟는다.', '中央の子供の顔へ彼岸花の根が広がり、石室の水が一気に立ち上がる。') },
          );
        }
        wellWoman.resolveQuestion(selected.answer);
        wellQuestionPlaying = false;
        renderHud();
      };
      vv.wellShaft.onPebbleSplash = (position) => {
        sfx.pebbleSplash(position.x, vv.wellShaft.chamber.waterY, position.z, 0.96);
        wellWoman?.distractAt(position, 3.2);
        tpCam.shake(0.08);
      };
    }

    // --- 유리 (ACT 8~9, §5.3.2) — 폐교의 얼굴 없는 학생. 머리빗을 집으면 눈을 뜬다 ---
    {
      // 실물 도착 (2026-08-25) — 놋페라보 돌려쓰기 졸업. 「3학년 교실 아이」라 키도 1.62 → 1.30
      yuri = new Yuri({ url: '/models/yokai-yuri.glb', height: 1.30 }, vv.schoolInterior, physics, sfx);
      yuri.configureResponse(evidence.has('school:response-answered'));
      void yuri.load().catch((e) => console.warn('[yuri]', e));
      scene.add(yuri.root);
      yuri.onCatch = () => {
        // §5.3.2 — 잡히면 「내 이름…」 + 입구 체크포인트 + 사망 +1. 머리빗은 **뺏지 않는다**
        storyFlags.deaths += 1;
        telemetry.recordDeath('yuri', storyFlags.act);
        dreadEl.style.opacity = '0.95';
        tpCam.shake(0.7);
        sfx.hit();
        controller.teleport(vv.school.doorPos.clone().add(new THREE.Vector3(0, 0.3, 0)));
        yuri!.respawnFarFrom(controller.position);
        void (async () => {
          await dialogue.say(
            { who: '???', text: L('내 이름…', 'わたしの、なまえ…') },
            { text: L('정신이 들자 교사 입구다. 심장이 목까지 올라와 있다.', '気づけば校舎の入口だ。心臓が喉まで上がっている。') },
          );
          dreadEl.style.opacity = '0';
        })();
      };

      // 추격을 단순 달리기로 끝내지 않는다. 준비실 벽장은 안전한 선택지지만 유리가 코앞까지
      // 온 뒤 숨으면 잡히고, 복도 미닫이문은 한 번만 닫아 3.8초를 번다.
      inspect.add({
        id: 'school-hide-enter', pos: vv.schoolInterior.hideEntryPos, radius: 1.25,
        prompt: L('준비실 벽장 아래칸에 숨는다', '準備室の戸棚に隠れる'), once: false, inputPriority: true,
        // 같은 벽장 안판의 크레용 단서를 먼저 읽은 뒤 은신처로 전환한다. 둘을 동시에 켜면
        // 가까운 은신 프롬프트가 필수 크레용 조사를 가로챈다.
        enabled: () => evidence.has('school:crayon') && !!yuri && yuri.state !== 'dormant'
          && !vv.schoolInterior.inHideCloset(controller.position),
        onUse: () => {
          crouching = true;
          controller.teleport(vv.schoolInterior.hideInsidePos);
          sfx.hideIn();
          toastEl.textContent = L('시선을 끊고 숨으면 흥얼거림이 멀어진다', '視線を切って隠れれば、鼻歌が遠ざかる');
          toastEl.classList.add('show'); toastT = 3.2;
        },
      });
      inspect.add({
        id: 'school-hide-exit', pos: vv.schoolInterior.hideInsidePos, radius: 0.85,
        prompt: L('벽장 밖으로 나온다', '戸棚から出る'), once: false, inputPriority: true,
        enabled: () => crouching && vv.schoolInterior.inHideCloset(controller.position),
        onUse: () => {
          controller.teleport(vv.schoolInterior.hideEntryPos.clone().setY(vv.schoolInterior.bounds.floorY + 0.04));
          crouching = false;
          sfx.hideOut();
        },
      });
      inspect.add({
        id: 'school-brace-door', pos: vv.schoolInterior.hauntedDoorPos, radius: 1.45,
        prompt: L('미닫이문을 닫아 막는다', '引き戸を閉めて塞ぐ'), once: true, inputPriority: true, hold: 0.55,
        enabled: () => !!yuri && yuri.state !== 'dormant' && !vv.schoolInterior.doorBraced,
        onUse: () => {
          const seconds = 3.8;
          if (!vv.schoolInterior.braceHauntedDoor(seconds)) return false;
          yuri?.delayByDoor(seconds);
          const p = vv.schoolInterior.hauntedDoorPos;
          sfx.doorPush(p.x, p.y, p.z, 0.9);
          void dialogue.say({ text: L('문 너머의 손톱 소리가 멎는다. 오래 버티지는 못한다.', '戸の向こうの爪音が止まる。長くはもたない。') });
        },
      });
    }

    inspect.add({
      // 미오는 **빈손으로 내렸다**(각색 6 C안). 이 게임의 빛은 여기서 손에 들어온다 —
      // 폐허의 처마에 아직 켜져 있는 남의 집 등불이다
      id: 'eave-chochin', pos: vv.eaveChochin.pos, radius: 2.0, markerLift: 1.95,
      prompt: L('초칭을 든다', '提灯を取る'), once: true,
      enabled: () => vv.eaveChochin.available,
      onUse: () => {
        vv.eaveChochin.take();
        chochin?.setHeld(true);
        chochin?.setLevel(2);
        sfx.lanternToggle(2);
        storyFlags.chochin = true;
        saveCheckpoint();
        void (async () => {
          await dialogue.say(
            { who: MIO_NAME, text: L('……빌릴게요.', '……お借りします。') },
            { text: L('돌려줄 사람이 없다는 건, 알고 있다.', '返す相手がいないことは、わかっている。') },
          );
          // 빛 3단은 이 게임의 난이도 다이얼이다. 가르칠 자리가 지금까지 없었다 —
          // 처음부터 들고 시작했으니까
          toast(L('Q — 초칭 밝기(끔 / 약 / 강). 밝을수록 멀리서도 보인다', 'Q — 提灯の明るさ（消す / 弱 / 強）。明るいほど遠くからも見つかる'));
        })();
      },
    });
    inspect.add({
      /**
       * 굳게 잠긴 본전 문 (PLAN-STORY P3-1).
       *
       * `once: false` 다 — **몇 번을 밀어도 안 열린다**는 게 이 물건의 내용이라,
       * 한 번 쓰고 사라지면 안 된다. 봉납이 쌓여 틈이 벌어진 뒤에도 같은 자리에서 계속 민다
       */
      id: 'honden', pos: vv.shrine.honden.pos, radius: 2.1, prompt: L('본전 문을 밀어본다', '本殿の戸を押してみる'), once: false,
      hold: 1.2,
      onHold: (p) => vv.shrine.honden.push(p),
      onUse: () => {
        const h = vv.shrine.honden;
        h.refuse();
        const d = h.stage;
        void dialogue.say(
          d >= 2
            ? { who: MIO_NAME, text: L('……틈은 있는데, 더는 안 열려.', '……隙間はあるのに、これ以上は開かない。') }
            : { text: L('안에서 잠겨 있다. 밖에는 걸쇠가 없다.', '内側から閉ざされている。外に掛け金はない。') },
        );
      },
    });
    // 미는 동안 삐걱임 — 문이 간격을 정하고(누를수록 잦아진다) 소리는 여기서 낸다
    vv.shrine.honden.onCreak = (p) => {
      const hp = vv.shrine.honden.pos;
      sfx.doorPush(hp.x, hp.y + 1.1, hp.z, p);
    };
    // ---------- ACT 10-1: 지상 장례 흔적 3종 (선택 조사, 진입은 막지 않는다) ----------
    const surfaceLines = [
      [
        { text: L('비에 젖은 장례 쟁반. 동전 세 닢과 작은 장난감이 놓였던 물자국만 남았다.', '雨に濡れた葬送盆。三枚の銭と小さな玩具が置かれていた水跡だけが残る。') },
        { who: MIO_NAME, text: L('가져간 게 아니라…… 장례를 끝내지 못한 거야.', '持ち去ったんじゃない……葬送を終えられなかった。') },
      ],
      [
        { text: L('구조용 밧줄의 단면이 빗물에 불었다. 자연스럽게 삭은 섬유가 아니라 한 번에 베인 칼자국이다.', '救助縄の断面が雨を吸っている。朽ちた繊維ではなく、一度で断った刃痕だ。') },
        { who: MIO_NAME, text: L('칼자국이 바깥쪽이야. 아래 사람이 끊은 게 아니야.', '刃痕は外側。下にいた人が切ったんじゃない。') },
      ],
      [
        { text: L('성인 여성의 젖은 발자국이 금줄 안으로 들어간다. 밖으로 되돌아온 자국은 없다.', '成人女性の濡れた足跡が注連縄の内へ入る。外へ戻った跡はない。') },
        { who: MIO_NAME, text: L('누군가를 찾으러 내려갔어.', '誰かを探しに降りた。') },
      ],
    ] as const;
    vv.wellShaft.surfaceCluePositions.forEach((pos, i) => inspect!.add({
      id: `well-surface-${i}`, pos, radius: 1.55, once: true, inputPriority: true,
      prompt: [L('장례 쟁반을 살핀다', '葬送盆を調べる'), L('잘린 밧줄을 확인한다', '切られた縄を確かめる'), L('젖은 발자국을 따라본다', '濡れた足跡を辿る')][i]!,
      enabled: () => rules!.stateOf('coins') === 'open' && !vv.wellShaft.inChamber(controller.position)
        && !evidence.has(WELL_SURFACE_EVIDENCE[i]!),
      onUse: () => {
        rememberEvidence(WELL_SURFACE_EVIDENCE[i]!);
        void (async () => {
          await dialogue.say(...surfaceLines[i]!);
          if (wellSurfaceComplete()) await dialogue.say(
            { who: MIO_NAME, text: L('누군가 아이를 찾으러 내려갔고…….', '誰かが子供を探しに降りて……。') },
            { who: MIO_NAME, text: L('위에서는 그 사람이 돌아올 길을 끊었어.', '上では、その人が戻る道を断った。') },
          );
        })();
      },
    }));

    inspect.add({
      // ACT 10-2 — 하강은 안전하지만, 세 매듭에서 과거가 층층이 겹친다.
      id: 'well-descend', pos: vv.well.pos, radius: 2.2, prompt: L('밧줄을 타고 내려간다', '縄を伝って降りる'), once: false,
      enabled: () => !vv.wellShaft.inChamber(controller.position) && !wellClimbInProgress,
      hold: 1.4,
      onUse: () => {
        const firstDescent = !wellPreludeHeard;
        wellClimbInProgress = true;
        void (async () => {
          if (firstDescent) {
            wellPreludeHeard = true;
            vv.well.flashFace();
            sfx.voice(0.24, 'girl');
            await dialogue.say(
              { who: L('우물 아래', '井戸の底'), text: L('엄마…… 추워.', 'お母さん……寒い。') },
              { text: L('빛을 내리자 아이의 얼굴이 잠깐 수면에 떠올랐다가 사라졌다.', '光を落とすと、子供の顔が一瞬水面に浮かび、消えた。') },
              ...(wellSurfaceComplete() ? [
                { who: L('등 뒤의 골목', '背後の路地'), text: L('여기야.', 'こっちだよ。') },
                { text: L('같은 목소리가 우물 아래와 등 뒤에서 동시에 들렸다. 돌아보면 빈 골목뿐이다.', '同じ声が井戸の底と背後から同時に聞こえた。振り向いても空の路地しかない。') },
              ] : []),
            );
          }
          dreadEl.style.opacity = '1';
          if (firstDescent) {
            const ropeX = vv.wellShaft.chamber.cx + 0.3, ropeZ = vv.wellShaft.chamber.cz + 0.15;
            sfx.wellRope(ropeX, vv.wellShaft.ropeKnotYs[0]!, ropeZ, 0.76);
            sfx.wellMonitor(ropeX, vv.wellShaft.ropeKnotYs[0]!, ropeZ, 0.7);
            setTimeout(() => sfx.wellRope(ropeX, vv.wellShaft.ropeKnotYs[1]!, ropeZ, 0.72), 4700);
            setTimeout(() => sfx.wellRope(ropeX, vv.wellShaft.ropeKnotYs[2]!, ropeZ, 0.78), 7900);
            await dialogue.say(
            { text: L('첫 번째 매듭. 심박계가 길게 한 번 울린다.', '一つ目の結び。心拍計が長く一度鳴る。'), dur: 2.0 },
            { who: L('과거의 남자', '過去の男'), text: L('……9월 20일입니다. 보호자분을 불러 주세요.', '……九月二十日です。保護者の方を呼んでください。'), dur: 2.7 },
            { text: L('두 번째 매듭.', '二つ目の結び。'), dur: 1.2 },
            { who: L('과거의 여자', '過去の女'), text: L('하루야. 엄마 왔어.', 'ハル。お母さん来たよ。'), dur: 2.0 },
            { text: L('세 번째 매듭.', '三つ目の結び。'), dur: 1.2 },
            { who: L('아이', '子供'), text: L('동전도 가져왔지?', '銭も持ってきたよね?'), dur: 2.1 },
            { text: L('반기는 목소리가 아니라, 물건을 확인하는 질문처럼 들린다.', '迎える声ではなく、持ち物を確かめる問いに聞こえる。') },
            );
          }
          else await new Promise((resolve) => setTimeout(resolve, 520));
          vv.wellShaft.setRitualProgress(wellNicheOrder);
          controller.teleport(vv.wellShaft.landing.clone().add(new THREE.Vector3(0, 0.3, 0)));
          tpCam.snapBehind(controller.position, vv.wellShaft.altarPos);
          vv.update(0, controller.position);
          const progress = countOf(WELL_EVIDENCE);
          if (progress > 0) wellWoman?.awakenFromEvidence(progress, controller.position);
          if (rules?.carried.includes('coins')) setTimeout(() => wellWoman?.activate(controller.position), 900);
          await dialogue.say({ text: L('12미터. 밧줄이 끝나는 곳에서 발이 물에 닿았다.', '十二メートル。縄の尽きる所で足が水に触れた。') });
          dreadEl.style.opacity = '0';
          wellClimbInProgress = false;
          if (progress === WELL_EVIDENCE.length && !wellAnswer()) void maybeBeginWellQuestion();
          renderHud();
        })();
      },
    });
    inspect.add({
      /** 잠수 직후의 2~3초 무음만 상승 시작이 가능하다. 밧줄 위에서는 세 매듭과 마지막 행동으로 이어진다. */
      id: 'well-ascend', pos: vv.wellShaft.landing, radius: 1.6, prompt: L('밧줄을 타고 올라간다', '縄を伝って登る'), once: false,
      enabled: () => vv.wellShaft.inChamber(controller.position) && !wellClimbInProgress,
      hold: 2.2,
      onUse: () => {
        if (wellWoman && !wellWoman.safeToClimb) {
          wellWoman.catches += 1;
          wellWoman.onCatch?.(wellWoman.catches);
          return;
        }
        wellClimbInProgress = true;
        const hasCoins = rules?.carried.includes('coins') ?? false;
        // 매듭 대사 도중 지상 이동 대신 포획 숏이 끼어들지 않게, 등반 시작부터 AI를 멈춘다.
        wellWoman?.holdForCinematic();
        void (async () => {
          if (hasCoins) {
            const ropeX = vv.wellShaft.chamber.cx + 0.3, ropeZ = vv.wellShaft.chamber.cz + 0.15;
            sfx.wellRope(ropeX, vv.wellShaft.ropeKnotYs[2]!, ropeZ, 0.86);
            setTimeout(() => sfx.wellRope(ropeX, vv.wellShaft.ropeKnotYs[1]!, ropeZ, 0.9), 3400);
            setTimeout(() => sfx.wellRope(ropeX, vv.wellShaft.ropeKnotYs[0]!, ropeZ, 0.96), 7000);
            await dialogue.say(
              { text: L('첫 번째 매듭. 아래의 물소리가 끊긴다.', '一つ目の結び。下の水音が途切れる。'), dur: 1.6 },
              { who: L('우물 아래', '井戸の底'), text: L('엄마, 나 여기 있어.', 'お母さん、ここにいるよ。'), dur: 1.8 },
              { text: L('두 번째 매듭. 밧줄 아래에서 젖은 손이 돌을 더듬는다.', '二つ目の結び。縄の下で濡れた手が石を探る。'), dur: 1.8 },
              { who: L('우물 아래', '井戸の底'), text: L('엄마, 왜 올라가?', 'お母さん、どうして上がるの?'), dur: 1.8 },
              { text: L('세 번째 매듭. 우물 입구의 빛이 보인다.', '三つ目の結び。井戸口の光が見える。'), dur: 1.7 },
              { who: L('우물 아래', '井戸の底'), text: L('엄마, 저 애가 나를 데려가.', 'お母さん、あの子がぼくを連れていく。'), dur: 2.0 },
              { who: L('우물 아래', '井戸の底'), text: L('엄마, 같이 가.', 'お母さん、いっしょに行こう。'), dur: 2.0 },
            );
            rememberEvidence('well:child-call');
            vv.wellShaft.showFalseHaru(6.2);
            wellWoman?.beginFinalKnot();
            const womanFocus = wellWoman?.cinematicFocus()
              ?? new THREE.Vector3(vv.wellShaft.chamber.cx, vv.wellShaft.chamber.waterY + 1.42, vv.wellShaft.chamber.cz);
            const ropeFocus = new THREE.Vector3(ropeX, vv.wellShaft.chamber.waterY + 1.2, ropeZ);
            await playWellCinematic(
              wellCinematics.finalKnot(ropeFocus, womanFocus, vv.wellShaft.falseHaruFocus()),
              [{ text: L('밧줄 아래에서 여자가 멈춘다. 시선이 미오와 아이 형체 사이를 오간다.', '縄の下で女が止まる。視線がミオと子供の姿の間を行き来する。'), dur: 3.7 }],
            );
            const actions: { id: typeof WELL_ESCAPE_EVIDENCE[number]; label: string }[] = [
              { id: 'well:escape-voice', label: L('가짜 목소리가 여자를 데려가게 두고 올라간다.', '偽の声に女を連れて行かせて上がる。') },
            ];
            if (wellPebbles > 0) actions.push({ id: 'well:escape-stone', label: L('돌을 던져 스스로 다른 물소리를 만든다.', '石を投げ、自分で別の水音を作る。') });
            if (wellSurfaceComplete()) actions.push({ id: 'well:escape-truth', label: L('목마를 내려놓고 “그 애는 하루가 아니에요”라고 외친다.', '木馬を置き「その子はハルじゃない」と叫ぶ。') });
            // 준비물이 없으면 목소리 분기만 남는다. 2~4지선다 UI에 한 항목을 넘기면 등반이 멈춘다.
            const choice = actions.length === 1 ? 0 : await dialogue.choose(
              L('여자가 가짜 목소리와 미오 사이에서 방향을 바꾼다.', '女が偽の声とミオの間で向きを変える。'),
              actions.map((entry) => entry.label),
            );
            const action = actions[choice]!;
            rememberEvidence(action.id);
            wellWoman?.releaseFromCinematic(6);
            if (action.id === 'well:escape-voice') {
              wellWoman?.lureToChildVoice(4.2);
              await dialogue.say({ text: L('여자가 미오에게서 등을 돌린다. 보이지 않는 아이를 안듯 두 팔이 깊은 물로 향한다.', '女がミオに背を向ける。見えない子を抱くように両腕が深い水へ向かう。') });
            } else if (action.id === 'well:escape-stone') {
              wellPebbles--;
              const dir = new THREE.Vector3(vv.wellShaft.chamber.cx - controller.position.x, 0, vv.wellShaft.chamber.cz - controller.position.z);
              const target = vv.wellShaft.waterPointInDirection(controller.position, dir, 4.5);
              vv.wellShaft.throwPebble(controller.position, target);
              await new Promise((resolve) => setTimeout(resolve, 680));
              await dialogue.say({ text: L('첨벙. 여자의 손이 밧줄 반대편을 한 번 잘못 움켜쥔다.', 'ぽちゃん。女の手が縄の反対側を一度、誤って掴む。') });
            } else {
              wellWoman?.confrontWithToy(3.8);
              sfx.wellWetGrab(ropeX, vv.wellShaft.ropeKnotYs[0]!, ropeZ, 0.9);
              await dialogue.say(
                { who: MIO_NAME, text: L('그 애는 하루가 아니에요!', 'その子はハルじゃない!') },
                { text: L('목마가 매듭 아래로 내려간다. 여자가 분노해 밧줄을 붙잡지만, 장난감을 보는 순간 손이 멈춘다.', '木馬が結びの下へ降りる。女は怒って縄を掴むが、玩具を見た瞬間に手が止まる。') },
                { who: '???', text: L('하루는…… 나한테 아래로 오라고 한 적이 없는데.', 'ハルは……わたしに下へ来いと言ったことがないのに。') },
              );
            }
          }
          dreadEl.style.opacity = '1';
          await new Promise((resolve) => setTimeout(resolve, 520));
          const surfaceCheckpoint = vv.wellShaft.topPos.clone().add(new THREE.Vector3(1.6, 0.3, 0.6));
          controller.teleport(surfaceCheckpoint);
          wellWoman?.deactivate();
          tpCam.snapBehind(surfaceCheckpoint, vv.wellShaft.topPos);
          vv.update(0, controller.position);
          dreadEl.style.opacity = '0';
          if (hasCoins) {
            wellOutroPlaying = true;
            const horn = vv.speakers.nearestHorn(surfaceCheckpoint).clone();
            sfx.wellSpeaker(horn.x, horn.y, horn.z, 0.72);
            sfx.voice(0.3, 'girl');
            await playWellCinematic(
              wellCinematics.surfaceOutro(surfaceCheckpoint, vv.wellShaft.topPos, horn),
              [
                { text: L('미오가 젖은 땅에 손을 짚는다. 밧줄 끝에서 물이 위로 흐르듯 떨어진다.', 'ミオが濡れた地面に手をつく。縄の先から水が上へ流れるように落ちる。'), dur: 2.65 },
                { who: L('마을 스피커', '村のスピーカー'), text: L('잘했어.', 'よくできたね。'), dur: 1.65 },
                { who: L('마을 스피커', '村のスピーカー'), text: L('이제 신사로 가져가.', '今度は社へ持っていって。'), dur: 2.2 },
              ],
            );
            await dialogue.say(...(wellSurfaceComplete() ? [
                { who: MIO_NAME, text: L('날 살려준 게 아니야.', 'わたしを助けたんじゃない。') },
                { who: MIO_NAME, text: L('동전을 가져가게 만든 거야.', '銭を持ち出させたんだ。') },
              ] : [
                { who: MIO_NAME, text: L('저 목소리…… 우물 안에 있던 게 아니었어.', 'あの声……井戸の中にいたんじゃない。') },
              ]));
            phone.showWellDistortion();
            await new Promise((resolve) => setTimeout(resolve, 3700));
            wellOutroPlaying = false;
            saveCheckpoint();
          } else await dialogue.say({ text: L('지상의 공기. 아래의 물소리는 다시 느린 박자로 돌아간다.', '地上の空気。下の水音はまた遅い拍へ戻る。') });
          dreadEl.style.opacity = '0';
          wellClimbInProgress = false;
          renderHud();
        })();
      },
    });
    inspect.add({
      id: 'well-carving', pos: vv.wellShaft.carvingPos, radius: 2.0,
      prompt: L('벽의 각인을 읽는다', '壁の刻み文字を読む'), once: true,
      onUse: () => { void dialogue.say(...WELL_RECORDS.carving); },
    });
    // 바닥 조약돌 — 한 번에 세 개. J는 모바일 공격 버튼과 공유하고 G는 키보드 전용 보조키다.
    inspect.add({
      id: 'well-pebbles', pos: vv.wellShaft.pebblePilePos, radius: 1.25, once: false,
      prompt: L('조약돌 세 개를 주워 쥔다', '小石を三つ拾って握る'),
      enabled: () => vv.wellShaft.inChamber(controller.position) && countOf(WELL_EVIDENCE) >= 2 && wellPebbles < 3,
      onUse: () => {
        wellPebbles = 3;
        toastEl.textContent = L('J / G — 바라보는 수면에 조약돌을 던진다', 'J / G — 見ている水面へ小石を投げる');
        toastEl.classList.add('show'); toastT = 3.6; renderHud();
      },
    });
    // ACT 10-3 — 세 벽감은 자유 순서. 마지막은 침수되고 첫 벽감 뒤 우회 포켓이 열린다.
    const nicheLines = [
      [
        { text: L('작은 환자복의 이름표 — 「하루」. 천은 젖었지만 사망 확인표만 비정상적으로 말라 있다.', '小さな病衣の名札 — 「ハル」。布は濡れているのに死亡確認票だけ異様に乾いている。') },
        { text: L('「사망 9월 20일」. 퇴원 날짜는 비어 있다.', '「死亡 九月二十日」。退院日は空欄だ。') },
        { who: MIO_NAME, text: L('피안제보다 사흘 전…… 우물에 오기 전부터 죽어 있었어.', '彼岸祭の三日前……井戸へ来る前から亡くなっていた。') },
      ],
      [
        { text: L('성인 여성의 젖은 소매와 손톱 부스러기. 손톱 폭은 벽의 「내 아이가 아니다」와 정확히 같다.', '成人女性の濡れた袖と爪片。爪の幅は壁の「うちの子じゃない」と完全に一致する。') },
        { who: MIO_NAME, text: L('누가 남겨 준 경고가 아니야. 저 여자가…… 자기한테 쓴 거야.', '誰かが残した警告じゃない。あの女が……自分へ書いた。') },
      ],
      [
        { text: L('바퀴가 닳은 목마 밑면. 「하루가 세 경계를 잃지 않도록 한 닢씩.」', '車輪の擦れた木馬の裏。「ハルが三つの境を失わぬよう、一枚ずつ。」') },
        { who: L('방 중앙', '部屋の中央'), text: L('그거 내 거야.', 'それ、ぼくの。') },
        { who: MIO_NAME, text: L('목마가 아니라…… 동전이 움직이기를 기다리고 있어.', '木馬じゃない……銭が動くのを待ってる。') },
      ],
    ] as const;
    vv.wellShaft.nicheInspectPositions.forEach((pos, i) => {
      const key = WELL_EVIDENCE[i]!;
      inspect!.add({
        id: `well-niche-${i}`, pos, radius: 1.55,
        prompt: [
          L('젖은 어린이 환자복을 조사한다', '濡れた子供用の病衣を調べる'),
          L('젖은 소매와 손톱을 조사한다', '濡れた袖と爪片を調べる'),
          L('바퀴 달린 목마를 조사한다', '車輪付きの木馬を調べる'),
        ][i]!, once: true,
        inputPriority: true,
        enabled: () => rules!.stateOf('coins') === 'open' && !evidence.has(key),
        onUse: () => {
          if (!wellNicheOrder.includes(i)) wellNicheOrder.push(i);
          rememberEvidence(key);
          const progress = countOf(WELL_EVIDENCE);
          vv.wellShaft.setRitualProgress(wellNicheOrder);
          wellWoman?.awakenFromEvidence(progress, controller.position);
          const done = progress === WELL_EVIDENCE.length;
          void (async () => {
            await dialogue.say(
              ...nicheLines[i]!,
              ...(progress === 1 ? [{ text: L('방 반대편 수면 아래로 사람 크기의 그림자가 한 번 지나간다.', '部屋の反対側、水面下を人ほどの影が一度通り過ぎる。') }] : []),
            );
            if (progress === 2) {
              wellQuestionPlaying = true;
              wellWoman?.beginRecognition(controller.position);
              const womanFocus = wellWoman?.cinematicFocus()
                ?? new THREE.Vector3(vv.wellShaft.chamber.cx, vv.wellShaft.chamber.waterY + 1.42, vv.wellShaft.chamber.cz);
              await playWellCinematic(
                wellCinematics.faceCheck(controller.position, womanFocus),
                [
                  { text: L('발목 옆에서 긴 손가락이 올라온다. 젖은 여자가 턱을 더듬어 얼굴을 확인한다.', '足首の脇から長い指が上がる。濡れた女が顎をなぞり顔を確かめる。'), dur: 2.35 },
                  { who: '???', text: L('……하루?', '……ハル?'), dur: 1.35 },
                  { who: '???', text: L('너는 아니야.', 'おまえじゃない。'), dur: 1.45 },
                ],
              );
              wellWoman?.endRecognition();
              wellQuestionPlaying = false;
              toastEl.textContent = L('벽감 안은 안전하다  ·  J / G 조약돌 유인', '壁龕の中は安全  ·  J / G 小石で誘導');
              toastEl.classList.add('show'); toastT = 4.0;
            }
            if (done) {
              const flooded = vv.wellShaft.floodedNicheIndex + 1;
              const detour = vv.wellShaft.detourNicheIndex + 1;
              await dialogue.say(
                { text: L('물이 무릎까지 차오른다. 세 홈이 합쳐져 하나의 이름을 만든다 — 「하루」.', '水が膝まで満ちる。三つの溝が重なり、一つの名になる — 「ハル」。') },
                { text: L(`마지막에 조사한 ${flooded}번째 벽감은 잠겼고, 처음 조사한 ${detour}번째 벽감 뒤로 좁은 틈이 열렸다.`, `最後に調べた${flooded}番目の壁龕は沈み、最初に調べた${detour}番目の奥に狭い隙間が開いた。`) },
              );
              await maybeBeginWellQuestion();
            }
            renderHud();
          })();
        },
      });
    });
    const recordSchoolEvidence = (key: typeof SCHOOL_EVIDENCE[number]) => {
      rememberEvidence(key);
      const progress = countOf(SCHOOL_EVIDENCE);
      yuri?.beginHaunt(progress, controller.position);
      if (progress === 2) {
        // 현재 조사 문장을 먼저 읽은 뒤 붙는다. 같은 E 입력에서 발생한 연출이므로 별도 컷신으로
        // 조작을 빼앗지 않고, 첫 이동 전 규칙을 말과 형광등으로 한 번만 확정한다.
        setTimeout(() => void dialogue.say(
          { text: L('복도 먼 곳에서 책상 다리가 바닥을 긁는다. 형광등이 그 자리까지 차례로 켜진다.', '遠い廊下で机の脚が床を擦る。蛍光灯がそこまで順に灯る。') },
          { who: MIO_NAME, text: L('……내가 보고 있는 동안은 움직이지 않아.', '……わたしが見ている間は動かない。') },
        ), 0);
      }
    };
    inspect.add({
      id: 'school-journal', pos: vv.schoolInterior.journalPos, radius: 2.0,
      prompt: L('교무 일지를 읽는다', '教務日誌を読む'), once: true,
      enabled: () => rules!.stateOf('kushi') === 'open' && !evidence.has('school:journal'),
      onUse: () => { recordSchoolEvidence('school:journal'); void dialogue.say(...SCHOOL_RECORDS.journal); },
    });
    inspect.add({
      id: 'school-attendance', pos: vv.schoolInterior.attendancePos, radius: 1.9,
      prompt: L('칠판의 출석 숫자를 읽는다', '黒板の出席数を読む'), once: true,
      enabled: () => rules!.stateOf('kushi') === 'open' && !evidence.has('school:attendance'),
      onUse: () => { recordSchoolEvidence('school:attendance'); void dialogue.say(...SCHOOL_RECORDS.attendance); },
    });
    inspect.add({
      id: 'school-desk-name', pos: vv.schoolInterior.deskNamePos, radius: 1.55,
      prompt: L('책상 밑 이름을 확인한다', '机の裏の名を確かめる'), once: true,
      enabled: () => rules!.stateOf('kushi') === 'open' && !evidence.has('school:desk-name'),
      onUse: () => { recordSchoolEvidence('school:desk-name'); void dialogue.say(...SCHOOL_RECORDS.deskName); },
    });
    inspect.add({
      id: 'school-crayon', pos: vv.schoolInterior.crayonPos, radius: 2.0,
      prompt: L('크레용 그림을 본다', 'クレヨンの絵を見る'), once: true,
      enabled: () => rules!.stateOf('kushi') === 'open' && !evidence.has('school:crayon'),
      onUse: () => { recordSchoolEvidence('school:crayon'); void dialogue.say(...SCHOOL_RECORDS.crayon); },
    });
    inspect.add({
      id: 'school-broadcast', pos: vv.schoolInterior.broadcastPos, radius: 1.65,
      prompt: L('교내 방송으로 이름을 부른다', '校内放送で名を呼ぶ'), once: true,
      enabled: () => rules!.stateOf('kushi') === 'open'
        && SCHOOL_EVIDENCE.every((id) => evidence.has(id)) && !evidence.has('school:called'),
      onUse: () => {
        void (async () => {
          vv.schoolInterior.pulseBroadcast(9);
          await dialogue.say(
            { text: L('전원은 끊겼는데 마이크의 붉은 불이 켜진다. 스피커 어딘가에서 숨을 죽이는 소리.', '電源は切れているのにマイクの赤い灯が点く。どこかのスピーカーで息を潜める音。') },
            { who: MIO_NAME, text: L('나츠메 유리.', '夏目ユリ。') },
            { who: MIO_NAME, text: L('대답하지 않아도 돼. 네가 여기 있었다는 걸, 내가 기억할게.', '返事をしなくていい。あなたがここにいたことを、わたしが覚えてる。') },
          );
          const p = vv.schoolInterior.broadcastPos;
          sfx.deskScrape(p.x, p.y, p.z, 0.42);
          await new Promise((resolve) => setTimeout(resolve, 550));
          await dialogue.say(
            { who: L('교내 스피커', '校内スピーカー'), text: L('……네.', '……はい。') },
            { text: L('음악실 피아노 안쪽에서 누르고 있던 힘이 사라졌다.', '音楽室のピアノを内側から押さえていた力が消えた。') },
          );
          yuri?.acknowledgeName();
          rememberEvidence('school:called');
        })();
      },
    });
    /**
     * 복도 벽거울 — **거울 시야를 여기서 얻는다.** 손거울(공물)은 거울 방 안에 있고 그 방은
     * 들보로 막혀 있으므로, 도구가 방 밖에 있어야 순서가 성립한다(§5.3.5 「획득 전엔 벽거울」).
     */
    inspect.add({
      id: 'inn-wall-mirror', pos: vv.innInterior.wallMirrorPos, radius: 1.9,
      prompt: L('벽거울을 들여다본다', '壁鏡を覗き込む'), once: true,
      onUse: () => {
        rememberEvidence('inn:wall-mirror');
        void dialogue.say(
          { text: L('그을린 테두리 안쪽만 멀쩡하다. 거울 속 복도에는 불이 켜져 있다.', '焦げた枠の内側だけが無事だ。鏡の中の廊下には灯りがついている。') },
          { who: MIO_NAME, text: L('탄 건 이쪽뿐이야……. 거울 속은 그대로야.', '焼けたのはこっちだけ……。鏡の中はそのまま。') },
          { text: L('거울에 비친 벽에는, 이쪽에 없는 문이 하나 더 있다.', '鏡に映る壁には、こちらにない戸がもう一つある。') },
        );
      },
    });
    /**
     * 合わせ鏡 통로 — 벽에 걸린 그을린 거울. **와쿄를 든 채 마주 보고 사용해야만** 건너간다.
     * 양쪽 실물 거울마다 조사점을 둔다. 돌아가는 쪽은 새 조사 조건으로 막지 않는다.
     * enabled 는 「와쿄를 들었고 + 그 거울을 보고 있다」 — 등지고 E 를 누르는 것은 마주 봄이 아니다.
     */
    const facingDir = new THREE.Vector3();
    for (const returning of [false, true]) inspect.add({
      id: returning ? 'inn-mirror-return' : 'inn-mirror-passage',
      pos: returning ? vv.innInterior.passageReturnPos : vv.innInterior.passageEntryPos, radius: 2.3,
      prompt: returning ? L('안쪽 벽거울에 와쿄를 대고 돌아간다', '内側の壁鏡に和鏡を合わせて戻る')
        : L('와쿄를 마주 대고 건너간다', '和鏡を向かい合わせて渡る'), once: false, inputPriority: true,
      enabled: () => {
        if (!returning && innCaseActive()) return false;
        if (!wakyoView.active) return false;
        const side = controller.position.x - vv.innInterior.secretPos.x;
        if (returning ? side <= 0.12 : side >= -0.12) return false;
        camera.getWorldDirection(facingDir);
        const sp = returning ? vv.innInterior.passageReturnPos : vv.innInterior.passageEntryPos;
        const dx = sp.x - camera.position.x, dz = sp.z - camera.position.z;
        const dl = Math.hypot(dx, dz) || 1;
        return (facingDir.x * dx / dl + facingDir.z * dz / dl) > 0.55;
      },
      onUse: () => {
        const destination = vv.innInterior.passageLandings[returning ? 0 : 1];
        controller.teleport(destination);
        tpCam.snapBehind(destination, destination.clone().add(new THREE.Vector3(returning ? -1 : 1, 0, 0)));
        sfx.bellAfterimage(0.18);
        if (!evidence.has('inn:passage')) {
          rememberEvidence('inn:passage');
          void dialogue.say(
            { text: L('와쿄와 벽거울이 마주 본 순간 — 두 거울 사이가 복도가 된다.', '和鏡と壁鏡が向かい合った瞬間 — 二枚の鏡の間が廊下になる。') },
            { who: MIO_NAME, text: L('……거울과 거울 사이는, 이어져 있어.', '……鏡と鏡の間は、つながっている。') },
            { text: L('경대 위 작은 보관함에 손님 짐표와 같은 무늬가 있다. 뚜껑 틈으로 종이 한 귀퉁이가 나왔다.', '鏡台の小さな預かり箱に、客の荷札と同じ模様。蓋の隙間から紙の角が覗いている。') },
          );
        }
        renderHud(); saveCheckpoint();
      },
    });
    /**
     * 와쿄 픽업 — **객실1 좌탁 위.** 이것이 이 방의 도구다: 인벤토리에 들어가고,
     * [F] 로 화면 전체가 거울 반사가 된다(`story/wakyoView.ts`). 벽거울은 예고, 와쿄가 열쇠.
     */
    inspect.add({
      id: 'inn-wakyo', pos: vv.innInterior.wakyoPos, radius: 1.7,
      prompt: L('오래된 거울을 줍는다', '古い鏡を拾う'), once: true,
      onUse: () => {
        vv.innInterior.takeWakyo();
        give('wakyo');
        rememberEvidence('inn:wakyo');
        void dialogue.say(
          { text: L('좌탁 위에 손잡이 없는 청동 거울이 엎어져 있다. 와쿄 — 뒷면에 학과 소나무.', '座卓の上に柄のない青銅鏡が伏せてある。和鏡 — 裏に鶴と松。') },
          { who: MIO_NAME, text: L('뒤집어 보면…….', '裏返してみると……。') },
          { text: L('거울 면에 비친 방에는, 탄 자국이 하나도 없다.', '鏡面に映る部屋には、焦げ跡がひとつもない。') },
          { text: L('[V] 로 와쿄를 들면 원 거울 안에 저쪽이 비친다.', '[V] で和鏡をかざすと、円鏡の中に向こうが映る。') },
          { text: L('벽에 걸린 거울과 마주 대면 — [E] 로 건너갈 수 있다.', '壁の鏡と向かい合わせれば — [E] で渡れる。') },
        );
      },
    });
    // 폐여관 기록물 — 숙박부의 「열넷」과 **안쪽에서 박힌 못**.
    // 둘 다 거울보다 먼저 읽히는 자리에 있다: 이 집에서 무슨 일이 있었는지 알고 거울을 봐야 한다
    inspect.add({
      id: 'inn-register', pos: vv.innInterior.registerPos, radius: 1.8,
      prompt: L('숙박부를 읽는다', '宿帳を読む'), once: true,
      enabled: () => !evidence.has('inn:register'),
      onUse: () => { rememberEvidence('inn:register'); void dialogue.say(...INN_RECORDS.register); },
    });
    inspect.add({
      id: 'inn-stairs', pos: vv.innInterior.stairsPos, radius: 1.8,
      prompt: L('못질된 계단을 살핀다', '塞がれた階段を調べる'), once: true,
      onUse: () => { rememberEvidence('inn:stairs'); void dialogue.say(...INN_RECORDS.stairs); },
    });
    if (vv.inn.mirrorPos) inspect.add({
      id: 'inn-memory-mirror', pos: vv.inn.mirrorPos, radius: 2.0,
      prompt: L('큰 거울 속 축제를 본다', '大鏡の中の祭を見る'), once: true,
      enabled: () => rules!.stateOf('kagami') === 'open' && !evidence.has('inn:mirror') && !innWaitingActive(),
      onUse: () => void (async () => {
        vv.inn.showMirrorMemory(14);
        rememberEvidence('inn:mirror');
        await dialogue.say(
          { text: L('불타고 무너진 여관이 거울 속에서만 10년 전 모습으로 밝아진다.', '焼け落ちた旅館が、鏡の中だけ十年前の姿に明るく戻る。') },
          { text: L('웃는 주민과 금붕어 뜨기 아이들 사이로 어린 사요와 어린 미오가 지나간다.', '笑う住民と金魚すくいの子供たちの間を、幼いサヨとミオが通り過ぎる。') },
          { who: MIO_NAME, text: L('저건…….', 'あれは……。') },
          ...(innAfterimage.complete ? [
            { text: L('어린 미오의 무릎에 매화 무늬 손수건이 보인다. 병풍 안쪽 두 자리에 앉았던 아이들이 이제 얼굴을 든다.', '幼いミオの膝に梅模様の手ぬぐい。屏風の内側の二つの場所にいた子供たちが、顔を上げる。') },
            { who: MIO_NAME, text: L('언니랑 나였어. 그 방을 우리에게 내줬던 거야.', '姉と私だった。あの部屋を、私たちに譲ってくれたんだ。') },
          ] : []),
          { who: L('거울 속 어린 미오', '鏡の幼いミオ'), text: L('언니 어디 갔어?', 'お姉ちゃん、どこ?') },
          { text: L('어린 미오가 이쪽을 똑바로 보고 손바닥을 댄다. 유리 위에 작은 자국이 남는다.', '幼いミオがこちらを真っ直ぐ見て掌を当てる。硝子に小さな跡が残る。') },
          { text: L('사요는 아이의 손바닥에 손가락으로 원을 두 번 그린다.', 'サヨは子供の掌に指で円を二度描く。') },
        );
        // **복선 회수**: ACT 12 묘지의 아이가 그린 그 원이다. 같은 화면을 다시 띄우는 것이
        // 설명 한 줄보다 강하다 — 플레이어는 「아까 그거」라고 알아본다(`story/palmSign.ts`)
        await palmSign.play();
        await dialogue.say(
          { text: L('미오도 모르게 같은 동작을 따라 한다.', 'ミオも知らず同じ動きをなぞる。') },
          ...(evidence.has('graveyard:palm') ? [{ who: MIO_NAME, text: L('묘지의 아이가 그린 원…… 언니한테 배운 거였어.', '墓地の子が描いた円……姉に教わったものだった。') }] : []),
          { who: MIO_NAME, text: L('나…… 여기 와본 적 있어.', 'わたし……ここに来たことがある。') },
        );
      })(),
    });
    const manorRecordLines = [
      [
        { text: L('「일곱 공물은 신에게 바치는 것이 아니다. 각각 피안의 길 하나를 닫는다.」', '「七つの供物は神に捧げるものではない。それぞれ彼岸への道を一つ閉ざす。」') },
        { text: L('「하나라도 옮겨지면 문은 숨을 쉬기 시작한다.」', '「一つでも動かせば、門は息を始める。」') },
        { text: L('뒷면의 본래 의식은 물에 번져 있다. 촌장의 명부와 사요의 기록이 있어야 복원할 수 있다.', '裏面の本来の儀式は水で滲んでいる。村長の名簿とサヨの記録がなければ復元できない。') },
        { who: MIO_NAME, text: L('그럼 지금까지 내가 한 건…….', 'じゃあ、今までわたしがしたことは……。') },
      ],
      [
        { text: L('불완전한 대체 의식 — 「문을 연 자의 피를 바칠 것.」', '不完全な代替儀式 — 「門を開いた者の血を捧げること。」') },
        { text: L('촌장의 주석. 「본래 의식이 아니다. 이름을 되찾을 시간이 없을 때 사용하는 대체법.」', '村長の注記。「本来の儀式ではない。名を取り戻す時間がない時の代替法。」') },
        { text: L('붉은 먹으로 적힌 이름 — 「雨宮 澪」.', '赤い墨で記された名 — 「雨宮 澪」。') },
        { who: MIO_NAME, text: L('내 이름……?', 'わたしの名前……?') },
      ],
      [
        { text: L('주민 수색 명령. 「아이를 발견하면 신사로 데려올 것.」', '住民捜索命令。「子供を見つけたら社へ連れてくること。」') },
        { text: L('「저항하는 자도 공범으로 간주한다. 해 뜨기 전 봉인을 복구하지 못하면 마을은 사라진다.」', '「抵抗する者も共犯と見なす。夜明け前に封印を戻せなければ村は消える。」') },
      ],
    ] as const;
    vv.manor.recordPositions.forEach((pos, i) => inspect!.add({
      id: `manor-record-${i}`, pos, radius: 1.65,
      prompt: [L('봉인 구조를 읽는다', '封印の構造を読む'), L('대체 의식을 읽는다', '代替儀式を読む'), L('수색 명령을 읽는다', '捜索命令を読む')][i]!,
      once: true,
      /**
       * 봉인패 픽업 반경(1.9, `rules.ts`)이 불단에서 뻗어 나와 **가운데 책상까지 0.75 m 겹친다**
       * (불단↔책상 2.8 m). 우선권이 없으면 그 띠에서 「봉인을 조사한다」가 문서 프롬프트를 덮어
       * 책상 앞에 서 있는데 문서를 못 읽는다 — 동전·벽감에서 이미 겪은 것과 같은 겹침이다.
       * 불단 코앞(0.9 m)에서는 책상 앵커가 1.9 m 밖이라 이 우선권이 봉인패를 가리지 않는다.
       */
      inputPriority: true,
      enabled: () => rules!.stateOf('fuda') === 'open' && !evidence.has(MANOR_EVIDENCE[i]!),
      onUse: () => {
        if (storyFlags.act < 15) setStoryAct(storyFlags, 15);
        rememberEvidence(MANOR_EVIDENCE[i]!);
        void dialogue.say(...manorRecordLines[i]!, ...(countOf(MANOR_EVIDENCE) === MANOR_EVIDENCE.length
          ? [{ text: L('불단의 덮개에는 작은 자물쇠가 걸렸다. 서재 문옆 압흔판에서 결재함 여는 법을 찾아보자. 책상 밑 명령 사본은 따로 더 대조할 수 있다.', '仏壇の覆いに小さな錠。書斎の戸脇の圧痕から決裁箱の開け方を探そう。机の下の命令控えは、別に詳しく照合できる。') }] : []));
      },
    }));
    vv.manor.recordPositions.forEach((pos, i) => inspect!.add({
      id: `truth-record-${i}`, pos, radius: 1.65, inputPriority: true, once: false,
      prompt: TRUTH_RECORDS[i]!.prompt,
      enabled: () => reconstructingTruth() && !truth.busy && truth.next === i,
      onUse: () => {
        void truth.read(i).finally(renderHud);
      },
    }));
    /**
     * ---------- 지하 기록실 (ACT 15) ----------
     * 마루 뚜껑 → 하강 → 기록 3종 → 상승. 우물 석실과 **같은 문법**이다(연출 텔레포트,
     * 좁은 구멍에 물리를 태우지 않는다). 다른 점 하나: 여기엔 쫓아오는 것이 없다 —
     * 저택의 공포는 추격이 아니라 **읽고 나면 돌아갈 수 없다**는 것이다.
     *
     * 뚜껑은 대청 문서 셋을 **다 읽어야** 열린다: 촌장이 무엇을 결정했는지 모르고 내려가면
     * 지하의 보강 기록이 서로 연결되지 않는다.
     */
    const mi = vv.manorInterior;
    const archiveLines = [
      [
        { text: L('촌장의 명부. 「雨宮 澪」 옆에 붉은 먹으로 「문을 연 자」라고 적혀 있다.', '村長の名簿。「雨宮 澪」の脇に、赤い墨で「門を開いた者」と記されている。') },
        { text: L('그 아래에는 사당에서 발견된 작은 손자국과 푸른 옷의 실밥에 관한 보고가 끼워져 있다.', 'その下には、祠で見つかった小さな手形と青い服の糸くずについての報告が挟まれている。') },
        { who: MIO_NAME, text: L('방울을 가져간 아이가…… 나였으니까.', '鈴を持ち出した子供が……わたしだったから。') },
      ],
      [
        { text: L('긴급 회의록. 「붉은 방울이 옮겨져 첫 번째 길이 열렸다. 해 뜨기 전 본래 의식을 치를 수 없다.」', '緊急会議録。「赤い鈴が動かされ、最初の道が開いた。夜明けまでに本来の儀式は行えない。」') },
        { text: L('「불완전한 대체 의식을 시행한다. 대상은 문을 연 자, 아마미야 미오.」', '「不完全な代替儀式を行う。対象は門を開いた者、雨宮澪。」') },
        { text: L('여백의 「겨우 여섯 살이다」라는 반대 의견은 검은 먹으로 두 번 지워져 있다.', '余白の「まだ六歳だ」という反対意見は、黒い墨で二度消されている。') },
      ],
      [
        { text: L('위패 모양의 봉인표가 여섯 개 서 있고, 맨 끝 일곱 번째 홈은 비어 있다.', '位牌の形をした封印札が六つ並び、端の七つ目の溝だけが空いている。') },
        { text: L('빈 홈 뒤쪽의 번진 문장. 「이름을 잃은 자가 길에 남을 경우…… 같은 피를 문지기로……」', '空の溝の裏に滲んだ文。「名を失った者が道に残る場合……同じ血を門守に……」') },
        { who: MIO_NAME, text: L('같은 피…… 그 뒤는 읽을 수 없어.', '同じ血……その先は読めない。') },
      ],
    ] as const;
    inspect.add({
      id: 'manor-hatch', pos: mi.hatchPos, radius: 2.0, once: false, hold: 1.6,
      prompt: L('마루 뚜껑을 연다', '床の蓋を開ける'),
      // 대청 문서 셋을 다 읽어야 열린다 — 지하는 그 셋의 **대가**를 보여 주는 곳이다
      enabled: () => !rules!.fudaRefused && (rules!.stateOf('fuda') === 'open' || rules!.carried.includes('fuda'))
        && countOf(MANOR_EVIDENCE) === MANOR_EVIDENCE.length
        && controller.position.y > mi.archiveFloorY + 2,
      onUse: () => {
        const first = !evidence.has('manor:hatch');
        if (first) {
          rememberEvidence('manor:hatch');
          void dialogue.say(
            { text: L('뚜껑을 들자 마른 종이 냄새가 올라온다. 아래는 기록실이다.', '蓋を上げると乾いた紙の匂いが上がってくる。下は記録室だ。') },
          );
        }
        controller.teleport(mi.archiveEnter.clone().add(new THREE.Vector3(0, 0.35, 0)));
        sfx.doorPush(mi.hatchPos.x, mi.hatchPos.y, mi.hatchPos.z);
        renderHud(); saveCheckpoint();
      },
    });
    inspect.add({
      /**
       * 반경 0.6 — 사다리 실제 발치에 한정한다. 큰 반경은 결재함 판과 열쇠보다 먼저 선택된다.
       * 예전 2.2 는 **기록실(4.5 × 4.8 m)을 통째로 덮었다.** 사다리 앵커는 바닥 높이라
       * 거리가 순수 수평인데, 기록 앵커들은 상판(+1.05)·선반(+1.35) 높이라 늘 1.3 m 이상이다.
       * 그래서 `Inspect` 의 최근접 선택이 방 어디서나 사다리를 골랐다 — 실측에서 회의록·위패
       * 앞에 서도 「사다리를 오른다」가 떴고, 꾹 누르면 지상으로 튕겨 나갔다.
       * 도착점을 실제 사다리 바로 아래로 옮겨 결재함 앞에서는 사다리가 선택되지 않게 한다.
       */
      id: 'manor-ascend', pos: mi.archiveEnter, radius: 0.6, once: false, hold: 1.2,
      prompt: L('사다리를 오른다', '梯子を登る'),
      enabled: () => controller.position.y < mi.archiveFloorY + 2,
      onUse: () => {
        controller.teleport(mi.hatchPos.clone().add(new THREE.Vector3(0.9, 0.4, 0)));
        sfx.doorPush(mi.hatchPos.x, mi.hatchPos.y, mi.hatchPos.z);
        renderHud(); saveCheckpoint();
      },
    });
    /**
     * 반경 1.6 은 넉넉해 보이지만 **딱 맞다.** `Inspect` 는 발밑(`controller.position`) 기준
     * **3D** 거리를 쓰는데 이 앵커들은 탁자 상판(바닥 +1.05)에 있다 — 탁자 콜라이더 때문에
     * 수평으로는 0.71 m 까지만 붙으므로 실거리가 **1.25 m** 다. 1.0 을 주면 프롬프트가
     * 아예 안 뜬다(반경을 0.9 로 줄여 봤다가 그렇게 됐다).
     * [0] 명부와 [1] 회의록이 0.77 m 밖에 안 떨어져 있어도 헷갈리지 않는다 — `Inspect` 는
     * 범위 안에서 **가장 가까운 것**을 고르므로 앞에 선 쪽이 이긴다 (1.25 vs 1.47).
     */
    // [2] 봉인표 열만 1.9 — 선반 콜라이더(반깊이 0.3) + 남쪽이 벽이라 **북쪽에서만** 접근되고,
    // 앵커가 위 칸(바닥 +1.35)이라 최근접 실거리가 1.46 m 다. 1.6 은 여유가 14 cm 뿐이었다
    const archiveRadius = [1.6, 1.6, 1.9];
    mi.archivePositions.forEach((pos, i) => inspect!.add({
      id: `manor-archive-${i}`, pos, radius: archiveRadius[i]!, once: true, inputPriority: true,
      prompt: [L('촌장의 명부를 읽는다', '村長の名簿を読む'),
        L('회의록 마지막 장을 읽는다', '議事録の最終頁を読む'),
        L('봉인표를 살핀다', '封印札を調べる')][i]!,
      enabled: () => !evidence.has(ARCHIVE_EVIDENCE[i]!),
      onUse: () => {
        rememberEvidence(ARCHIVE_EVIDENCE[i]!);
        void (async () => {
          await dialogue.say(...archiveLines[i]!);
          // 선택 기록 셋은 대청 문서를 보강할 뿐, 봉인패나 ACT 16 진입을 잠그지 않는다.
          if (countOf(ARCHIVE_EVIDENCE) === ARCHIVE_EVIDENCE.length) {
            renderHud();
            await dialogue.say(
              { text: L('세 기록이 한 줄로 이어진다 — 방울이 옮겨졌고, 장로들은 문을 연 아이를 대체 의식의 대상으로 정했다.', '三つの記録が一本に繋がる — 鈴が動かされ、長老たちは門を開いた子供を代替儀式の対象に決めた。') },
              { who: MIO_NAME, text: L('그날 주민들이 쫓던 아이가…… 나였어.', 'あの夜、村人たちが追っていた子供は……わたしだった。') },
            );
          }
        })();
      },
    }));
    // 같은 장소에 이미 있던 기록을 먼저 읽고, 추가 조사로 자연스럽게 이어진다.
    const bindCase = (story: InvestigationCase, clues: THREE.Vector3[], steps: THREE.Vector3[], active: () => boolean,
      ready: (i: number) => boolean = () => true, mirrorAt = -1,
      options: { holdAt?: number; reachable?: (pos: THREE.Vector3) => boolean } = {}) => {
      const use = (action: () => Promise<boolean>, needsMirror: boolean) => {
        if (needsMirror && !wakyoView.active) {
          void dialogue.say({ text: inventory.has('wakyo')
            ? L('[V]로 와쿄를 든 뒤 같은 흔적을 대조하자.', '[V]で和鏡を持ち、同じ痕を照合しよう。')
            : L('객실 좌탁의 와쿄가 있어야 반대편을 대조할 수 있다.', '客室の座卓の和鏡があれば、向こう側を照合できる。') });
          return;
        }
        void action().catch((e) => console.warn('[investigation]', e)).finally(renderHud);
      };
      clues.forEach((pos, i) => inspect!.add({
        id: `${story.def.id}:clue-${i}`, pos, radius: 1.9, once: false, inputPriority: true,
        hold: i === options.holdAt ? 0.7 : undefined,
        prompt: story.def.clues[i]!.prompt,
        enabled: () => active() && ready(i) && (options.reachable?.(pos) ?? true) && !story.busy && !story.hasClue(i),
        onUse: () => use(() => story.read(i), i === mirrorAt),
      }));
      steps.forEach((pos, i) => inspect!.add({
        id: `${story.def.id}:step-${i}`, pos, radius: 1.9, once: false, inputPriority: true,
        prompt: story.def.steps[i]!.prompt,
        enabled: () => active() && (options.reachable?.(pos) ?? true) && !story.busy && story.nextClue < 0 && story.nextStep === i,
        onUse: () => use(() => story.resolve(i), story === innCase && i === 1),
      }));
    };
    bindCase(graveyardCase, vv.graveyard.playCluePositions, vv.graveyard.playResolvePositions, graveyardCaseActive);
    const hollow = vv.graveyard.hollow;
    const passageAction = (action: () => Promise<boolean>) => {
      void action().catch(e => console.warn('[graveyard passage]', e)).finally(renderHud);
    };
    vv.graveyard.jizoPositions.forEach((pos, i) => inspect!.add({
      id: `graveyard-jizo-${i}`, pos, radius: 1.55, once: false,
      prompt: L('지장의 얼굴이 향한 곳을 살핀다', '地蔵の顔が向く先を調べる'),
      enabled: () => rules?.stateOf('geta') === 'open' && !inGraveyardHollow() && !graveyardPassage.busy,
      onUse: () => passageAction(() => graveyardPassage.observeJizo(i)),
    }));
    hollow.clues.forEach((pos, i) => inspect!.add({
      id: HOLLOW_CLUES[i]!.id, pos, radius: 1.65, once: false, inputPriority: true,
      prompt: HOLLOW_CLUES[i]!.prompt,
      enabled: () => inGraveyardHollow() && !graveyardPassage.busy && !evidence.has(HOLLOW_CLUES[i]!.id),
      onUse: () => passageAction(() => graveyardPassage.readClue(i)),
    }));
    hollow.candidates.forEach((pos, i) => inspect!.add({
      id: `graveyard-candidate-${i}`, pos, radius: 1.7, once: false, inputPriority: true,
      prompt: L('이 게다가 남겨진 짝과 맞는지 대조한다', 'この下駄が残った片方と合うか照合する'),
      enabled: () => inGraveyardHollow() && !graveyardPassage.busy && !graveyardPassage.matched && !rules?.carried.includes('geta'),
      onUse: () => passageAction(() => graveyardPassage.inspectGeta(i)),
    }));
    inspect.add({
      id: 'graveyard-hollow-exit', pos: hollow.exit, radius: 1.8, once: false, hold: 0.7, inputPriority: true,
      prompt: L('붉은 매듭을 짚고 공동묘지로 돌아간다', '赤い結び目に触れて墓地へ戻る'),
      enabled: () => inGraveyardHollow() && !graveyardPassage.busy,
      onUse: () => passageAction(() => graveyardPassage.leave()),
    });
    // 가짜 귀환문도 행동으로 답한다. 게다를 빼앗거나 단서를 초기화하지 않고 방 입구로 접힌다.
    for (const side of [-1, 1]) inspect.add({
      id: `graveyard-false-exit-${side}`, pos: hollow.exit.clone().add(new THREE.Vector3(side * 7.5, 0, 0)), radius: 1.7,
      once: false, inputPriority: true, prompt: L('목소리가 나는 문을 살핀다', '声がする門を調べる'),
      enabled: () => inGraveyardHollow() && !graveyardPassage.busy,
      onUse: () => passageAction(() => graveyardPassage.falseExit()),
    });
    bindCase(innCase, vv.innInterior.guestCluePositions, vv.innInterior.guestResolvePositions, innCaseActive,
      (i) => i !== 0 || evidence.has('inn:register'), 2);
    bindCase(innAfterimage, vv.innInterior.memoryCluePositions, vv.innInterior.memoryResolvePositions, innWaitingActive,
      (i) => i === 0 || innAfterimage.hasClue(0), 1, { holdAt: 0,
        reachable: (pos) => vv.inn.contains(controller.position)
          && (pos.x > vv.innInterior.secretPos.x) === (controller.position.x > vv.innInterior.secretPos.x),
      });
    bindCase(manorCase, mi.orderCluePositions, mi.orderResolvePositions, manorCaseActive,
      (i) => i !== 2 || evidence.has('manor:roster'));
    const device = mi.dispatch;
    const dispatchAction = (action: () => Promise<boolean>) => {
      void action().catch(e => console.warn('[manor dispatch]', e)).finally(renderHud);
    };
    const dispatchReachable = (pos: THREE.Vector3) => manorDispatchActive() && !manorDispatch.busy
      && (pos.y < mi.archiveFloorY + 2 ? inManorArchive() : vv.manor.contains(controller.position) && !inManorArchive());
    device.cluePositions.forEach((pos, i) => inspect!.add({
      id: DISPATCH_CLUES[i]!.id, pos, radius: 1.8, once: false, inputPriority: true, markerLift: 0.1,
      prompt: DISPATCH_CLUES[i]!.prompt, hold: i < 2 ? 1.1 : undefined,
      onHold: i === 0 ? progress => device.setRubbing(progress) : undefined,
      enabled: () => dispatchReachable(pos) && !evidence.has(DISPATCH_CLUES[i]!.id),
      onUse: () => dispatchAction(() => manorDispatch.read(i)),
    }));
    syncDispatchPrompts = () => device.dialPositions.forEach((pos, i) => inspect!.add({
      id: `manor-dispatch-dial-${i}`, pos, radius: 1.55, once: false, inputPriority: true, markerLift: 0.14,
      prompt: L(`${i + 1}번 ${DISPATCH_DIALS[i]!.title} 인장판을 돌린다 · 현재 ${DISPATCH_DIALS[i]!.labels[manorDispatch.setting[i]!]}`,
        `${i + 1}番 ${DISPATCH_DIALS[i]!.title}の印字板を回す · 現在 ${DISPATCH_DIALS[i]!.labels[manorDispatch.setting[i]!]}`),
      enabled: () => dispatchReachable(pos) && !manorDispatch.printed,
      onUse: () => { if (manorDispatch.rotate(i)) sfx.doorPush(pos.x, pos.y, pos.z, 0.12); },
    }));
    syncDispatchPrompts();
    inspect.add({
      id: 'manor-dispatch-press', pos: device.pressPos, radius: 1.55, once: false, inputPriority: true, markerLift: 0.15,
      prompt: L('결재함 손잡이를 눌러 인장을 맞물린다', '決裁箱の取っ手を押し、印を噛み合わせる'), hold: 1.2,
      onHold: progress => device.setPress(progress),
      enabled: () => dispatchReachable(device.pressPos) && !manorDispatch.printed,
      onUse: () => dispatchAction(() => manorDispatch.press()),
    });
    inspect.add({
      id: 'manor-dispatch-key', pos: device.keyPos, radius: 1.4, once: false, inputPriority: true, markerLift: 0.08,
      prompt: L('열린 서랍에서 불단 열쇠를 집는다', '開いた引き出しから仏壇の鍵を取る'),
      enabled: () => dispatchReachable(device.keyPos) && manorDispatch.printed && !manorDispatch.hasKey,
      onUse: () => dispatchAction(() => manorDispatch.takeKey()),
    });
    inspect.add({
      id: 'manor-dispatch-unlock', pos: device.unlockPos, radius: 1.8, once: false, inputPriority: true, markerLift: 0.08,
      prompt: L('열쇠를 돌려 불단의 덮개를 연다', '鍵を回して仏壇の覆いを開く'), hold: 1.2,
      enabled: () => dispatchReachable(device.unlockPos) && manorDispatch.hasKey,
      onUse: () => dispatchAction(() => manorDispatch.unlock()),
    });
    // 개정본 ACT 11의 핵심 통제 구간. 방송을 들은 뒤 세 공물을 직접 되찾아 보게 한다.
    // 시스템 문구가 플레이어의 행동을 거부해야 UI의 배신이 단순 대사가 아니라 경험이 된다.
    const restoreNames = [L('붉은 방울', '赤い鈴'), L('붉은 머리빗', '赤い櫛'), L('동전 세 닢', '三枚の銭')];
    for (let i = 0; i < 3; i++) inspect.add({
      id: `restore-offering-${i}`, pos: vv.pedestals.slots[i]!, radius: 2.1,
      prompt: L(`${restoreNames[i]}${eul(restoreNames[i]!)} 되찾는다`, `${restoreNames[i]}を取り戻す`), once: true,
      // 첫 시도는 반드시 방울. 그 장면을 본 뒤 나머지 두 받침대도 직접 확인할 수 있다.
      enabled: () => restoreWarningReady && !restoreResolutionPlaying && (i === 0 ? !restoreFirstDone : restoreFirstDone),
      onUse: () => {
        if (i !== 0) {
          void dialogue.say(
            { text: L('이 공물도 검은 뿌리가 받침대에 붙들고 있다.', 'この供物も黒い根に台座へ縛りつけられている。') },
            { text: L('【완료한 목표는 되돌릴 수 없습니다】', '【完了した目標は取り消せません】') },
          );
          return;
        }
        restoreFirstDone = true;
        restoreResolutionPlaying = true;
        photoMessageRevealed = true;
        setPhotoStoryState(storyFlags.offered, true);
        rememberEvidence('act11:bell-recovery-attempt');
        renderHud();
        sfx.suzuRing(0.38);
        setTimeout(() => sfx.suzuRing(0.38), 330);
        tpCam.shake(0.18);
        sfx.hit(0.35);
        void (async () => {
          await dialogue.say(
            { text: L('검은 뿌리가 방울과 받침대를 한 덩어리처럼 붙들고 있다.', '黒い根が鈴と台座を一つの塊のように縛っている。') },
            { text: L('【완료한 목표는 되돌릴 수 없습니다】', '【完了した目標は取り消せません】') },
            { who: MIO_NAME, text: L('누가 완료됐다고 정했는데.', '誰が完了したって決めたの。') },
            { text: L('억지로 당기자 손바닥이 베였다. 피 한 방울이 받침대의 검은 뿌리 사이로 스민다.', '無理に引くと掌が切れた。血の一滴が台座の黒い根へ染み込む。') },
            { text: L('본전 안쪽, 보이지 않는 손에서 작은 방울이 두 번 울린다. 딸랑. 딸랑.', '本殿の内側、見えない手の中で小さな鈴が二度鳴る。ちりん。ちりん。') },
            { text: L('가족사진 뒷면의 글씨가 젖은 종이 섬유를 타고 번진다 — 「문 안에 있어.」', '家族写真の裏の文字が濡れた紙の繊維を伝って滲む — 「扉の中にいる。」') },
            { who: MIO_NAME, text: L('저 문을 열겠다는 게 아니야.', 'あの扉を開けたいんじゃない。') },
            { who: MIO_NAME, text: L('언니가 있는지만 확인하고, 전부 돌려놓을 거야.', '姉がいるかだけ確かめて、全部戻す。') },
          );
          restoreResolutionPlaying = false;
          renderHud();
          saveCheckpoint();
        })();
      },
    });
    inspect.add({
      id: 'slab', pos: vv.pedestals.slabPos, radius: 2.2, prompt: L('석판을 읽는다', '石板を読む'), once: true,
      enabled: () => tabletRead && evidenceCount('village:') >= 3 && !rules!.started,
      onUse: () => {
        setStoryAct(storyFlags, 5);
        saveCheckpoint();
        void (async () => {
          await dialogue.say(
            { text: L('받침대 여섯에는 물건의 홈이 있다. 일곱 번째만 비어 있고, 다른 자리보다 넓다.', '六つの台座には物の溝がある。七つ目だけは空で、ほかより広い。') },
            { text: L('「피안의 문을 열고자 하는 자여.」', '「彼岸の門を開かんとする者よ。」') },
            { text: L('「일곱 공물을 모아 이곳에 바쳐라.」', '「七つの供物を集め、ここに捧げよ。」') },
            { text: L('「그러면 돌아갈 길이 열리리라.」', '「さすれば帰る道が開かれよう。」') },
            { who: MIO_NAME, text: L('일곱 개를 모으면…… 여기서 나갈 수 있어.', '七つ集めれば……ここから出られる。') },
            { who: MIO_NAME, text: L('언니도 저 안에 있다면.', '姉もあの中にいるなら。') },
            { who: MIO_NAME, text: L('이번에는 얼굴을 보고 물어볼 거야. 왜 나를 기다린다고 했는지.', '今度は顔を見て訊く。なぜ私を待っていると書いたのか。') },
          );
          rules!.begin();
          setStoryAct(storyFlags, 6);
          saveCheckpoint();
          renderHud();
          // **소리가 먼저, 자막이 나중.** 자막이 먼저 뜨면 「들었다」가 아니라 「들려줬다」가 된다.
          // 위치는 배전 마루 밑 — 방향이 들려야 「바닥 아래」가 성립하고,
          // 그 좌표가 ACT 18 의 지하 입구다 (PLAN-STORY P3-2)
          const uf = vv.shrine.underfloor;
          sfx.underfloorLaugh(uf.x, uf.y, uf.z, 0.5);
          await new Promise((r) => setTimeout(r, 700));
          await dialogue.say({ text: L('신사 바닥 아래에서 아주 희미한 웃음소리가 들린 것 같다.', '社の床下から、ごく微かな笑い声が聞こえた気がした。') });
        })();
      },
    });
  }

  // --- 인벤토리 · 장비 · 전투 · 허수아비 (전투는 sandbox 전용) ---
  const inventory = new Inventory();
  // 인벤토리는 별도 localStorage를 쓰므로 타이틀에서 모드를 고르기 전에는 스토리 물건을 비운다.
  // 이어하기는 아래 restoreFromCheckpoint가 세이브 계약에 맞춰 정확히 다시 넣는다.
  for (const id of ['suzu', 'kushi', 'coins', 'geta', 'kagami', 'fuda', 'photo', 'phone', 'wakyo']) {
    inventory.remove(id, Number.MAX_SAFE_INTEGER);
  }
  const invUI = new InventoryUI(inventory);
  const evidenceJournal = new EvidenceJournal(() => evidence);
  // 기록물 뷰어. 가족사진이 첫 물건이고, 뒤에 명부·일기·문서가 같은 창구를 쓴다 (PLAN-STORY P2)
  const photoViewer = new PhotoViewer();
  const palmSign = new PalmSign();
  /**
   * 와쿄 원형 반사뷰. 폐기된 코너 손거울은 RT·CPU 버퍼만 미리 할당하고 실제로 렌더되지 않아
   * 런타임 배선에서 제거했다. 현재 경로는 `WakyoView`의 GPU 직접 합성 하나뿐이다.
   */
  const wakyoView = new WakyoView();
  (window as unknown as Record<string, unknown>)['__wk'] = wakyoView;
  /**
   * 두 손의 자세를 미리 구워 두고 임시 GPU 자원을 해제한다.
   * 일시적 로드 실패는 한 번 재시도한다. 끝내 실패하면 접촉을 묘사하는 자막으로 이어진다.
   */
  void (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await palmSign.setHandSprites(await loadPalmGestureSprites(renderer));
        return;
      } catch (e) {
        if (attempt) console.warn('[palmSign] 손 모델 실패 — 자막으로 진행:', e);
        else await new Promise((r) => setTimeout(r, 600));
      }
    }
  })();
  invUI.onUse = (id) => {
    if (id === 'photo') photoViewer.show(photoDamageForOfferings(storyFlags.offered));
    else if (id === 'phone') { if (invUI.isOpen) invUI.toggle(); phone.inspect(); }
    else if (id === 'wakyo') { if (invUI.isOpen) invUI.toggle(); wakyoView.toggle(true); }
  };
  /**
   * 이야기가 물건을 쥐여 주는 창구. **중복은 막는다** — 인벤은 localStorage 에 남으므로
   * 두 번째 플레이에서 사진이 2 장이 된다
   */
  const give = (id: string) => {
    if (inventory.has(id)) return;
    if (!inventory.add(id)) return;
    const def = ITEMS[id];
    if (!def) return;
    toastEl.textContent = L(`${def.name}${eul(def.name)} 가방에 넣었다  ·  Tab 으로 열어 볼 수 있다`,
      `${def.name}を鞄に入れた  ·  Tab で開いて見られる`);
    toastEl.classList.add('show'); toastT = 4.6;
  };
  const popups = new Popups(camera);
  let equipment: Equipment | null = null;
  let combat: Combat | null = null;
  let dummies: Dummies | null = null;
  let hitstop = 0;
  if (model && !isVillage) {
    equipment = new Equipment(model);
    combat = new Combat(model, equipment, {
      onSwing: (i) => sfx.swing(i),
      onHit: (_t, dmg, point, i, shake, stop) => { sfx.hit(i); popups.damage(point, dmg, i === 2); hitstop = stop; tpCam.shake(shake); },
      onFullBodyStart: () => { if (animator) { animator.interrupt(); animator.suspended = true; } },
      onFullBodyEnd: () => { if (animator) { animator.suspended = false; animator.resume(); } },
    });
    const applyEquip = () => { void equipment!.equip(inventory.equipped); };
    inventory.on('equip', applyEquip);
    applyEquip();
  }
  // 허수아비 3개 (스폰 앞) — sandbox 전용
  if (island && !isVillage) {
    dummies = new Dummies(scene, physics, island);
    const dummySpots: [number, number][] = [[2.5, -6], [-1.5, -7.5], [5.5, -3.5]];
    const d = dummies;
    void d.spawn('/models/props/dummy.glb', dummySpots).then(() => { if (combat) combat.targets = d.list; }).catch((e) => console.warn('[dummies]', e));
    d.onHit = (_dd, _dmg, _pos, killed) => { if (killed) sfx.dummyDown(); };
  }

  // 월드에 놓인 검 (아직 안 주웠으면) — sandbox 전용
  let worldSword: THREE.Object3D | null = null;
  const swordSpot = new THREE.Vector3(3, 0, 3);
  if (!isVillage && !inventory.has('sword') && ITEMS['sword']?.model) {
    swordSpot.y = (island ? island.heightAt(swordSpot.x, swordSpot.z) : 0);
    Props.loader().loadAsync(ITEMS['sword'].model).then((gltf) => {
      const g = new THREE.Group();
      g.add(gltf.scene);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
      const sc = 1.0 / Math.max(size.x, size.y, size.z);
      gltf.scene.position.set(-c.x * sc, -box.min.y * sc, -c.z * sc); gltf.scene.scale.setScalar(sc);
      gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; } });
      g.position.copy(swordSpot).add(new THREE.Vector3(0, 0.05, 0));
      g.rotation.set(0, 0.6, 0);
      scene.add(g);
      worldSword = g;
    }).catch(() => { /* 모델 없음 */ });
  }
  const promptEl = document.createElement('div');
  promptEl.className = 'prompt-anchor prompt-sword hidden';
  promptEl.innerHTML = `<i class="prompt-marker"></i><div class="prompt-line">${L('<kbd>E</kbd> 검 줍기', '<kbd>E</kbd> 剣を拾う')}</div>`;
  document.getElementById('hud')!.appendChild(promptEl);
  const swordPromptLine = promptEl.querySelector('.prompt-line') as HTMLElement;

  const postfx = createPostFX(renderer, scene, camera, quality, {
    support: postFxSupport,
    forceCompatibility: forceGpuCompatibility,
  });
  // 시간대 컨트롤러 — postfx 가 있어야 색보정을 즉시 반영할 수 있다
  if (isVillage) {
    timeOfDay = new TimeOfDayController(
      sky as unknown as ConstructorParameters<typeof TimeOfDayController>[0],
      // 현재의 히가사토는 **늦은 저녁**이다 (`?skip=intro` 로 프롤로그를 건너뛰어도 같은 조도)
      scene, () => postfx.applySettings(), 'evening',
    );
  }
  const input = new Input(canvas);
  setupTouch(input, canvas);

  createTweaks({
    onRenderChange: () => postfx.applySettings(),
    onSunChange: () => sky.updateSun(),
    onAudioChange: () => sfx.setMaster(settings.audio.master),
    onAmbientChange: () => sfx.setAmbient(settings.audio.ambient),
    // 잔향 배율이 바뀌면 현재 존을 다시 걸어 wet 을 즉시 반영한다 (A/B 비교용)
    onMoonShadowChange: () => sky.setShadowMapSize(settings.night.moonShadow && quality.moonShadow ? quality.shadowMap : 0),
    onSpaceChange: () => { const sp = sfx.space; if (!sp) return; const z = sp.currentZone; sp.setZone(z === 'outdoor' ? 'indoor' : 'outdoor', 0); sp.setZone(z, 0.15); },
    onCharacterGrade: () => { model?.gradeAlbedo(); model?.applyAnisotropy(renderer); },
    weapon: { item: ITEMS['sword']!, onChange: () => equipment?.applyOffsets() },
    quality: { current: quality.level, levels: QUALITY_LEVELS, onChange: (lv: QualityLevel) => setQualityManually(lv) },
    onHudChange: () => { applyHudAccessibility(); saveHudPrefs(); onResize(); },
  }, debug);

  /** 타이틀의 「이어하기」가 고른 스냅숏을, 연출 재생 없이 현재 월드에 투영한다. */
  const restoreFromCheckpoint = (saved: SavePayload): boolean => {
    if (!isVillage || !village || !rules) return false;
    const world = saved.world ?? {};
    Object.assign(storyFlags, defaultFlags(), saved.flags);
    evidence.clear();
    for (const id of storyFlags.evidence) if (typeof id === 'string') evidence.add(id);
    manorDispatch.restoreSetting(); syncDispatchPrompts();
    storyFlags.evidence = [...evidence];
    suzuWardOrder = (world.suzuWardOrder ?? [])
      .filter((i, at, all) => Number.isInteger(i) && i >= 0 && i < SUZU_EVIDENCE.length && all.indexOf(i) === at);
    wellNicheOrder = (world.wellNicheOrder?.length
      ? world.wellNicheOrder
      : WELL_EVIDENCE.map((id, i) => evidence.has(id) ? i : -1))
      .filter((i, at, all) => Number.isInteger(i) && i >= 0 && i < WELL_EVIDENCE.length && all.indexOf(i) === at);
    village.wellShaft.setRitualProgress(wellNicheOrder);
    const restoredAnswer = wellAnswer();
    if (restoredAnswer) wellWoman?.restoreAnswer(restoredAnswer);
    rokuroTrialPhase = 'idle';
    rokuroRebindStep = 0;
    rokuroWakeToken++;

    const canonical = ['suzu', 'kushi', 'coins', 'geta', 'kagami', 'fuda'] as const;
    const valid = new Set<string>(canonical);
    const offeredIds = (world.offered?.length ? world.offered : canonical.slice(0, storyFlags.offered))
      .filter((id, i, all) => valid.has(id) && all.indexOf(id) === i);
    const carriedIds = (world.carried ?? [])
      .filter((id, i, all) => valid.has(id) && !offeredIds.includes(id) && all.indexOf(id) === i);
    const rulesStarted = world.rulesStarted ?? (storyFlags.act >= 6 || offeredIds.length > 0 || carriedIds.length > 0);
    rules.restoreProgress(offeredIds, carriedIds, { started: rulesStarted, fudaRefused: world.fudaRefused });
    // 구 저장에서 이미 얻은 봉인패는 사망 후 제자리로 돌아가도 새 퍼즐로 다시 잠그지 않는다.
    // 완료로 꾸미지 않고 호환용 내부 키만 남겨 새 조사 기록/대사를 만들지 않는다.
    if (!manorDispatch.complete && (carriedIds.includes('fuda') || offeredIds.includes('fuda') || world.fudaRefused)) {
      evidence.add('manor:dispatch-legacy'); storyFlags.evidence = [...evidence];
    }
    act17.restore(storyFlags.act >= 18 ? 'complete' : world.act17, storyFlags.act >= 17 || rules.fudaRefused);
    storyFlags.offered = offeredIds.length;

    tabletEventReady = world.tabletEventReady ?? storyFlags.act >= 4;
    tabletRead = world.tabletRead ?? storyFlags.act >= 5;
    restoreFirstDone = world.restoreFirstDone ?? evidence.has('act11:bell-recovery-attempt');
    restoreWarningPlaying = false;
    restoreResolutionPlaying = false;
    restoreWarningReady = offeredIds.length >= 3 && !restoreFirstDone;
    photoMessageRevealed = world.photoMessageRevealed ?? restoreFirstDone;
    wellPreludeHeard = world.wellPreludeHeard ?? evidenceCount('well:') > 0;
    schoolPreludeHeard = world.schoolPreludeHeard ?? evidenceCount('school:') > 0;
    graveyardPreludeHeard = world.graveyardPreludeHeard ?? evidenceCount('graveyard:') > 0;

    // 제단은 먼저 값싼 표식으로 즉시 복원하고, 실물 모델이 준비되는 슬롯부터 교체한다.
    village.pedestals.clear();
    offeredIds.forEach((id, slot) => {
      const def = rules!.offerings.find((o) => o.id === id);
      if (!def) return;
      village!.pedestals.place(slot, def.color, null);
      void rules!.prototype(def).then((proto) => {
        if (proto) village?.pedestals.place(slot, def.color, proto.clone(true));
      });
    });
    village.hamlet.setStoryStage(offeredIds.length);
    lifesigns?.setStoryStage(offeredIds.length);
    village.pedestals.setRootsLocked(offeredIds.length >= 3);
    village.pedestals.setRelocated(evidence.has('crypt:offerings-moved'));
    act18.restoreVisuals();
    village.shrine.honden.setStage(offeredIds.length >= 5 ? 3 : offeredIds.length >= 4 ? 2 : offeredIds.length >= 2 ? 1 : 0);
    if (offeredIds.length >= 3) timeOfDay?.set('breach', 0);

    for (const id of carriedIds) inventory.add(id);
    inventory.add('photo');
    inventory.add('phone');
    if (evidence.has('inn:wakyo')) {
      inventory.add('wakyo');
      village.innInterior.takeWakyo();
    }
    phone.seen = storyFlags.phone;
    phone.setBattery(storyFlags.phoneBattery);
    if (storyFlags.chochin) {
      village.eaveChochin.take();
      chochin?.setHeld(true);
      chochin?.setLevel(Math.max(1, settings.chochin.level));
    }
    setPhotoStoryState(offeredIds.length, photoMessageRevealed);
    ITEMS['photo']!.icon = photoThumb(photoDamageForOfferings(offeredIds.length));

    const p = world.player;
    if (p && [p.x, p.y, p.z].every(Number.isFinite) && Math.abs(p.x) < 500 && Math.abs(p.z) < 500) {
      const restored = new THREE.Vector3(p.x, p.y, p.z);
      spawn.copy(restored); // 사망 뒤에도 마지막 체크포인트로 돌아온다.
      controller.teleport(restored);
      if (Number.isFinite(p.yaw)) controller.yaw = p.yaw!;
      if (Number.isFinite(p.cameraYaw)) tpCam.yaw = p.cameraYaw!;
    }
    const suzuCarried = carriedIds.includes('suzu');
    const suzuInside = suzuCarried && village.hokora.contains(controller.position);
    rokuroEncounterSeen = suzuCarried || offeredIds.includes('suzu');
    rokuroTrialCleared = offeredIds.includes('suzu') || (suzuCarried && !suzuInside);
    syncSuzuWardVisuals();
    schoolWasInside = village.schoolInterior.contains(controller.position);
    act4?.skip();
    renderHud();
    invUI.render();
    evidenceJournal.sync();
    return true;
  };

  let requestingNewGame = false;
  async function requestNewGame(reload = false) {
    if (requestingNewGame || (!reload && started)) return;
    requestingNewGame = true;
    try {
      if (reload || storySave.peek()) {
        if (!await confirmNewGame()) return;
        if (!storySave.clear()) { saveStatus.deletionFailed(); return; }
      }
      if (reload) location.reload();
      else start(false);
    } finally { requestingNewGame = false; }
  }

  /** 메뉴의 새 게임은 확인 후 초기화하고, 개발용 sandbox 리셋은 저장에 손대지 않는다. */
  const resetRun = () => {
    // 스토리는 플래그·증거·연출·AI를 함께 초기화해야 한다. 공물만 리셋하면 이전
    // 단서와 열린 문이 남아 새 게임을 진행할 수 없으므로 부팅 경로에서 다시 만든다.
    if (isVillage) { void requestNewGame(true); return; }
    rokuroWakeToken++;
    rokuroTrialPhase = 'idle';
    rokuroRebindStep = 0;
    rokuroTrialCleared = false;
    rokuroEncounterSeen = false;
    village?.hokora.openDoor();
    rokuro?.setEscapeEnabled(false);
    rokuro?.deactivate();
    controller.teleport(spawn);
    for (const h of hunters) h.reset();
    dorotabo?.reset();
    rules?.reset();
    village?.pedestals.clear();
    syncSuzuWardVisuals();
    stamina = settings.stamina.max; exhausted = false; crouching = false;
    renderHud();
    endEl.classList.remove('show');
  };

  /**
   * Esc 로 열리는 일시정지 메뉴 (`ui/pauseMenu.ts`). 여는 쪽은 `pointerlockchange` 가 잡는다.
   * 「계속하기」는 포인터락을 다시 요청한다 — 크롬은 Esc 해제 직후 1 초 동안 재잠금을 막으므로
   * 실패하면 한 번 더 시도한다(그래도 안 되면 화면을 클릭하면 된다. `core/input.ts` 가 받는다).
   */
  const pauseMenu = new PauseMenu({
    onQuit: isDesktop() ? () => { saveCheckpoint(); void closeDesktop(); } : undefined,
    onResume: () => {
      const grab = () => {
        // 되잡을 이유가 사라졌으면 조용히 그만둔다 — 재시도가 인벤토리 위에서 락을 뺏으면 안 된다
        if (modalInput.active || document.pointerLockElement) return;
        try { void (canvas.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); }
        catch { /* 포인터락 불가 환경(자동화 등) — 드래그 오빗으로 대체된다 */ }
      };
      grab();
      // 크롬은 Esc 해제 직후 1 초 동안 재잠금을 막는다. 한 번만 더 시도하고, 그래도 안 되면
      // 화면을 클릭하면 된다(`core/input.ts` 가 받는다)
      setTimeout(grab, 1100);
    },
    onRestart: resetRun,
    onQuality: setQualityManually,
    onVolume: (v) => { muted = false; sfx.setMaster(v); },
    // 값 자체는 메뉴가 settings 에 이미 썼다. 타이틀 설정의 같은 슬라이더도 따라오게 한다
    onRenderScale: (v) => { saveRenderScale(v); onResize(); titleGfx?.syncScale(v); },
    onHudChange: () => { applyHudAccessibility(); saveHudPrefs(); onResize(); },
  }, quality.level);
  /**
   * 포인터락을 거부하는 브라우저·보조기기에서도 Esc 메뉴를 열 수 있어야 한다.
   * 캡처 단계에서 처리해 아래의 「열린 메뉴를 Esc로 닫기」 핸들러가 같은 키로 즉시 닫지 않게 한다.
   * 다른 오버레이가 열려 있으면 그 오버레이의 기존 Esc 닫기 동작을 우선한다.
   */
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.repeat || document.pointerLockElement || !started || modalInput.active
      || invUI.isOpen || photoViewer.isOpen || palmSign.isOpen || evidenceJournal.isOpen || deathT > 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pauseMenu.open();
  }, { capture: true });
  invUI.canOpen = () => started && !modalInput.active && !palmSign.isOpen && !act17.running && !investigationsBusy() && !(act3?.controlsLocked ?? false);
  evidenceJournal.canOpen = () => isVillage && started && !pauseMenu.isOpen && !invUI.isOpen
    && !photoViewer.isOpen && !palmSign.isOpen && !modalInput.active && !act17.running && !investigationsBusy() && !(act3?.controlsLocked ?? false);

  /**
   * 타이틀 「설정」 모달에 그래픽 옵션(화질·렌더 해상도)을 붙인다. 모달 껍데기는 index.html /
   * boot.ts 소유지만, 화질 적용에는 살아 있는 엔진(applyQualityLive)이 필요해서 여기서 주입한다 —
   * 설정 버튼 자체가 로딩 완료(startBtn 공개) 후에야 나타나므로 이 배선이 항상 먼저 끝나 있다.
   */
  const titleGfx = (() => {
    const anchor = document.getElementById('title-fullscreen'); // 이 버튼 앞에 끼운다
    if (!anchor?.parentElement) return null;
    const qRow = document.createElement('div');
    qRow.className = 'title-setting-row';
    const qLabel = document.createElement('span');
    qLabel.textContent = L('화질', '画質');
    const seg = document.createElement('div');
    seg.className = 'title-seg';
    const qButtons = QUALITY_LEVELS.map((lv) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = QUALITY_LABEL[lv];
      b.classList.toggle('on', lv === quality.level);
      b.addEventListener('click', () => setQualityManually(lv));
      seg.appendChild(b);
      return { lv, b };
    });
    qRow.append(qLabel, seg);

    const rRow = document.createElement('div');
    rRow.className = 'title-setting-row';
    const rLabel = document.createElement('label');
    rLabel.htmlFor = 'title-res';
    rLabel.textContent = L('렌더 해상도', '描画解像度');
    const rCtl = document.createElement('div');
    rCtl.className = 'title-volume-control';
    const rInput = document.createElement('input');
    rInput.id = 'title-res'; rInput.type = 'range';
    rInput.min = '0.5'; rInput.max = '1'; rInput.step = '0.05';
    rInput.value = String(settings.render.resolutionScale);
    const rOut = document.createElement('output'); // '%' 는 CSS ::after — 음량 표기와 같은 방식
    rOut.setAttribute('for', 'title-res');
    rOut.value = String(Math.round(settings.render.resolutionScale * 100));
    rInput.addEventListener('input', () => {
      const v = Number(rInput.value);
      settings.render.resolutionScale = v;
      rOut.value = String(Math.round(v * 100));
      saveRenderScale(v);
      onResize();
      pauseMenu.syncRenderScale(v);
    });
    rCtl.append(rInput, rOut);
    rRow.append(rLabel, rCtl);

    anchor.before(qRow, rRow);
    return {
      syncQuality(lv: QualityLevel) { for (const q of qButtons) q.b.classList.toggle('on', q.lv === lv); },
      syncScale(v: number) { rInput.value = String(v); rOut.value = String(Math.round(v * 100)); },
    };
  })();

  // --- 단축키: M 음소거, F 전체화면. R은 개발 sandbox 전용이다. ---
  let muted = false;
  window.addEventListener('keydown', (e) => {
    if (!started || modalInput.active || e.defaultPrevented || e.repeat) return;
    // 키를 눌렀다는 사실을 월드 표지자 자체가 답한다. 꾹 누르기는 아래의 원형 진행도가 이어 받는다.
    if (e.code === 'KeyE' && !e.repeat && promptAnchor.classList.contains('in-view')) {
      promptAnchor.classList.remove('pressed');
      void promptAnchor.offsetWidth; // 같은 프레임 재입력도 애니메이션을 처음부터 재생
      promptAnchor.classList.add('pressed');
      window.setTimeout(() => promptAnchor.classList.remove('pressed'), 180);
    }
    // 사진을 펼쳐 든 동안은 어떤 키도 게임으로 내려보내지 않는다 — Esc 닫기 · Space 뒤집기
    if (photoViewer.key(e.code)) { e.preventDefault(); return; }
    const cine = sequencer.active; // 시퀀스 중엔 게임 입력을 받지 않는다 (Space 는 스킵 홀드)
    const gameplayLocked = cine || palmSign.isOpen || investigationsBusy() || mirrorMemory.busy || truth.busy || act17.running || dialogue.choosing || wellQuestionPlaying || wellClimbInProgress || wellOutroPlaying || wellCinematicPlaying
      || (act3?.controlsLocked ?? false);
    if (e.code === 'KeyE' && !gameplayLocked && worldSword && controller.position.distanceTo(swordSpot) < 2.2) {
      worldSword.removeFromParent(); worldSword = null; promptEl.classList.add('hidden');
      inventory.add('sword');
      if (!inventory.mainhand) { const idx = inventory.slots.findIndex((s) => s.itemId === 'sword'); if (idx >= 0) inventory.equip(idx); }
      sfx.equip();
    }
    if (e.code === 'KeyQ' && chochin?.held && !invUI.isOpen && !gameplayLocked) { chochin.cycle(); sfx.lanternToggle(chochin.level); }
    /**
     * 금기 三 — **[E] 대답한다** (§5.5). 조사점이 아니라 **UI 가 들이미는 버튼**이라
     * `Inspect` 밖에서 E 를 **먼저 가로챈다**. 조사 시스템은 「가장 가까운 점」이 이기는 구조라
     * 계단·숙박부 같은 것이 옆에 있으면 대답 프롬프트가 밀린다(실측: 계단에 뺏겼다).
     * 누르면 위반이다 — 참는 쪽에는 아무 보상도 없다. 아무 일이 없는 것이 보상이다.
     */
    if (e.code === 'KeyE' && gazeIdx >= 0 && village && deathT <= 0 && !gameplayLocked) {
      const i = gazeIdx;
      const sp2 = village.innInterior.crowdSpots[i];
      village.innInterior.unwatch(i);
      gazeDone.add(i); gazeIdx = -1;
      renderPrompt();
      storyFlags.answered++;
      innFireT = 10;
      tpCam.shake(1.0);
      sfx.thunder(0.5);
      if (sp2) sfx.callName(sp2.x, sp2.y, sp2.z, { gain: 1.0 });
      saveCheckpoint();
      void dialogue.say(
        { who: MIO_NAME, text: L('……네?', '……はい?') },
        { text: L('대답한 순간, 거울 속 인파가 일제히 이쪽을 돌아본다.', '答えた瞬間、鏡の中の人波が一斉にこちらを振り向く。') },
        { text: L('여관이 타오른다 — 10년 전 그날의 불이 벽을 타고 번진다.', '旅館が燃え上がる — 十年前のあの日の火が壁を這う。') },
        { who: MIO_NAME, text: L('아니야, 난 부르지 않았어……!', '違う、わたしは呼んでない……!') },
      );
      return;   // 이 E 는 조사에 넘기지 않는다
    }
    if (e.code === 'KeyE' && rules && deathT <= 0 && !gameplayLocked && !firstPerson?.active) {
      // 새 상호작용이 대사를 내면 이전 이벤트의 남은 자막을 밀어내고 즉시 시작한다 (밀림 방지).
      // 대사가 안 나오는 상호작용이면 120 ms 창이 그냥 만료된다
      dialogue.preemptNext();
      // 봉인된 동전과 마지막 벽감처럼 반경이 겹치는 곳에서는 화면에 보이는 조사 프롬프트가 실제 입력도 받는다.
      if (inspect?.hasInputPriority) inspect.interact();
      else if (!rules.interact(controller.position)) inspect?.interact();
    }
    if (e.code === 'KeyC' && isVillage && !invUI.isOpen && !gameplayLocked) crouching = !crouching;
    if (e.code === 'Space' && crouching && !gameplayLocked) crouching = false; // 웅크림 중 스페이스 = 일어서기
    if (e.code === 'KeyR' && import.meta.env.DEV && !isVillage && !gameplayLocked) resetRun();
    // T (debug): 시퀀서 데모 — S0 스택 검증용 (PLAN-STORY §8)
    if (e.code === 'KeyT' && debug && !gameplayLocked && village && rules && deathT <= 0) {
      void sequencer.play(buildDemoSeq(village, quests)).then(() => renderHud());
    }
    if (e.code === 'KeyO' && !invUI.isOpen) toggleMissionFold();
    // dev 전용: 콘솔 텔레포트 — 소품 실사 확인용. __tp(x, z, yaw?, pitch?) · __go('이름', dx, dz) · __ls('패턴')
    if (debug && !(window as any).__tp) {
      (window as any).__tp = (x: number, z: number, yaw?: number, pitch?: number) => {
        const g = village?.ground;
        controller.teleport(new THREE.Vector3(x, (g ? g.heightAt(x, z) : controller.position.y) + 0.2, z));
        tpCam.startIntro(0);   // 소품 확인용 순간이동 — 인트로 크레인이 남아 있으면 시점을 뺏는다
        if (yaw !== undefined) tpCam.yaw = yaw;
        if (pitch !== undefined) tpCam.pitch = pitch;
      };
      (window as any).__tablet = village && (village as any).tablet;
      // 폐교 QA — __school.setFlicker(1) 로 형광등을, hauntDoor() 로 미닫이문을 직접 몬다
      (window as any).__school = village?.schoolInterior;
      (window as any).__scene = scene;
      // 지하 공간 검증용 — heightAt 스냅 없이 y 를 직접 지정한다
      (window as any).__tpy = (x: number, y: number, z: number, yaw?: number, pitch?: number) => {
        controller.teleport(new THREE.Vector3(x, y, z));
        tpCam.startIntro(0);
        if (yaw !== undefined) tpCam.yaw = yaw;
        if (pitch !== undefined) tpCam.pitch = pitch;
      };
      // 시간대 프리셋 QA — __time('breach', 1) 처럼 바로 전환해 본다
      (window as any).__time = (n: string, sec = 1) => timeOfDay?.set(n as Parameters<NonNullable<typeof timeOfDay>['set']>[0], sec);
      // 사운드 QA — __sfx.suzuRing(1) 처럼 직접 울려 본다
      (window as any).__sfx = sfx;
      // 자막 QA — 선점(preemptNext) 동작을 직접 확인한다
      (window as any).__dlg = dialogue;
      // 성능 계측 QA — renderer.info(드로우콜·삼각형)를 직접 읽는다
      (window as any).__renderer = renderer;
      (window as any).__ls = (pat: string) => {
        const names: string[] = [];
        scene.traverse((o) => { if (o.name && o.name.toLowerCase().includes(pat.toLowerCase())) names.push(o.name); });
        return names;
      };
      (window as any).__go = (name: string, dx = 0, dz = 3) => {
        let target: THREE.Object3D | undefined;
        scene.traverse((o) => { if (!target && o.name === name) target = o; });
        if (!target) return 'not found: ' + name;
        const c = new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3());
        const px = c.x + dx, pz = c.z + dz;
        const g = village?.ground;
        const py = (g ? g.heightAt(px, pz) : c.y) + 0.2;
        controller.teleport(new THREE.Vector3(px, py, pz));
        tpCam.startIntro(0);
        tpCam.yaw = Math.atan2(-(c.x - px), -(c.z - pz));
        tpCam.pitch = 0.28;
        return `at (${px.toFixed(1)}, ${pz.toFixed(1)}) → ${name} (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`;
      };
    }
    if (e.code === 'KeyM') { muted = !muted; sfx.setMaster(muted ? 0 : settings.audio.master); }
    // 닫는 쪽은 **진짜 Esc** 다 — 메뉴가 떠 있다는 건 이미 락이 풀렸다는 뜻이라 keydown 이 온다
    if (e.code === 'Escape' && pauseMenu.isOpen) { e.preventDefault(); pauseMenu.close(); }
    if (e.code === 'KeyF' || isDesktop() && (e.code === 'F11' || e.code === 'Enter' && e.altKey)) { e.preventDefault(); void toggleFullscreen(); }
  });

  // --- 런타임 품질 적용 + 적응형(느리면 자동 하향) ---
  function applyQualityLive(q: QualityProfile) {
    quality = q;
    onResize(); // 픽셀비는 창 크기에 따라 달라지므로 여기서 다시 계산된다
    postfx.applyQuality(q);
    settings.render.shadowRadius = q.shadowRadius;
    sky.setShadowMapSize(isVillage && !(q.moonShadow && settings.night.moonShadow) ? 0 : q.shadowMap);
    grass?.setBudget(q.grassCount);
    lightPool?.setBudget(q.lightBudget);
    village?.paddy.setBudget(Math.round(HIGASATO_RICE_HIGH * q.treeScale));
    chochin?.setShadowMapSize(q.shadowMap >= 3072 ? 1024 : 512);
  }
  const toast = (msg: string) => {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 20); setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 600); }, 4200);
  };
  /** 화질 표시가 있는 모든 UI(Esc 메뉴·타이틀 설정)를 맞춘다 — H 패널 바인딩은 스스로 갱신된다 */
  function syncQualityUI(lv: QualityLevel) {
    pauseMenu.syncQuality(lv);
    titleGfx?.syncQuality(lv);
  }
  /** 메뉴·H 패널·타이틀에서 화질을 직접 골랐다 — 기능 단계 자동 하향만 끄고 미세 해상도는 유지한다. */
  function setQualityManually(lv: QualityLevel) {
    adaptiveProfile = false;
    adaptiveRenderScale = 1;
    saveQuality(lv);
    applyQualityLive(profileFor(lv));
    syncQualityUI(lv);
  }
  let adaptT = 0, adaptAcc = 0, adaptN = 0;
  let slowWindows = 0, fastWindows = 0;
  let adaptiveProfile = !new URLSearchParams(location.search).has('quality'); // URL 품질은 기능 단계를 고정
  const MIN_ADAPTIVE_SCALE = 0.9;

  const setAdaptiveRenderScale = (value: number) => {
    const next = Math.round(THREE.MathUtils.clamp(value, MIN_ADAPTIVE_SCALE, 1) * 100) / 100;
    if (Math.abs(next - adaptiveRenderScale) < 0.005) return false;
    adaptiveRenderScale = next;
    onResize();
    gpuTimer.reset();
    slowWindows = 0; fastWindows = 0;
    adaptT = 0; adaptAcc = 0; adaptN = 0;
    return true;
  };
  /**
   * 상시 적응형 하향. 예전엔 시작 후 3번(≈11 s)만 재고 끝이라, 한적한 스폰만 통과하면 이후
   * 마쓰리처럼 무거운 구역에서 프레임이 떨어져도 손을 못 썼다 — M2 Max 「무겁다」 후기의 한 축.
   * 이제 먼저 내부 해상도만 2%씩 90%까지 움직인다. 4K에서도 90%면 선형 픽셀 수는 81%지만
   * SMAA·TAA 없는 이 화면에서 체감 차이는 작고, AO·Bloom·메인 패스 픽셀 비용은 즉시 줄어든다.
   * GPU query가 없는 브라우저만 프레임 시간으로 보수적으로 판단한다. 90%에서도 두 창 연속
   * 느릴 때에만 기존처럼 기능 품질을 한 단계 내린다.
   */
  function adaptiveQuality(dt: number) {
    if (!started) return;
    adaptT += dt;
    if (adaptT < 2) return; // 시작·품질 변경 직후 2 s 는 무시(셰이더 컴파일·로딩)
    adaptAcc += dt; adaptN++;
    if (adaptAcc < 2) return; // RT 재할당 빈도를 제한하는 2 s 창
    const cpuMs = (adaptAcc / adaptN) * 1000;
    adaptAcc = 0; adaptN = 0;

    // 상한이 걸려 있으면 그 상한을 기준으로 판단한다 (30 fps 상한을 느리다고 오해하지 않게).
    const cap = settings.render.maxFps;
    const targetMs = cap > 0 ? 1000 / cap : 1000 / 60;
    const hasGpuSample = gpuTimer.available && gpuTimer.sampleCount >= 12 && gpuTimer.ms > 0;
    const overloaded = hasGpuSample
      ? gpuTimer.ms > targetMs * 0.88               // vsync 전에 약 12% 여유를 남겨 발열/스파이크를 흡수
      : cpuMs > targetMs * 1.18;                   // CPU 프레임은 대기시간이 섞이므로 더 보수적
    const comfortablyFast = hasGpuSample
      ? gpuTimer.ms < targetMs * 0.68 && cpuMs < targetMs * 1.08
      : cpuMs < targetMs * 0.82;

    if (overloaded) {
      slowWindows++;
      fastWindows = 0;
      if (adaptiveRenderScale > MIN_ADAPTIVE_SCALE + 0.005) {
        setAdaptiveRenderScale(adaptiveRenderScale - 0.02);
        return;
      }
    } else if (comfortablyFast) {
      slowWindows = 0;
      fastWindows++;
      // 복귀는 하향보다 느리게: 6초 안정 뒤 1%씩 올려 해상도 요요와 RT 재할당을 피한다.
      if (fastWindows >= 3 && adaptiveRenderScale < 0.995) {
        fastWindows = 0;
        setAdaptiveRenderScale(adaptiveRenderScale + 0.01);
      }
      return;
    } else {
      slowWindows = 0;
      fastWindows = 0;
      return;
    }

    if (!adaptiveProfile || slowWindows < 2) return;
    const next = lowerLevel(quality.level);
    if (!next) return; // 이미 low — 더 내릴 단계가 없다
    adaptiveRenderScale = 1; // 새 기능 프로필이 풀 해상도를 감당하는지 다시 측정한다
    applyQualityLive(profileFor(next));
    saveQuality(next);
    syncQualityUI(next);
    toast(L(`프레임이 낮아 품질을 ${next} 로 낮췄습니다 (Esc 로 바꿀 수 있습니다)`,
      `フレームが低いため画質を ${next} に下げました（Esc で変更できます）`));
    gpuTimer.reset();
    slowWindows = 0; fastWindows = 0;
    adaptT = 0; // 변경 직후(셰이더 재컴파일 등) 2 s 는 다시 무시
  }

  // --- 로딩 완료 → 시작 대기 → 진입 연출 ---
  setProgress(1);
  // 셰이더 사전 컴파일(초칭 끔/약/강 × 시작 자리)은 **가족사진 촬영 뒤**로 옮겼다 —
  // 촬영이 시간대를 낮으로 돌렸다 되돌리며 환경맵을 두 번 굽기 때문에, 프리워밍은
  // 그 뒤에 와야 «게임이 시작될 때의 상태» 를 굽는다 (아래 `bakeFrom`).
  /**
   * 점광원 풀 — 픽셀당 조명 비용의 상한. **프리워밍 전에** 만들어야 한다:
   * 원본 라이트를 내리고 슬롯을 세우는 순간 `NUM_POINT_LIGHTS` 가 바뀌어 재질이 재컴파일되는데,
   * 그 비용을 로딩 화면 안에서 치르고 프리워밍이 최종 상태를 굽게 하려는 것이다.
   */
  lightPool = new LightPool(scene, quality.lightBudget, [chochin?.light, faceFill?.light]);
  console.info(`[lights] 원본 ${lightPool.sourceCount} → 슬롯 ${lightPool.slotCount}`);

  /**
   * ACT 2 의 가족사진 — 실제 씬(도리이 앞·낮)에서 **로케 촬영**한다.
   *
   * ⚠️ 예전엔 이걸 `start()` 안에서 했다. 그런데 이 함수는 싼 함수가 아니다 —
   * 시간대를 낮으로 바꾸며 **환경맵(PMREM)을 다시 굽고**, 되돌리며 **한 번 더 굽고**,
   * 2 배 해상도로 렌더한 뒤 `readRenderTargetPixels` 로 GPU→CPU 동기 읽기를 한다.
   * 실측 **281 ms**. 그게 「새 게임을 눌렀는데 화면이 잠깐 멈춘다」의 정체였다
   * (사용자 리포트 2026-08-22).
   *
   * 촬영은 상태를 전부 원위치시키므로 **언제 해도 결과가 같다.** 그러니 로딩 화면이
   * 아직 덮고 있는 지금 해 둔다 — 여기서는 멈춰도 그게 로딩이다.
   */
  if (isVillage && model && timeOfDay && village) {
    loadingPct.textContent = L('사진을 꺼내는 중…', '写真を取り出しています…');
    await new Promise((r) => setTimeout(r, 0));   // 위 글자가 화면에 찍히고 나서 멈추게
    try {
      // 언니는 **사요 모델로** 찍는다 (없으면 photo.ts 가 미오 두 번으로 폴백)
      preparePhoto({ model, renderer, scene, village, timeOfDay, sister: sayo, hide: chochin ? [chochin.root, chochin.body] : [] });
    } catch (e) { console.warn('[photo]', e); }
  }

  /**
   * 가족사진의 인벤토리 아이콘 = **손에 쥔 그 물건**.
   *
   * ① 먼저 캔버스 사진을 줄여 넣는다 — 즉시 뜨는 폴백.
   * ② 곧이어 `photo-symbol.glb`(말린 인화지 한 장)를 정면에서 한 컷 찍어 갈아 끼운다.
   *    이모지(🖼️)도, 캔버스 도판도 「가방에 든 사진」으로는 안 읽혔다(사용자).
   * 인벤은 열 때마다 다시 그리므로 도중에 바뀌어도 문제없다.
   *
   * ⚠️ 이것도 `start()` 안에 있었다. `photoThumb()` 하나가 **38 ms** 라(캔버스 축소),
   * 위 로케 촬영을 옮기고 나니 남은 멈춤이 통째로 이거였다. 촬영 바로 뒤로 옮긴다 —
   * 여기서는 `shot` 이 이미 있고, 화면은 아직 로딩이 덮고 있다.
   */
  if (isVillage) {
    try { ITEMS['photo']!.icon = photoThumb(); } catch (e) { console.warn('[photo] 아이콘 생성 실패', e); }
    // 얼룩은 텍스처에 이미 구워져 있으므로 덧그리지 않는다(`damaged 0`)
    void modelSprite(renderer, '/models/props/wakyo.glb', { size: 256, faceThinAxis: true })
      .then((url) => { ITEMS['wakyo']!.icon = url; if (invUI.isOpen) invUI.render(); })
      .catch(() => {});   // 실패해도 이모지 아이콘이 남는다
    // 휴대폰도 같은 GLB를 실제로 한 번 렌더해 쓴다. items.ts의 WebP는 로딩 전 즉시 뜨는 폴백이다.
    for (const id of ['phone', 'suzu', 'kushi', 'coins', 'geta', 'kagami', 'fuda']) {
      const def = ITEMS[id];
      if (!def?.model) continue;
      void modelSprite(renderer, def.model, { size: 256, faceThinAxis: true, zoom: 1.08 })
        .then((url) => { def.icon = url; if (invUI.isOpen) invUI.render(); })
        .catch(() => {});
    }
    void photoThumbFromModel(renderer, '/models/props/photo-symbol.glb', 256, 0)
      .then((url) => { ITEMS['photo']!.icon = url; if (invUI.isOpen) invUI.render(); })
      .catch((e) => console.warn('[photo] 심볼 아이콘 실패 → 캔버스 축소본 유지', e));
    // 뷰어로 펼쳤을 때의 원판 — 사용자가 준 사진 한 장(`public/textures/photo-front.webp`)
    void loadPhotoFront()
      .catch((e) => console.warn('[photo] 원판 로드 실패 → 캔버스 사진 유지', e));
  }

  // compileAsync 로 **씬 전체 재질 × 3상태**를 로딩 화면 중에 끝내둔다.
  // ?noprewarm: 개발용 — 숨겨진 탭에서는 타이머가 1초/틱이라 이 루프가 로딩을 수십 초 붙잡는다.
  // 소품·연출 확인처럼 히치가 무관한 반복 재로드에서만 쓴다 (첫 전환 히치는 감수)
  const noPrewarm = forceGpuCompatibility || new URLSearchParams(location.search).has('noprewarm');
  await detailsReady;
  if (chochin && !noPrewarm) {
    loadingPct.textContent = L('그림자를 준비하는 중…', '影を用意しています…');
    const bakeT0 = performance.now();
    const bakeP0 = renderer.info.programs?.length ?? 0;
    // 실제 플레이에서는 드로우콜을 없애기 위해 숨긴 꽃·새싹·꽃잎도 여기서는 잠깐 노출한다.
    // 그렇지 않으면 첫 서사 등장 프레임에 셰이더를 새로 컴파일해 최적화가 히치로 되돌아온다.
    village?.setHiddenEffectsPrewarm(true);
    try {

    const camPos0 = camera.position.clone();
    const camQuat0 = camera.quaternion.clone();
    const modelPos0 = model ? model.root.position.clone() : null;
    /**
     * **한 자리에서 한 프레임씩 굽는다.**
     *
     * ⚠️ 프리워밍에서 「어디서 보느냐」가 「무엇이 구워지느냐」를 정한다.
     * `compileAsync` 는 씬 전체를 훑어 **표시용** 프로그램을 만들지만,
     * 그림자 재질(`depth`·`distance`)과 **텍스처 GPU 업로드**는 *실제로 그려질 때* 생긴다.
     * 예전에는 여기서 카메라를 건드리지 않았다 — tpCam 이 자리를 잡는 건 첫 프레임부터라
     * 그 시점의 카메라는 아직 원점 근처(0, 3, 6)였고, **게임이 실제로 그리는 자리에서는
     * 한 번도 굽지 않은** 셈이었다.
     * 실측(M4 Pro · 높음): 로딩이 끝난 뒤 첫 프레임에서 셰이더 프로그램 14 개가 새로 컴파일되고
     * 텍스처 85 장이 올라가며 **255 ~ 900 ms** 가 통째로 멈췄다. 그게 「게임시작이 버벅인다」의
     * 정체다. 그리고 느린 GPU 에서는 이 한 프레임이 드라이버 감시 시간(윈도우 TDR 2 s)을 넘겨
     * WebGL 컨텍스트가 날아간다 — 「화면은 안 나오고 자막·소리만 나온다」가 그 결과다.
     *
     * `sky.follow` 와 미오 옮기기를 같이 하는 이유: 달빛 그림자 절두체와 초칭 점광원은
     * **플레이어를 따라다니므로**, 그 자리로 옮겨 두지 않으면 그 구역의 `depth`·`distance`
     * 프로그램이 안 구워진다. 그래서 `at`(플레이어가 설 자리)과 `eye`(카메라)를 따로 받는다 —
     * 3인칭에서는 이 둘이 4 m 넘게 떨어져 있고, 그 차이만큼 다른 것이 그림자에 든다.
     */
    const bakeFrom = async (eye: THREE.Vector3, look: THREE.Vector3, levels: readonly number[], at = eye) => {
      camera.position.copy(eye);
      camera.lookAt(look);
      camera.updateMatrixWorld(true);
      sky.follow(at);
      // 미오(와 손에 달린 초칭 점광원)도 같이 옮긴다. 캐릭터 위치는 `visual.update` 가 프레임마다
      // 맞추는데 그 루프가 아직 안 돌아서, 두지 않으면 원점에 선 채로 그림자가 구워진다
      if (model) { model.root.position.copy(at); model.root.updateMatrixWorld(true); }
      lightPool?.update(0, eye, losslessGpu ? camera : undefined);
      for (const lv of levels) {
        chochin.setLevel(lv);
        try { await renderer.compileAsync(scene, camera); } catch { /* 구형 브라우저 폴백 */ }
        postfx.composer.render(1 / 60);
        await new Promise((r) => setTimeout(r, 0)); // 프레임 양보 — 로딩 화면이 멈춘 것처럼 보이지 않게
      }
    };

    // ① 스폰(3인칭) — 프롤로그를 건너뛰거나 이어하기로 들어오는 자리.
    //    compileAsync 는 **그 카메라에 보이는 것만** 컴파일한다. 스폰 시야 밖의 재질
    //    (요괴·먼 소품)이 빠져서 나중에 히치가 났다 → 컴파일 동안 대상들을 카메라 앞에 세워 둔다.
    const eye0 = spawn.clone().add(new THREE.Vector3(0, 2, 4.6));
    const look0 = new THREE.Vector3(spawn.x, spawn.y + 1.2, spawn.z);
    const stash: { obj: THREE.Object3D; pos: THREE.Vector3 }[] = [];
    const front = look0.clone().sub(eye0).normalize().multiplyScalar(6).add(eye0);
    for (const h of hunters) stash.push({ obj: h.root, pos: h.root.position.clone() });
    if (dorotabo) stash.push({ obj: dorotabo.root, pos: dorotabo.root.position.clone() });
    stash.forEach((s2, i) => s2.obj.position.set(front.x + (i - 1) * 2.2, front.y, front.z));
    // compileAsync 만으로는 그림자 유무 변형까지 못 잡는다(실측: 첫 끔에서 그림자 받는 재질 28개
    // 재컴파일 → 300~900 ms). 세 상태를 **실제로 한 프레임씩 렌더**해 확실히 굽는다.
    await bakeFrom(eye0, look0, [2, 1, 0, 2, 1, 0], spawn);
    for (const s2 of stash) s2.obj.position.copy(s2.pos);

    // ② ACT 1 시작(1인칭 · 금줄 게이트 안쪽) — 비·언니·횃불이 **모두 켜진** 그 프레임.
    //    셋 다 「보일 때 처음 굽는」 것들이라, 여기서 세워 두지 않으면 시작하자마자 한꺼번에 몰린다
    //    (언니만 스킨드 2 K 텍스처 세 장이다). 앞뒤 두 방향 — ACT 1 은 돌아보는 장면까지 있다.
    if (village && rain) {
      loadingPct.textContent = L('그 밤을 준비하는 중…', 'あの夜を用意しています…');
      const g = village.ground;
      const s1 = g.sAtZ(86);
      const p1 = g.roadAt(s1);
      const eye1 = new THREE.Vector3(p1.x, g.heightAt(p1.x, p1.z) + 1.05, p1.z);
      const ahead = g.roadAt(Math.min(s1 + 10, g.roadLength - 1));
      const back = g.roadAt(Math.max(0, s1 - 8));
      const rainWasOn = rain.group.visible;
      const sayoHome = sayo ? sayo.root.position.clone() : null;
      rain.setEnabled(true);
      if (sayo) {
        const lead = g.roadAt(s1 + 0.29);
        sayo.place(new THREE.Vector3(lead.x, g.heightAt(lead.x, lead.z), lead.z), Math.atan2(lead.dirX, lead.dirZ));
        sayo.show(true);
      }
      pursuers?.begin(s1, 8, 3.6);
      pursuers?.update(1 / 60, s1, 0);   // 횃불이 제자리를 잡아야 화면에 든다
      await bakeFrom(eye1, new THREE.Vector3(ahead.x, eye1.y, ahead.z), [0]);
      await bakeFrom(eye1, new THREE.Vector3(back.x, eye1.y, back.z), [0]);
      pursuers?.end();
      sayo?.show(false);
      if (sayoHome) sayo!.root.position.copy(sayoHome);
      rain.setEnabled(rainWasOn);
    }

    chochin.setLevel(2);
    camera.position.copy(camPos0);
    camera.quaternion.copy(camQuat0);
    camera.updateMatrixWorld(true);
    if (model && modelPos0) { model.root.position.copy(modelPos0); model.root.updateMatrixWorld(true); }
    // 「구운 프로그램 수」가 이 장치의 성적표다 — 시작 첫 프레임에서 새로 컴파일되는 게 남아 있으면
    // 그만큼이 그대로 히치다. 실측: 자리 프리워밍 전 117 개 → 후 151 개, 첫 프레임 255 ms → 28 ms
    console.info(`[prewarm] ${(performance.now() - bakeT0).toFixed(0)} ms · 프로그램 ${bakeP0} → ${renderer.info.programs?.length ?? 0}`);
    } finally {
      village?.setHiddenEffectsPrewarm(false);
    }
  }

  /**
   * ACT 2 직전 타이틀 암전에서만 버스를 실제 렌더해 텍스처 업로드와 셰이더 컴파일을 끝낸다.
   * 초기 로딩 메모리를 늘리지 않으면서도 버스 첫 프레임 히치는 남기지 않는다.
   */
  let busPrepared = false;
  const prepareBus = async () => {
    await prefetchBus();
    if (!bus || busPrepared) return;
    busPrepared = true;
    if (noPrewarm) return;
    const camPos = camera.position.clone();
    const camQuat = camera.quaternion.clone();
    const wasVisible = bus.group.visible;
    const seat = new THREE.Vector3();
    bus.seatWorld(seat);
    bus.show(true);
    camera.position.copy(seat);
    camera.lookAt(seat.clone().add(new THREE.Vector3(0, -0.4, -3)));
    camera.updateMatrixWorld(true);
    try {
      try { await renderer.compileAsync(scene, camera); } catch { /* 구형 브라우저 폴백 */ }
      postfx.composer.render(1 / 60); // 실제 텍스처 업로드까지 암전 아래서 끝낸다
    } catch (e) {
      console.warn('[bus] ACT 2 프리워밍 실패 — 첫 프레임 렌더로 폴백', e);
    } finally {
      bus.show(wasVisible);
      camera.position.copy(camPos);
      camera.quaternion.copy(camQuat);
      camera.updateMatrixWorld(true);
    }
  };

  loadingPct.textContent = totalItems ? `${loadedItems} / ${totalItems}  ·  ${L('로드 완료', '読み込み完了')}` : L('준비 완료', '準備完了');
  startBtn.hidden = false;
  /**
   * **첫 프레임이 실제로 그려질 때까지** 연출 시계를 붙잡아 둔다.
   *
   * 프롤로그의 페이드·자막은 `setTimeout` 과 CSS 트랜지션 — 즉 **벽시계**로 간다.
   * 반면 화면은 프레임이 돌아야 나온다. 시작 직후 한 프레임이 길게 걸리면 그동안에도
   * 자막 타이머와 페이드는 흘러가서, 「화면은 아직 검은데 자막만 지나간다」가 된다
   * (사용자 리포트 2026-08-26). 로딩 화면은 1.15 s 에 걸쳐 사라지므로, 그 밑에서
   * 첫 프레임을 치르고 나서 시계를 출발시키면 이 어긋남이 원천적으로 없어진다.
   */
  let firstFrameDone: (() => void) | null = null;
  const firstFrame = new Promise<void>((r) => {
    firstFrameDone = r;
  });
  // 셰이더 프리워밍: 초칭 끔/약/강은 각각 다른 셰이더 변형이라 첫 전환 때 한 번 컴파일된다
  // (실측: 플레이 중 첫 Q 끔 = 120~1,000 ms 히치). 인트로 동안 세 상태를 한 프레임씩
  // 렌더해 미리 컴파일해 둔다 — 등불이 살짝 깜빡이는 정도라 연출로도 자연스럽다.
  // 인트로(3.4 s 시네마틱) 동안 초칭 세 상태를 실제 카메라로 한 프레임씩 렌더한다.
  // 로딩 중 compileAsync 로도 안 잡히는 재질이 남는데(프러스텀 밖), 인트로는 카메라가 크게 훑고
  // 지나가므로 여기서 마저 구워진다 — 남는 히치가 있어도 연출 중이라 보이지 않는다.
  const PREWARM_SEQ = [0, 1, 2, 0, 1, 2, 0, 2];
  let prewarmFrame = -1;
  // 스킵 상태를 **화면에 보이게** 한다. 코드는 URL 을 바꾸지 않지만 브라우저가 주소를
  // 자동완성해 주기 때문에, 처음부터 하려던 사람이 영문도 모르고 프롤로그를 건너뛴다(그랬다).
  if (skipIntro) {
    const btn = document.getElementById('start-btn');
    if (btn) {
      const label = L('프롤로그 건너뛰고 게임시작', 'プロローグを飛ばして開始');
      btn.setAttribute('aria-label', label);
      btn.title = label;
      const text = btn.querySelector<HTMLElement>('.title-action-label');
      if (text) text.textContent = label;
    }
    const sub = document.querySelector('.loading-sub');
    if (sub) sub.innerHTML = L(
      '<b>?skip=intro</b> — 프롤로그를 건너뜁니다 · <a href="./" style="color:#ffc876">처음부터 하기</a>',
      '<b>?skip=intro</b> — プロローグを飛ばします · <a href="./" style="color:#ffc876">最初から</a>');
  }
  const titleCard = document.getElementById('title-card')!;
  const start = (wantContinue = false) => {
    if (started) return;
    const saved = wantContinue ? storySave.peek() : null;
    const resumed = saved !== null && restoreFromCheckpoint(saved);
    if (wantContinue && !resumed) {
      continueBtn.disabled = true;
      continueBtn.title = L('저장된 진행을 읽을 수 없습니다', '保存された進行を読み込めません');
      return;
    }
    if (resumed) controlsTutorial?.skip();
    started = true;
    syncAudioRegions(controller.position);
    void village?.prepareDetails(controller.position);
    input.reset();
    window.dispatchEvent(new Event('game-started'));
    // 타이틀에서 기다린 시간이 아니라 시작 클릭부터 4초를 센다. 이전 위치에서는
    // 메뉴에 오래 머물기만 해도 firstFrame이 미리 풀려 첫 렌더보다 연출이 먼저 흘렀다.
    setTimeout(() => { if (!document.hidden) firstFrameDone?.(); }, 4000);
    telemetry.start(storyFlags.act, resumed);
    prewarmFrame = chochin ? 0 : -1;
    sfx.unlock();
    if (isVillage) sfx.startNight();
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 1200);
    // ACT 1~2 프롤로그 → 끝나면 금줄 게이트 안쪽에서 플레이 시작 (PLAN-STORY §8.4)
    const bypassPrologue = skipIntro || resumed;
    const tutorialRun = tutorialQa && !resumed;
    setYokaiActive(!(village && rain && (!bypassPrologue || tutorialRun)));   // 프롤로그·튜토리얼 중에는 꺼둔다
    if (rokuroQa && rules && village) {
      // 방울 줍기 이벤트를 정상 경로로 태운다. ACT 6 금기 퍼즐이 추가된 뒤에는 선행 증거가 없어
      // `canPickup`에서 막혀 로쿠로가 dormant로 남았다 — QA 진입점에서만 세 매듭을 완료 처리한다.
      for (const id of SUZU_EVIDENCE) rememberEvidence(id);
      rules.update(0, village.hokora.suzuPos);
      rules.interact(village.hokora.suzuPos);
    }
    if (village && rain && !bypassPrologue) {
      hintExpired = true; // 연출 중엔 조작 힌트를 띄우지 않는다
      // 가족사진은 로딩 중에 이미 찍어 뒀다 (위 `preparePhoto` 주석 — 여기서 하면 클릭이 281 ms 멈춘다)
      // **첫 프레임을 기다렸다가** 시작한다 — 자막·페이드가 화면보다 먼저 가지 않게 (`firstFrame` 주석)
      void firstFrame.then(() => playPrologue({
        scene, sequencer, dialogue, village, controller, rain, sfx, chochin, phone, sayo, give, input,
        fp: firstPerson!, pursuers: pursuers!, lightning: lightning!, bus: bus!, camera,
        prefetchBus,
        prepareBus,
        releaseBus: () => bus?.dispose(),
        setSurfaceOverride: (sf) => { surfaceOverride = sf; },
        setDread: (v) => { dreadEl.style.opacity = String(Math.min(0.95, v)); },
        setTime: (n, sec) => timeOfDay?.set(n, sec ?? 0),
        onAct: (act) => setStoryAct(storyFlags, act),
        title: (show) => titleCard.classList.toggle('show', show),
        bindAct1: (a) => { act1 = a; },
        bindAct2: (a) => { act2 = a; },
        place: (p) => controller.teleport(p),
        onEnd: (p) => {
          spawn.copy(p);
          controller.teleport(p);
          surfaceOverride = null;
          dreadEl.style.opacity = '0';
          lightning?.end();
          tpCam.startIntro(2.2);
          // 카메라 인계가 끝나면 이동 → 시점 → 단축키 안내를 마친 뒤 ACT 3 으로 넘어간다.
          // 이 동안 방송·요괴를 함께 보류해 첫 조작에만 집중시킨다.
          controlsTutorial?.begin(p);
        },
      })).catch((e) => { console.warn('[prologue]', e); sayo?.dispose(); firstPerson?.end(); pursuers?.end(); lightning?.end(); bus?.dispose(); sfx.busEngine(false); surfaceOverride = null; dreadEl.style.opacity = '0'; controlsTutorial?.skip(); setStoryAct(storyFlags, 3); setYokaiActive(true); });
    } else {
      tpCam.startIntro(3.4);
      if (!tutorialRun) setTimeout(() => { hintExpired = true; }, 14000); // 조작 힌트는 처음 잠깐만
      // 프롤로그를 건너뛰어도 **가방 안은 같아야 한다** — 사진은 ACT 2b 에서 넣는 물건이고,
      // 없으면 인벤 튜토리얼도 ACT 16·30 의 재열람도 자리를 잃는다.
      // (로케 촬영은 로딩 중에 이미 끝났다 — 위 `preparePhoto` 주석)
      // 프롤로그가 없으니 언니가 나올 자리도 없다 — 사진만 찍고 돌려준다
      sayo?.dispose();
      sayo = null;
      // 스킵/이어하기에서는 ACT 2 세트를 한 번도 쓰지 않는다. 절차 버스도 즉시 해제한다.
      bus?.dispose();
      if (isVillage && !resumed) {
        give('photo');
        give('phone');
        if (!tutorialRun) setStoryAct(storyFlags, 3);
      }
      if (tutorialRun) controlsTutorial?.begin(controller.position);
      if (resumed && village && rules) {
        if (storySave.lastReadSource === 'backup') saveStatus.recovered();
        void firstFrame.then(async () => {
          if (rules.carried.includes('kagami') && !rules.fudaRefused) await mirrorMemory.play();
          await act17.resume();
        });
        // 순간 추격 상태는 저장하지 않는다. 다만 보스 구역 안에서 운반 중인 세이브라면
        // 충분한 예고 뒤 그 구역의 규칙만 다시 시작해 ‘멈춘 보스’를 만들지 않는다.
        if (rules.carried.includes('suzu') && village.hokora.contains(controller.position)) beginRokuroTrial('resume');
        if (rules.carried.includes('kushi') && village.schoolInterior.contains(controller.position)) {
          setTimeout(() => yuri?.activate(controller.position), 1200);
        }
        if (village.wellShaft.inChamber(controller.position)) {
          const progress = countOf(WELL_EVIDENCE);
          if (progress > 0) wellWoman?.awakenFromEvidence(progress, controller.position);
          if (rules.carried.includes('coins')) setTimeout(() => wellWoman?.activate(controller.position), 1200);
          else if (progress === WELL_EVIDENCE.length && !wellAnswer()) setTimeout(() => void maybeBeginWellQuestion(), 900);
        }
        toastEl.textContent = L(`ACT ${storyFlags.act} 체크포인트에서 이어합니다`, `ACT ${storyFlags.act}のチェックポイントから再開します`);
        toastEl.classList.add('show'); toastT = 3.8;
      }
    }
  };
  startBtn.addEventListener('click', () => { void requestNewGame(); });
  continueBtn.addEventListener('click', () => start(true));
  // Enter/Space는 실제 포커스된 버튼의 기본 click을 사용한다. 설정 조작으로 게임을 시작하지 않는다.

  // 배포 빌드에서도 `?debug` 를 명시하면 QA 도구를 연다. 원격 프리뷰/정적 호스트에서
  // 개발 서버와 같은 사당·AI 상태 검증을 할 수 있어야 한다.
  if (debug) {
    // 사진 아이콘 재단용 — 크롭/얼룩 위치를 큰 해상도로 확인할 때 쓴다
    (window as unknown as Record<string, unknown>)['__photoThumb'] = (size = 1024, damaged = 1) =>
      photoThumbFromModel(renderer, '/models/props/photo-hands.glb', size, damaged);
    (window as unknown as Record<string, unknown>)['__dbg'] = { controller, physics, tpCam, scene, settings, sky, postfx, input, camera, model, animator, sfx, island, water, inventory, equipment, combat, dummies, village, crows, chochin, faceFill, hunters, get hunter() { return hunters[0]; }, dorotabo, get rokuro() { return rokuro; }, get yuri() { return yuri; }, get wellWoman() { return wellWoman; }, senses, matsuri, scares, rules, ambience, telemetry, get hiding() { return hiding; }, get crouching() { return crouching; }, setCrouch(v: boolean) { crouching = v; }, story: { acts: STORY_ACTS, phases: STORY_PHASES, act17, act18, quests, dialogue, sequencer, flags: storyFlags, save: storySave, phone, photoViewer, journal: evidenceJournal, fp: firstPerson, pursuers, lightning, bus, get sayo() { return sayo; }, get act1() { return act1; }, get act2() { return act2; }, get act3() { return act3; }, get act4() { return act4; }, get lifesigns() { return lifesigns; }, get speakers() { return village?.speakers; } }, get navgrid() { return navgridRef; }, get timeOfDay() { return timeOfDay; }, get audioSpace() { return sfx.space; }, get audioZone() { return audioZone; } };
  }

  // --- 리사이즈 ---
  /**
   * 마지막으로 렌더러에 **적용한** 화면 상태. `resize` 이벤트만 믿으면 안 된다 —
   * 전체화면 전환·모니터 이동·브라우저 확대는 `devicePixelRatio` 만 바꾸고 이벤트를 안 주는 경우가 있고,
   * 그러면 컴포저 버퍼와 캔버스 크기가 어긋나 **화면 한쪽이 검게** 남는다(실측 재현).
   * 그래서 프레임마다 값을 대조해 달라졌을 때만 다시 맞춘다 (같으면 아무 일도 안 한다).
   */
  let lastW = -1, lastH = -1, lastDpr = -1, lastLock = false;
  /** 캔버스가 화면에서 차지하는 사각형 — 목표 지시자가 투영 좌표를 여기에 맞춘다 */
  const viewRect = { x: 0, y: 0, w: 1, h: 1 };
  const promptWorld = new THREE.Vector3();
  const promptCam = new THREE.Vector3();
  const promptNdc = new THREE.Vector3();
  /**
   * 상호작용 좌표를 현재 카메라로 투영한다. 화면 밖/등 뒤 대상은 구석으로 끌어오지 않는다 —
   * 퀘스트 화살표가 아니라, 플레이어가 실제로 보고 있는 물건에 붙는 표지자이기 때문이다.
   */
  function placeInteractionPrompt(
    anchor: HTMLElement,
    bubble: HTMLElement,
    target: THREE.Vector3 | null,
    visible: boolean,
    lift = 0.62,
  ): boolean {
    if (!visible || !target) { anchor.classList.remove('in-view'); return false; }
    promptWorld.copy(target);
    promptWorld.y += lift;
    promptCam.copy(promptWorld).applyMatrix4(camera.matrixWorldInverse);
    if (-promptCam.z <= 0.05) { anchor.classList.remove('in-view'); return false; }
    promptNdc.copy(promptWorld).project(camera);
    if (promptNdc.z < -1 || promptNdc.z > 1 || Math.abs(promptNdc.x) > 1 || Math.abs(promptNdc.y) > 1) {
      anchor.classList.remove('in-view');
      return false;
    }
    const x = viewRect.x + (promptNdc.x * 0.5 + 0.5) * viewRect.w;
    const y = viewRect.y + (-promptNdc.y * 0.5 + 0.5) * viewRect.h;
    anchor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    // 링은 대상에 고정하고 긴 문구만 화면 안으로 살짝 밀어 넣는다.
    const scale = settings.hud.scale;
    const half = bubble.offsetWidth * scale * 0.5;
    const margin = 12;
    const shift = x - half < margin ? margin - (x - half)
      : x + half > window.innerWidth - margin ? window.innerWidth - margin - (x + half) : 0;
    bubble.style.setProperty('--prompt-shift', `${Math.round(shift / scale)}px`);
    anchor.classList.toggle('below', y - (bubble.offsetHeight + 14) * scale < margin);
    anchor.classList.add('in-view');
    return true;
  }
  function onResize() {
    const winW = window.innerWidth, winH = window.innerHeight, dpr = window.devicePixelRatio;
    const lock = settings.hud.lockAspect;
    lastW = winW; lastH = winH; lastDpr = dpr; lastLock = lock;
    // 비율 고정(선택): 렌더 영역을 aspect 로 묶고 남는 자리는 검게 둔다 (`core/settings.ts` hud.lockAspect)
    let w = Math.max(1, winW), h = Math.max(1, winH);
    if (lock) {
      const a = settings.hud.aspect;
      if (winW / winH > a) w = Math.round(winH * a); else h = Math.round(winW / a);
      w = Math.max(1, w); h = Math.max(1, h);
      document.body.style.setProperty('--view-w', `${w}px`);
      document.body.style.setProperty('--view-h', `${h}px`);
    }
    document.body.classList.toggle('locked-aspect', lock);
    viewRect.x = (winW - w) / 2; viewRect.y = (winH - h) / 2; viewRect.w = w; viewRect.h = h;
    // 픽셀비는 창 크기마다 다시 계산한다 — 전체화면으로 키우면 예산에 맞춰 자동으로 내려간다
    const pr = effectivePixelRatio(quality, w, h, dpr, settings.render.resolutionScale * adaptiveRenderScale);
    if (Math.abs(renderer.getPixelRatio() - pr) > 0.001) renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // ⚠️ 반드시 픽셀비·캔버스 크기를 정한 **뒤에** — 컴포저는 렌더러의 드로잉 버퍼 크기를 읽어 간다
    postfx.resize(w, h);
    gpuTimer.reset();
    adaptT = 0; adaptAcc = 0; adaptN = 0;
    slowWindows = 0; fastWindows = 0;
  }
  /** 프레임마다 부르는 값싼 대조. 달라진 게 없으면 즉시 돌아간다 */
  function syncViewport() {
    if (window.innerWidth === lastW && window.innerHeight === lastH
      && window.devicePixelRatio === lastDpr && settings.hud.lockAspect === lastLock) return;
    onResize();
  }
  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onResize);
  onResize();

  // --- 루프 ---
  const frameClock = new FrameClock(performance.now());
  let fpsAcc = 0, fpsN = 0, fpsShown = 0;
  /** 연속으로 터진 프레임 수 — 한 번은 넘기고, 이어지면 안내를 띄운다 */
  let frameErrors = 0;
  const shadowTarget = new THREE.Vector3();
  let wasPaused = false;
  if (isDesktop()) window.addEventListener('blur', () => {
    input.reset();
    if (started && !endEl.classList.contains('show')) pauseMenu.open();
  });
  document.addEventListener('visibilitychange', () => {
    frameClock.reset(performance.now());
    input.reset();
    gpuTimer.reset();
    adaptT = 0; adaptAcc = 0; adaptN = 0;
    slowWindows = 0; fastWindows = 0;
    if (document.hidden && started && !endEl.classList.contains('show')) pauseMenu.open();
  });

  function frame(now: number) {
    requestAnimationFrame(frame);
    // 메인 타이틀은 정적 키아트 + DOM UI 다. 새 게임 전에는 뒤의 3D 월드를 갱신하거나
    // 후처리 렌더링할 이유가 없다 — 불투명 타이틀 아래에서 매 프레임 전체 마을을 그리던 것이
    // 타이틀 렉의 주원인이었다. 시계만 맞춰 시작 첫 프레임의 dt 폭주를 막는다.
    if (!started || document.hidden) { frameClock.reset(now); return; }
    const elapsed = frameClock.sample(now, settings.render.maxFps);
    if (elapsed === null) return;
    let dt = elapsed;
    if (dt > 1 / 20) dt = 1 / 20; // 탭 전환 등 큰 dt 방지
    if (dt <= 0) return;
    if (import.meta.env.DEV && (window as unknown as { __dbg?: { paused?: boolean } }).__dbg?.paused) return; // 테스트용 일시정지
    syncViewport();
    const paused = pauseMenu.isOpen || evidenceJournal.isOpen || endEl.classList.contains('show');
    if (paused !== wasPaused) {
      gpuTimer.reset();
      adaptT = 0; adaptAcc = 0; adaptN = 0;
      slowWindows = 0; fastWindows = 0;
      fpsAcc = 0; fpsN = 0;
      wasPaused = paused;
    }
    if (!paused) {
      adaptiveQuality(elapsed); // 물리용 50 ms 제한값으로 실제 부하를 숨기지 않는다
      fpsAcc += elapsed; fpsN++;
      if (fpsAcc > 0.5) { fpsShown = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    }
    // 루프가 매 프레임 터지면 화면만 멈추고 소리·자막은 계속 흐른다 — 그 침묵을 안내로 바꾼다
    // (`showBreakdown` 주석). 한 번의 사고는 넘기고, 이어서 세 번 터지면 말한다.
    try { step(dt, true); frameErrors = 0; } catch (e) {
      if (++frameErrors === 1) console.error('[frame]', e);
      if (frameErrors >= 3) {
        showBreakdown(
          L('화면 그리기가 멈췄습니다', '描画が停止しました'),
          L('내부 오류로 렌더링이 계속 실패하고 있습니다 (소리와 자막만 남습니다).',
            '内部エラーで描画が失敗し続けています（音声と字幕だけが残ります）。'));
      }
      return;
    }
    // 화면이 한 장이라도 나온 뒤에 프롤로그 시계를 출발시킨다 (위 `firstFrame` 주석)
    if (firstFrameDone) { const done = firstFrameDone; firstFrameDone = null; done(); }
  }

  /**
   * ⚠️ **런타임 라이트 개수 감시** (DEV 전용).
   *
   * three 는 씬에서 *보이는* 라이트만 세고, 그 수가 바뀌면 `NUM_POINT_LIGHTS` 가 달라져
   * **재질 전부가 셰이더 재컴파일**된다. 실측 한 프레임 **8561 ms**(평소 3.2 ms).
   * 이 프로젝트에서 두 번 났다 — 제단 halo(`higasato/pedestals.ts`)와 프롤로그 횃불(`story/pursuers.ts`).
   * 씬 전환(프롤로그→마을, 버스)에서는 정상적으로 바뀌므로 **에러가 아니라 로그**다.
   * 플레이 중에 이게 찍히면 그 자리가 히치다.
   */
  let lightWatchT = 0;
  let lastLightCount = -1;
  function watchLights(dt: number) {
    if (!import.meta.env.DEV) return;
    lightWatchT -= dt;
    if (lightWatchT > 0) return;
    lightWatchT = 0.5;
    let n = 0;
    scene.traverse((o) => { if ((o as THREE.Light).isLight && o.visible) n++; });
    if (lastLightCount >= 0 && n !== lastLightCount) {
      console.warn(`[light] 씬 라이트 수 ${lastLightCount} → ${n} — 재질 셰이더가 전부 재컴파일된다(히치). 라이트는 상주시키고 intensity 로 켜고 꺼라`);
    }
    lastLightCount = n;
  }

  /**
   * 공간 오디오 — 리스너 위치 / 리버브 존 / 위협 덕킹 (audio/space.ts).
   * 존은 **문턱에서 왔다 갔다 하면 안 된다**. 현관에 서서 반 발짝씩 움직이면 잔향이 초당 몇 번씩
   * 뒤집히는데, 0.55 s 홀드를 걸면 실제로 들어가고 나올 때만 바뀐다.
   */
  let audioZone: ZoneName = 'outdoor';
  let zoneHold = 0;
  function updateAudioSpace(dt: number) {
    const space = sfx.space;
    if (!space) return;
    // 캐릭터 자신의 콜라이더는 제외한다 — 안 그러면 내 몸이 모든 소리를 막는다
    space.raycast ??= (a, b) => physics.rayBlocked(a, b, controller.body);
    space.listener.copy(camera.position);
    let want: ZoneName = 'outdoor';
    if (bus?.group.visible) want = 'bus';                                  // ACT 2 — 버스 안
    else if (village) {
      if (village.isIndoors(controller.position)) want = 'indoor';         // 폐가·민가
      else if (village.inToriiCorridor(controller.position)) want = 'corridor'; // 센본토리이
    }
    zoneHold -= dt;
    if (want !== audioZone && zoneHold <= 0) { audioZone = want; zoneHold = 0.55; space.setZone(want); }
    space.setThreat(chochin?.threat ?? 0);
    space.update(dt);
  }

  /** 한 프레임 시뮬레이션+렌더. 테스트에서 rAF 없이 결정적으로 호출 가능 (`__dbg.step(dt, render)`) */
  let pausedRevision = -1;
  function step(dt: number, render = true) {
    /**
     * 일시정지 — **시뮬레이션을 통째로 건너뛴다.** 인벤토리(`uiOpen`)는 입력만 막고 세계는
     * 계속 도는데, 이 메뉴는 그러면 안 된다: 알트탭 한 사이에 요괴가 다가와 있으면 그건
     * 일시정지가 아니다. 정지 화면은 진입·해상도·그래픽 설정 변경 때만 다시 그린다.
     */
    if (pauseMenu.isOpen || evidenceJournal.isOpen || endEl.classList.contains('show')) {
      if (render && pausedRevision !== postfx.revision) {
        renderScene(0);
        pausedRevision = postfx.revision;
      }
      input.consumeMouseDelta();
      input.consumeWheel();
      input.endFrame();
      return;
    }
    pausedRevision = -1;
    gameClock.update(dt);
    if (truth.busy) village?.manor.showPastEcho(0.5);
    if (mirrorMemory.busy) village?.inn.showMirrorMemory(0.5);
    audioRegionT -= dt;
    if (audioRegionT <= 0) { audioRegionT = 0.5; syncAudioRegions(controller.position); }
    telemetry.update(dt, storyFlags.act);
    // AI가 비활성이어도 소음의 시계는 흘러야 한다. 프롤로그의 발소리가 나중에
    // 한꺼번에 들리거나 선택지 대기 중 배열에 계속 쌓이지 않게 한다.
    senses?.update(dt);
    // 히트스톱: 잠깐 세상을 느리게
    if (hitstop > 0) { hitstop -= dt; dt *= 0.12; }
    const uiOpen = invUI.isOpen || photoViewer.isOpen || palmSign.isOpen || evidenceJournal.isOpen || dialogue.choosing;
    // 시퀀서 활성 = 카메라·이동 입력을 가져간다 (B등급 연출, PLAN-STORY §8.2). 월드 시뮬은 계속 돈다
    const cine = sequencer.active || titleCard.classList.contains('show');
    const eventLocked = palmSign.isOpen || investigationsBusy() || mirrorMemory.busy || truth.busy || act17.running || (act3?.controlsLocked ?? false) || dialogue.choosing
      || wellQuestionPlaying || wellClimbInProgress || wellOutroPlaying || wellCinematicPlaying;
    // ACT 1: 조작은 살아 있고 카메라만 스토리 1인칭 리그가 가져간다 (컷신이 아니라 플레이 구간)
    const fpOn = firstPerson?.active ?? false;
    // 현재 시점의 방향과 카메라 상태를 그대로 유지하며 일반 플레이 1/3인칭을 바꾼다.
    // 스토리 1인칭·컷신·이벤트가 카메라를 소유한 동안에는 입력을 받지 않는다.
    if (input.justPressed('KeyP') && started && !uiOpen && !cine && !eventLocked && !fpOn
      && !tpCam.inIntro && deathT <= 0) {
      const view = tpCam.toggleView();
      toast(view === 'first'
        ? L('1인칭 · 미오 시점', '一人称 · ミオ視点')
        : L('3인칭 시점', '三人称視点'));
    }
    const gameplayFpOn = !cine && !fpOn && tpCam.isFirstPerson;
    if (cine) sequencer.update(dt);
    dialogue.update(dt);
    quests.update(dt);
    hudRoot.classList.toggle('cine', cine || fpOn);   // ACT 1 은 HUD 없이 — 목표조차 없던 밤이다
    // 우물 조약돌은 모바일 공격 버튼(J)도 공유한다. 물소리 기믹이 터치에서 사라지지 않게 한다.
    const throwWellPebble = !!village && !!wellWoman && wellWoman.state !== 'dormant'
      && village.wellShaft.inChamber(controller.position) && wellPebbles > 0
      && !uiOpen && !cine && !eventLocked && (input.justPressed('KeyJ') || input.justPressed('KeyG'));
    if (throwWellPebble) {
      const look = camera.getWorldDirection(new THREE.Vector3());
      const target = village!.wellShaft.waterPointInDirection(controller.position, look);
      village!.wellShaft.throwPebble(controller.position, target);
      wellPebbles--;
      renderHud();
    }
    // 공격 입력 (인벤토리 열려 있으면 무시). 우물에서는 같은 J가 조약돌에 우선한다.
    if (!throwWellPebble && combat && !uiOpen && !cine && !eventLocked
      && (input.justPressed('KeyJ') || (input.locked && input.justPressed('Mouse0')))) combat.tryAttack(controller);
    combat?.update(dt, controller);
    // 입력 → 캐릭터
    const axis = uiOpen || cine || eventLocked ? { x: 0, y: 0 } : input.moveAxis();
    // ACT 1 은 "달리는 것 말고 할 게 없다" — 뒷걸음질(S)로 추격자에게 걸어가는 것만 막는다.
    // moveAxis 는 전방이 +y 다 (W = +1)
    if (fpOn && axis.y < 0) axis.y = 0;
    // 넘어져 있는 동안·도착한 뒤에는 조작을 받지 않는다 (ACT 1 이 스스로 정한다)
    if (fpOn && act1) { const m = act1.moveScale; axis.x *= m; axis.y *= m; }
    if (act2) { axis.x = 0; axis.y = 0; }   // ACT 2a 는 좌석에 앉아 있다 — 걸어 나갈 곳이 없다
    // ACT 3: 비석 낭독 시작부터 마지막 대사가 끝날 때까지 이동 입력을 완전히 잠근다.
    if (act3) { const m = act3.moveScale; axis.x *= m; axis.y *= m; }
    if (combat && combat.moveScale < 1) { axis.x *= combat.moveScale; axis.y *= combat.moveScale; }
    const shift = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const wellWadeMul = village?.wellShaft.inChamber(controller.position)
      ? THREE.MathUtils.clamp(1 - Math.max(0, village.wellShaft.chamber.waterY - village.wellShaft.chamber.floorY - 0.16) * 0.48, 0.76, 1)
      : 1;
    // 스태미나 (기획 3.4): 달리기 6 s, 회복 8 s(정지 1.5×). 소진되면 30% 찰 때까지 못 달린다
    let wantRun = isVillage ? shift && !crouching : !shift;
    if (isVillage) {
      const st = settings.stamina;
      const moving = axis.x !== 0 || axis.y !== 0;
      const running = wantRun && moving && stamina > 0 && !exhausted;
      if (running) stamina = Math.max(0, stamina - dt);
      else stamina = Math.min(st.max, stamina + dt * (st.max / st.recover) * (moving ? 1 : st.standingBonus));
      if (stamina <= 0) exhausted = true;
      if (exhausted && stamina > st.max * 0.3) exhausted = false;
      wantRun = running && !exhausted;
      // 숨소리: 게이지가 빌수록 거칠게. ACT 1 은 스태미나가 아니라 스크립트가 숨을 몬다(`act1.ts`)
      if (!fpOn) sfx.breath(exhausted ? 1 : (1 - stamina / st.max) * 0.85, dt);
      const full = stamina >= st.max - 0.01;
      staminaEl.classList.toggle('show', !full);
      staminaFill.style.width = `${(stamina / st.max) * 100}%`;
      staminaEl.classList.toggle('low', exhausted);
    }
    controller.update(dt, {
      axis,
      // ACT 1 은 시선이 아니라 **길**을 기준으로 달린다. 시선을 쓰면 참배로가 굽는 만큼
      // 계속 어긋나 62 m 를 달리는 동안 길에서 8 m 벗어난다(실측). 손을 잡힌 아이는
      // 자기가 방향을 정하지 않으므로 이쪽이 연출에도 맞다 — 고개만 자유롭게 돌아간다
      cameraYaw: fpOn ? firstPerson!.forwardYaw : tpCam.headingYaw,
      // 마을(공포)에서는 기본이 걷기, Shift 가 달리기(스태미나) — 초원에서는 반대(v0.8 그대로)
      // ACT 1 은 목숨 걸고 달리는 장면이다 — 스태미나·걷기 규칙을 적용하지 않는다
      walk: fpOn ? false : isVillage ? !wantRun : shift,
      crouch: isVillage && crouching,
      // ACT 1 은 **도주**다 — 장면이 속도를 정한다 (`act1.ts` 의 SPEED_MUL)
      speedMul: (fpOn && act1 ? act1.speedMul : 1) * wellWadeMul,
      // 점프: 마을에서도 허용하되 낮게(1.05 m). 웅크림 중 Space 는 점프가 아니라 일어서기
      // 시퀀스 중 Space 는 스킵 홀드라 점프에 주지 않는다
      jumpPressed: !uiOpen && !cine && !eventLocked && !fpOn && !crouching && input.justPressed('Space'),
      jumpHeld: !cine && !eventLocked && !fpOn && !crouching && input.isDown('Space'),
    });
    physics.step(dt);
    dummies?.update(dt);

    // --- 요괴 ---
    if (hunters.length && senses && matsuri && village && yokaiActive && !inGraveyardHollow() && !dialogue.choosing && !palmSign.isOpen && !act17.running && !mirrorMemory.busy && !truth.busy && !investigationsBusy()) {
      if (deathT > 0) {
        // 사망 연출: 3 s 후 리스폰
        deathT -= dt;
        if (deathT <= 0) {
          controller.teleport(spawn);
          for (const h of hunters) h.reset();
          dorotabo?.reset();
          // 사망 = 들고 있던 공물만 원위치(강탈 규칙, §3.2·§6.1). 봉납 진행은 유지 (§6.2)
          rules?.dropCarried(); renderHud();
          stamina = settings.stamina.max; exhausted = false; crouching = false;
          deathEl.classList.remove('show');
        }
      } else {
        const spot = hiding?.evaluate(controller.position, crouching, controller.horizontalSpeed) ?? null;
        const tr = hiding?.transition();
        if (tr === 'in') sfx.hideIn();
        else if (tr === 'out') sfx.hideOut();
        hiddenEl.classList.toggle('show', spot !== null);
        for (const h of hunters) h.update(dt, controller.position, controller.horizontalSpeed, hiding?.hiddenFor(h) ?? false);
        hunterPaths.update();
        if (dorotabo) {
          dorotabo.update(dt, controller.position, controller.horizontalSpeed);
          if (dorotabo.pushVelocity.lengthSq() > 0.01) controller.externalPush.copy(dorotabo.pushVelocity);
        }
      }
      // 가장 가까운 요괴가 소리·근접 신호의 근원
      let nearest = hunters[0]!;
      let nd = Infinity;
      for (const h of hunters) {
        const dd = h.position.distanceTo(controller.position);
        if (dd < nd) { nd = dd; nearest = h; }
      }
      matsuri.update(dt, nearest.position, camera, nd);
      // 초칭 깜빡임 = 위협 근접도 (24 m 부터 서서히, 4 m 에서 최대)
      if (chochin) chochin.threat = THREE.MathUtils.clamp((24 - nd) / 20, 0, 1);
      scares?.update(dt, controller.position, camera, chochin?.threat ?? 0);
      // 규칙: 수집 수 → 난이도 (요괴 쪽 입력만 여기서 — `rules.update` 자체는 밖에서 돈다)
      if (rules) {
        const crouchMul = crouching ? settings.ai.crouchDetection : 1;
        for (const h of hunters) { h.chaseSpeedOverride = rules.hunterSpeed; h.detectionMul = rules.detectionMul * crouchMul; }
      }
    }
    // ⚠️ 공물 규칙은 **요괴와 무관하게** 돌아야 한다. 이게 요괴 블록 안에 있어서
    //    `?yokai=on` 이 아니면 줍기 프롬프트가 아예 안 떴다 — 붉은 구에 다가가도 아무 일이 없었다
    if (rules && deathT <= 0) rules!.update(dt, controller.position);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('show'); }
    // 오래 안 쓰면 칼집으로
    if (equipment?.hasWeapon) equipment.setDrawn(combat!.sinceLastAttack < 8);
    // 낙사/익사 방지
    const killY = village ? village.killY : island ? island.waterLevel - 1.6 : -20;
    const hollowRecovery = village?.graveyard.hollow.recoverPosition(controller.position);
    if (hollowRecovery) controller.teleport(hollowRecovery);
    if (controller.position.y < killY) controller.teleport(spawn);
    water?.update(dt);
    props?.update();
    grass?.update(dt);
    village?.update(dt, controller.position, tpCam.inIntro ? tpCam.introProgress : 1);
    /**
     * 손거울 — **누르고 있는 동안만** 든다. 토글이면 계속 켜 두고 다녀서 「대조」가 아니라 미니맵이 된다.
     * 렌더는 든 프레임에만 돈다(내리면 비용 0). 여관 안에서만 의미가 있으므로 씬도 그때만 넘긴다.
     */
    if (village) {
      const canMirror = inventory.has('wakyo') && village.inn.contains(controller.position) && deathT <= 0;
      // 여관을 나가거나 UI 가 열리면 강제로 내린다 — 반사뷰의 씬은 여관 안에만 존재한다
      if (wakyoView.active && (!canMirror || uiOpen || cine)) wakyoView.toggle(false);
      if (canMirror && !uiOpen && !cine && input.justPressed('KeyV')) wakyoView.toggle();
      /**
       * ---- 금기 三: 거울 속 인파의 시선 (§5.3.5 · §5.5) ----
       * 와쿄를 든 동안에만 일어난다 — 거울을 내리면 그들은 없는 것과 같다.
       * 인파에 2.2 m 안으로 들어가면 **돌아보고 이름을 부른다**. 6초 안에 [E] 를 누르면 위반.
       * 프롬프트를 띄우는 것 자체가 이 시스템이다 — 문서 표현대로 「UI(=히간누시)가 버튼을 들이민다」.
       */
      if (wakyoView.active && gazeIdx < 0 && !cine && !uiOpen && !eventLocked) {
        village.innInterior.crowdSpots.forEach((sp2, i) => {
          if (gazeDone.has(i) || gazeIdx >= 0) return;
          // 2.2 m — 방이 12×9 라 3.5 로는 옆방 인파까지 닿아 이벤트가 연쇄된다(실측)
          if (controller.position.distanceTo(sp2) > 2.2) return;
          gazeIdx = i; gazeT = 6;
          answerPos.copy(sp2);
          village.innInterior.watch(i, controller.position);
          renderPrompt();
          sfx.callName(sp2.x, sp2.y, sp2.z, { gain: 0.9 });
          tpCam.shake(0.18);
        });
      }
      if (gazeIdx >= 0) {
        gazeT -= dt;
        // 거울을 내리거나 시간이 다하면 — **참은 것이다.** 아무 일도 일어나지 않는 것이 보상이다
        if (gazeT <= 0 || !wakyoView.active) {
          village.innInterior.unwatch(gazeIdx);
          gazeDone.add(gazeIdx);
          gazeIdx = -1;
          renderPrompt();
        }
      }
      // 위반의 여파 — 여관 전체가 화재로 점멸한다(퇴로를 외우게 만드는 10초)
      if (innFireT > 0) {
        innFireT -= dt;
        const f = Math.max(0, Math.min(1, innFireT / 10));
        dreadEl.style.opacity = String(0.35 + 0.5 * f * (0.6 + 0.4 * Math.sin(performance.now() * 0.024)));
        if (innFireT <= 0) dreadEl.style.opacity = '0';
      }
      mirrorHintEl.classList.toggle('hidden', !canMirror);
      if (canMirror) {
        mirrorHintEl.textContent = wakyoView.active
          ? L('와쿄 너머를 보며 걷는 중', '和鏡越しに歩いている')
          : L('[V] — 와쿄를 본다', '[V] — 和鏡をかざす');
        mirrorHintEl.classList.toggle('on', wakyoView.active);
        /**
         * 벽거울 앞에서는 **다음에 누를 키**를 말한다. 키가 둘(V=든다 · E=상호작용)이라
         * 순서를 화면이 알려 주지 않으면 헷갈린다(실측: 「단축키는 V 인데 E 를 누르라고?」).
         * V 는 아이템을 드는 것이고 E 는 이 게임 전체의 상호작용이다 — 초칭을 든 채 문을 E 로 여는 것과 같다.
         */
        const sp = village.innInterior.secretPos;
        const near = Math.hypot(controller.position.x - sp.x, controller.position.z - sp.z) < 2.6;
        if (near) {
          const returning = controller.position.x > sp.x;
          mirrorHintEl.textContent = !returning && innCaseActive()
            ? L('먼저 손님의 짐표와 피난도를 대조하자', '先に客の荷札と避難図を照合しよう')
            : wakyoView.active
              ? returning ? L('안쪽 벽거울을 마주 보고 [E] — 객실로 돌아간다', '内側の壁鏡を向いて [E] — 客室へ戻る')
                : L('벽거울을 마주 보고 [E] — 거울 방으로 건너간다', '壁鏡を向いて [E] — 鏡の間へ渡る')
              : L('벽에 거울이 있다 — [V] 로 와쿄를 든다', '壁に鏡がある — [V] で和鏡をかざす');
          mirrorHintEl.classList.add('on');
        }
      }
    }
    // ACT 12 미로 — 게다를 얻기 전엔 묘지 밖으로 나가는 길이 없다(§5.3.4).
    // **요괴 갱신 블록 밖이어야 한다**: 그쪽은 `yokaiActive && hunters.length` 게이트라
    // 파수꾼이 아직 안 깬 상태에서는 통째로 건너뛴다 — 미로가 조용히 죽어 있었다(실측).
    // 되돌린 자리의 지면 높이는 다시 잡는다: 묘지는 flatten 0.55 라 반대편 고도가 다르다
    if (village && rules && started && deathT <= 0 && !cine && !uiOpen && !eventLocked && !dialogue.busy) {
      if (graveyardPassage.needsFarewell) {
        void graveyardPassage.resumeFarewell().catch(e => console.warn('[graveyard farewell]', e)).finally(renderHud);
      } else {
        const gp = village.graveyard.gazePoint;
        const nearGate = !inGraveyardHollow() && rules.stateOf('geta') === 'open'
          && (graveyardCase.complete || evidence.has('graveyard:palm'))
          && Math.abs(controller.position.y - gp.y) < 1.1
          && Math.hypot(controller.position.x - gp.x, controller.position.z - gp.z) < 0.95;
        graveyardGateHold = nearGate ? graveyardGateHold + dt : 0;
        if (graveyardGateHold >= 0.55) {
          graveyardGateHold = 0;
          void graveyardPassage.enter().catch(e => console.warn('[graveyard passage]', e)).finally(renderHud);
        }
      }
    } else graveyardGateHold = 0;
    if (village?.graveyard.mazeActive && !inGraveyardHollow() && !cine && !uiOpen && !eventLocked && !graveyardPassage.busy) {
      const back = village.graveyard.loopCheck(controller.position, dt);
      if (back) {
        back.y = village.heightAt(back.x, back.z) + 0.1;
        controller.teleport(back);
      }
    }
    rain?.update(dt, camera.position);
    timeOfDay?.update(dt);
    // 조사·ACT 3~4·생활 흔적은 **현재의 마을**에서만 돈다. ACT 1 은 10년 전 그 밤이고
    // 참배로를 달리는 동안 비석 옆을 지나간다 — 게이트를 안 걸면 프롤로그 중에
    // 「비석을 닦는다」 프롬프트가 뜨고, 빈집 TV 잡음이 빗속에서 같이 난다 (실제로 그랬다)
    if (deathT <= 0 && !cine && !eventLocked && !fpOn) {
      inspect?.update(controller.position, dt, input.isDown('KeyE'));
      const hold = inspect?.holdProgress ?? 0;
      promptAnchor.style.setProperty('--prompt-hold', `${Math.round(hold * 360)}deg`);
      promptAnchor.classList.toggle('holding', hold > 0);
    } else {
      promptAnchor.style.setProperty('--prompt-hold', '0deg');
      promptAnchor.classList.remove('holding');
    }
    crows?.update(dt, controller.position);
    sfx.updateNight(dt);
    ambience?.update(dt, controller.position, camera);

    // 카메라 — 좁은 공간에서는 거리·피치를 명시적으로 조인다
    //   토리이 통로: 빔이 화면을 가로지르지 않게 / 실내: 벽에 밀려 캐릭터에 코를 박지 않게
    if (village) {
      const inTunnel = village.inToriiCorridor(controller.position);
      const indoors = village.isIndoors(controller.position);
      // 토리이가 1.5 배로 커지며 통로도 넓어졌다(기둥 안쪽 3.9 m) → 카메라를 예전만큼 조일 이유가 없다
      tpCam.constrainDistance = indoors ? 2.0 : inTunnel ? 2.6 : null; // 실내 확장(15×11)에 맞춰 1.55 → 2.0
      tpCam.constrainPitch = indoors ? 0.42 : inTunnel ? 0.20 : null;
    }
    const mouse = input.consumeMouseDelta();
    const wheel = input.consumeWheel();
    // 이 프레임의 조사 업데이트에서 비석 이벤트가 막 시작됐을 수 있으므로 상태를 다시 읽는다.
    const cameraLocked = eventLocked || (act3?.controlsLocked ?? false);
    // 시퀀스 중엔 시퀀서가 카메라를 쓴다 — 마우스·휠은 소비만 하고 버린다 (끝났을 때 튀지 않게)
    if (fpOn) firstPerson!.update(dt, uiOpen || cameraLocked ? { x: 0, y: 0 } : mouse, controller);
    else if (!cine && !wellCinematicPlaying) tpCam.update(dt, uiOpen || cameraLocked ? { x: 0, y: 0 } : mouse, uiOpen || cameraLocked ? 0 : wheel, controller.position, controller.horizontalSpeed, controller.grounded);
    controlsTutorial?.update(dt, controller.position, {
      cameraReady: !tpCam.inIntro && !cine,
      lookDelta: uiOpen || cameraLocked ? 0 : Math.abs(mouse.x) + Math.abs(mouse.y),
      running: shift && (axis.x !== 0 || axis.y !== 0),
      inventoryOpen: invUI.isOpen,
    });
    act1?.update(dt);
    bus?.update(dt);
    if (!cine && !fpOn) {
      if (village && rules) {
        /**
         * 목표 지시자는 **구역이 바뀔 때만** 다시 그린다(매 프레임 renderHud 는 낭비다).
         * ⚠️ 그래서 이 목록에 빠진 건물은 **들어가도 실내 안내로 안 바뀐다** — 폐여관·저택이
         * 빠져 있었다(코드 감사에서 발견). 지시자 실내 분기를 다섯 구역으로 늘렸으면
         * 이 목록도 같이 늘어나야 한다. 둘은 **한 몸**이다.
         */
        const p2 = controller.position;
        const nextGuideZone = village.crypt.contains(p2)
          ? p2.x > village.crypt.gatePos.x + 1.1 && p2.z > village.crypt.entryTop.z - 1.1 ? 'crypt-shaft' : 'crypt-corridor'
          : inGraveyardHollow() ? 'graveyard-hollow'
          : village.wellShaft.inChamber(p2) ? 'well'
          : village.schoolInterior.contains(p2) ? 'school'
            : village.hokora.contains(p2) ? 'hokora'
              : village.inn.contains(p2) ? 'inn'
                // 저택은 **두 층**이다 — 지하로 내려가면 안내가 바뀌어야 하므로 층까지 구역으로 센다
                : inManorArchive() ? 'archive'
                  : village.manor.contains(p2) ? 'manor'
                    : village.graveyard.contains(p2, 18) ? 'graveyard' : 'field';
        if (nextGuideZone !== guideZone) {
          guideZone = nextGuideZone;
          renderHud();
        }
      }
      act3?.update(dt);
      act4?.update(dt, controller.position);
      // --- 방울이 운다 (금기 一 예습, §5.3.1) — 방울을 든 채 달리면 걸음마다 울린다.
      // 사당 안에서는 로쿠로쿠비의 활주 압박을 높이고, 밖에서는 파수꾼이 듣는다(소음 이벤트)
      {
        const carryingSuzu = rules?.carried.includes('suzu') ?? false;
        const running = controller.horizontalSpeed > 2.6 && !crouching;
        // 방울 발소리는 ACT 6 사당 추격의 탐지 규칙이다. 툇마루 탈출선을 넘긴 뒤에도
        // 소지 여부만 보고 울리면 마을 전체가 계속 보스전처럼 들린다.
        const hokora = village?.hokora;
        const insideRokuroTrial = !!hokora
          && hokora.contains(controller.position)
          && controller.position.x <= hokora.chaseArena.escapeX;
        const ringing = carryingSuzu && running && insideRokuroTrial;
        if (ringing) {
          suzuRingT -= dt;
          if (suzuRingT <= 0) {
            suzuRingT = 0.30;
            sfx.suzuRing(0.5);
            senses?.emitNoise(controller.position, 18);
          }
        } else suzuRingT = 0;
        rokuro?.update(dt, controller.position, {
          speed: controller.horizontalSpeed,
          moving: axis.x !== 0 || axis.y !== 0,
          crouching,
          ringing,
        });
        if (village && rules?.stateOf('geta') === 'open' && !village.graveyard.mazeActive
          && village.graveyard.contains(controller.position, 14.5)) {
          village.graveyard.beginHaunt();
          // 중간 저장은 미로와 아이들을 되살리되 이미 본 첫 대사는 반복하지 않는다.
          if (!graveyardPreludeHeard) {
            graveyardPreludeHeard = true;
            sfx.voice(0.34, 'girl');
            void dialogue.say(
              { text: L('공기놀이 돌이 부딪히는 소리. 묘석 사이의 작은 길 표식들이 서로 다른 방향으로 옮겨 간다.', 'お手玉の石がぶつかる音。墓石の間の小さな道標が、別々の方向へ移っていく。') },
              { who: L('아이 1', '子供 1'), text: L('누나도 죽었어?', 'お姉ちゃんも死んだの?') },
              { who: L('아이 2', '子供 2'), text: L('누나는 언제 죽었어?', 'お姉ちゃんはいつ死んだの?') },
              { who: L('아이 3', '子供 3'), text: L('왜 아직 살아 있어?', 'どうしてまだ生きてるの?') },
            );
          }
          // 미로의 규칙은 대사가 아니라 **지장의 시선**으로 가르친다. 다만 한 줄은 필요하다 —
          // 「움직이는 것은 전부 거짓」이 없으면 플레이어는 표식을 따라가는 것이 정답인 줄 안다
          village.graveyard.onLoop = (n) => {
            sfx.voice(0.3, 'girl');
            if (n === 1) void dialogue.say(
              { text: L('묘열을 벗어났는데 — 같은 묘열이다.', '墓列を抜けたはずなのに — 同じ墓列だ。') },
            );
            else if (n === 2) void dialogue.say(
              { text: L('붉은 천을 감은 묘석. 아까 그 돌이다.', '赤い布を巻いた墓石。さっきの石だ。') },
              { who: MIO_NAME, text: L('웃음소리가 나는 쪽으로 가면…… 계속 여기로 돌아온다.', '笑い声のする方へ行くと……ずっとここに戻ってくる。') },
            );
            else if (n === 4) void dialogue.say(
              { who: MIO_NAME, text: L('움직이는 건 전부 거짓말이야. 움직이지 않는 건…… 지장님.', '動くものは全部うそ。動かないのは……お地蔵さま。') },
              { text: L('여섯 지장이 하나같이 같은 곳을 보고 있다.', '六体の地蔵が、そろって同じ方を見ている。') },
            );
          };
        }
        if (!schoolPreludeHeard && village && rules?.stateOf('kushi') === 'open'
          && village.schoolInterior.contains(controller.position)) {
          schoolPreludeHeard = true;
          village.schoolInterior.setFlicker(0.42);
          village.schoolInterior.hauntDoor();
          setTimeout(() => village?.schoolInterior.setFlicker(0), 1700);
          const villageCallback = evidence.has('inference:village-mimic')
            ? [{ who: MIO_NAME, text: L('풍경의 쪽지와 같아. 이름을 불러도 대답하면 안 된다고 했어.', '風鈴の短冊と同じ。名を呼ばれても返事をするなって。') }]
            : evidence.has('inference:village-simultaneous')
              ? [{ who: MIO_NAME, text: L('이 방송도 10년 전 그 순간에서 끊기지 못한 거야.', 'この放送も十年前のあの瞬間から途切れられないんだ。') }]
              : evidence.has('inference:village-sealed')
                ? [{ who: MIO_NAME, text: L('학교 안에 남은 목소리야. 밖에서 부르는 것처럼 들리게 하고 있어.', '校内に残った声だ。外から呼んでいるように聞かせてる。') }]
                : [];
          void (async () => {
            await dialogue.say(
              { who: L('교내 방송', '校内放送'), text: L('나츠메…… [잡음].', '夏目…… [雑音]。') },
              { who: L('교내 방송', '校内放送'), text: L('[잡음], 대답해.', '[雑音]、返事をして。') },
              { text: L('복도 끝의 교실 문이 저절로 조금 열린다.', '廊下の端の教室の戸が、ひとりでに少し開く。') },
              ...villageCallback,
            );
            const response = await dialogue.choose(
              L('끊어진 출석 방송이 아직 대답을 기다리고 있다.', '途切れた出席放送が、まだ返事を待っている。'),
              [L('입을 다문다', '黙っている'), L('“네”라고 대답한다', '「はい」と答える')],
            );
            if (response === 0) {
              yuri?.configureResponse(false);
              rememberEvidence('school:response-silent');
              await dialogue.say(
                { text: L('대답하지 않는다. 복도 끝에서부터 형광등이 하나씩 꺼진다.', '答えない。廊下の端から蛍光灯が一つずつ消える。') },
                { who: MIO_NAME, text: L('저건 유리를 부르는 목소리가 아니야.', 'あれはユリを呼ぶ声じゃない。') },
              );
            } else {
              storyFlags.answered += 1;
              rememberEvidence('school:response-answered');
              const p = village!.schoolInterior.broadcastPos;
              village!.schoolInterior.pulseBroadcast(2.8);
              village!.schoolInterior.setFlicker(0.88);
              sfx.callName(p.x, p.y, p.z, { gain: 0.9 });
              tpCam.shake(0.45);
              yuri?.provokeByAnswer(controller.position);
              await dialogue.say(
                { who: MIO_NAME, text: L('……네.', '……はい。') },
                { text: L('대답이 스피커를 타고 되돌아온다. 복도 끝의 학생이 고개를 든다.', '返事がスピーカーを通って戻る。廊下の端の生徒が顔を上げる。') },
                { who: '???', text: L('그건…… 네 이름이 아니야.', 'それは……あなたの名前じゃない。') },
              );
            }
          })();
        }
        const inSchool = !!village && village.schoolInterior.contains(controller.position);
        // ACT 9은 크레용을 읽는 순간이 아니라, 머리빗을 들고 폐교를 빠져나온 뒤 기억이 되돌아오는 장면이다.
        // 단서는 이미 필수라 놓칠 수 없고, 경계 통과를 한 번만 기록해 세이브/재진입 중복도 막는다.
        const recalledOnExit = schoolWasInside && !inSchool && !!rules?.carried.includes('kushi')
          && evidence.has('school:crayon') && !evidence.has('school:crayon-recalled');
        if (recalledOnExit) {
          rememberEvidence('school:crayon-recalled');
          setStoryAct(storyFlags, 9);
          saveCheckpoint();
          sfx.bellAfterimage(0.16);
          void dialogue.say(
            { text: L('학교 문을 넘는 순간, 벽장 안 크레용 글씨가 다시 떠오른다.', '校舎の戸を越えた瞬間、戸棚のクレヨン文字が蘇る。') },
            { text: L('「언니가 조용히 하라고 했다. 엄마 목소리도 가짜라고 했다.」', '「お姉ちゃんが静かにしてって言った。お母さんの声も偽物だって言った。」') },
            { who: MIO_NAME, text: L('푸른 원피스…… 사진 속 나와 같아.', '青いワンピース……写真のわたしと同じ。') },
            { text: L('가방 속 가족사진의 모서리가 차갑게 젖어 있다.', '鞄の家族写真の角が、冷たく濡れている。') },
          );
          toastEl.textContent = L('가족사진을 다시 확인할 수 있다  ·  Tab', '家族写真をもう一度確認できる  ·  Tab');
          toastEl.classList.add('show'); toastT = 4.5;
        }
        schoolWasInside = inSchool;
        const schoolHidden = !!yuri && yuri.state !== 'dormant' && crouching
          && controller.horizontalSpeed < 0.3 && village!.schoolInterior.inHideCloset(controller.position);
        hiddenEl.classList.toggle('show', schoolHidden || hiding?.spot !== null);
        // 유리 — 단서 조사 중의 약한 출현(haunt)도 학교 경계를 넘지 않는다.
        if (yuri && yuri.state !== 'dormant' && village && !village.school.contains(controller.position)) {
          const wasStalking = yuri.state === 'stalk';
          yuri.deactivate();
          if (wasStalking) {
            toastEl.textContent = recalledOnExit
              ? L('형광등이 죽었다  ·  가족사진을 다시 확인할 수 있다  ·  Tab', '蛍光灯が死んだ  ·  家族写真をもう一度確認できる  ·  Tab')
              : L('형광등이 죽었다. 학교가 조용하다.', '蛍光灯が死んだ。校舎が静かだ。');
            toastEl.classList.add('show'); toastT = recalledOnExit ? 4.5 : 3.0;
          }
        } else if (!dialogue.choosing) yuri?.update(dt, controller.position, camera, controller.body, schoolHidden);
      }
      // 폰을 한 번이라도 켰으면 플래그로 남긴다 — 공고판의 마지막 한 줄이 이걸 읽고,
      // 세이브에도 실려야 로드 뒤에 그 줄이 사라지지 않는다
      if (phone.seen && !storyFlags.phone) storyFlags.phone = true;
      lifesigns?.update(dt, controller.position, camera);
    }
    // 대면 숏에서도 스킨 애니메이션은 돌리고 추격·포획만 동결한다.
    if (wellClimbInProgress && dialogue.choosing) village?.wellShaft.showFalseHaru(1.5);
    wellWoman?.update(dt, controller.position, rules?.carried.includes('coins') ?? false,
      cine || fpOn || wellCinematicPlaying || dialogue.choosing);
    act2?.update(dt);
    village?.torii.update(camera.position); // 카메라가 확정된 뒤 코앞의 토리이를 접는다
    updateAudioSpace(dt);                    // 리스너가 확정된 뒤 존·오클루전 갱신
    watchLights(dt);
    popups.update();

    // --- 길안내 HUD (목표 지시자 · 팻말 읽어 주기 · Esc 안내) ---
    // 정보 우선순위: 대사 > 가까운 상호작용 > 장거리 목표·팻말.
    const guideOn = !cine && !fpOn && !uiOpen && !dialogue.busy && deathT <= 0;
    const inspectWins = !!(inspect?.hasInputPriority && inspectPrompt) || (!rulesPrompt && !!inspectPrompt);
    const interactionTarget = gazeIdx >= 0 ? answerPos
      : inspectWins ? inspect?.targetPosition ?? null
        : rulesPrompt ? rules?.targetPosition ?? null : null;
    const interactionLift = gazeIdx >= 0 ? 1.45 : inspectWins ? inspect?.targetMarkerLift ?? 0.62 : 0.62;
    const interactionShown = placeInteractionPrompt(
      promptAnchor, promptLine, interactionTarget,
      guideOn && promptAnchor.classList.contains('show'),
      interactionLift,
    );
    // 가까이 다가가 E 안내가 붙으면 같은 자리를 가리키던 장거리 목표 링은 잠시 양보한다.
    waypoint.update(camera, controller.position, guideOn && settings.hud.waypoint && !interactionShown, viewRect);
    const swordPromptVisible = !!worldSword && controller.position.distanceTo(swordSpot) <= 2.2 && guideOn;
    promptEl.classList.toggle('hidden', !swordPromptVisible);
    placeInteractionPrompt(promptEl, swordPromptLine, worldSword ? swordSpot : null, swordPromptVisible, 0.58);
    hudRoot.classList.toggle('interaction-active', interactionShown || swordPromptVisible);
    hudRoot.classList.toggle('dialogue-active', dialogue.busy);
    if (village && guideOn && settings.hud.signRead && !interactionShown) {
      // 가장 가까운 **기둥**을 고르고 그 기둥의 판자를 전부 읽어 준다 (한 기둥에 두 장인 곳이 있다)
      let bestD = Infinity, bx = 0, bz = 0;
      for (const b of village.signposts.boards) {
        const d = b.pos.distanceTo(controller.position);
        if (d < bestD) { bestD = d; bx = b.pos.x; bz = b.pos.z; }
      }
      const near = bestD < 7;
      if (near) {
        const html = village.signposts.boards
          .filter((b) => b.pos.x === bx && b.pos.z === bz)
          .map((b) => `${bearingGlyph(b.toward.x - controller.position.x, b.toward.y - controller.position.z, tpCam.headingYaw)}  ${b.text}`)
          .join('<br>');
        if (signReadEl.innerHTML !== html) signReadEl.innerHTML = html;
      }
      signReadEl.classList.toggle('show', near);
    } else signReadEl.classList.remove('show');
    if (escHintT > 0) { escHintT -= dt; if (escHintT <= 0) escHintEl.classList.remove('show'); }

    // 시각
    animator?.update(dt, controller);
    if (combat?.attacking && model) {
      // 모캡 공격 클립은 자세가 이미 정확하므로 Tripo 클립용 머리·척추 보정을 끈다
      model.spinePitchTarget = 0;
      model.headPitchTarget = 0;
    }
    // 웅크림 자세(CrouchPose, postPose 훅) + 카메라 피벗 낮춤
    crouchPose?.setTarget(crouching ? 1 : 0);
    if (isVillage) tpCam.pivotDrop = crouching ? 0.5 : 0;
    visual.update(dt, controller);
    // 발소리는 믹서·절차 포즈가 모두 적용된 같은 프레임의 발 접지 위치로 판정한다.
    animator?.updateFootsteps(controller);
    chochin?.update(dt, controller.yaw, controller.horizontalSpeed);
    if (faceFill) faceFill.update(controller.position, camera.position, settings.fill.levelMul[settings.chochin.level] ?? 1);
    {
      const c = settings.camera;
      const t = (tpCam.currentDistance - c.minCollisionDistance) / Math.max(0.01, c.fadeDistance - c.minCollisionDistance);
      // 미오 모델은 한 장의 스킨 메시라 머리만 따로 끄면 치마·가방까지 잘린다.
      // 실제 1인칭 카메라일 때만 몸을 통째로 숨기고, 컷신은 사용자의 시점 설정보다 우선한다.
      visual.setVisibility(fpOn || gameplayFpOn ? 0 : t);
    }
    shadowTarget.copy(controller.position);
    lightPool?.update(dt, camera.position, losslessGpu ? camera : undefined);
    sky.follow(shadowTarget, dt);
    physics.updateDebug(scene, settings.render.showColliders);

    if (prewarmFrame >= 0 && prewarmFrame < PREWARM_SEQ.length && chochin) {
      chochin.setLevel(PREWARM_SEQ[prewarmFrame]!);
      prewarmFrame++;
      if (prewarmFrame >= PREWARM_SEQ.length) {
        chochin.setLevel(settings.chochin.level || 2);
        // 프리워밍이 끝나야 손에서 뗀다 (각색 6 C안). 먼저 숨기면 「불 켜진 초칭」 셰이더 변형이
        // 안 구워져 획득 순간에 히치가 난다 — 그게 하필 튜토리얼 순간이다
        chochin.setHeld(storyFlags.chochin);
      }
    }
    if (render) renderScene(dt);
    input.endFrame();

    if (import.meta.env.DEV) {
      const dbg = (window as unknown as { __dbg?: { trace?: unknown[] } }).__dbg;
      if (dbg?.trace) dbg.trace.push({ dt: +dt.toFixed(4), spd: +controller.horizontalSpeed.toFixed(2), vy: +controller.velocity.y.toFixed(2), y: +controller.position.y.toFixed(3), g: controller.grounded });
    }

    // HUD
    // 튜토리얼은 포인터락 뒤에도 남아야 한다. 기존 안내는 클릭하는 순간 사라져 읽을 틈이 없었다.
    const tutorialHint = !!controlsTutorial?.active && !tpCam.inIntro && started;
    hint.classList.toggle('hidden', tutorialHint ? false : input.locked || tpCam.inIntro || !started || hintExpired);
    if (debug) statsEl.textContent =
      `${fpsShown.toFixed(0)} fps\n` +
      `speed ${controller.horizontalSpeed.toFixed(2)} m/s  ${controller.grounded ? 'ground' : 'air'}\n` +
      `pos ${controller.position.x.toFixed(1)}, ${controller.position.y.toFixed(1)}, ${controller.position.z.toFixed(1)}\n` +
      (lightPool ? `${lightPool.debugLine()} · gpuopt ${losslessGpu ? 'on' : 'off'}\n` : '') +
      (gpuTimer.available ? `gpu ${gpuTimer.ms.toFixed(2)} ms · dyn ${Math.round(adaptiveRenderScale * 100)}%\n` : '') +
      `${telemetry.debugLine()}\n` +
      (rokuro ? `rokuro ${rokuro.state}  ${rokuro.root.position.x.toFixed(1)}, ${rokuro.root.position.z.toFixed(1)}\n` : '') +
      L('H: 튜닝 패널(개발)', 'H: チューニング(開発)');
  }

  function renderScene(dt: number) {
    gpuTimer.begin();
    try {
      try {
        village?.applyInteriorVisibility(camera, scene, renderer.shadowMap.enabled);
        postfx.composer.render(dt);
      } finally { village?.restoreInteriorVisibility(); }
      // 와쿄 렌즈 — 현실 위에 원 거울만 따로 굽는다 (내리면 비용 0).
      // 초칭 빛을 거울 속에도 복사한다 — 반사에 내 등불이 없으면 조명이 「다른 세계」가 된다
      if (wakyoView.active && village) {
        const mc = village.innInterior.mirrorChochin;
        if (chochin) {
          chochin.light.getWorldPosition(mc.position);
          mc.intensity = chochin.light.intensity;
          mc.distance = chochin.light.distance;
          mc.decay = chochin.light.decay;
          mc.color.copy(chochin.light.color);
        }
        wakyoView.update(renderer, village.innInterior.mirrorScene, camera);
      }
    } finally {
      gpuTimer.end(); // 렌더 예외 뒤에도 열린 query가 다음 프레임까지 남지 않는다
    }
  }
  requestAnimationFrame(frame);
  if (import.meta.env.DEV) {
    const dbg = (window as unknown as { __dbg?: Record<string, unknown> }).__dbg;
    if (dbg) dbg['step'] = step;
  }
}

main().catch((err) => {
  console.error(err);
  (window as unknown as Record<string, unknown>)['__err'] = String(err?.stack ?? err);
  const el = document.getElementById('hint');
  if (el) el.textContent = `${L('초기화 실패', '初期化に失敗')}: ${err?.message ?? err}`;
});
