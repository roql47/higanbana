import {createMoriStoryPlay} from '@/world/ogimachi/moriStoryPlay';
import {relocateWalk} from '@/world/ogimachi/walkRelocation';
import * as THREE from 'three';
import { Physics } from '@/core/physics';
import { Input } from '@/core/input';
import { FrameClock } from '@/core/frameClock';
import { FixedStepPresentation } from './fixedStepPresentation';
import { PlayRender } from '@/world/ogimachi/playRender';
import { settings } from '@/core/settings';
import { CharacterController } from '@/character/controller';
import { CharacterModel } from '@/character/model';
import { CharacterAnimator } from '@/character/animator';
import { syncSkinnedPose } from '@/character/syncSkinnedPose';
import { MIO } from '@/character/config';
import { ThirdPersonCamera } from '@/camera/thirdPerson';
import { addWalkColliders } from '@/world/ogimachi/walkPhysics';
import type { SurveyWorld } from '@/world/ogimachi/surveyWorld';
import { Rain } from '@/world/rain';
import { Lightning } from '@/world/lightning';
import { Bus } from '@/world/bus';
import { Higanbana } from '@/world/village/higanbana';
import { ToriiPath } from '@/world/village/torii';
import { StoneTablet } from '@/world/higasato/tablet';
import { TimeOfDayController } from '@/world/timeOfDay';
import { Sfx } from '@/audio/sfx';
import { Dialogue } from './dialogue';
import { Sequencer } from './sequencer';
import { FirstPerson } from './firstPerson';
import { Pursuers } from './pursuers';
import { Sayo } from './sayo';
import { Phone } from './phone';
import { playPrologue } from './prologue';
import type { Act1 } from './act1';
import type { Act2 } from './act2';
import { Act3 } from './act3';
import { OgimachiStoryRoute } from './ogimachiRoute';
import { preparePhoto } from './photo';
import './ogimachiStory.css';

/** Story owns only its actors, route and UI. Survey terrain stays with the map task. */
export async function startOgimachiStory(world: SurveyWorld, scene: THREE.Scene, renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight) {
  document.body.classList.add('story-mode');
  // The aerial preview clips at 15 cm; ACT 1's close-held Sayo was framed
  // for the original game's 10 cm near plane.
  camera.near = .1;
  camera.updateProjectionMatrix();
  const playRender = new PlayRender(renderer, sun);
  const status = document.querySelector<HTMLElement>('#status')!;
  status.textContent = 'ACT 1 · 사요와 프롤로그를 준비하는 중…';
  const [physics, model, sayo] = await Promise.all([Physics.create(), CharacterModel.load(MIO, renderer), Sayo.load(scene)]);
  const surfaces = addWalkColliders(physics, world.group, world.data);
  physics.step(1 / 60);
  const road = world.data.roads.find(r => r.id === 1268046903);
  if (!road) throw new Error('프롤로그에 필요한 마을 주도로가 없습니다.');
  const startIndex = road.points.findIndex(p => Math.abs(p[1] + 3.117) < .1);
  if (startIndex < 0) throw new Error('프롤로그 시작점을 찾을 수 없습니다.');
  const ground = new OgimachiStoryRoute(road.points.slice(startIndex), (x, z) => surfaces.heightAt(x, z) ?? world.height(x, z));
  const start = ground.roadAt(8), spawn = new THREE.Vector3(start.x, ground.heightAt(start.x, start.z) + .1, start.z);
  const controller = new CharacterController(physics, spawn);
  const animator = new CharacterAnimator(model), input = new Input(renderer.domElement);
  const follow = new ThirdPersonCamera(camera, physics, controller.body);
  const dialogue = new Dialogue(), sequencer = new Sequencer(camera, dialogue);
  const fp = new FirstPerson(scene, camera), sfx = new Sfx(), phone = new Phone();
  const rain = new Rain(scene), pursuers = new Pursuers(scene, ground, { count: 5 });
  const hemi = scene.children.find(o => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
  const overlay = (name: string) => { const el = document.createElement('div'); el.className = name; document.body.append(el); return el; };
  const dread = overlay('story-dread'), flash = overlay('story-flash');
  const lightning = new Lightning(sun, hemi, sfx, v => { flash.style.opacity = String(v); }, scene);
  const lighting = () => {
    sun.intensity = settings.night.moonIntensity; hemi.intensity = settings.night.hemiIntensity;
    scene.environmentIntensity = settings.night.envIntensity;
  };
  const time = new TimeOfDayController({ moon: sun, hemi, updateSun: lighting, updateLighting: lighting,
    setSkyColors: colors => { scene.background = new THREE.Color(colors.horizon); } }, scene,
  () => { renderer.toneMappingExposure = settings.render.exposure; }, 'rainNight');
  const flowers = new Higanbana(scene, ground, { tunnel: [92, 120], corridor: { s0: 0, s1: 88 },
    cluster: { x: start.x + 5, z: start.z, r: 2 },
    reject: (x, z) => world.data.buildings.some(b => {
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.angle), s = Math.sin(b.angle);
      return Math.abs(c * dx - s * dz) < b.width / 2 + 1 && Math.abs(s * dx + c * dz) < b.depth / 2 + 1;
    }) });
  new ToriiPath(scene, physics, ground, { startS: 94, count: 1, scale: 1.5 });
  const tablet = new StoneTablet(scene, physics, ground);
  const stopAt = ground.roadAt(0), stop = new THREE.Vector3(stopAt.x + 3.6, ground.heightAt(stopAt.x + 3.6, stopAt.z), stopAt.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x454d49 }));
  pole.position.copy(stop).y += 1.1; scene.add(pole);
  const signCanvas = document.createElement('canvas'); signCanvas.width = 256; signCanvas.height = 256;
  const ctx = signCanvas.getContext('2d')!; ctx.fillStyle = '#343f3b'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#dedac6'; ctx.textAlign = 'center'; ctx.font = 'bold 38px serif'; ctx.fillText('히가사토', 128, 108); ctx.fillText('종 점', 128, 164);
  const signMap = new THREE.CanvasTexture(signCanvas); signMap.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshStandardMaterial({ map: signMap, side: THREE.DoubleSide }));
  sign.position.copy(stop).y += 2; scene.add(sign);
  const bus = new Bus(scene, { origin: new THREE.Vector3(0, 1200, 0) });
  scene.add(model.root); physics.step(1 / 60);
  preparePhoto({ scene, renderer, model, sister: sayo, village: { ground, toriiS0: 94 }, timeOfDay: time, hide: [rain.group, bus.group] });
  const title = overlay('title-card'); title.innerHTML = '<div class="tc-kanji">피안화</div><div class="tc-ko">꺼지지 않는 등불</div>';
  let act1: Act1 | null = null, act2: Act2 | null = null, act = 1, started = false, arrived = false, wipe = 0, tabletDone = false;
  const inventory = new Set<string>();
  let answered = 0;
  const checkpoint = () => {
    try { sessionStorage.setItem('ogimachi.story-preview', JSON.stringify({ version: 1, act, answered, inventory: [...inventory], tabletDone })); } catch { /* Playable without browser storage. */ }
  };
  const mori=await createMoriStoryPlay(scene,physics,world,(x,z)=>surfaces.heightAt(x,z)??world.height(x,z));
  mori.bind(()=>controller.position,(p,target)=>{follow.setView(mori.inside?'first':'third');relocateWalk(controller,follow,p,target);input.reset();});
  const act3 = new Act3({ tablet, ground, dialogue, sfx, cam: follow, body: controller,
    setDread: v => { dread.style.opacity = String(v); }, onViolate: () => { answered++; checkpoint(); },
    onDone: () => { tabletDone = true; act=4; checkpoint();mori.start();status.textContent = 'ACT 4 · 사라지기 직전의 흔적을 조사하세요.'; } });
  document.querySelector('header h1')!.textContent = '피안화 · 새 맵 스토리';
  const hint = document.querySelector<HTMLElement>('header p')!;
  hint.textContent = 'ACT 1 붉은 꽃밭 → ACT 2 종점 → ACT 3 세 가지 금기 → ACT 4 끝나지 않은 축제';
  const nav = document.querySelector('header nav')!; nav.replaceChildren();
  const restart = document.createElement('button'); restart.textContent = '처음부터'; restart.onclick = () => location.reload();
  const walk = document.createElement('button'); walk.textContent = '자유 이동'; walk.onclick = () => { const url = new URL(location.href); url.searchParams.delete('story'); url.searchParams.set('play', '1'); location.href = url.href; };
  nav.append(restart, walk);
  const startPanel = document.createElement('div'); startPanel.className = 'story-start';
  startPanel.innerHTML = '<h2>ACT 1 · 붉은 꽃밭</h2><p>10년 전, 비 오는 밤.<br>사요의 손을 잡고 달립니다.<br><br>W 앞으로 달리기 · 마우스 둘러보기<br>소리를 켜고 시작해 주세요.</p><button>이야기 시작</button>';
  document.body.append(startPanel);
  let busReady: Promise<void> | null = null;
  const prefetchBus = () => busReady ??= bus.load();
  void sfx.bank.setRegions(['village', 'prologue']);
  startPanel.querySelector('button')!.onclick = () => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('record')) {
      void import('./recordStory').then(({ recordStory }) => {
        const delay = new URLSearchParams(location.search).get('record') === 'ending' ? 24_000 : 0;
        setTimeout(() => recordStory(renderer.domElement), delay);
      });
    }
    startPanel.hidden = true; input.reset(); sfx.unlock(); started = true;
    void playPrologue({ scene, sequencer, dialogue, village: { ground, busStop: { pos: stop } }, controller, fp, pursuers, sayo, rain, lightning, bus, camera, sfx, phone, input,
      chochin: null, companionFollowsPlayer: true, give: id => { inventory.add(id); checkpoint(); },
      prefetchBus: () => prefetchBus().catch(error => { console.warn('버스 소품 일부 로드 실패', error); }),
      prepareBus: async () => { await prefetchBus().catch(() => {}); }, releaseBus: () => bus.dispose(),
      setSurfaceOverride: () => {}, setDread: v => { dread.style.opacity = String(v); },
      setTime: (name, seconds) => time.set(name, seconds), onAct: n => { act = n; checkpoint(); },
      title: show => title.classList.toggle('show', show), bindAct1: a => { act1 = a; }, bindAct2: a => { act2 = a; },
      place: p => controller.teleport(p), onEnd: p => {
        arrived = true; act = 3; controller.teleport(p); fp.end(); dread.style.opacity = '0'; follow.startIntro(1.2);
      },
    }).catch(error => { console.error(error); started = false; status.textContent = `스토리 시작 실패: ${error.message}. 처음부터 버튼으로 재시도할 수 있습니다.`; sequencer.setFade(0, .3); });
  };
  fp.onStep = (foot, speed) => sfx.footstep(speed, 'water', foot);
  const frameClock = new FrameClock(performance.now());
  const presentation = new FixedStepPresentation(controller.position);
  const savedCameraPosition = new THREE.Vector3(), savedSayoPosition = new THREE.Vector3();
  let accumulator = 0, jump = false, nextStatus = 0;
  /**
   * ACT 1 의 **끌기**(`act1.dragged` → `controller.externalPush`)를 프레임 안에 붙잡아 둔다.
   *
   * `externalPush` 는 컨트롤러가 **한 스텝에 소비하고 비운다**. 그런데 끌기를 정하는
   * `act1.update` 는 프레임당 한 번이라, 한 프레임에 고정 스텝이 두 번 도는 순간
   * **두 번째 스텝이 끌기 없이 지나간다**. 이 장면의 미오는 스스로 달리지 않고 끌려가므로
   * 그 스텝은 아예 못 움직이고, `horizontalSpeed` 가 **0 으로 읽힌다**.
   *
   * 실측(60 Hz·±0.5 ms 지터, 260 프레임): 초당 1~2 회. 그 한 프레임에
   *   · 사요가 `walk` 로 넘어갔다가 다음 프레임 `run` 을 **처음부터** 다시 튼다 (`sayo.play`)
   *   · 1인칭 흔들림 진폭(`run`)이 0 이 되어 카메라가 한 프레임에 **4 cm** 튄다 (평소 0.6 cm)
   * — 「사요 모션이 흔들리고 프레임이 튄다」의 정체가 이것이다.
   */
  const towPush = new THREE.Vector3();
  renderer.setAnimationLoop(now => {
    if (document.hidden) { frameClock.reset(now); accumulator = 0; input.reset(); return; }
    const raw = frameClock.sample(now, 60);
    if (raw === null) return;
    const dt = Math.min(.1, raw);
    if (started) {
      time.update(dt); dialogue.update(dt); sequencer.update(dt);
      const locked = !arrived && !act1?.running || sequencer.active || act3.controlsLocked || mori.locked;
      const axis = locked ? { x: 0, y: 0 } : input.moveAxis();
      if (act1) { axis.x *= act1.moveScale; axis.y *= act1.moveScale; }
      jump ||= arrived && !locked && input.justPressed('Space');
      accumulator += dt;
      for (let n = 0; accumulator >= 1 / 60 && n < 6; n++, accumulator -= 1 / 60) {
        presentation.beforeStep(controller.position);
        if (n > 0) controller.externalPush.copy(towPush);   // 위 `towPush` 주석
        controller.update(1 / 60, { axis, cameraYaw: fp.active ? fp.forwardYaw : follow.headingYaw,
          walk: !fp.active && !(input.isDown('ShiftLeft') || input.isDown('ShiftRight')),
          speedMul: act1?.speedMul ?? 1, jumpPressed: jump, jumpHeld: arrived && !locked && input.isDown('Space') });
        jump = false; physics.step(1 / 60);
      }
      animator.update(dt, controller); model.update(dt, controller);
      const mouse = input.consumeMouseDelta(), wheel = input.consumeWheel();
      if (fp.active) fp.update(dt, mouse, controller);
      else if (!sequencer.active) follow.update(dt, act3.controlsLocked ? { x: 0, y: 0 } : mouse, wheel, controller.position, controller.horizontalSpeed, controller.grounded);
      if(tabletDone){mori.update(dt);if(input.justPressed('KeyE'))mori.interact();if(mori.invitationAccepted&&act===5){act=6;checkpoint();status.textContent='일곱 공물을 찾아라 0/7 · 첫 번째 장소: 작은 사당';}if(mori.atShrine&&act===4){act=5;checkpoint();status.textContent='ACT 5 · 석판과 비어 있는 받침대를 조사하세요.';}}
      act1?.update(dt); act2?.update(dt); act3.update(dt); bus.update(dt); rain.update(dt, camera.position);
      // 이번 프레임이 정한 끌기 — 다음 프레임의 두 번째 스텝부터 다시 먹인다
      towPush.copy(controller.externalPush);
      flowers.update(dt, controller.position);
      const space = sfx.space;
      if (space) {
        space.listener.copy(camera.position);
        const zone = bus.group.visible ? 'bus' : 'outdoor';
        if (space.currentZone !== zone) space.setZone(zone);
        space.update(dt);
      }
      model.root.visible = !fp.active && !follow.isFirstPerson;
      if(tabletDone){hint.textContent='ACT 4 · WASD 이동 · E 조사/출입 · 생활 흔적 세 곳 확인 후 중앙 신사로';}
      else if (arrived && !tabletDone && !act3.running) {
        const near = controller.position.distanceTo(tablet.pos) < 3;
        hint.textContent = near ? 'E를 길게 눌러 비석의 이끼를 닦으세요.' : '길 오른쪽 비석으로 이동하세요. WASD 이동 · Shift 달리기';
        if (near && input.isDown('KeyE')) { wipe = Math.min(1, wipe + dt / 2); act3.wipe(wipe); if (wipe === 1) act3.begin(); }
      } else if (act1) hint.textContent = 'W 앞으로 달리기 · 마우스 둘러보기 · 뒤를 돌아보지 마';
      else if (!arrived) hint.textContent = '버스 안 · 마우스로 둘러보기';
      if (!tabletDone && now >= nextStatus) {
        nextStatus = now + 250;
        status.textContent = `ACT ${act} · ${act1 ? `${Math.round(act1.progress[0])} / ${Math.round(act1.progress[1])}m` : act === 2 ? '종점' : `세 가지 금기${wipe > 0 && wipe < 1 ? ` · ${Math.round(wipe * 100)}%` : ''}`}`;
      }
    }
    playRender.update(controller.position);
    if(world.updateDetail(camera))renderer.shadowMap.needsUpdate=true;
    const interpolate = !!act1 && fp.active;
    if (interpolate) {
      const offset = presentation.offset(controller.position, accumulator, 1 / 60);
      savedCameraPosition.copy(camera.position); savedSayoPosition.copy(sayo.root.position);
      camera.position.add(offset); sayo.root.position.add(offset);
    }
    try {
      syncSkinnedPose(sayo.root);
      syncSkinnedPose(model.root);
      mori.renderTV(renderer,model.root);
      renderer.render(scene, camera);

    }
    finally {
      if (interpolate) { camera.position.copy(savedCameraPosition); sayo.root.position.copy(savedSayoPosition); }
    }
    playRender.record(raw); input.endFrame();
  });
}
