import * as THREE from 'three';
import { createRenderer, createCamera } from '@/core/renderer';
import { createPostFX } from '@/core/postfx';
import { Physics } from '@/core/physics';
import { Input } from '@/core/input';
import { createTweaks } from '@/core/tweaks';
import { settings, applyDayPreset } from '@/core/settings';
import { createSky } from '@/world/sky';
import { createNightSky } from '@/world/nightSky';
import { Village } from '@/world/village';
import { Chochin } from '@/light/chochin';
import { createPlayground } from '@/world/playground';
import { Island, loadTerrainTextures } from '@/world/terrain';
import { Water } from '@/world/water';
import { Grass } from '@/world/grass';
import { PROP_DEFS } from '@/world/propDefs';
import { CharacterController } from '@/character/controller';
import { PlaceholderCharacter } from '@/character/placeholder';
import { CharacterModel } from '@/character/model';
import { CharacterAnimator } from '@/character/animator';
import { Sfx, type Surface } from '@/audio/sfx';
import { CHARACTER } from '@/character/config';
import { ThirdPersonCamera } from '@/camera/thirdPerson';
import { detectQuality, saveQuality, lowerLevel, profileFor, QUALITY_LEVELS, type QualityLevel, type QualityProfile } from '@/core/quality';
import { setupTouch } from '@/core/touch';
import { Inventory } from '@/items/inventory';
import { InventoryUI } from '@/items/inventoryUI';
import { ITEMS } from '@/items/items';
import { Equipment } from '@/character/equipment';
import { Combat } from '@/character/combat';
import { Dummies } from '@/world/dummies';
import { Popups } from '@/ui/popups';
import { Props } from '@/world/props';

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

  // --- 로딩 진행률 (three 의 기본 LoadingManager 를 모든 로더가 공유) ---
  let loadedItems = 0, totalItems = 0;
  const setProgress = (p: number) => { loadingFill.style.width = `${Math.round(p * 100)}%`; loadingPct.textContent = `${Math.round(p * 100)}%`; };
  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => { loadedItems = loaded; totalItems = total; setProgress(0.1 + 0.85 * (total ? loaded / total : 0)); };
  THREE.DefaultLoadingManager.onError = (url) => console.warn('[load] 실패:', url);
  setProgress(0.03);

  const renderer = createRenderer(canvas);
  let quality = detectQuality(renderer.getContext());
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
  settings.render.shadowRadius = quality.shadowRadius;
  console.info('[quality]', quality.level, quality);
  const scene = new THREE.Scene();
  const camera = createCamera();

  const physics = await Physics.create();

  // --- 씬: 기본은 마을(공포). ?scene=sandbox = v0.8 초원 섬, ?scene=playground = 테스트 지형 ---
  const sceneName = new URLSearchParams(location.search).get('scene') ?? 'village';
  const isVillage = sceneName === 'village';
  if (!isVillage) applyDayPreset(); // 초원·테스트 지형은 낮 세팅으로 되돌린다
  const sky = isVillage ? createNightSky(renderer, scene) : createSky(renderer, scene, quality.shadowMap);

  let island: Island | null = null;
  let water: Water | null = null;
  let props: Props | null = null;
  let grass: Grass | null = null;
  let village: Village | null = null;
  const spawn = new THREE.Vector3(0, 0.05, 0);
  if (sceneName === 'playground') {
    createPlayground(scene, physics);
    scene.fog = new THREE.Fog(0xd7e3ec, 70, 240);
  } else if (isVillage) {
    const tex = await loadTerrainTextures(renderer);
    village = new Village(scene, physics, tex, { riceBudget: Math.round(quality.grassCount * 0.8), treeBudget: Math.round(700 * quality.treeScale) });
    spawn.copy(village.spawn);
    if (new URLSearchParams(location.search).get('at') === 'house') {
      spawn.copy(village.house.entrance);
      spawn.y = village.heightAt(spawn.x, spawn.z) + 0.05;
    }
    console.info('[village] 논 배미', village.ground.paddyCells().length, '· 벼', village.paddy.riceCount, '· 토리이', village.torii.count, '· 삼나무', village.cedars.count);
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
  const unlockAudio = () => sfx.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  const controller = new CharacterController(physics, spawn);
  const tpCam = new ThirdPersonCamera(camera, physics, controller.body);
  /** 발밑 표면: 마을은 자갈/흙/논물, 섬은 수면 근처가 물/모래 */
  const surfaceAt = (p: THREE.Vector3): Surface => {
    if (village) return village.surfaceAt(p);
    if (!island) return 'grass';
    const h = p.y - island.waterLevel;
    if (h < 0.12) return 'water';
    if (h < 1.1) return 'sand';
    return 'grass';
  };

  // 캐릭터 비주얼: GLB 가 있으면 로드, 없으면 캡슐 플레이스홀더
  let visual: CharacterVisual = new PlaceholderCharacter(scene);
  let model: CharacterModel | null = null;
  let animator: CharacterAnimator | null = null;
  try {
    const head = await fetch(CHARACTER.url, { method: 'HEAD' });
    if (head.ok && (head.headers.get('content-type') ?? '').includes('gltf')) {
      model = await CharacterModel.load(CHARACTER, renderer);
      scene.remove((visual as PlaceholderCharacter).root);
      scene.add(model.root);
      visual = model;
      if (model.clipNames.includes('idle')) model.play('idle', 0);
      if (model.clipNames.length > 0) {
        animator = new CharacterAnimator(model, {
          onFootstep: (foot, speed) => sfx.footstep(speed, surfaceAt(controller.position), foot),
          onJump: () => sfx.jump(),
          onLand: (impact) => sfx.land(impact),
        });
      }
      console.info('[character] loaded', CHARACTER.url, 'clips:', model.clipNames);
    }
  } catch (e) {
    console.warn('[character] GLB 로드 실패 → 캡슐 유지', e);
  }

  // --- 초칭(왼손 등불) — 마을의 유일한 그림자 광원 ---
  let chochin: Chochin | null = null;
  if (isVillage && model) {
    chochin = new Chochin(model.root, quality.shadowMap >= 3072 ? 1024 : 512);
    console.info('[chochin] level', chochin.level);
  }

  // --- 인벤토리 · 장비 · 전투 · 허수아비 (전투는 sandbox 전용) ---
  const inventory = new Inventory();
  const invUI = new InventoryUI(inventory);
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
  const input = new Input(canvas);
  setupTouch(input, canvas);

  createTweaks({
    onRenderChange: () => postfx.applySettings(),
    onSunChange: () => sky.updateSun(),
    onAudioChange: () => sfx.setMaster(settings.audio.master),
    onAmbientChange: () => sfx.setAmbient(settings.audio.ambient),
    onCharacterGrade: () => model?.gradeAlbedo(),
    weapon: { item: ITEMS['sword']!, onChange: () => equipment?.applyOffsets() },
    quality: { current: quality.level, levels: QUALITY_LEVELS, onChange: (lv: QualityLevel) => { saveQuality(lv); applyQualityLive(profileFor(lv)); } },
  }, debug);

  // --- 단축키: R 리셋, M 음소거, F 전체화면 ---
  let muted = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && worldSword && controller.position.distanceTo(swordSpot) < 2.2) {
      worldSword.removeFromParent(); worldSword = null; promptEl.classList.add('hidden');
      inventory.add('sword');
      if (!inventory.mainhand) { const idx = inventory.slots.findIndex((s) => s.itemId === 'sword'); if (idx >= 0) inventory.equip(idx); }
      sfx.equip();
    }
    if (e.code === 'KeyQ' && chochin && !invUI.isOpen) { chochin.cycle(); sfx.lanternToggle(chochin.level); }
    if (e.code === 'KeyR') controller.teleport(spawn);
    if (e.code === 'KeyM') { muted = !muted; sfx.setMaster(muted ? 0 : settings.audio.master); }
    if (e.code === 'KeyF') { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }
  });

  // --- 런타임 품질 적용 + 적응형(느리면 자동 하향) ---
  function applyQualityLive(q: QualityProfile) {
    quality = q;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    onResize();
    postfx.applyQuality(q);
    settings.render.shadowRadius = q.shadowRadius;
    sky.setShadowMapSize(q.shadowMap);
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
      if (avg > 0.024) { // 42 fps 미만
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
  loadingPct.textContent = totalItems ? `${loadedItems}/${totalItems} 로드 완료` : '준비 완료';
  startBtn.hidden = false;
  let started = false;
  const start = () => {
    if (started) return; started = true;
    sfx.unlock();
    if (isVillage) sfx.startNight();
    loadingEl.classList.add('hidden');
    tpCam.startIntro(3.4);
    setTimeout(() => loadingEl.remove(), 1200);
    setTimeout(() => { hintExpired = true; }, 14000); // 조작 힌트는 처음 잠깐만
  };
  let hintExpired = false;
  startBtn.addEventListener('click', start);
  window.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') start(); }, { once: false });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)['__dbg'] = { controller, physics, tpCam, scene, settings, sky, postfx, input, camera, model, animator, sfx, island, water, inventory, equipment, combat, dummies, village, chochin };
  }

  // --- 리사이즈 ---
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
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
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 1 / 20) dt = 1 / 20; // 탭 전환 등 큰 dt 방지
    if (dt <= 0) return;
    if (import.meta.env.DEV && (window as unknown as { __dbg?: { paused?: boolean } }).__dbg?.paused) return; // 테스트용 일시정지
    adaptiveQuality(dt);
    step(dt, true);
  }

  /** 한 프레임 시뮬레이션+렌더. 테스트에서 rAF 없이 결정적으로 호출 가능 (`__dbg.step(dt, render)`) */
  function step(dt: number, render = true) {
    // 히트스톱: 잠깐 세상을 느리게
    if (hitstop > 0) { hitstop -= dt; dt *= 0.12; }
    const uiOpen = invUI.isOpen;
    // 공격 입력 (인벤토리 열려 있으면 무시)
    if (combat && !uiOpen && (input.justPressed('KeyJ') || (input.locked && input.justPressed('Mouse0')))) combat.tryAttack(controller);
    combat?.update(dt, controller);
    // 입력 → 캐릭터
    const axis = uiOpen ? { x: 0, y: 0 } : input.moveAxis();
    if (combat && combat.moveScale < 1) { axis.x *= combat.moveScale; axis.y *= combat.moveScale; }
    const shift = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    controller.update(dt, {
      axis,
      cameraYaw: tpCam.headingYaw,
      // 마을(공포)에서는 기본이 걷기, Shift 가 달리기 — 초원에서는 반대(v0.8 그대로)
      walk: isVillage ? !shift : shift,
      jumpPressed: !uiOpen && input.justPressed('Space'),
      jumpHeld: input.isDown('Space'),
    });
    physics.step(dt);
    dummies?.update(dt);
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
    sfx.updateNight(dt);

    // 카메라 — 좁은 공간에서는 거리·피치를 명시적으로 조인다
    //   토리이 통로: 빔이 화면을 가로지르지 않게 / 실내: 벽에 밀려 캐릭터에 코를 박지 않게
    if (village) {
      const inTunnel = village.inToriiCorridor(controller.position);
      const indoors = village.isIndoors(controller.position);
      tpCam.constrainDistance = indoors ? 1.55 : inTunnel ? 1.95 : null;
      tpCam.constrainPitch = indoors ? 0.32 : inTunnel ? 0.20 : null;
    }
    const mouse = input.consumeMouseDelta();
    tpCam.update(dt, uiOpen ? { x: 0, y: 0 } : mouse, uiOpen ? 0 : input.consumeWheel(), controller.position, controller.horizontalSpeed, controller.grounded);
    village?.torii.update(camera.position); // 카메라가 확정된 뒤 코앞의 토리이를 접는다
    popups.update();

    // 시각
    animator?.update(dt, controller);
    if (combat?.attacking && model) {
      // 모캡 공격 클립은 자세가 이미 정확하므로 Tripo 클립용 머리·척추 보정을 끈다
      model.spinePitchTarget = 0;
      model.headPitchTarget = 0;
    }
    visual.update(dt, controller);
    chochin?.update(dt, controller.yaw, controller.horizontalSpeed);
    {
      const c = settings.camera;
      const t = (tpCam.currentDistance - c.minCollisionDistance) / Math.max(0.01, c.fadeDistance - c.minCollisionDistance);
      visual.setVisibility(t);
    }
    shadowTarget.copy(controller.position);
    sky.follow(shadowTarget, dt);
    physics.updateDebug(scene, settings.render.showColliders);

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
