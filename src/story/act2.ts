import * as THREE from 'three';
import type { Dialogue } from './dialogue';
import type { FirstPerson } from './firstPerson';
import type { Bus } from '@/world/bus';
import type { Sequencer } from './sequencer';
import type { Sfx } from '@/audio/sfx';
import { makePhoto } from './photo';
import { Props } from '@/world/props';
import type { Phone } from './phone';

/**
 * ACT 2 前半 「버스 안」 — 스토리보드가 통째로 빠져 있던 자리.
 *
 * 지금까지 ACT 2 는 「종점이야.」부터 시작했다. 그런데 스토리보드 ACT 2 의 장면 목적 셋 중
 * **둘이 버스 안에서** 일어난다: *현재의 미오를 소개한다* · *사요의 얼굴이 훼손된 사진으로
 * 기억의 결손을 시각화한다*. 특히 세 번째는 이 게임 전체의 전제다 —
 * **미오는 언니의 얼굴을 기억하지 못한다.** 그걸 대사로 말하지 않고 손에 든 사진으로 보여준다.
 *
 * ## 왜 1인칭인가 (각색 8 의 예외)
 * 각색 8 은 *과거 = 1인칭 · 현재 = 3인칭* 이다. 여기만 예외로 두는 이유는 하나다:
 * **사진은 손에 있다.** 3인칭으로 잡으면 관객이 "사진을 보는 사람"을 보게 되고,
 * 정작 봐야 할 얼룩은 화면에 없다. 그리고 이 예외가 다음 컷을 벌어 준다 —
 * 문이 열리고 발을 내딛는 순간 카메라가 뒤로 빠지며 **현재의 미오를 처음 보여준다**(장면 목적 ①).
 *
 * ## 조작
 * 뺏지 않는다. 마우스로 사진을 기울여 볼 수 있고, 기사가 부르면 **고개를 들 수 있다** —
 * 안 들면 3 초 뒤 미오가 스스로 든다(ACT 1 의 「보지 마!」와 같은 문법).
 * 고개를 드는 순간 백미러 안에서 눈 두 개가 이쪽을 본다.
 */

export interface Act2Deps {
  bus: Bus;
  fp: FirstPerson;
  dialogue: Dialogue;
  sequencer: Sequencer;
  sfx: Sfx;
  /** 「전기가 죽는다」를 광원 없이 가져오는 물건 (각색 6 C안) */
  phone: Phone;
  /** 좌석 위치를 매 프레임 갱신해야 흔들림이 카메라에 전달된다 */
  camera: THREE.PerspectiveCamera;
}

/**
 * 좌석에서 백미러를 보는 각도. 거울은 앞쪽 오른쪽 위에 있다 —
 * 자리(x −0.7)에서 거울(x +0.30)까지 옆으로 1 m, 눈높이(1.18)에서 거울(1.85)까지 위로 0.67 m,
 * 앞으로 약 4.2 m. 각도를 손으로 박아 두지 않고 여기 한 번만 적는다.
 */
// 카메라 전방은 yaw θ 에서 (−sinθ, 0, −cosθ) 다. 정면(π)에서 **오른쪽(+x)** 을 보려면
// −sinθ > 0, 즉 θ 를 **키워야** 한다. 부호를 반대로 잡아 창밖을 보고 있었다
const MIRROR_YAW = 0.23;
const MIRROR_PITCH = 0.05;

/** 시간 기반 비트 — 앉아 있는 장면이라 거리로 잴 것이 없다 */
interface Beat { at: number; run: (d: Act2Deps, self: Act2) => void }

export class Act2 {
  private state: 'idle' | 'run' | 'done' = 'idle';
  private t = 0;
  private fired = new Set<number>();
  private beats: Beat[] = [];
  private done: (() => void) | null = null;
  private anchor = new THREE.Vector3();
  /** 사진이 눈앞에 있는 정도 (1 = 들여다보는 중, 0 = 무릎으로 내려감) */
  private raise = 1;
  private raiseTarget = 1;
  /** 「학생.」 뒤 고개를 들기까지 남은 시간. 0 이하면 미오가 스스로 든다 */
  private lookUpIn = -1;
  private lookedUp = false;
  /** 고개를 드는 연출이 진행 중인 시간(초) */
  private steerT = 0;
  private photo: THREE.Group;
  private photoTilt = new THREE.Vector2();
  /** 프롭이 들어왔나 — 비어 있는 동안은 아무것도 그리지 않는다 */
  private photoReady = false;

  constructor(private d: Act2Deps) {
    // 프롭은 **스캔 모델**이다. 절차적 사진(`buildPhoto`)은 로드가 실패했을 때만 나온다 —
    // 먼저 띄워 놓고 바꿔 끼웠더니 장면 첫머리에 캡슐 엄지가 한 컷 스쳐 지나갔다(실측)
    this.photo = new THREE.Group();
    this.photo.visible = false;
    d.camera.add(this.photo);
    void loadPhotoModel()
      .catch((e) => { console.warn('[act2] 사진 모델 로드 실패 — 절차적 사진으로 간다:', e); return buildPhoto(); })
      .then((m) => { this.photo.add(m); this.photoReady = true; });

    this.beats = [
      // 사진부터 보여준다. 대사가 아니라 **이미지가 먼저** 와야 한다
      { at: 1.2, run: (d) => void d.dialogue.say({ text: '오래된 가족사진. 어린 미오와, 언니.', dur: 3.2 }) },
      { at: 5.0, run: (d) => void d.dialogue.say({ text: '언니의 얼굴만 물에 번진 것처럼 지워져 있다.', dur: 3.6 }) },
      // 기사가 부른다 → 여기서부터 고개를 들 수 있다
      { at: 9.4, run: (d, s) => { d.sfx.voice(0.55, 'low'); void d.dialogue.say({ who: '기사', text: '학생.', dur: 1.6 }); s.lookUpIn = 3.0; } },
      { at: 12.6, run: (d) => { d.sfx.voice(0.5, 'low'); void d.dialogue.say({ who: '기사', text: '히가사토 가는 거 맞지?', dur: 2.2 }); } },
      { at: 15.4, run: (d) => { d.sfx.voice(0.42, 'girl'); void d.dialogue.say({ who: '미오', text: '네.', dur: 1.4 }); } },
      { at: 17.4, run: (d) => { d.sfx.voice(0.5, 'low'); void d.dialogue.say({ who: '기사', text: '거긴 이제 아무것도 없는데.', dur: 2.4 }); } },
      { at: 20.6, run: (d) => { d.sfx.voice(0.44, 'girl'); void d.dialogue.say({ who: '미오', text: '사람을 찾으러 가요.', dur: 2.2 }); } },
      // 「기사는 백미러로 미오를 오래 바라보다 더 묻지 않는다」
      // — 눈이 **깜빡이지 않는다**. 이 ACT 에서 처음으로 뭔가 어긋나는 순간이다
      { at: 23.4, run: (d) => { d.bus.setEyes(1, true); void d.dialogue.say({ text: '기사는 백미러로 미오를 오래 바라보다, 더 묻지 않는다.', dur: 4.0 }); } },
      // --- 폰 (각색 6 C안 / P1-1) ---
      // 자리가 여기인 이유: 방금 「사람을 찾으러 가요」라고 말했다. 그 사람에게 걸어 보는 게
      // 다음 동작으로 자연스럽고, 실패가 **그 말 바로 뒤에** 붙어야 아프다.
      // 사진은 이미 무릎에 있다 — 「학생.」에 고개를 든 순간 내려갔다(`lookedUp`).
      // 한 손에 두 개를 들고 있는 그림이 안 나오는 건 그 덕이다.
      { at: 27.8, run: (d) => d.phone.show('lock') },
      { at: 29.4, run: (d) => void d.dialogue.say({ text: '15:04. 9月23日.', dur: 2.0 }) },
      { at: 31.6, run: (d) => { d.phone.set('calling'); void d.dialogue.say({ text: '「姉」— 미오는 통화 버튼을 누른다.', dur: 2.4 }); } },
      // 발신음이 **울리지 않는다**. 없는 소리가 실패를 말한다 — 안내 멘트를 깔면 그냥 정보다
      { at: 34.6, run: (d) => { d.phone.set('failed'); void d.dialogue.say({ text: '발신음이 울리지 않는다.', dur: 2.2 }); } },
      { at: 37.2, run: (d) => { d.sfx.voice(0.4, 'girl'); void d.dialogue.say({ who: '미오', text: '……산속이니까.', dur: 2.2 }); } },
      { at: 39.8, run: (d) => d.phone.hide() },
      // --- 도착 ---
      { at: 41.4, run: (d) => { d.bus.setEyes(0); d.bus.drive(0); d.sfx.busBrake(); } },
      { at: 44.6, run: (d) => { d.sfx.voice(0.52, 'low'); void d.dialogue.say({ who: '기사', text: '종점이야.', dur: 2.0 }); } },
      { at: 46.4, run: (d) => { d.bus.setDoor(true); d.sfx.busDoor(); } },
      { at: 48.4, run: (d, s) => void s.finish() },
    ];
  }

  /** 암전에서 열려 버스 안으로. resolve 는 문이 열리고 다시 암전된 시점 */
  async play(): Promise<void> {
    const d = this.d;
    d.bus.show(true);
    d.bus.drive(11);
    d.bus.setEyes(0);
    d.bus.setDoor(false);
    d.sfx.busEngine(true);

    // 좌석에 앉은 열여섯 — ACT 1(달리는 여섯 살)과 같은 리그지만 값이 전부 다르다.
    // 목은 어깨 위에서만 돈다(창가 자리에서 뒤를 돌아볼 일은 없다)
    d.bus.seatWorld(this.anchor);
    d.fp.begin(0, 3.6);
    d.fp.configure({ fov: 58, hand: false, bob: 0, resistFrom: 0.85, maxTurn: 1.5, anchor: this.anchor });
    // 버스의 **앞쪽(+z)** 을 정면으로 삼는다. 카메라 전방은 yaw θ 에서 (−sinθ, 0, −cosθ) 이므로
    // +z 를 보려면 θ = π 다. 0 으로 두면 뒷벽을 보고 앉아 있게 된다(실제로 그랬다)
    d.fp.yaw = d.fp.forwardYaw = Math.PI;
    d.fp.pitch = -0.34;               // 무릎 위의 사진을 내려다보고 있다
    this.photo.visible = this.photoReady;
    this.raise = this.raiseTarget = 1;

    d.sequencer.setFade(0, 1.6);
    this.state = 'run';
    return new Promise((r) => { this.done = r; });
  }

  get running() { return this.state === 'run'; }
  /** DEV */
  get time() { return this.t; }

  update(dt: number) {
    if (this.state !== 'run') return;
    const d = this.d;
    this.t += dt;

    // 좌석은 흔들린다 — 앵커를 매 프레임 갱신해야 그 흔들림이 카메라로 온다
    d.bus.seatWorld(this.anchor);

    for (let i = 0; i < this.beats.length; i++) {
      const b = this.beats[i]!;
      if (this.t >= b.at && !this.fired.has(i)) { this.fired.add(i); b.run(d, this); }
    }

    // --- 고개를 든다 ---
    // 플레이어가 스스로 들면(피치가 −0.1 위로) 그 순간, 안 들면 3 초 뒤 미오가 스스로 든다.
    // ACT 1 의 「보지 마!」와 같은 문법이다 — 조작을 뺏지 않되 장면은 반드시 일어난다
    if (this.lookUpIn > 0) {
      this.lookUpIn -= dt;
      if (d.fp.lookPitch > -0.1) this.lookUp();
      else if (this.lookUpIn <= 0) this.lookUp();
    }
    if (this.lookedUp && this.raiseTarget > 0) this.raiseTarget = 0;
    if (!this.lookedUp) {
      // 아직 사진을 보는 중 — 시선이 사진으로 도로 끌린다. 눈을 떼기 어렵다는 걸
      // 규칙이 아니라 **저항**으로 만든다(ACT 1 의 뒤돌아보기와 같은 문법)
      d.fp.steer(0, -0.34, dt, 0.7);
    } else if (this.steerT > 0) {
      // 고개를 든다 — **백미러 쪽으로**. 앉은 자리(−0.7)에서 거울(+0.30)은 오른쪽 위에 있다
      this.steerT -= dt;
      d.fp.steer(MIRROR_YAW, MIRROR_PITCH, dt, 3.2);
    }
    this.raise += (this.raiseTarget - this.raise) * (1 - Math.exp(-dt * 2.6));

    // --- 사진: 무릎에서 눈앞까지, 그리고 마우스로 기울인다 ---
    // 기울이면 얼룩이 빛을 받아 번들거린다 — 물에 젖었던 종이라는 걸 재질이 말한다
    const off = d.fp.offForward;
    this.photoTilt.x += ((d.fp.lookPitch + 0.34) * 0.7 - this.photoTilt.x) * (1 - Math.exp(-dt * 8));
    this.photoTilt.y += (off * 0.9 - this.photoTilt.y) * (1 - Math.exp(-dt * 8));
    const r = this.raise;
    // 화면 중앙 가까이 둔다. 아래로 내리면 자막띠(하단 13.5 vh)와 겹쳐 사진 위에 글자가 얹힌다
    this.photo.position.set(0.015 + off * 0.05, -0.10 - (1 - r) * 0.5, -0.31 - (1 - r) * 0.2);
    this.photo.rotation.set(PHOTO_TILT + this.photoTilt.x + (1 - r) * 0.5, this.photoTilt.y * 0.5, 0.03 + this.photoTilt.y * 0.25);
    this.photo.visible = this.photoReady && r > 0.02;
  }

  private lookUp() {
    if (this.lookedUp) return;
    this.lookedUp = true;
    this.lookUpIn = -1;
    this.steerT = 1.5;
    const d = this.d;
    // 백미러에 눈이 나타난다 — 고개를 들자마자 이미 보고 있었다
    d.bus.setEyes(0.9);
  }

  private async finish() {
    if (this.state !== 'run') return;
    this.state = 'done';
    const d = this.d;
    d.sequencer.setFade(1, 1.2);
    await wait(1500);
    this.photo.visible = false;
    d.bus.setEyes(0);
    d.bus.show(false);
    d.sfx.busEngine(false);
    d.fp.end();
    const r = this.done; this.done = null; r?.();
  }
}

/**
 * 손에 든 사진 — **스캔 모델**(`/models/props/photo-hands.glb`).
 *
 * 예전엔 판때기 한 장과 캡슐 엄지 둘을 절차적으로 세웠는데, 30 cm 앞에 두면 그게 손이 아니라
 * 흰 소시지로 보였다. 지금은 사진을 쥔 두 손이 통째로 한 메시다 — 사진 내용(언니와 어린 미오,
 * 그리고 **번진 언니의 얼굴**)까지 텍스처에 구워져 있다.
 *
 * 모델 로컬축: +z 가 사진 앞면, +y 가 위. 그대로 카메라 앞에 놓으면 된다.
 * 로드는 비동기라 `buildPhoto()` 의 절차적 사진이 먼저 뜨고, 도착하면 조용히 바뀐다.
 */
const PHOTO_URL = '/models/props/photo-hands.glb';
/**
 * 화면에서의 가로 폭(손 포함).
 *
 * 작게 잡으면 손목 잘린 단면이 화면 한가운데 떠서 **손이 공중에 뜬 것처럼** 보인다(실측).
 * 소매 끝이 화면 아래로 빠져나갈 만큼 크게 잡아야 그 단면이 안 보인다 — 사진 자체는
 * 자막띠(하단 13.5 vh) 위에 그대로 남는다.
 */
const PHOTO_WIDTH = 0.288;
/**
 * 사진을 든 각도(rad). 이 회전은 **카메라 로컬**이라 0 이면 렌즈와 정확히 마주 본다.
 * 예전 −0.62 는 무릎에 놓고 내려다보는 각이었는데, 그러면 사진이 사다리꼴로 눕고
 * 위쪽(언니의 얼굴)이 멀어진다 — 이 ACT 에서 반드시 읽혀야 할 곳이 제일 안 읽혔다.
 */
const PHOTO_TILT = -0.12;

async function loadPhotoModel(): Promise<THREE.Object3D> {
  // 빌드 산출물은 meshopt 압축이다(`build-props`) — 디코더를 단 로더가 아니면 로드 자체가 실패한다
  const gltf = await Props.loader().loadAsync(PHOTO_URL);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const s = PHOTO_WIDTH / Math.max(1e-6, size.x);
  const c = box.getCenter(new THREE.Vector3());
  const g = new THREE.Group();
  g.add(root);
  root.scale.setScalar(s);
  root.position.set(-c.x * s, -c.y * s, -c.z * s);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = false;
    m.frustumCulled = false;      // 카메라에 붙어 있어 바운딩 컬링이 오판한다
    m.renderOrder = 10;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const std = mat as THREE.MeshStandardMaterial;
      // 오후 햇빛(광원 2.9)에 구운 알베도를 그대로 두면 하얗게 날아간다 — 한 번 눌러 준다
      if (std.color) std.color.multiplyScalar(0.62);
      std.roughness = 0.6;
      std.metalness = 0;
    }
  });
  return g;
}

/** 모델이 오기 전(그리고 실패했을 때)의 사진 — 인화지 한 장과 그것을 쥔 엄지 둘 */
function buildPhoto(): THREE.Group {
  const g = new THREE.Group();
  const { front, back } = makePhoto();
  const W = 0.20, H = 0.133;
  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(W, H, 0.0006),
    [
      new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ map: front, color: 0xc2b9a4, roughness: 0.42, metalness: 0.02 }),
      new THREE.MeshStandardMaterial({ map: back, roughness: 0.72 }),
    ],
  );
  g.add(paper);
  const skin = new THREE.MeshStandardMaterial({ color: 0x6b4f3c, roughness: 0.72 });
  for (const side of [-1, 1]) {
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.016, 4, 8), skin);
    thumb.position.set(side * (W * 0.40), -H * 0.44, 0.004);
    thumb.rotation.set(0.15, 0, side * 0.42);
    g.add(thumb);
  }
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 10; } });
  return g;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
