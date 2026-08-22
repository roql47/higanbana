import * as THREE from 'three';
import { createRenderer, createCamera } from '@/core/renderer';
import { createPostFX } from '@/core/postfx';
import { Physics } from '@/core/physics';
import { Input } from '@/core/input';
import { createTweaks } from '@/core/tweaks';
import { settings, applyDayPreset } from '@/core/settings';
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
import { CHARACTER, MIO } from '@/character/config';
import { ThirdPersonCamera } from '@/camera/thirdPerson';
import { detectQuality, effectivePixelRatio, saveQuality, lowerLevel, profileFor, QUALITY_LEVELS, type QualityLevel, type QualityProfile } from '@/core/quality';
import { setupTouch } from '@/core/touch';
import { Inventory } from '@/items/inventory';
import { InventoryUI } from '@/items/inventoryUI';
import { ITEMS } from '@/items/items';
import { Equipment } from '@/character/equipment';
import { Combat } from '@/character/combat';
import { Dummies } from '@/world/dummies';
import { Popups } from '@/ui/popups';
import { Props } from '@/world/props';
import { NavGrid } from '@/ai/navgrid';
import { Senses } from '@/ai/senses';
import { Hunter } from '@/ai/hunter';
import { Dorotabo } from '@/ai/dorotabo';
import { Matsuri } from '@/audio/matsuri';
import { Ambience } from '@/audio/ambience';
import type { ZoneName } from '@/audio/space';
import { Scares } from '@/world/village/scares';
import { Rules, type OfferingDef } from '@/game/rules';
import { Actions } from '@/game/actions';
import { Hiding } from '@/game/hiding';
import { Inspect } from '@/game/inspect';
import { Dialogue } from '@/story/dialogue';
import { Phone } from '@/story/phone';
import { PhotoViewer } from '@/story/photoViewer';
import { Quests } from '@/story/quests';
import { Sequencer } from '@/story/sequencer';
import { StorySave, defaultFlags } from '@/story/flags';
import { buildDemoSeq } from '@/story/demo';
import { playPrologue } from '@/story/prologue';
import { FirstPerson } from '@/story/firstPerson';
import { Sayo } from '@/story/sayo';
import { Pursuers } from '@/story/pursuers';
import { Lightning } from '@/world/lightning';
import { Bus } from '@/world/bus';
import { preparePhoto, photoThumb, photoThumbFromModel, loadPhotoFront } from '@/story/photo';
import type { Act2 } from '@/story/act2';
import type { Act1 } from '@/story/act1';
import { Act3 } from '@/story/act3';
import { Act4 } from '@/story/act4';
import { LifeSigns } from '@/world/higasato/lifesigns';
import { Rain } from '@/world/rain';
import { TimeOfDayController } from '@/world/timeOfDay';

interface CharacterVisual {
  update(dt: number, ctrl: CharacterController): void;
  setVisibility(v: number): void;
}

async function main() {
  const canvas = document.getElementById('app') as HTMLCanvasElement;
  const hint = document.getElementById('hint')!;
  const statsEl = document.getElementById('stats')!;
  const loadingEl = document.getElementById('loading')!;
  const loadingFill = document.getElementById('loading-fill')!;
  const loadingPct = document.getElementById('loading-pct')!;
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

  // --- 배포 하위 경로 보정: 코드 곳곳의 '/models/…' 류 절대 경로를 BASE_URL 로 리라이트 ---
  // (GitHub Pages 는 /higanbana/ 하위라 루트 절대 경로가 404 난다. 개발 서버는 BASE_URL='/' 라 무변화)
  const BASE = import.meta.env.BASE_URL;
  if (BASE !== '/') {
    THREE.DefaultLoadingManager.setURLModifier((url) =>
      url.startsWith('/') && !url.startsWith(BASE) && !url.startsWith('//') ? BASE + url.slice(1) : url);
  }
  const withBase = (u: string) => (BASE !== '/' && u.startsWith('/') ? BASE + u.slice(1) : u);
  // 프롤로그 스킵: ?skip=intro (개발 중 반복 재생을 피한다).
  // **로드 전에** 정해져야 한다 — 건너뛸 프롤로그의 에셋(사요)까지 읽을 이유가 없다
  const skipIntro = new URLSearchParams(location.search).get('skip') === 'intro';

  // --- 로딩 진행률 (three 의 기본 LoadingManager 를 모든 로더가 공유) ---
  let loadedItems = 0, totalItems = 0;
  const setProgress = (p: number) => { loadingFill.style.width = `${Math.round(p * 100)}%`; loadingPct.textContent = `${Math.round(p * 100)}%`; };
  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => { loadedItems = loaded; totalItems = total; setProgress(0.1 + 0.85 * (total ? loaded / total : 0)); };
  THREE.DefaultLoadingManager.onError = (url) => console.warn('[load] 실패:', url);
  setProgress(0.03);

  const renderer = createRenderer(canvas);
  let quality = detectQuality(renderer.getContext());
  renderer.setPixelRatio(effectivePixelRatio(quality, window.innerWidth, window.innerHeight));
  settings.render.shadowRadius = quality.shadowRadius;
  console.info('[quality]', quality.level, quality);
  const scene = new THREE.Scene();
  const camera = createCamera();

  // --- 스토리 상태 + 체크포인트 저장 (PLAN-STORY S0). 재개 흐름은 스토리 챕터와 함께 연결한다 ---
  const storyFlags = defaultFlags();
  const storySave = new StorySave();

  const physics = await Physics.create();

  // --- 씬: 기본은 마을(공포). ?scene=sandbox = v0.8 초원 섬, ?scene=playground = 테스트 지형 ---
  // 기본 씬 = 스토리 맵 히가사토. ?scene=village 는 기존 공포 맵(v0.12) 그대로, sandbox/playground 는 v0.8 초원
  const sceneName = new URLSearchParams(location.search).get('scene') ?? 'higasato';
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
    village = new Higasato(scene, physics, tex, { riceBudget: Math.round(quality.grassCount * 0.8), treeBudget: Math.round(700 * quality.treeScale) });
    await village.loadAssets();
    spawn.copy(village.spawn);
    if (new URLSearchParams(location.search).get('at') === 'house') {
      spawn.copy(village.house.entrance);
      spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
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

  const sfx = new Sfx();
  void sfx.preload(); // 샘플(public/audio) 선로드 — 로딩 바에 같이 잡힌다. 없으면 프로시저럴 폴백
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
  try {
    const head = await fetch(withBase(characterCfg.url), { method: 'HEAD' });
    if (head.ok && (head.headers.get('content-type') ?? '').includes('gltf')) {
      model = await CharacterModel.load(characterCfg, renderer);
      scene.remove((visual as PlaceholderCharacter).root);
      scene.add(model.root);
      visual = model;
      if (model.clipNames.includes('idle')) model.play('idle', 0);
      if (model.clipNames.length > 0) {
        animator = new CharacterAnimator(model, {
          onFootstep: (foot, speed) => {
            // 1인칭 구간에서는 몸이 보이지 않고 클립 배속도 잘려 있어 소리가 어긋난다 —
            // 그때는 카메라 흔들림에 물린 `FirstPerson.onStep` 이 대신 낸다
            if (firstPerson?.active) return;
            sfx.footstep(speed, surfaceAt(controller.position), foot);
            // 발소리 = 소음 이벤트. 논물 첨벙은 반경 2배 (기획 3.4)
            const base = crouching ? settings.ai.noiseCrouch : speed > 2.5 ? settings.ai.noiseRun : settings.ai.noiseWalk;
            const inWater = surfaceAt(controller.position) === 'water';
            senses?.emitNoise(controller.position, base * (inWater ? 2 : 1));
          },
          onJump: () => sfx.jump(),
          onLand: (impact) => sfx.land(impact),
        });
      }
      console.info('[character] loaded', characterCfg.url, 'clips:', model.clipNames);
    }
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
      sayo = await Sayo.load(scene, { url: withBase('/models/sayo.glb') });
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
  /** ACT 4 의 생활 흔적 — 김 나는 찻잔·TV·젖은 게다·풍경·골목 끝의 사람 */
  let lifesigns: LifeSigns | null = null;
  /**
   * ACT 2a 의 무대 — **지형 밖(y +300)** 에 세운 자립 세트.
   * 히가사토에는 버스가 달릴 길이 없어서, 버스는 서 있고 창밖이 흐른다(`world/bus.ts`).
   */
  const bus = isVillage ? new Bus(scene) : null;
  void bus?.load();   // 좌석·핸들·손잡이를 Tripo GLB 로 (ACT 2 시작 전에만 오면 된다)
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
  let actions: Actions | null = null;
  let hiding: Hiding | null = null;
  let inspect: Inspect | null = null;
  let crouching = false;
  let stamina = settings.stamina.max;
  let exhausted = false; // 소진 후 30% 이상 회복해야 다시 달릴 수 있다
  const staminaEl = document.createElement('div'); staminaEl.className = 'stamina';
  staminaEl.innerHTML = '<div class="stamina-fill"></div>';
  document.getElementById('hud')!.appendChild(staminaEl);
  const staminaFill = staminaEl.querySelector('.stamina-fill') as HTMLElement;
  const saltEl = document.createElement('div'); saltEl.className = 'salt-count';
  document.getElementById('hud')!.appendChild(saltEl);
  const hiddenEl = document.createElement('div'); hiddenEl.className = 'hidden-badge'; hiddenEl.textContent = '숨었다';
  document.getElementById('hud')!.appendChild(hiddenEl);
  // 우상단 미션 패널: 현재 목표 한 줄 + 공물 체크리스트 (단계 변화 시 renderHud 가 갱신)
  const missionEl = document.createElement('div'); missionEl.className = 'mission';
  missionEl.innerHTML = '<div class="mission-title">목표</div><div class="mission-goal"></div><ul class="mission-list"></ul>';
  document.getElementById('hud')!.appendChild(missionEl);
  const missionGoal = missionEl.querySelector('.mission-goal') as HTMLElement;
  const missionList = missionEl.querySelector('.mission-list') as HTMLElement;
  // 하단: 프롬프트 라인만 (공물 칩은 미션 패널로 이동)
  const hudEl = document.createElement('div'); hudEl.className = 'game-hud';
  hudEl.innerHTML = '<div class="prompt-line"><span class="prompt-text"></span><i class="prompt-bar"></i></div>';
  document.getElementById('hud')!.appendChild(hudEl);
  const promptLine = hudEl.querySelector('.prompt-line') as HTMLElement;
  const promptText = hudEl.querySelector('.prompt-text') as HTMLElement;
  // 꾹 누르기 게이지 (ACT 3 의 비석 닦기) — 프롬프트 줄 아래에 깔린다
  const promptBar = hudEl.querySelector('.prompt-bar') as HTMLElement;
  // 프롬프트는 두 출처(공물 rules / 조사 inspect)가 한 줄을 나눠 쓴다 — rules 우선
  let rulesPrompt: string | null = null;
  let inspectPrompt: string | null = null;
  const renderPrompt = () => {
    const t = rulesPrompt ?? inspectPrompt;
    promptText.textContent = t ?? '';
    promptLine.classList.toggle('show', !!t);
  };
  // --- 스토리 시스템 (PLAN-STORY S0): 자막 · 퀘스트 보이스(목표 문구를 넘겨받는다) · 시퀀서 ---
  const hudRoot = document.getElementById('hud')!;
  const dialogue = new Dialogue();
  // 「전기가 죽는다」 — 씬에 아무것도 안 넣는 DOM 한 장 (각색 6 C안)
  const phone = new Phone();
  const quests = new Quests(missionGoal);
  const sequencer = new Sequencer(camera, dialogue);
  const endEl = document.createElement('div'); endEl.className = 'ending';
  document.body.appendChild(endEl);
  const toastEl = document.createElement('div'); toastEl.className = 'pickup-toast'; document.body.appendChild(toastEl);
  let toastT = 0;
  /** 받침침 조사(을/를) — 이름 끝 글자의 받침 유무 */
  const eul = (w: string) => {
    const c = w.charCodeAt(w.length - 1);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '을' : '를';
  };
  /** 스토리 진행 단계 (S1): 비석을 읽었는가 — 석판(퀘스트 개시) 전까지의 목표 문구를 가른다 */
  let tabletRead = false;
  const renderHud = () => {
    if (!rules) return;
    // 목표 문구 = 히간누시의 명령문 (PLAN-STORY §4.1 — UI 가 히간누시다)
    if (rules.fudaRefused) {
      // ACT 17 — 글리치 시퀀스가 목표를 잡고 있다. 여기서 덮지 않는다
    } else if (!rules.started) {
      quests.set(tabletRead ? '마을 한가운데의 제단으로 가라' : '참배로를 따라 마을로 들어가라', 'gm');
    } else if (rules.carrying) {
      const def = rules.offerings.find((o) => o.id === rules!.carried[0])!;
      quests.set(`${def.name}${eul(def.name)} 제단으로 가져와라`, 'gm');
    } else {
      const avail = rules.available();
      const GOALS: Record<string, string> = {
        suzu: '오래된 사당을 조사하라', kushi: '폐교를 조사하라', coins: '공동우물을 조사하라',
        geta: '공동묘지를 조사하라', kagami: '폐여관을 조사하라', fuda: '촌장의 저택을 조사하라',
      };
      if (avail.length >= 2) quests.set('공동묘지와 폐여관을 조사하라', 'gm');
      else if (avail.length === 1) quests.set(GOALS[avail[0]!] ?? '공물을 찾아라', 'gm');
      else quests.set(`7개의 공물을 찾아라  <b>${rules.offered}</b> / 7`, 'gm');
    }
    // 체크리스트 7행 — 일곱 번째(사요)는 끝까지 '？？？'
    missionList.innerHTML = rules.offerings.map((o) => {
      const st = rules!.stateOf(o.id);
      const label = st === 'offered' ? '봉납' : st === 'carried' ? '운반 중' : st === 'open' ? o.where : '─';
      const cls = st === 'offered' ? 'got' : st === 'carried' ? 'carry' : st === 'locked' ? 'lock' : '';
      return `<li class="${cls}" style="--c:#${o.color.toString(16).padStart(6, '0')}"><span class="dot"></span><span class="nm">${o.name}</span><span class="where">${label}</span></li>`;
    }).join('');
    missionEl.classList.toggle('done', rules.fudaRefused);
  };
  if (village) {
    const g = village.ground;
    const vv = village;
    const onGround = (v: THREE.Vector3) => { v.y = g.heightAt(v.x, v.z); return v; };
    // --- 7공물 — 위치는 스토리 고정 (PLAN-STORY §2.1, 각색 1·5. 랜덤화는 폐기) ---
    // `model`·`size` 는 실물 소품(Tripo). 없으면 발광 구슬 자리표시자가 남는다.
    // `size` = **가장 긴 변**(m). 실물 치수에 맞춘다 — 아이 게다 18 cm · 얼레빗 12 cm · 손거울 20 cm
    const offerings: OfferingDef[] = [
      { id: 'suzu', name: '붉은 방울', where: '오래된 사당', color: 0xff4a3c, pos: vv.hokora.suzuPos.clone(), model: '/models/props/offer-suzu.glb', size: 0.12 },
      { id: 'kushi', name: '붉은 머리빗', where: '폐교', color: 0xe06a8a, pos: vv.school.inner.clone(), model: '/models/props/offer-kushi.glb', size: 0.12 },
      { id: 'coins', name: '동전 세 닢', where: '공동우물', color: 0xd8c25e, pos: onGround(vv.well.pos.clone().add(new THREE.Vector3(1.3, 0, -0.9))), model: '/models/props/offer-coins.glb', size: 0.09 },
      { id: 'geta', name: '아이의 게다', where: '공동묘지', color: 0xd08a4a, pos: onGround(new THREE.Vector3(-37, 0, 10.5)), model: '/models/props/offer-geta.glb', size: 0.18 },
      { id: 'kagami', name: '깨진 거울', where: '폐여관', color: 0x9ac8e0, pos: vv.inn.inner.clone(), model: '/models/props/offer-kagami.glb', size: 0.20 },
      { id: 'fuda', name: '제문과 봉인패', where: '촌장의 저택', color: 0xc05a2a, pos: vv.manor.inner.clone(), model: '/models/props/offer-fuda.glb', size: 0.28 },
      { id: 'sayo', name: '？？？', where: '', color: 0x8a8a9a, pos: null },
    ];
    // 봉납 판정 = 받침대 반원의 석판
    rules = new Rules(scene, offerings, vv.pedestals.slabPos, {
      onPrompt: (t) => { rulesPrompt = t; renderPrompt(); },
      onPickup: (o, _carried) => {
        renderHud(); sfx.pickup();
        toastEl.textContent = `${o.name}${eul(o.name)} 손에 넣었다`;
        toastEl.classList.add('show'); toastT = 3.0;
        // 공물이 운다 — 줍는 순간 큰 소음 이벤트 = 운반 구간의 시작 (§3.2)
        senses?.emitNoise(controller.position, 26);
        if (o.id === 'suzu') {
          void dialogue.say(
        { text: '어린아이의 손이 같은 방울을 집는다 — 기억이 스친다.' },
        { who: '미오', text: '방금…… 뭐였지?' },
        { text: '사당 밖에서, 무언가가 이쪽으로 고개를 돌렸다.' },
          );
        }
      },
      onOffer: (o, n, slot) => {
        sfx.offer(); matsuri?.onOffered(); renderHud();
        vv.pedestals.place(slot, o.color, rules!.cloneModel(o.id));
        // 신사 아래에서 여자 목소리가 숫자를 센다 (ACT 7~)
        const count = ['하나', '둘', '셋', '넷', '다섯'][n - 1];
        if (count) void dialogue.say({ who: '땅 밑', text: `……${count}.` });
        // 봉인 해제 단계별 월드 반응 (PLAN-STORY §1.2) — S1 은 텍스트·AI 반응까지, 비주얼은 후속
        const stage: Record<number, string> = {
          1: '땅이 울렸다. 마을 어딘가에서 오래 잠긴 문이 열리는 소리가 났다.',
          2: '본전 문 안쪽에서 손톱으로 긁는 소리가 난다.',
          4: '본전 문에 작은 틈이 생겼다.',
          5: '마을의 공기가 달라졌다 — 어디에도 안전한 길이 없다.',
        };
        if (stage[n]) { toastEl.textContent = stage[n]!; toastEl.classList.add('show'); toastT = 4.2; }
        // **본전 문이 계기판이다** (PLAN-STORY P3-1). 위 자막이 말한 것을 문이 실제로 한다 —
        // 봉납 2 에 금줄이 삭고, 4 에 틈이 벌어지고, 그 뒤에 흰 손이 든다.
        // 자막만 있고 물건이 안 변하면 그건 알림이지 세계가 아니다
        if (vv.shrine) vv.shrine.honden.setStage(n >= 5 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0);
        if (n === 3) {
          // ACT 11 — 방송 두 목소리 충돌. 플레이어가 처음 의심하는 지점
          void dialogue.say(
            { who: '방송', text: '주민 여러분께 알려드립니다. 공물이 세 개 사라졌습니다.' },
            { who: '방송', text: '발견 즉시 원래 장소로 돌려놓으십시오. 공물을 제단으로 옮기지 마십시오.' },
            { who: '방송', text: '……제단으로 가져오십시오.' },
          );
        }
        if (n === 4 && hunters[1]) {
          // 여우 요괴가 마을로 내려온다 (§1.2 — 봉납 4)
          const a: THREE.Vector3[] = [];
          for (const z of [60, 35, 10, -12, -35]) { const rp = g.roadAt(g.sAtZ(z)); a.push(new THREE.Vector3(rp.x, 0, rp.z)); }
          a.push(new THREE.Vector3(31, 0, 30));
          hunters[1].setAnchors(a);
          toastEl.textContent += '  …토리이 쪽에서 방울 소리가 난다';
        }
        // 봉납 = 자동 체크포인트 (§6.2). 재개 흐름은 스토리 챕터에서 연결한다
        storyFlags.offered = n;
        storySave.checkpoint(storyFlags, { offered: [...rules!.offeredSet] });
      },
      onFudaRefused: () => {
        // ACT 17 — 받침대가 봉인패를 받지 않는다 → UI 3단 변조 (수직 슬라이스의 끝)
        renderHud();
        void (async () => {
          await dialogue.say(
            { text: '받침대가 봉인패를 받지 않는다.' },
            { who: '미오', text: '……왜 안 놓이지?' },
          );
          await quests.glitchTo('마지막 공물을 찾아라', 'gm', 1.0);
          await new Promise((r) => setTimeout(r, 700));
          await quests.glitchTo('마지막 봉인을 없애라', 'gm', 1.2);
          await new Promise((r) => setTimeout(r, 700));
          await quests.glitchTo('나를 꺼내줘', 'gm', 1.6);
          await dialogue.say({ who: '???', text: '미오.' }, { who: '???', text: '여기까지 잘 왔구나.' });
          endEl.innerHTML = '<div class="ending-title">彼岸</div><div class="ending-sub">1부 수직 슬라이스는 여기까지 — 신사 지하는 다음 빌드에서.</div><div class="ending-hint">R — 처음부터</div>';
          endEl.classList.add('show');
        })();
      },
    });
    rules.onChange = renderHud;
    renderHud();
    actions = new Actions(scene, asGround(g), senses!, sfx);
    hiding = new Hiding(asVillage(village));
    saltEl.textContent = '소금 × ' + actions.salt;

    // --- ACT 3 「세 가지 금기」 · ACT 4 「끝나지 않은 축제」 (story/act3.ts, act4.ts) ---
    act3 = new Act3({
      tablet: vv.tablet, ground: vv.ground, dialogue, sfx, cam: tpCam,
      // 위치·바라보는 방향·속도를 **참조로** 넘긴다 — ACT 3 이 비석/목소리 쪽으로 몸을 돌린다
      body: controller,
      setDread: (v) => { dreadEl.style.opacity = String(v); },
      // 「플레이어는 아직 모르지만, 미오는 게임 시작 직후 세 번째 금기를 어겼다」
      onViolate: () => { storyFlags.answered++; },
      onDone: () => {
        tabletRead = true;
        storyFlags.chapter = 'act04';
        storySave.checkpoint(storyFlags);
        renderHud();
      },
    });
    act4 = new Act4({
      speakers: vv.speakers, dialogue, sfx, phone, player: controller.position,
      // ACT 3 이 도는 중에는 방송을 미룬다. 비석 앞에서 「미오야」를 듣는 동안
      // 머리 위에서 안내방송이 겹치면 둘 다 죽는다
      ready: () => !(act3?.running ?? false),
      onDone: () => { storyFlags.chapter = 'act05'; storySave.checkpoint(storyFlags); },
    });
    // 생활 흔적은 상시 월드다 — 스크립트가 아니라 **걷다가 스치는 것**이라야 한다.
    // (Scares 와 같은 이유로 main 에서 만든다: 월드 소품인데 sfx 가 필요하다)
    lifesigns = new LifeSigns(scene, vv.ground, vv.hamlet, sfx);

    // --- 조사 지점 (PLAN-STORY §4): 돌비석(ACT 3) · 공고판(ACT 4) · 석판(ACT 5 퀘스트 개시) ---
    inspect = new Inspect((t) => { inspectPrompt = t; renderPrompt(); });
    inspect.add({
      // 「플레이어가 표면을 닦으면 글자가 나타난다」 — 한 번의 E 가 아니라 **꾹**. 2.4 초 동안
      // 이끼가 위에서부터 벗겨지고, 마지막에 드러나는 문장이 세 번째 금기다
      id: 'tablet', pos: vv.tablet.pos, radius: 2.4, prompt: '비석을 닦는다', once: true,
      hold: 2.4,
      onHold: (p) => act3!.wipe(p),
      onUse: () => { act3!.begin(); },
    });
    inspect.add({
      // 「방송 장치에 적힌 날짜는 10년 전 피안제 당일이다」
      id: 'notice', pos: vv.speakers.noticePos, radius: 2.2, prompt: '공고문을 읽는다', once: true,
      enabled: () => tabletRead,
      onUse: () => {
        vv.speakers.reveal();
        void (async () => {
          await dialogue.say(
            { text: '종이는 새것처럼 빳빳하다. 풀이 아직 마르지 않았다.' },
            { text: '「彼ヶ里 秋季 彼岸祭 — 二〇一五年 九月 二十三日」' },
            { who: '미오', text: '……10년 전 날짜잖아.' },
            { who: '미오', text: '방금 금일이라고 했어. 오늘이라고.' },
            // 폰을 본 사람만 받는 줄. 「방송이 틀렸다」가 「오늘이 정말 그날이다」로 바뀐다.
            // 안 본 사람에게는 설명이 되므로 붙이지 않는다
            ...(phone.seen ? [{ who: '미오', text: '……내 폰도 9월 23일이었어.' }] : []),
          );
        })();
      },
    });
    inspect.add({
      // 미오는 **빈손으로 내렸다**(각색 6 C안). 이 게임의 빛은 여기서 손에 들어온다 —
      // 폐허의 처마에 아직 켜져 있는 남의 집 등불이다
      id: 'eave-chochin', pos: vv.eaveChochin.pos, radius: 2.0, prompt: '초칭을 든다', once: true,
      enabled: () => vv.eaveChochin.available,
      onUse: () => {
        vv.eaveChochin.take();
        chochin?.setHeld(true);
        chochin?.setLevel(2);
        sfx.lanternToggle(2);
        storyFlags.chochin = true;
        storySave.checkpoint(storyFlags);
        void (async () => {
          await dialogue.say(
            { who: '미오', text: '……빌릴게요.' },
            { text: '돌려줄 사람이 없다는 건, 알고 있다.' },
          );
          // 빛 3단은 이 게임의 난이도 다이얼이다. 가르칠 자리가 지금까지 없었다 —
          // 처음부터 들고 시작했으니까
          toast('Q — 초칭 밝기(끔 / 약 / 강). 밝을수록 멀리서도 보인다');
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
      id: 'honden', pos: vv.shrine.honden.pos, radius: 2.1, prompt: '본전 문을 밀어본다', once: false,
      hold: 1.2,
      onHold: (p) => vv.shrine.honden.push(p),
      onUse: () => {
        const h = vv.shrine.honden;
        h.refuse();
        const d = h.stage;
        void dialogue.say(
          d >= 2
            ? { who: '미오', text: '……틈은 있는데, 더는 안 열려.' }
            : { text: '안에서 잠겨 있다. 밖에는 걸쇠가 없다.' },
        );
      },
    });
    // 미는 동안 삐걱임 — 문이 간격을 정하고(누를수록 잦아진다) 소리는 여기서 낸다
    vv.shrine.honden.onCreak = (p) => {
      const hp = vv.shrine.honden.pos;
      sfx.doorPush(hp.x, hp.y + 1.1, hp.z, p);
    };
    inspect.add({
      id: 'slab', pos: vv.pedestals.slabPos, radius: 2.2, prompt: '석판을 읽는다', once: true,
      onUse: () => {
        void (async () => {
          await dialogue.say(
            { text: '「피안의 문을 열고자 하는 자여.」' },
            { text: '「일곱 공물을 모아 이곳에 바쳐라.」' },
            { text: '「그러면 돌아갈 길이 열리리라.」' },
            { who: '미오', text: '일곱 개를 모으면…… 여기서 나갈 수 있어.' },
          );
          rules!.begin();
          storyFlags.chapter = 'act06';
          renderHud();
          // **소리가 먼저, 자막이 나중.** 자막이 먼저 뜨면 「들었다」가 아니라 「들려줬다」가 된다.
          // 위치는 배전 마루 밑 — 방향이 들려야 「바닥 아래」가 성립하고,
          // 그 좌표가 ACT 18 의 지하 입구다 (PLAN-STORY P3-2)
          const uf = vv.shrine.underfloor;
          sfx.underfloorLaugh(uf.x, uf.y, uf.z, 0.5);
          await new Promise((r) => setTimeout(r, 700));
          await dialogue.say({ text: '신사 바닥 아래에서 아주 희미한 웃음소리가 들린 것 같다.' });
        })();
      },
    });
  }

  // --- 인벤토리 · 장비 · 전투 · 허수아비 (전투는 sandbox 전용) ---
  const inventory = new Inventory();
  const invUI = new InventoryUI(inventory);
  // 기록물 뷰어. 가족사진이 첫 물건이고, 뒤에 명부·일기·문서가 같은 창구를 쓴다 (PLAN-STORY P2)
  const photoViewer = new PhotoViewer();
  invUI.onUse = (id) => { if (id === 'photo') photoViewer.show(); };
  /**
   * 이야기가 물건을 쥐여 주는 창구. **중복은 막는다** — 인벤은 localStorage 에 남으므로
   * 두 번째 플레이에서 사진이 2 장이 된다
   */
  const give = (id: string) => {
    if (inventory.has(id)) return;
    if (!inventory.add(id)) return;
    const def = ITEMS[id];
    if (!def) return;
    toastEl.textContent = `${def.name}${eul(def.name)} 가방에 넣었다  ·  Tab 으로 열어 볼 수 있다`;
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
  promptEl.className = 'prompt hidden';
  promptEl.innerHTML = '<kbd>E</kbd> 검 줍기';
  document.getElementById('hud')!.appendChild(promptEl);

  const postfx = createPostFX(renderer, scene, camera, quality);
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
    quality: { current: quality.level, levels: QUALITY_LEVELS, onChange: (lv: QualityLevel) => { saveQuality(lv); applyQualityLive(profileFor(lv)); } },
  }, debug);

  // --- 단축키: R 리셋, M 음소거, F 전체화면 ---
  let muted = false;
  window.addEventListener('keydown', (e) => {
    // 사진을 펼쳐 든 동안은 어떤 키도 게임으로 내려보내지 않는다 — Esc 닫기 · Space 뒤집기
    if (photoViewer.key(e.code)) { e.preventDefault(); return; }
    const cine = sequencer.active; // 시퀀스 중엔 게임 입력을 받지 않는다 (Space 는 스킵 홀드)
    if (e.code === 'KeyE' && !cine && worldSword && controller.position.distanceTo(swordSpot) < 2.2) {
      worldSword.removeFromParent(); worldSword = null; promptEl.classList.add('hidden');
      inventory.add('sword');
      if (!inventory.mainhand) { const idx = inventory.slots.findIndex((s) => s.itemId === 'sword'); if (idx >= 0) inventory.equip(idx); }
      sfx.equip();
    }
    if (e.code === 'KeyQ' && chochin?.held && !invUI.isOpen && !cine) { chochin.cycle(); sfx.lanternToggle(chochin.level); }
    if (e.code === 'KeyE' && rules && deathT <= 0 && !cine && !firstPerson?.active) { if (!rules.interact(controller.position)) inspect?.interact(); }
    if (e.code === 'KeyC' && isVillage && !invUI.isOpen && !cine) crouching = !crouching;
    if (e.code === 'Space' && crouching && !cine) crouching = false; // 웅크림 중 스페이스 = 일어서기
    if (e.code === 'KeyG' && actions && deathT <= 0 && !cine) {
      const r = actions.throwSalt(controller.position, controller.yaw, hunters);
      if (r === -1) { toastEl.textContent = '소금이 없다'; toastEl.classList.add('show'); toastT = 1.6; }
      saltEl.textContent = '소금 × ' + actions.salt;
    }
    if (e.code === 'KeyR' && !cine) { controller.teleport(spawn); for (const h of hunters) h.reset(); dorotabo?.reset(); rules?.reset(); village?.pedestals.clear(); actions?.reset(); if (actions) saltEl.textContent = '소금 × ' + actions.salt; stamina = settings.stamina.max; exhausted = false; crouching = false; renderHud(); endEl.classList.remove('show'); }
    // T (debug): 시퀀서 데모 — S0 스택 검증용 (PLAN-STORY §8)
    if (e.code === 'KeyT' && debug && !cine && village && rules && deathT <= 0) {
      void sequencer.play(buildDemoSeq(village, quests)).then(() => renderHud());
    }
    if (e.code === 'KeyM') { muted = !muted; sfx.setMaster(muted ? 0 : settings.audio.master); }
    if (e.code === 'KeyF') { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }
  });

  // --- 런타임 품질 적용 + 적응형(느리면 자동 하향) ---
  function applyQualityLive(q: QualityProfile) {
    quality = q;
    onResize(); // 픽셀비는 창 크기에 따라 달라지므로 여기서 다시 계산된다
    postfx.applyQuality(q);
    settings.render.shadowRadius = q.shadowRadius;
    sky.setShadowMapSize(isVillage && !(q.moonShadow && settings.night.moonShadow) ? 0 : q.shadowMap);
    grass?.setBudget(q.grassCount);
    village?.paddy.setBudget(Math.round(q.grassCount * 0.8));
    chochin?.setShadowMapSize(q.shadowMap >= 3072 ? 1024 : 512);
  }
  const toast = (msg: string) => {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 20); setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 600); }, 4200);
  };
  let adaptT = 0, adaptAcc = 0, adaptN = 0, adaptChecks = 0;
  const adaptive = !new URLSearchParams(location.search).has('quality'); // URL 로 고정하면 적응 안 함
  function adaptiveQuality(dt: number) {
    if (!adaptive || !started || adaptChecks >= 3) return;
    adaptT += dt;
    if (adaptT < 2) return; // 시작 직후 2 s 는 무시(셰이더 컴파일·로딩)
    adaptAcc += dt; adaptN++;
    if (adaptAcc >= 3) { // 3 s 창
      const avg = adaptAcc / adaptN;
      adaptAcc = 0; adaptN = 0; adaptChecks++;
      // 상한이 걸려 있으면 그 상한을 기준으로 판단한다 (예: 30 fps 상한을 "느리다" 고 오해하지 않게)
      const cap = settings.render.maxFps;
      const slowMs = Math.max(0.024, cap > 0 ? (1 / cap) * 1.25 : 0);
      if (avg > slowMs) { // 상한 대비 25% 이상 느리면
        const next = lowerLevel(quality.level);
        if (next) {
          applyQualityLive(profileFor(next));
          saveQuality(next);
          toast(`프레임이 낮아 품질을 ${next} 로 낮췄습니다 (H 패널에서 변경 가능)`);
          adaptT = 0; // 변경 직후(셰이더 재컴파일 등) 2 s 는 다시 무시
        }
      } else adaptChecks = 3; // 충분히 빠르면 종료
    }
  }

  // --- 로딩 완료 → 시작 대기 → 진입 연출 ---
  setProgress(1);
  // 셰이더 사전 컴파일: 초칭 끔/약/강은 라이트 상태가 달라 셰이더 변형이 따로 컴파일된다.
  // 화면에 보인 재질만 컴파일되는 렌더 프리워밍으로는 부족해서(다른 곳에서 첫 끔 = 400 ms+ 히치),
  // compileAsync 로 **씬 전체 재질 × 3상태**를 로딩 화면 중에 끝내둔다.
  if (chochin) {
    loadingPct.textContent = '그림자를 준비하는 중…';
    // compileAsync 는 **그 카메라에 보이는 것만** 컴파일한다. 스폰 시야 밖의 재질
    // (요괴·먼 소품)이 빠져서 나중에 히치가 났다 → 컴파일 동안 대상들을 카메라 앞에 세워 둔다.
    const stash: { obj: THREE.Object3D; pos: THREE.Vector3 }[] = [];
    const front = camera.position.clone().add(new THREE.Vector3(0, 0, -6).applyQuaternion(camera.quaternion));
    for (const h of hunters) stash.push({ obj: h.root, pos: h.root.position.clone() });
    if (dorotabo) stash.push({ obj: dorotabo.root, pos: dorotabo.root.position.clone() });
    stash.forEach((s2, i) => s2.obj.position.set(front.x + (i - 1) * 2.2, front.y, front.z));
    // compileAsync 만으로는 그림자 유무 변형까지 못 잡는다(실측: 첫 끔에서 그림자 받는 재질 28개
    // 재컴파일 → 300~900 ms). 세 상태를 **실제로 한 프레임씩 렌더**해 확실히 굽는다.
    for (const lv of [2, 1, 0, 2, 1, 0]) {
      chochin.setLevel(lv);
      try { await renderer.compileAsync(scene, camera); } catch { /* 구형 브라우저 폴백 */ }
      postfx.composer.render(1 / 60);
      await new Promise((r) => setTimeout(r, 0)); // 프레임 양보 — 로딩 화면이 멈춘 것처럼 보이지 않게
    }
    for (const s2 of stash) s2.obj.position.copy(s2.pos);
    chochin.setLevel(2);
  }
  loadingPct.textContent = totalItems ? `${loadedItems}/${totalItems} 로드 완료` : '준비 완료';
  startBtn.hidden = false;
  let started = false;
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
    if (btn) btn.textContent = '프롤로그 건너뛰고 시작';
    const sub = document.querySelector('.loading-sub');
    if (sub) sub.innerHTML = '<b>?skip=intro</b> — 프롤로그를 건너뜁니다 · <a href="./" style="color:#ffc876">처음부터 하기</a>';
  }
  const titleCard = document.getElementById('title-card')!;
  const start = () => {
    if (started) return; started = true;
    prewarmFrame = chochin ? 0 : -1;
    sfx.unlock();
    if (isVillage) sfx.startNight();
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 1200);
    // ACT 1~2 프롤로그 → 끝나면 금줄 게이트 안쪽에서 플레이 시작 (PLAN-STORY §8.4)
    setYokaiActive(!(village && rain && !skipIntro));   // 프롤로그를 볼 때만 꺼둔다
    if (village && rain && !skipIntro) {
      hintExpired = true; // 연출 중엔 조작 힌트를 띄우지 않는다
      // ACT 2 의 가족사진 — 실제 씬(도리이 앞·낮)에서 로케 촬영. 프레임 루프 전이라 화면엔 안 보인다
      if (model && timeOfDay) {
        try {
          // 언니는 **사요 모델로** 찍는다 (없으면 photo.ts 가 미오 두 번으로 폴백)
          preparePhoto({ model, renderer, scene, village, timeOfDay, sister: sayo, hide: chochin ? [chochin.root, chochin.body] : [] });
        } catch (e) { console.warn('[photo]', e); }
      }
      void playPrologue({
        sequencer, dialogue, village, controller, rain, sfx, chochin, phone, sayo, give,
        fp: firstPerson!, pursuers: pursuers!, lightning: lightning!, bus: bus!, camera,
        setSurfaceOverride: (sf) => { surfaceOverride = sf; },
        setDread: (v) => { dreadEl.style.opacity = String(Math.min(0.95, v)); },
        setTime: (n, sec) => timeOfDay?.set(n, sec ?? 0),
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
          setYokaiActive(true);   // 현재로 돌아왔다 — 이제부터 마을에 요괴가 있다
          tpCam.startIntro(2.2);
          storyFlags.chapter = 'act03';
          hintExpired = false;
          setTimeout(() => { hintExpired = true; }, 16000);
        },
      }).catch((e) => { console.warn('[prologue]', e); sayo?.dispose(); firstPerson?.end(); pursuers?.end(); lightning?.end(); bus?.show(false); sfx.busEngine(false); surfaceOverride = null; dreadEl.style.opacity = '0'; setYokaiActive(true); });
    } else {
      tpCam.startIntro(3.4);
      setTimeout(() => { hintExpired = true; }, 14000); // 조작 힌트는 처음 잠깐만
      // 프롤로그를 건너뛰어도 **가방 안은 같아야 한다** — 사진은 ACT 2b 에서 넣는 물건이고,
      // 없으면 인벤 튜토리얼도 ACT 16·30 의 재열람도 자리를 잃는다.
      // 로케 촬영도 여기서 한 번 해 둔다(안 하면 뷰어가 그려진 폴백을 띄운다)
      if (isVillage && model && timeOfDay && village) {
        try {
          preparePhoto({ model, renderer, scene, village, timeOfDay, sister: sayo, hide: chochin ? [chochin.root, chochin.body] : [] });
        } catch (e) { console.warn('[photo]', e); }
      }
      // 프롤로그가 없으니 언니가 나올 자리도 없다 — 사진만 찍고 돌려준다
      sayo?.dispose();
      sayo = null;
      if (isVillage) give('photo');
    }
    /**
     * 가족사진의 인벤토리 아이콘 = **손에 쥔 그 물건**.
     *
     * ① 먼저 캔버스 사진을 줄여 넣는다 — 즉시 뜨는 폴백.
     * ② 곧이어 `photo-hands.glb`(사진을 쥔 두 손)를 정면에서 한 컷 찍어 갈아 끼운다.
     *    이모지(🖼️)도, 캔버스 도판도 「가방에 든 사진」으로는 안 읽혔다(사용자).
     * 인벤은 열 때마다 다시 그리므로 도중에 바뀌어도 문제없다.
     */
    try { ITEMS['photo']!.icon = photoThumb(); } catch (e) { console.warn('[photo] 아이콘 생성 실패', e); }
    void photoThumbFromModel(renderer)
      .then((url) => { ITEMS['photo']!.icon = url; if (invUI.isOpen) invUI.render(); })
      .catch((e) => console.warn('[photo] 모델 아이콘 실패 → 캔버스 축소본 유지', e));
    // 뷰어로 펼쳤을 때의 원판 — 사용자가 준 사진 한 장(`public/textures/photo-front.webp`)
    void loadPhotoFront()
      .catch((e) => console.warn('[photo] 원판 로드 실패 → 캔버스 사진 유지', e));
  };
  let hintExpired = false;
  startBtn.addEventListener('click', start);
  window.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') start(); }, { once: false });

  if (import.meta.env.DEV) {
    // 사진 아이콘 재단용 — 크롭/얼룩 위치를 큰 해상도로 확인할 때 쓴다
    (window as unknown as Record<string, unknown>)['__photoThumb'] = (size = 1024, damaged = 1) =>
      photoThumbFromModel(renderer, '/models/props/photo-hands.glb', size, damaged);
    (window as unknown as Record<string, unknown>)['__dbg'] = { controller, physics, tpCam, scene, settings, sky, postfx, input, camera, model, animator, sfx, island, water, inventory, equipment, combat, dummies, village, crows, chochin, faceFill, hunters, get hunter() { return hunters[0]; }, dorotabo, senses, matsuri, scares, rules, ambience, get actions() { return actions; }, get hiding() { return hiding; }, get crouching() { return crouching; }, setCrouch(v: boolean) { crouching = v; }, story: { quests, dialogue, sequencer, flags: storyFlags, save: storySave, phone, photoViewer, fp: firstPerson, pursuers, lightning, bus, get sayo() { return sayo; }, get act1() { return act1; }, get act2() { return act2; }, get act3() { return act3; }, get act4() { return act4; }, get lifesigns() { return lifesigns; }, get speakers() { return village?.speakers; } }, get navgrid() { return navgridRef; }, get timeOfDay() { return timeOfDay; }, get audioSpace() { return sfx.space; }, get audioZone() { return audioZone; } };
  }

  // --- 리사이즈 ---
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    // 픽셀비는 창 크기마다 다시 계산한다 — 전체화면으로 키우면 예산에 맞춰 자동으로 내려간다
    const pr = effectivePixelRatio(quality, w, h);
    if (Math.abs(renderer.getPixelRatio() - pr) > 0.001) renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    postfx.resize(w, h);
  }
  window.addEventListener('resize', onResize);
  onResize();

  // --- 루프 ---
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0, fpsShown = 0, fpsTimer = 0;
  const shadowTarget = new THREE.Vector3();

  function frame(now: number) {
    requestAnimationFrame(frame);
    // 프레임 상한: 아직 이를 때는 그리지 않고 돌려보낸다 (last 를 갱신하지 않아야 dt 가 이어진다).
    // 여유 2 ms 는 vsync 지터용 — 60 Hz 화면에서 상한 60 이 30 fps 로 반토막 나는 것을 막는다
    const cap = settings.render.maxFps;
    if (cap > 0 && now - last < 1000 / cap - 2) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 1 / 20) dt = 1 / 20; // 탭 전환 등 큰 dt 방지
    if (dt <= 0) return;
    if (import.meta.env.DEV && (window as unknown as { __dbg?: { paused?: boolean } }).__dbg?.paused) return; // 테스트용 일시정지
    adaptiveQuality(dt);
    step(dt, true);
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
  function step(dt: number, render = true) {
    // 히트스톱: 잠깐 세상을 느리게
    if (hitstop > 0) { hitstop -= dt; dt *= 0.12; }
    const uiOpen = invUI.isOpen || photoViewer.isOpen;
    // 시퀀서 활성 = 카메라·이동 입력을 가져간다 (B등급 연출, PLAN-STORY §8.2). 월드 시뮬은 계속 돈다
    const cine = sequencer.active || titleCard.classList.contains('show');
    // ACT 1: 조작은 살아 있고 카메라만 1인칭 리그가 가져간다 (컷신이 아니라 플레이 구간)
    const fpOn = firstPerson?.active ?? false;
    if (cine) sequencer.update(dt);
    dialogue.update(dt);
    quests.update(dt);
    hudRoot.classList.toggle('cine', cine || fpOn);   // ACT 1 은 HUD 없이 — 목표도 소금도 없던 밤이다
    // 공격 입력 (인벤토리 열려 있으면 무시)
    if (combat && !uiOpen && !cine && (input.justPressed('KeyJ') || (input.locked && input.justPressed('Mouse0')))) combat.tryAttack(controller);
    combat?.update(dt, controller);
    // 돌 던지기 (village, 포인터락 좌클릭)
    if (actions && !uiOpen && !cine && deathT <= 0 && input.locked && input.justPressed('Mouse0')) {
      actions.throwStone(controller.position, camera);
    }
    // 입력 → 캐릭터
    const axis = uiOpen || cine ? { x: 0, y: 0 } : input.moveAxis();
    // ACT 1 은 "달리는 것 말고 할 게 없다" — 뒷걸음질(S)로 추격자에게 걸어가는 것만 막는다.
    // moveAxis 는 전방이 +y 다 (W = +1)
    if (fpOn && axis.y < 0) axis.y = 0;
    // 넘어져 있는 동안·도착한 뒤에는 조작을 받지 않는다 (ACT 1 이 스스로 정한다)
    if (fpOn && act1) { const m = act1.moveScale; axis.x *= m; axis.y *= m; }
    if (act2) { axis.x = 0; axis.y = 0; }   // ACT 2a 는 좌석에 앉아 있다 — 걸어 나갈 곳이 없다
    // ACT 3: 이름이 불리면 발이 멈춘다. 조작을 끊는 게 아니라 **배율**이라 다시 풀린다
    if (act3) { const m = act3.moveScale; axis.x *= m; axis.y *= m; }
    if (combat && combat.moveScale < 1) { axis.x *= combat.moveScale; axis.y *= combat.moveScale; }
    const shift = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
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
      speedMul: fpOn && act1 ? act1.speedMul : 1,
      // 점프: 마을에서도 허용하되 낮게(1.05 m). 웅크림 중 Space 는 점프가 아니라 일어서기
      // 시퀀스 중 Space 는 스킵 홀드라 점프에 주지 않는다
      jumpPressed: !uiOpen && !cine && !crouching && input.justPressed('Space'),
      jumpHeld: !cine && !crouching && input.isDown('Space'),
    });
    physics.step(dt);
    dummies?.update(dt);

    // --- 요괴 ---
    if (hunters.length && senses && matsuri && village && yokaiActive) {
      senses.update(dt);
      if (deathT > 0) {
        // 사망 연출: 3 s 후 리스폰
        deathT -= dt;
        if (deathT <= 0) {
          controller.teleport(spawn);
          for (const h of hunters) h.reset();
          dorotabo?.reset();
          // 사망 = 들고 있던 공물만 원위치(강탈 규칙, §3.2·§6.1). 봉납 진행은 유지 (§6.2)
          rules?.dropCarried(); renderHud();
          actions?.reset(); if (actions) saltEl.textContent = '소금 × ' + actions.salt;
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
    if (rules && deathT <= 0) rules.update(dt, controller.position);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('show'); }
    // 오래 안 쓰면 칼집으로
    if (equipment?.hasWeapon) equipment.setDrawn(combat!.sinceLastAttack < 8);
    // 줍기 프롬프트
    if (worldSword) promptEl.classList.toggle('hidden', controller.position.distanceTo(swordSpot) > 2.2 || uiOpen);

    // 낙사/익사 방지
    const killY = village ? village.killY : island ? island.waterLevel - 1.6 : -20;
    if (controller.position.y < killY) controller.teleport(spawn);
    water?.update(dt);
    props?.update();
    grass?.update(dt);
    village?.update(dt, controller.position);
    rain?.update(dt, camera.position);
    timeOfDay?.update(dt);
    // 조사·ACT 3~4·생활 흔적은 **현재의 마을**에서만 돈다. ACT 1 은 10년 전 그 밤이고
    // 참배로를 달리는 동안 비석 옆을 지나간다 — 게이트를 안 걸면 프롤로그 중에
    // 「비석을 닦는다」 프롬프트가 뜨고, 빈집 TV 잡음이 빗속에서 같이 난다 (실제로 그랬다)
    if (deathT <= 0 && !cine && !fpOn) {
      inspect?.update(controller.position, dt, input.isDown('KeyE'));
      promptBar.style.width = `${(inspect?.holdProgress ?? 0) * 100}%`;
    }
    crows?.update(dt, controller.position);
    sfx.updateNight(dt);
    ambience?.update(dt, controller.position, camera);

    // 카메라 — 좁은 공간에서는 거리·피치를 명시적으로 조인다
    //   토리이 통로: 빔이 화면을 가로지르지 않게 / 실내: 벽에 밀려 캐릭터에 코를 박지 않게
    if (village) {
      const inTunnel = village.inToriiCorridor(controller.position);
      const indoors = village.isIndoors(controller.position);
      tpCam.constrainDistance = indoors ? 2.0 : inTunnel ? 1.95 : null; // 실내 확장(15×11)에 맞춰 1.55 → 2.0
      tpCam.constrainPitch = indoors ? 0.42 : inTunnel ? 0.20 : null;
    }
    const mouse = input.consumeMouseDelta();
    const wheel = input.consumeWheel();
    // 시퀀스 중엔 시퀀서가 카메라를 쓴다 — 마우스·휠은 소비만 하고 버린다 (끝났을 때 튀지 않게)
    if (fpOn) firstPerson!.update(dt, uiOpen ? { x: 0, y: 0 } : mouse, controller);
    else if (!cine) tpCam.update(dt, uiOpen ? { x: 0, y: 0 } : mouse, uiOpen ? 0 : wheel, controller.position, controller.horizontalSpeed, controller.grounded);
    act1?.update(dt);
    bus?.update(dt);
    if (!cine && !fpOn) {
      act3?.update(dt);
      act4?.update(dt, controller.position);
      // 폰을 한 번이라도 켰으면 플래그로 남긴다 — 공고판의 마지막 한 줄이 이걸 읽고,
      // 세이브에도 실려야 로드 뒤에 그 줄이 사라지지 않는다
      if (phone.seen && !storyFlags.phone) storyFlags.phone = true;
      lifesigns?.update(dt, controller.position, camera);
    }
    act2?.update(dt);
    village?.torii.update(camera.position); // 카메라가 확정된 뒤 코앞의 토리이를 접는다
    updateAudioSpace(dt);                    // 리스너가 확정된 뒤 존·오클루전 갱신
    watchLights(dt);
    popups.update();

    // 시각
    animator?.update(dt, controller);
    if (combat?.attacking && model) {
      // 모캡 공격 클립은 자세가 이미 정확하므로 Tripo 클립용 머리·척추 보정을 끈다
      model.spinePitchTarget = 0;
      model.headPitchTarget = 0;
    }
    actions?.update(dt, surfaceAt);
    // 웅크림 자세(CrouchPose, postPose 훅) + 카메라 피벗 낮춤
    crouchPose?.setTarget(crouching ? 1 : 0);
    if (isVillage) tpCam.pivotDrop = crouching ? 0.5 : 0;
    visual.update(dt, controller);
    chochin?.update(dt, controller.yaw, controller.horizontalSpeed);
    if (faceFill) faceFill.update(controller.position, camera.position, settings.fill.levelMul[settings.chochin.level] ?? 1);
    {
      const c = settings.camera;
      const t = (tpCam.currentDistance - c.minCollisionDistance) / Math.max(0.01, c.fadeDistance - c.minCollisionDistance);
      visual.setVisibility(fpOn ? 0 : t);   // 1인칭에서는 내 몸이 보이면 안 된다
    }
    shadowTarget.copy(controller.position);
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
    if (render) postfx.composer.render(dt);
    input.endFrame();

    if (import.meta.env.DEV) {
      const dbg = (window as unknown as { __dbg?: { trace?: unknown[] } }).__dbg;
      if (dbg?.trace) dbg.trace.push({ dt: +dt.toFixed(4), spd: +controller.horizontalSpeed.toFixed(2), vy: +controller.velocity.y.toFixed(2), y: +controller.position.y.toFixed(3), g: controller.grounded });
    }

    // HUD
    hint.classList.toggle('hidden', input.locked || tpCam.inIntro || !started || hintExpired);
    fpsAcc += 1 / dt; fpsN++; fpsTimer += dt;
    if (fpsTimer > 0.5) { fpsShown = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0; fpsTimer = 0; }
    if (debug) statsEl.textContent =
      `${fpsShown.toFixed(0)} fps\n` +
      `speed ${controller.horizontalSpeed.toFixed(2)} m/s  ${controller.grounded ? 'ground' : 'air'}\n` +
      `pos ${controller.position.x.toFixed(1)}, ${controller.position.y.toFixed(1)}, ${controller.position.z.toFixed(1)}\n` +
      `H: 튜닝 패널`;
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
  if (el) el.textContent = `초기화 실패: ${err?.message ?? err}`;
});
