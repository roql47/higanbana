import * as THREE from 'three';
import { Props } from '@/world/props';

/**
 * 피치용 인게임 티저 (dev 전용 — 게임 코드 어디서도 import 하지 않는다).
 *
 * 사용: `?teaser&skip=intro&quality=high` 로 부팅 → 게임시작 → 콘솔에서
 *   const m = await import('/src/teaser/run.ts');  m.install();
 *   __teaserAt(12.5)   // 그 시점 화면을 정지 상태로 확인 (프레이밍 조정용 · 소리 없음)
 *   __teaserGo()       // 처음부터 재생만
 *   __teaserGo(true)   // 재생 + 녹화 → dev/teaser/take-<ts>.webm 저장
 *   __teaserStop()
 *
 * 원리: 게임 시퀀서를 「카메라 없는 시퀀스」로 잡아 두면(cine=true) 이동 입력과 3인칭 카메라가
 * 물러난다. 그 위에서 이 모듈의 rAF 가 카메라·요괴·마츠리 음악·오버레이(레터박스/자막 카드/타이틀)를
 * 직접 몰고, 합성 캔버스(게임 프레임 + 오버레이)를 MediaRecorder 로 녹화한다.
 * 오디오는 전부 인게임 시스템(sfx/matsuri)이고 sfx.masterGain 을 탭해서 같이 녹음한다.
 */

type Dbg = {
  controller: { position: THREE.Vector3; yaw: number; teleport: (p: THREE.Vector3) => void };
  tpCam: unknown;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  chochin: { setHeld: (v: boolean) => void; setLevel: (n: number) => void; threat: number } | null;
  sfx: {
    context: AudioContext | null;
    masterGain: GainNode | null;
    out: GainNode;
    bank: { play: (key: string, opts?: Record<string, unknown>) => boolean; has: (key: string) => boolean };
    callName: (x: number, y: number, z: number, opts?: { gain?: number; far?: number }) => void;
    paChime: (x: number, y: number, z: number, gain?: number) => void;
    paVoice: (x: number, y: number, z: number, syl?: number, gain?: number) => void;
    paNoise: (x: number, y: number, z: number, dur?: number, gain?: number) => void;
    paOn: (x: number, y: number, z: number) => void;
    paOff: () => void;
    lanternToggle: (level: number) => void;
    bell: (gain?: number, far?: number) => void;
    bellAfterimage: (gain?: number) => void;
    wellRope: (x: number, y: number, z: number, gain?: number) => void;
    waterLap: (x: number, y: number, z: number, gain?: number) => void;
  };
  matsuri: {
    update: (dt: number, hunterPos: THREE.Vector3, camera: THREE.Camera, dist: number) => void;
    onOffered: () => void;
  } | null;
  village: {
    ground: {
      roadAt: (s: number) => { x: number; z: number; dirX: number; dirZ: number };
      sAtZ: (z: number) => number;
      heightAt: (x: number, z: number) => number;
      roadLength: number;
    };
    heightAt: (x: number, z: number) => number;
    speakers: { noticePos: THREE.Vector3 };
    toriiS0: number;
    toriiS1: number;
  };
  timeOfDay: { set: (n: string, sec?: number) => void } | null;
  story: { sequencer: { play: (s: unknown) => Promise<void>; skip: () => void; active: boolean } };
};

interface CamKey { t: number; pos: [number, number, number]; look: [number, number, number]; fov?: number }
interface Shot {
  name: string;
  dur: number;
  cam: CamKey[];
  /** 멱등 상태 셋업 — 재생 진입과 정지 프리뷰가 같은 함수를 쓴다. fast=true 면 전환 없이 스냅 */
  state?: (fast: boolean) => void;
  /** 소리·1회성 연출 — 정지 프리뷰에서는 건너뛴다 */
  events?: { t: number; fn: () => void }[];
  /** 마츠리 음악 거리 엔벨로프 (샷 로컬 t → m). 없으면 60 m (사실상 무음) */
  matsuriDist?: (t: number) => number;
  letterbox?: boolean;
}

const W = 1920, H = 1080;
/** 2.39:1 시네마 바 높이 */
const BAR = Math.round((H - W / 2.39) / 2);

/**
 * rAF → setTimeout 펌프.
 *
 * 이 도구는 에이전트가 **화면에 안 보이는(히든) 브라우저 팬**에서 돌린다. 히든 탭에서는
 * rAF 가 아예 멈추므로 게임 루프도 녹화도 죽는다. rAF 등록을 가로채 15 ms setTimeout
 * 체인으로 돌리면 히든 상태에서도 ~47 fps 로 게임·티저·녹화가 전부 돈다 (실측 2026-08-29).
 * three 의 setAnimationLoop 은 매 프레임 rAF 를 다시 찾으므로 설치 이후 자연히 넘어온다 —
 * 단, 설치 **이전에** 네이티브 큐에 등록된 콜백 하나는 탭이 한 번 보여야(스크린샷) 풀린다.
 */
function installPump() {
  const w = window as unknown as Record<string, unknown>;
  if (w['__teaserPump']) return;
  w['__teaserPump'] = true;
  const pending: FrameRequestCallback[] = [];
  window.requestAnimationFrame = (cb: FrameRequestCallback) => { pending.push(cb); return pending.length; };
  const step = () => {
    const cbs = pending.splice(0);
    const t = performance.now();
    for (const cb of cbs) { try { cb(t); } catch (e) { console.warn('[teaser] pump cb', e); } }
    setTimeout(step, 15);
  };
  step();
}

const lerp = THREE.MathUtils.lerp;
const smooth = (u: number) => u * u * (3 - 2 * u);

// ---------------------------------------------------------------- 오버레이

interface Card {
  t0: number; t1: number;
  lines: { text: string; size: number; font?: 'serif' | 'pen'; color?: string; dy: number; ls?: number }[];
  y: number; // 0~1 화면 비율 기준 앵커
}

class Overlay {
  private vignette: HTMLCanvasElement;
  cards: Card[] = [];
  /** [t0, t1, from, to] 구간 밖은 마지막 값 유지 */
  fades: [number, number, number, number][] = [];
  vignetteBoost = 0; // 요괴 샷에서 잠깐 조인다

  constructor() {
    this.vignette = document.createElement('canvas');
    this.vignette.width = W; this.vignette.height = H;
    const c = this.vignette.getContext('2d')!;
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  private font(size: number, kind: 'serif' | 'pen' = 'serif', weight = 600) {
    return kind === 'pen' ? `${size}px "Nanum Pen Script", cursive` : `${weight} ${size}px "Noto Serif KR", serif`;
  }

  fadeAt(t: number): number {
    let v = 0;
    for (const [t0, t1, from, to] of this.fades) {
      if (t < t0) continue;
      v = t >= t1 ? to : lerp(from, to, smooth((t - t0) / Math.max(1e-4, t1 - t0)));
    }
    return v;
  }

  draw(ctx: CanvasRenderingContext2D, t: number, letterbox: boolean, titleT: number | null) {
    // 비네트
    ctx.globalAlpha = 0.75 + this.vignetteBoost * 0.25;
    ctx.drawImage(this.vignette, 0, 0);
    ctx.globalAlpha = 1;

    // 시네마 바
    if (letterbox) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, BAR);
      ctx.fillRect(0, H - BAR, W, BAR);
    }

    // 자막 카드
    for (const card of this.cards) {
      if (t < card.t0 || t > card.t1) continue;
      const inU = THREE.MathUtils.clamp((t - card.t0) / 0.5, 0, 1);
      const outU = THREE.MathUtils.clamp((card.t1 - t) / 0.5, 0, 1);
      const a = smooth(Math.min(inU, outU));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 18;
      for (const ln of card.lines) {
        ctx.font = this.font(ln.size, ln.font ?? 'serif');
        ctx.fillStyle = ln.color ?? '#e9e4d8';
        const y = H * card.y + ln.dy;
        if (ln.ls) {
          // letter-spacing 수동 — 카드 한 줄에만 쓰므로 폭 계산은 단순 합으로 충분하다
          const chars = [...ln.text];
          const widths = chars.map((ch) => ctx.measureText(ch).width);
          const total = widths.reduce((s, w) => s + w, 0) + ln.ls * (chars.length - 1);
          let x = W / 2 - total / 2;
          for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i]!, x + widths[i]! / 2, y);
            x += widths[i]! + ln.ls;
          }
        } else {
          ctx.fillText(ln.text, W / 2, y);
        }
      }
      ctx.restore();
    }

    // 페이드(암전)
    const fade = this.fadeAt(t);
    if (fade > 0.001) { ctx.fillStyle = `rgba(0,0,0,${fade.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }

    // 타이틀 시퀀스 (검은 바탕 전체를 이 함수가 그린다)
    if (titleT !== null) this.drawTitle(ctx, titleT);
  }

  private drawTitle(ctx: CanvasRenderingContext2D, t: number) {
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, W, H);
    const a = (t0: number, dur = 0.9) => smooth(THREE.MathUtils.clamp((t - t0) / dur, 0, 1));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // 붉은 기운 — 등불의 잔광
    const glow = a(0.2, 1.6) * 0.5;
    if (glow > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, H * 0.62);
      g.addColorStop(0, `rgba(150,26,28,${(0.34 * glow).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    ctx.shadowColor = 'rgba(160,30,30,0.55)'; ctx.shadowBlur = 42;
    ctx.globalAlpha = a(0.3, 1.2);
    ctx.fillStyle = '#ddd5c4';
    ctx.font = this.font(190, 'serif');
    ctx.fillText('彼岸花', W / 2, H * 0.40);
    ctx.restore();

    ctx.globalAlpha = a(1.2);
    ctx.fillStyle = '#b9b2a2';
    ctx.font = this.font(46, 'serif', 400);
    ctx.fillText('피안화 ㅡ 꺼지지 않는 등불', W / 2, H * 0.565);

    ctx.globalAlpha = a(2.2);
    ctx.fillStyle = '#8e8778';
    ctx.font = this.font(34, 'serif', 400);
    ctx.fillText('초칭을 밝히면, 그들도 당신을 봅니다', W / 2, H * 0.675);

    ctx.globalAlpha = a(3.2);
    ctx.fillStyle = '#6c665b';
    ctx.font = this.font(26, 'serif', 400);
    ctx.fillText('브라우저에서 바로 플레이 · 로그인 없음', W / 2, H * 0.83);
    ctx.fillStyle = '#5a554c';
    ctx.font = this.font(23, 'serif', 400);
    ctx.fillText('OpenAI Game Builders Seoul 2026 본선 진출작', W / 2, H * 0.878);

    // 끝 페이드
    const out = smooth(THREE.MathUtils.clamp((t - 5.2) / 0.8, 0, 1));
    if (out > 0) { ctx.fillStyle = `rgba(0,0,0,${out.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- 요괴 워크바이

/** hunter.ts 의 로드·정규화(신장 맞춤·발바닥 원점·+X→+Z·idle 보정)를 그대로 쓰는 수동 배우 */
class WalkbyActor {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  loaded = false;

  constructor(private scene: THREE.Scene, private url: string, private height: number) {
    this.root.visible = false;
    scene.add(this.root);
  }

  async load() {
    if (this.loaded) return;
    const gltf = await Props.loader().loadAsync(this.url);
    const inner = gltf.scene;
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const s = this.height / Math.max(0.01, size.y);
    inner.scale.setScalar(s);
    inner.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    const wrap = new THREE.Group();
    wrap.add(inner);
    wrap.rotation.y = -Math.PI / 2; // Tripo 정면 +X → +Z
    this.root.add(wrap);
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    });
    this.mixer = new THREE.AnimationMixer(inner);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    const idle = this.actions.get('idle');
    let sk: THREE.SkinnedMesh | null = null;
    inner.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) sk = o as THREE.SkinnedMesh; });
    if (idle && sk) {
      const skinned = sk as THREE.SkinnedMesh;
      idle.reset().play(); idle.time = 0;
      this.mixer.update(0);
      this.root.updateMatrixWorld(true);
      skinned.computeBoundingBox();
      const toInner = new THREE.Matrix4().copy(inner.matrixWorld).invert().multiply(skinned.matrixWorld);
      const pb = skinned.boundingBox!.clone().applyMatrix4(toInner);
      const c = pb.getCenter(new THREE.Vector3());
      inner.position.set(-c.x * s, -pb.min.y * s, -c.z * s);
      idle.stop();
    }
    this.loaded = true;
  }

  play(name: string, fade = 0.3) {
    if (this.current === name || !this.actions.has(name)) return;
    const next = this.actions.get(name)!;
    const prev = this.actions.get(this.current);
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, fade, false);
    this.current = name;
  }

  set(x: number, y: number, z: number, yaw: number) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  update(dt: number, timeScale = 1) {
    if (this.mixer) { this.mixer.timeScale = timeScale; this.mixer.update(dt); }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}

// ---------------------------------------------------------------- 본체

class Teaser {
  private dbg: Dbg;
  private overlay = new Overlay();
  private shots: Shot[] = [];
  private starts: number[] = [];
  private total = 0;
  private t = 0;
  private shotI = -1;
  private firedEvents = new Set<string>();
  private raf = 0;
  /** rAF 체인 실행 토큰 — 새 시작마다 +1. 옛 체인은 토큰 불일치로 스스로 죽는다 (중복 체인 방지) */
  private runToken = 0;
  private last = 0;
  private playing = false;
  private frozen = false;

  private rec: HTMLCanvasElement;
  private rctx: CanvasRenderingContext2D;
  private gl: HTMLCanvasElement;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioTap: MediaStreamAudioDestinationNode | null = null;
  /** captureStream(0) 수동 프레임 푸시 — 히든 탭에서 자동 프레임 전달을 믿지 않는다 */
  private videoTrack: CanvasCaptureMediaStreamTrack | null = null;

  private yokai: WalkbyActor;
  private matsuriPos = new THREE.Vector3();
  private matsuriDist = 60;
  private lockPromise: Promise<void> | null = null;

  constructor(dbg: Dbg) {
    this.dbg = dbg;
    this.gl = document.getElementById('app') as HTMLCanvasElement;
    this.rec = document.createElement('canvas');
    this.rec.width = W; this.rec.height = H;
    this.rec.id = 'teaser-canvas';
    this.rec.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:9000;pointer-events:none;';
    this.rctx = this.rec.getContext('2d')!;
    this.yokai = new WalkbyActor(dbg.scene, '/models/yokai-hasshaku.glb', 2.4);
    this.build();
  }

  // ---------------- 샷 정의 ----------------
  private build() {
    const { village: v, controller, chochin, sfx, timeOfDay } = this.dbg;
    const g = v.ground;
    const road = (z: number, h: number, side = 0): [number, number, number] => {
      const rp = g.roadAt(g.sAtZ(z));
      const nx = -rp.dirZ, nz = rp.dirX;
      const x = rp.x + nx * side, zz = rp.z + nz * side;
      return [x, v.heightAt(x, zz) + h, zz];
    };
    const at = (x: number, z: number, h: number): [number, number, number] => [x, v.heightAt(x, z) + h, z];
    const park = (x: number, z: number, yaw = Math.PI) => {
      controller.teleport(new THREE.Vector3(x, v.heightAt(x, z) + 0.1, z));
      controller.yaw = yaw;
    };

    const notice = v.speakers.noticePos;
    const toriiZ = g.roadAt(v.toriiS0).z;

    this.shots = [
      // S1 — 버스 종점: 금줄 게이트 너머, 아무도 없는 정류장으로 밀어 들어간다
      {
        name: 'terminus', dur: 4.2,
        state: (fast) => {
          timeOfDay?.set('dusk', fast ? 0.1 : 0.5);
          chochin?.setHeld(false);
          park(-3.5, 80, Math.PI);   // 프레임 밖 서측
          this.yokai.root.visible = false;
        },
        cam: [
          { t: 0.0, pos: at(-0.6, 85.0, 1.5), look: at(4.6, 95.2, 2.6), fov: 48 },
          { t: 4.2, pos: at(0.2, 87.6, 1.42), look: at(4.5, 95.0, 2.3), fov: 45 },
        ],
        events: [
          { t: 0.4, fn: () => sfx.bell(0.28, 1) },
        ],
      },
      // S2 — 마을 방송탑: 실루엣 틸트업 + 잡음 낀 안내방송
      {
        name: 'speaker', dur: 4.0,
        state: () => { park(notice.x + 2, notice.z + 6, Math.PI); },
        cam: [
          { t: 0.0, pos: [notice.x + 3.4, notice.y + 1.1, notice.z + 5.2], look: [notice.x, notice.y + 3.4, notice.z], fov: 44 },
          { t: 4.0, pos: [notice.x + 2.2, notice.y + 1.5, notice.z + 3.6], look: [notice.x, notice.y + 4.6, notice.z], fov: 40 },
        ],
        events: [
          { t: 0.3, fn: () => sfx.paOn(notice.x, notice.y + 4, notice.z) },
          { t: 0.6, fn: () => sfx.paChime(notice.x, notice.y + 4, notice.z, 0.6) },
          { t: 1.7, fn: () => sfx.paVoice(notice.x, notice.y + 4, notice.z, 9, 0.6) },
          { t: 3.4, fn: () => { sfx.paNoise(notice.x, notice.y + 4, notice.z, 0.7, 0.5); } },
          { t: 3.9, fn: () => sfx.paOff() },
        ],
      },
      // S3 — 미오 프로필: 할머니의 집 앞, 피안화 너머로 얼굴을 스치는 트래킹. 여기서 해가 진다
      {
        name: 'mio', dur: 4.2,
        state: (fast) => {
          park(-18, 40, Math.PI * 0.75);
          timeOfDay?.set('evening', fast ? 0.1 : 5.5);
        },
        cam: [
          { t: 0.0, pos: at(-14.5, 41.5, 1.55), look: at(-30.5, 31, 2.4), fov: 46 },
          { t: 4.2, pos: at(-19.2, 40.4, 1.45), look: at(-32.5, 31, 2.2), fov: 44 },
        ],
        events: [
          { t: 1.1, fn: () => sfx.callName(-32, v.heightAt(-32, 31) + 2, 31, { gain: 0.65, far: 1 }) },
        ],
      },
      // S4 — 초칭 점화: 미오 뒷모습, 센본토리이 초입. 불이 켜지며 길이 드러난다
      {
        name: 'ignite', dur: 4.2,
        state: (fast) => {
          const m = road(toriiZ + 5, 0, 0.3);
          park(m[0], m[2], Math.PI);
          chochin?.setHeld(true);
          chochin?.setLevel(fast ? 2 : 0);
        },
        cam: [
          { t: 0.0, pos: road(toriiZ + 9.8, 1.75, -1.35), look: road(toriiZ - 1, 1.35, 0.5), fov: 46 },
          { t: 4.2, pos: road(toriiZ + 7.6, 1.6, -0.95), look: road(toriiZ - 7, 1.6, 0.4), fov: 42 },
        ],
        events: [
          { t: 1.3, fn: () => { chochin?.setLevel(2); sfx.lanternToggle(2); } },
        ],
        matsuriDist: (t) => lerp(52, 44, t / 4.2),
      },
      // S5 — 피안화 낮은 돌리: 꽃 위를 스치며 도리이로. 축제 음악이 다가온다
      {
        name: 'higanbana', dur: 4.0,
        state: () => {
          const m = road(toriiZ + 9, 0, -1.1);
          park(m[0], m[2], Math.PI);
          chochin?.setHeld(true); chochin?.setLevel(2);
        },
        cam: [
          { t: 0.0, pos: road(toriiZ + 24, 0.52, 1.5), look: road(toriiZ + 10, 1.15, 0.4), fov: 40 },
          { t: 4.0, pos: road(toriiZ + 15, 0.6, 1.3), look: road(toriiZ + 1, 1.5, 0.2), fov: 34 },
        ],
        events: [],
        matsuriDist: (t) => lerp(38, 13, smooth(t / 4.0)),
      },
      // S6 — 센본토리이 워크바이: S5 에서 다가오던 음악의 근원이 복도를 가로지르다, 멈추고, 돌아본다
      {
        name: 'yokai', dur: 4.6,
        state: () => {
          const m = road(toriiZ - 1.5, 0, 0.15);   // 초칭이 카메라 곁에서 근처 도리이를 비춘다
          park(m[0], m[2], Math.PI);
          chochin?.setHeld(true);
          chochin?.setLevel(1);
          this.yokai.root.visible = true;
          const y = this.yokaiPath(0);
          this.yokai.set(y.x, y.y, y.z, y.yaw);
          this.yokai.play('walk', 0);
          if (this.dbg.chochin) this.dbg.chochin.threat = 0.85;
        },
        cam: [
          { t: 0.0, pos: road(toriiZ - 4, 1.38, 0), look: road(toriiZ - 16, 1.78, 0), fov: 44 },
          { t: 4.6, pos: road(toriiZ - 3.4, 1.34, 0.1), look: road(toriiZ - 16, 1.72, 0.1), fov: 41 },
        ],
        events: [
          { t: 2.05, fn: () => { this.dbg.matsuri?.onOffered(); } },
          { t: 2.75, fn: () => { if (!this.dbg.sfx.bank.play('yokai/po', { gain: 0.8, dest: this.dbg.sfx.out })) this.dbg.sfx.bellAfterimage(0.3); } },
        ],
        matsuriDist: (t) => (t < 2.05 ? lerp(13, 8, t / 2.05) : 8),
      },
      // S7a — 우물 스팅어
      {
        name: 'well', dur: 0.7,
        state: () => {
          park(-10.6, 24.3, Math.PI);
          chochin?.setLevel(2);   // 우물 테두리를 초칭이 비춘다 — 없으면 컷이 통째로 어둠이다
          this.yokai.root.visible = false;
          if (this.dbg.chochin) this.dbg.chochin.threat = 0.4;
        },
        cam: [
          { t: 0.0, pos: at(-10.4, 23.6, 2.1), look: at(-10.0, 21.7, 0.1), fov: 44 },
          { t: 0.7, pos: at(-10.35, 23.35, 2.0), look: at(-10.0, 21.7, 0.1), fov: 42 },
        ],
        events: [{ t: 0.02, fn: () => { sfx.wellRope(-10, v.heightAt(-10, 22) + 0.6, 22, 0.9); sfx.waterLap(-10, v.heightAt(-10, 22), 22, 0.6); } }],
        matsuriDist: () => 9,
      },
      // S7b — 마츠리 광장 야구라 스팅어: 불 켜진 축제, 사람은 없다
      {
        name: 'yagura', dur: 0.7,
        state: () => { park(32, 36, Math.PI); },
        cam: [
          { t: 0.0, pos: at(23.2, 38.8, 1.2), look: at(32, 29.5, 5.0), fov: 50 },
          { t: 0.7, pos: at(23.8, 38.2, 1.25), look: at(32, 29.6, 4.8), fov: 48 },
        ],
        events: [{ t: 0.02, fn: () => { if (!sfx.bank.play('matsuri/taiko', { gain: 1.0, dest: sfx.out })) sfx.bell(0.8, 0); } }],
        matsuriDist: () => 9,
      },
      // S8 — 블랙: 귓가의 속삭임
      {
        name: 'whisper', dur: 2.3,
        state: () => { if (this.dbg.chochin) this.dbg.chochin.threat = 0; },
        cam: [
          { t: 0.0, pos: at(32, 40, 1.5), look: at(32, 30, 1.5), fov: 46 },
          { t: 2.3, pos: at(32, 40, 1.5), look: at(32, 30, 1.5), fov: 46 },
        ],
        events: [
          { t: 0.35, fn: () => { const c = this.dbg.camera.position; sfx.callName(c.x, c.y, c.z - 0.5, { gain: 1.35 }); } },
        ],
        matsuriDist: () => 12,
      },
      // S9 — 타이틀
      {
        name: 'title', dur: 6.2,
        state: () => { /* 검은 화면 — 상태 변경 없음 */ },
        cam: [
          { t: 0.0, pos: at(32, 40, 1.5), look: at(32, 30, 1.5), fov: 46 },
          { t: 6.2, pos: at(32, 40, 1.5), look: at(32, 30, 1.5), fov: 46 },
        ],
        events: [
          { t: 0.5, fn: () => { if (!sfx.bank.play('matsuri/suzu', { gain: 0.5, dest: sfx.out })) sfx.bell(0.4, 0.5); } },
        ],
        matsuriDist: (t) => lerp(14, 34, t / 6.2),
      },
    ];

    this.starts = [];
    let acc = 0;
    for (const s of this.shots) { this.starts.push(acc); acc += s.dur; }
    this.total = acc;

    // ---------------- 카드·페이드 (글로벌 타임라인) ----------------
    const S = (i: number) => this.starts[i]!;
    this.overlay.cards = [
      { t0: S(1) + 0.7, t1: S(1) + 3.8, y: 0.78, lines: [
        { text: '십 년 전 여름밤,', size: 42, dy: -34, ls: 6 },
        { text: '마을 하나가 통째로 사라졌다', size: 52, dy: 30, ls: 4 },
      ] },
      { t0: S(2) + 0.9, t1: S(2) + 4.0, y: 0.78, lines: [
        { text: '언니를 찾으러', size: 42, dy: -34, ls: 6 },
        { text: '미오는 그 마을로 돌아간다', size: 52, dy: 30, ls: 4 },
      ] },
      { t0: S(4) + 0.6, t1: S(4) + 3.7, y: 0.78, lines: [
        { text: '축제 음악이 가까워질수록', size: 46, dy: -34, ls: 5 },
        { text: '…그건 축제가 아니야', size: 54, font: 'pen', color: '#ffd9a0', dy: 34 },
      ] },
    ];
    this.overlay.fades = [
      [0, 1.6, 1, 0],                       // 오프닝 페이드 인
      [S(5) + 4.55, S(5) + 4.6, 0, 0],      // (요괴 샷 끝 하드컷 — 페이드 없음을 명시)
      [S(7) + 0.68, S(7) + 0.7, 0, 1],      // 야구라 → 블랙 하드컷
    ];
  }

  /** S6 요괴 경로: 센본토리이 복도를 왼→오로 가로지른다 (카메라 앞 ~7 m). t 0~2.3 이동, 이후 정지·돌아보기 */
  private yokaiPath(t: number) {
    const v = this.dbg.village;
    const ax = -4.2, az = -19.1, bx = 0.3, bz = -19.4;
    const u = THREE.MathUtils.clamp(t / 2.3, 0, 1);
    const x = lerp(ax, bx, u), z = lerp(az, bz, u);
    const walkYaw = Math.atan2(bx - ax, bz - az);
    // 2.4 s 정지 → 2.6~3.5 s 몸이 카메라 쪽으로 돌아간다
    const cam = this.dbg.camera.position;
    const faceYaw = Math.atan2(cam.x - x, cam.z - z);
    const turnU = smooth(THREE.MathUtils.clamp((t - 2.6) / 0.9, 0, 1));
    let d = faceYaw - walkYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return { x, y: v.heightAt(x, z), z, yaw: walkYaw + d * turnU, moving: u < 1 };
  }

  // ---------------- 실행 ----------------

  async prepare() {
    await Promise.all([
      this.yokai.load(),
      document.fonts.load('600 190px "Noto Serif KR"'),
      document.fonts.load('400 46px "Noto Serif KR"'),
      document.fonts.load('600 52px "Noto Serif KR"'),
      document.fonts.load('54px "Nanum Pen Script"'),
    ]);
  }

  /** 게임 시퀀서를 카메라 없는 시퀀스로 잡아 이동·3인칭 카메라를 물린다 */
  private lock(duration: number) {
    if (this.dbg.story.sequencer.active) this.dbg.story.sequencer.skip();
    this.lockPromise = this.dbg.story.sequencer.play({
      id: 'teaser-lock', duration, skippable: false, letterbox: false, events: [],
    });
  }
  private unlock() {
    if (this.dbg.story.sequencer.active) this.dbg.story.sequencer.skip();
  }

  freezeAt(t: number) {
    void this.yokai.load();   // 정지 프리뷰에서도 요괴가 보여야 한다 (로드되는 대로 나타난다)
    this.stopLoop();
    this.frozen = true; this.playing = false;
    this.t = THREE.MathUtils.clamp(t, 0, this.total - 0.01);
    this.lock(3600);
    document.body.appendChild(this.rec);
    this.shotI = this.shotIndexAt(this.t);
    this.shots[this.shotI]!.state?.(true);
    this.startLoop();
    return `${this.shots[this.shotI]!.name} @ ${this.t.toFixed(2)}s`;
  }

  async play(record: boolean) {
    this.stopLoop();
    await this.prepare();
    this.frozen = false;
    this.t = 0; this.shotI = -1;
    this.firedEvents.clear();
    this.lock(this.total + 2);
    document.body.appendChild(this.rec);

    if (record) this.startRecorder();
    this.playing = true;
    this.startLoop();
  }

  private shotIndexAt(t: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) if (t >= this.starts[i]!) return i;
    return 0;
  }

  private startRecorder() {
    const sfx = this.dbg.sfx;
    const stream = this.rec.captureStream(0);
    this.videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    if (sfx.context && sfx.masterGain) {
      this.audioTap = sfx.context.createMediaStreamDestination();
      sfx.masterGain.connect(this.audioTap);
      for (const tr of this.audioTap.stream.getAudioTracks()) stream.addTrack(tr);
    }
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus' : 'video/webm';
    this.recorder = new MediaRecorder(stream, {
      mimeType: mime, videoBitsPerSecond: 26_000_000, audioBitsPerSecond: 192_000,
    });
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(1000);
  }

  private async finishRecorder() {
    const rec = this.recorder;
    if (!rec) return;
    this.recorder = null;
    this.videoTrack = null;
    await new Promise<void>((r) => { rec.onstop = () => r(); rec.stop(); });
    if (this.audioTap && this.dbg.sfx.masterGain) {
      try { this.dbg.sfx.masterGain.disconnect(this.audioTap); } catch { /* 이미 끊겼으면 무시 */ }
      this.audioTap = null;
    }
    const blob = new Blob(this.chunks, { type: 'video/webm' });
    const name = `take-${Date.now()}.webm`;
    const res = await fetch(`/__teaser-save?name=${name}`, { method: 'POST', body: blob });
    console.info('[teaser] saved', name, blob.size, 'bytes →', await res.text());
    (window as unknown as Record<string, unknown>)['__teaserLastTake'] = name;
  }

  private stopLoop() { this.runToken++; cancelAnimationFrame(this.raf); }
  private startLoop() {
    const token = ++this.runToken;
    this.last = performance.now();
    const step = () => {
      if (token !== this.runToken) return;   // 새 체인이 시작됐다 — 이 체인은 조용히 끝난다
      this.raf = requestAnimationFrame(step);
      try { this.tick(); } catch (e) { console.warn('[teaser] tick', e); }
    };
    step();
  }

  stop() {
    this.stopLoop();
    this.playing = false; this.frozen = false;
    void this.finishRecorder();
    this.rec.remove();
    this.unlock();
    if (this.dbg.chochin) this.dbg.chochin.threat = 0;
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.playing) {
      this.t += dt;
      if (this.t >= this.total + 0.6) { void this.endOfPlay(); return; }
      const i = this.shotIndexAt(this.t);
      if (i !== this.shotI) {
        this.shotI = i;
        this.shots[i]!.state?.(false);
      }
      // 이벤트 발화
      const shot = this.shots[i]!;
      const local = this.t - this.starts[i]!;
      for (let e = 0; e < (shot.events?.length ?? 0); e++) {
        const ev = shot.events![e]!;
        const key = `${i}:${e}`;
        if (local >= ev.t && !this.firedEvents.has(key)) { this.firedEvents.add(key); ev.fn(); }
      }
    }

    const i = this.shotI < 0 ? 0 : this.shotI;
    const shot = this.shots[i]!;
    const local = THREE.MathUtils.clamp(this.t - this.starts[i]!, 0, shot.dur);

    // 카메라
    this.evalCam(shot, local);

    // 요괴 배우
    if (this.yokai.root.visible && shot.name === 'yokai') {
      const y = this.yokaiPath(local);
      this.yokai.set(y.x, y.y, y.z, y.yaw);
      if (!this.frozen) {
        if (!y.moving && local > 2.35) this.yokai.play('idle', 0.25);
        this.yokai.update(dt, y.moving ? 0.62 : 1);
      } else {
        this.yokai.update(0);
      }
    }

    // 마츠리 음악 (재생 중에만 — 정지 프리뷰는 무음)
    if (this.playing && this.dbg.matsuri) {
      const target = shot.matsuriDist ? shot.matsuriDist(local) : 60;
      this.matsuriDist += (target - this.matsuriDist) * Math.min(1, dt * 2.5);
      const cam = this.dbg.camera;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      this.matsuriPos.copy(cam.position).addScaledVector(fwd, this.matsuriDist);
      this.dbg.matsuri.update(dt, this.matsuriPos, cam, this.matsuriDist);
    }

    // 비네트 부스트 — 요괴가 돌아보는 순간 조인다
    this.overlay.vignetteBoost = shot.name === 'yokai'
      ? smooth(THREE.MathUtils.clamp((local - 2.0) / 1.2, 0, 1)) : 0;

    // 합성
    const titleLocal = shot.name === 'title' ? local : null;
    // 히든 탭 전환 순간 게임 캔버스가 0×0 이 될 수 있다 — 그 프레임은 건너뛴다 (마지막 프레임 유지)
    if (this.gl.width === 0 || this.gl.height === 0) return;
    this.rctx.fillStyle = '#000';
    this.rctx.fillRect(0, 0, W, H);
    if (titleLocal === null) {
      // cover-fit — 게임 캔버스 비율이 16:9 가 아니면 중앙 크롭
      const gw = this.gl.width, gh = this.gl.height;
      const scale = Math.max(W / gw, H / gh);
      const dw = gw * scale, dh = gh * scale;
      this.rctx.drawImage(this.gl, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    this.overlay.draw(this.rctx, this.t, titleLocal === null, titleLocal);
    this.videoTrack?.requestFrame();
  };

  private async endOfPlay() {
    this.stopLoop();
    this.playing = false;
    await this.finishRecorder();
    this.rec.remove();
    this.unlock();
    if (this.dbg.chochin) this.dbg.chochin.threat = 0;
    console.info('[teaser] done');
  }

  private evalCam(shot: Shot, local: number) {
    const keys = shot.cam;
    if (keys.length < 2) return;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1]!.t <= local) i++;
    const a = keys[i]!, b = keys[i + 1]!;
    const u = smooth(THREE.MathUtils.clamp((local - a.t) / Math.max(1e-4, b.t - a.t), 0, 1));
    const cam = this.dbg.camera;
    cam.position.set(lerp(a.pos[0], b.pos[0], u), lerp(a.pos[1], b.pos[1], u), lerp(a.pos[2], b.pos[2], u));
    cam.lookAt(lerp(a.look[0], b.look[0], u), lerp(a.look[1], b.look[1], u), lerp(a.look[2], b.look[2], u));
    const fov = lerp(a.fov ?? 50, b.fov ?? 50, u);
    if (Math.abs(fov - cam.fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
}

// ---------------------------------------------------------------- 설치

let instance: Teaser | null = null;

export function install() {
  const dbg = (window as unknown as { __dbg?: Dbg }).__dbg;
  if (!dbg?.village) { console.error('[teaser] __dbg/village 없음 — 게임 시작 후에 부르세요'); return null; }
  installPump();
  instance?.stop();
  instance = new Teaser(dbg);
  const w = window as unknown as Record<string, unknown>;
  w['__teaserI'] = instance;   // 콘솔 라이브 튜닝용 (shots[i].cam 교체 → __teaserAt 재호출)
  w['__teaserGo'] = (record = false) => { void instance!.play(!!record); return record ? 'recording…' : 'playing…'; };
  w['__teaserAt'] = (t: number) => instance!.freezeAt(t);
  w['__teaserStop'] = () => { instance!.stop(); return 'stopped'; };
  // 정지 프리뷰를 PNG 로 저장 — 합성 결과(=녹화에 담길 그대로)를 파일로 확인한다
  w['__frame'] = (t: number, name: string) => {
    instance!.freezeAt(t);
    return new Promise((res) => setTimeout(() => {
      (document.getElementById('teaser-canvas') as HTMLCanvasElement).toBlob((b) => {
        void fetch(`/__teaser-save?name=${name}`, { method: 'POST', body: b }).then((x) => x.text()).then(res);
      }, 'image/png');
    }, 800));
  };
  console.info(`[teaser] 설치 완료 — __teaserGo(true)=녹화, __teaserAt(t)=정지 프리뷰`);
  return instance;
}
