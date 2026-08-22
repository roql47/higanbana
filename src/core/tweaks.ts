import { Pane } from 'tweakpane';
import { L } from '@/core/i18n';
import { settings } from './settings';

export interface TweakHooks {
  onRenderChange: () => void; // 후처리/노출 값 갱신
  onSunChange: () => void; // 태양/하늘 재계산(PMREM 재베이크 — 무거움)
  onAudioChange?: () => void;
  onAmbientChange?: () => void;
  /** 리버브 센드 배율이 바뀌었을 때 — 현재 존의 wet 을 다시 건다 */
  onSpaceChange?: () => void;
  /** 달빛 그림자 on/off */
  onMoonShadowChange?: () => void;
  onCharacterGrade?: () => void;
  weapon?: { item: { grip?: { pos: [number, number, number]; rot: [number, number, number]; scale: number }; sheath?: { pos: [number, number, number]; rot: [number, number, number] } }; onChange: () => void };
  quality?: { current: string; levels: readonly string[]; onChange: (level: never) => void };
  /** HUD 편의 설정이 바뀌었을 때 — 저장 + 필요하면 뷰포트 재계산 */
  onHudChange?: () => void;
}

/** 개발용 튜닝 패널. `H` 키로 토글. */
export function createTweaks(hooks: TweakHooks, visible = true) {
  const pane = new Pane({ title: '3D_motion · tuning', expanded: false });
  const el = (pane as unknown as { element: HTMLElement }).element;
  el.style.position = 'fixed';
  el.style.top = '12px';
  el.style.right = '12px';
  el.style.width = '300px';
  // 우상단은 미션 패널 자리 — 튜닝 패널은 기본 숨김(H 로 토글), 열리면 미션 패널 아래로
  el.style.display = 'none';
  el.style.top = '176px';
  el.style.zIndex = '10';
  if (!visible) el.style.display = 'none';

  if (hooks.quality) {
    const q = { level: hooks.quality.current };
    const opts = Object.fromEntries(hooks.quality.levels.map((l) => [l, l]));
    pane.addBinding(q, 'level', { label: 'quality', options: opts }).on('change', (ev) => (hooks.quality!.onChange as (l: string) => void)(ev.value));
  }

  /**
   * HUD · 접근성 — 개발용 값이 아니라 **플레이어가 고르는 것**이라 맨 위에 둔다.
   * (사용자 지시 2026-08-22: 길안내는 필요하고, 창 비율 고정은 「선택사항」)
   */
  {
    const hd = pane.addFolder({ title: L('HUD · 접근성', 'HUD · アクセシビリティ'), expanded: true });
    const H = settings.hud;
    const onHud = hooks.onHudChange ?? (() => {});
    hd.addBinding(H, 'waypoint', { label: L('목표 지시자', '目標マーカー') }).on('change', onHud);
    hd.addBinding(H, 'signRead', { label: L('팻말 읽어 주기', '道標を読み上げ') }).on('change', onHud);
    hd.addBinding(H, 'lockAspect', { label: L('창 비율 고정', '画面比を固定') }).on('change', onHud);
    hd.addBinding(H, 'aspect', { label: L('고정 비율', '固定する比'), options: { '16:9': 16 / 9, '16:10': 1.6, '21:9': 21 / 9, '4:3': 4 / 3 } }).on('change', onHud);
  }

  const mv = pane.addFolder({ title: 'Movement', expanded: false });
  const m = settings.movement;
  mv.addBinding(m, 'runSpeed', { min: 1, max: 12, step: 0.1 });
  mv.addBinding(m, 'walkSpeed', { min: 0.5, max: 5, step: 0.1 });
  mv.addBinding(m, 'accelGround', { min: 1, max: 40, step: 0.5 });
  mv.addBinding(m, 'decelGround', { min: 1, max: 40, step: 0.5 });
  mv.addBinding(m, 'accelAir', { min: 0.5, max: 20, step: 0.5 });
  mv.addBinding(m, 'airControl', { min: 0, max: 1, step: 0.05 });
  mv.addBinding(m, 'turnSpeed', { min: 2, max: 30, step: 0.5 });
  mv.addBinding(m, 'gravity', { min: 5, max: 50, step: 0.5 });
  mv.addBinding(m, 'jumpHeight', { min: 0.3, max: 4, step: 0.05 });
  mv.addBinding(m, 'jumpCutMultiplier', { min: 0.1, max: 1, step: 0.05 });
  mv.addBinding(m, 'coyoteTime', { min: 0, max: 0.3, step: 0.01 });
  mv.addBinding(m, 'jumpBuffer', { min: 0, max: 0.3, step: 0.01 });
  mv.addBinding(m, 'leanAmount', { min: 0, max: 0.3, step: 0.01 });
  mv.addBinding(m, 'squashOnLand', { min: 0, max: 0.5, step: 0.01 });

  const cam = pane.addFolder({ title: 'Camera', expanded: false });
  const c = settings.camera;
  cam.addBinding(c, 'distance', { min: 1.5, max: 10, step: 0.1 });
  cam.addBinding(c, 'pivotHeight', { min: 0.5, max: 2.5, step: 0.05 });
  cam.addBinding(c, 'shoulderOffset', { min: -1, max: 1, step: 0.05 });
  cam.addBinding(c, 'sensitivity', { min: 0.0005, max: 0.006, step: 0.0001 });
  cam.addBinding(c, 'followLag', { min: 1, max: 40, step: 0.5 });
  cam.addBinding(c, 'baseFov', { min: 35, max: 90, step: 1 });
  cam.addBinding(c, 'runFovBoost', { min: 0, max: 20, step: 0.5 });
  cam.addBinding(c, 'fovLag', { min: 1, max: 20, step: 0.5 });
  cam.addBinding(c, 'collisionPullSpeed', { min: 5, max: 80, step: 1 });
  cam.addBinding(c, 'collisionReleaseSpeed', { min: 1, max: 30, step: 0.5 });

  const an = pane.addFolder({ title: 'Animation', expanded: false });
  const A = settings.animation;
  an.addBinding(A, 'walkClipSpeed', { min: 0.5, max: 3, step: 0.05 });
  an.addBinding(A, 'runClipSpeed', { min: 2, max: 7, step: 0.05 });
  an.addBinding(A, 'walkRunThreshold', { min: 1, max: 5, step: 0.1 });
  an.addBinding(A, 'fadeIdleWalk', { min: 0.05, max: 0.6, step: 0.01 });
  an.addBinding(A, 'fadeWalkRun', { min: 0.05, max: 0.6, step: 0.01 });
  an.addBinding(A, 'fadeLand', { min: 0.05, max: 0.6, step: 0.01 });
  an.addBinding(A, 'landSquash', { min: 0, max: 0.2, step: 0.005 });
  an.addBinding(A, 'footContactWalk', { min: 0.05, max: 0.3, step: 0.005 });
  an.addBinding(A, 'footContactRun', { min: 0.1, max: 0.4, step: 0.005 });

  const ch = pane.addFolder({ title: 'Character', expanded: false });
  const C = settings.character;
  ch.addBinding(C, 'saturation', { min: 0.5, max: 2, step: 0.05 }).on('change', hooks.onCharacterGrade ?? (() => {}));
  ch.addBinding(C, 'contrast', { min: 0.6, max: 1.6, step: 0.02 }).on('change', hooks.onCharacterGrade ?? (() => {}));
  ch.addBinding(C, 'brightness', { min: 0.6, max: 1.3, step: 0.01 }).on('change', hooks.onCharacterGrade ?? (() => {}));
  ch.addBinding(C, 'warmth', { min: -0.1, max: 0.15, step: 0.005 }).on('change', hooks.onCharacterGrade ?? (() => {}));
  ch.addBinding(C, 'headPitchIdle', { min: -0.3, max: 0.6, step: 0.01 });
  ch.addBinding(C, 'headPitchWalk', { min: -0.3, max: 0.6, step: 0.01 });
  ch.addBinding(C, 'headPitchRun', { min: -0.3, max: 0.8, step: 0.01 });
  ch.addBinding(C, 'headPitchAir', { min: -0.3, max: 0.6, step: 0.01 });
  ch.addBinding(C, 'neckShare', { min: 0, max: 1, step: 0.05 });
  ch.addBinding(C, 'spinePitchIdle', { min: -0.3, max: 0.5, step: 0.01 });
  ch.addBinding(C, 'spinePitchWalk', { min: -0.3, max: 0.5, step: 0.01 });
  ch.addBinding(C, 'spinePitchRun', { min: -0.3, max: 0.6, step: 0.01 });
  ch.addBinding(C, 'spinePitchAir', { min: -0.3, max: 0.5, step: 0.01 });

  if (hooks.weapon?.item.grip) {
    const wp = pane.addFolder({ title: 'Weapon (grip/sheath)', expanded: false });
    const gr = hooks.weapon.item.grip, sh = hooks.weapon.item.sheath;
    const gp = { x: gr.pos[0], y: gr.pos[1], z: gr.pos[2] }, grr = { x: gr.rot[0], y: gr.rot[1], z: gr.rot[2] }, gs = { scale: gr.scale };
    const sync = () => { gr.pos = [gp.x, gp.y, gp.z]; gr.rot = [grr.x, grr.y, grr.z]; gr.scale = gs.scale; if (sh) { sh.pos = [sp.x, sp.y, sp.z]; sh.rot = [sr.x, sr.y, sr.z]; } hooks.weapon!.onChange(); console.info('[weapon]', JSON.stringify({ grip: gr, sheath: sh })); };
    wp.addBinding(gp, 'x', { min: -0.3, max: 0.3, step: 0.005, label: 'grip x' }).on('change', sync);
    wp.addBinding(gp, 'y', { min: -0.3, max: 0.3, step: 0.005, label: 'grip y' }).on('change', sync);
    wp.addBinding(gp, 'z', { min: -0.3, max: 0.3, step: 0.005, label: 'grip z' }).on('change', sync);
    wp.addBinding(grr, 'x', { min: -3.2, max: 3.2, step: 0.02, label: 'grip rx' }).on('change', sync);
    wp.addBinding(grr, 'y', { min: -3.2, max: 3.2, step: 0.02, label: 'grip ry' }).on('change', sync);
    wp.addBinding(grr, 'z', { min: -3.2, max: 3.2, step: 0.02, label: 'grip rz' }).on('change', sync);
    wp.addBinding(gs, 'scale', { min: 0.3, max: 2, step: 0.01, label: 'length(m)' }).on('change', sync);
    const sp = { x: sh?.pos[0] ?? 0, y: sh?.pos[1] ?? 0, z: sh?.pos[2] ?? 0 }, sr = { x: sh?.rot[0] ?? 0, y: sh?.rot[1] ?? 0, z: sh?.rot[2] ?? 0 };
    if (sh) {
      wp.addBinding(sp, 'x', { min: -0.5, max: 0.5, step: 0.005, label: 'sheath x' }).on('change', sync);
      wp.addBinding(sp, 'y', { min: -0.5, max: 0.5, step: 0.005, label: 'sheath y' }).on('change', sync);
      wp.addBinding(sp, 'z', { min: -0.5, max: 0.5, step: 0.005, label: 'sheath z' }).on('change', sync);
      wp.addBinding(sr, 'x', { min: -3.2, max: 3.2, step: 0.02, label: 'sheath rx' }).on('change', sync);
      wp.addBinding(sr, 'y', { min: -3.2, max: 3.2, step: 0.02, label: 'sheath ry' }).on('change', sync);
      wp.addBinding(sr, 'z', { min: -3.2, max: 3.2, step: 0.02, label: 'sheath rz' }).on('change', sync);
    }
  }

  // 밤 씬 조명 — 초칭(유일한 그림자 광원) + 캐릭터 채움광
  const lt = pane.addFolder({ title: L('Light (초칭 · 채움광)', 'Light (提灯 · 補助光)'), expanded: false });
  const F = settings.fill, K = settings.chochin;
  lt.addBinding(F, 'intensity', { min: 0, max: 3, step: 0.05, label: L('fill 세기', 'fill 強さ') });
  lt.addBinding(F, 'distance', { min: 0.5, max: 4, step: 0.05, label: L('fill 사거리(m)', 'fill 距離(m)') });
  lt.addBinding(F, 'height', { min: 0.5, max: 2.2, step: 0.05, label: L('fill 높이(m)', 'fill 高さ(m)') });
  lt.addBinding(F, 'offset', { min: 0, max: 1.5, step: 0.05, label: L('fill 카메라쪽(m)', 'fill カメラ側(m)') });
  lt.addBinding(K, 'intensityHigh', { min: 0.5, max: 10, step: 0.1, label: L('초칭 강', '提灯 強') });
  lt.addBinding(K, 'intensityLow', { min: 0.1, max: 4, step: 0.05, label: L('초칭 약', '提灯 弱') });
  // gripPos 는 튜플이라 프록시로 묶고 배열에 되쓴다 (follow() 가 매 프레임 배열을 읽는다)
  const gp = { x: K.gripPos[0], y: K.gripPos[1], z: K.gripPos[2] };
  const gpSync = () => { K.gripPos[0] = gp.x; K.gripPos[1] = gp.y; K.gripPos[2] = gp.z; };
  lt.addBinding(gp, 'x', { min: 0, max: 0.5, step: 0.01, label: L('등불 바깥쪽', '提灯 外側') }).on('change', gpSync);
  lt.addBinding(gp, 'y', { min: -0.4, max: 0.3, step: 0.01, label: L('등불 높이', '提灯 高さ') }).on('change', gpSync);
  lt.addBinding(gp, 'z', { min: -0.3, max: 0.3, step: 0.01, label: L('등불 앞뒤', '提灯 前後') }).on('change', gpSync);

  const at = pane.addFolder({ title: 'Attack (3-hit combo)', expanded: false });
  const T = settings.attack;
  at.addBinding(T, 'speed', { min: 0.5, max: 2, step: 0.05 });
  at.addBinding(T, 'amplitude', { min: 0.5, max: 1.5, step: 0.05 });
  at.addBinding(T, 'comboWindow', { min: 0.1, max: 1.5, step: 0.05 });
  at.addBinding(T, 'stepImpulse', { min: 0, max: 2, step: 0.1 });

  const au = pane.addFolder({ title: 'Audio', expanded: false });
  const S = settings.audio;
  au.addBinding(S, 'master', { min: 0, max: 1, step: 0.05 }).on('change', hooks.onAudioChange ?? (() => {}));
  au.addBinding(S, 'footstep', { min: 0, max: 1, step: 0.05 });
  au.addBinding(S, 'jump', { min: 0, max: 1, step: 0.05 });
  au.addBinding(S, 'land', { min: 0, max: 1, step: 0.05 });
  au.addBinding(S, 'ambient', { min: 0, max: 0.5, step: 0.01 }).on('change', hooks.onAmbientChange ?? (() => {}));
  au.addBinding(S, 'combat', { min: 0, max: 1, step: 0.05 });
  // 공간 오디오 (audio/space.ts) — 0 으로 내리면 이 기능을 넣기 전 동작으로 돌아간다. A/B 비교용
  au.addBinding(S, 'reverb', { label: L('잔향', '残響'), min: 0, max: 2, step: 0.05 }).on('change', hooks.onSpaceChange ?? (() => {}));
  au.addBinding(S, 'occlusion', { label: L('벽 차폐', '壁の遮蔽'), min: 0, max: 1.5, step: 0.05 });

  // 밤 씬 — 달빛 그림자 A/B (품질 프리셋이 high·ultra 일 때만 실제로 켜진다)
  const nt = pane.addFolder({ title: 'Night', expanded: false });
  nt.addBinding(settings.night, 'moonShadow', { label: L('달빛 그림자', '月明かりの影') }).on('change', hooks.onMoonShadowChange ?? (() => {}));

  const rd = pane.addFolder({ title: 'Render', expanded: false });
  const r = settings.render;
  // 프레임 상한 — 낮출수록 GPU 가 쉬어서 발열·배터리에 유리하다 (0 = 무제한)
  rd.addBinding(r, 'maxFps', { label: 'max fps', options: { '30': 30, '60': 60, '120': 120, [L('무제한', '無制限')]: 0 } });
  rd.addBinding(r, 'exposure', { min: 0.2, max: 2.5, step: 0.05 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'sunElevation', { min: 2, max: 89, step: 1 }).on('change', hooks.onSunChange);
  rd.addBinding(r, 'sunAzimuth', { min: 0, max: 360, step: 1 }).on('change', hooks.onSunChange);
  rd.addBinding(r, 'sunIntensity', { min: 0, max: 8, step: 0.1 }).on('change', hooks.onSunChange);
  rd.addBinding(r, 'envIntensity', { min: 0, max: 1, step: 0.01 }).on('change', hooks.onSunChange);
  rd.addBinding(r, 'hemiIntensity', { min: 0, max: 2, step: 0.05 }).on('change', hooks.onSunChange);
  rd.addBinding(r, 'turbidity', { min: 1, max: 20, step: 0.1 }).on('change', hooks.onSunChange);
  rd.addBinding(r, 'rayleigh', { min: 0, max: 4, step: 0.05 }).on('change', hooks.onSunChange);
  rd.addBinding(r, 'mieCoefficient', { min: 0, max: 0.1, step: 0.001 }).on('change', hooks.onSunChange);
  rd.addBinding(r, 'aoIntensity', { min: 0, max: 8, step: 0.1 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'aoRadius', { min: 0.1, max: 5, step: 0.05 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'bloomIntensity', { min: 0, max: 2, step: 0.05 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'bloomThreshold', { min: 0, max: 2, step: 0.05 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'vignetteDarkness', { min: 0, max: 1, step: 0.05 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'vignetteOffset', { min: 0, max: 1, step: 0.05 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'saturation', { min: -1, max: 1, step: 0.02 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'contrast', { min: -1, max: 1, step: 0.02 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'brightness', { min: -0.5, max: 0.5, step: 0.01 }).on('change', hooks.onRenderChange);
  rd.addBinding(r, 'showColliders');

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') el.style.display = el.style.display === 'none' ? '' : 'none';
  });

  return pane;
}
