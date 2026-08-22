import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clamp, damp, dampAngle } from '@/core/math';

/**
 * **사요** — ACT 1 에서 미오 앞을 달리는 언니.
 *
 * 기획(PLAN-STORY 표 「1 프롤로그」)의 한 줄이 이 파일의 전부다: *사요는 손·뒷모습만*.
 * 그래서 이 클래스가 지키는 규칙이 하나 있다 — **얼굴을 보여주지 않는다.**
 * 몸은 항상 진행 방향을 보고, 재촉할 때 도는 것은 목뿐이며 그것도 옆얼굴까지(≤ 50°)다.
 * ACT 30 에서 사진의 얼룩이 걷히는 순간을 위해 그 얼굴은 아껴 둔다.
 *
 * 왜 다시 세웠나: 2026-08-22 오전에 사요 모델을 통째로 걷어냈었다. 그때 화면이 무너진 원인은
 * "리깅 품질"로 적혀 있었지만 실제로는 **리그와 클립의 짝이 어긋난 것**이었다(rest 128° 차이,
 * `scripts/dev/rest.ts` 참고). 이번엔 같은 리그 태스크에서 클립을 뽑아 짝을 맞췄다:
 *
 *   rig  : Tripo `/animations/rig` v1.0-20240301 · spec tripo · biped (42본)
 *   clips: `/animations/retarget` preset:biped:{run,walk,idle} — **입력이 그 rig 태스크 id**
 *   build: `node scripts/build-character.ts --base …/rig/model_url.glb --clips …/anim --out public/models/sayo.glb`
 *
 * 짝이 맞는지는 `node scripts/dev/rest.ts assets/tripo/sayo-dress/rig/model_url.glb assets/tripo/sayo-dress/anim/run.glb`
 * 로 확인했다 — 42본 전부 소수점 셋째 자리까지 같다.
 *
 * ### 잡힌 손
 * 달리기 클립은 두 팔을 앞뒤로 흔든다. 그 위에 **왼팔만** 2본 IK 로 덮어써서 뒤(=미오)로 뻗는다.
 * 회전만 건다 — 본을 늘리거나(스케일) 옮기면(위치) 스킨이 그대로 찢어진다. 목표가 팔 길이를
 * 넘으면 **목표를 사거리 안으로 자른다**(늘리지 않는다). 그래서 팔은 어떤 거리에서도 안 뒤틀리고,
 * 대신 손이 미오의 손에 못 닿는다 — 미오의 팔은 화면에 없으므로(1인칭) 그 차이는 보이지 않는다.
 * 화면에 남는 것은 *뒤로 팽팽하게 뻗은 팔* 하나뿐이고, 그게 첨부 구도의 그림이다.
 */
export interface SayoPose {
  /** 발밑이 놓일 자리 (월드) */
  pos: THREE.Vector3;
  /** 몸이 보는 방향 (rad) */
  yaw: number;
  /** 잡힌 손이 있어야 할 자리 (월드). null 이면 팔을 놓는다 */
  hand: THREE.Vector3 | null;
  /** 달리는 속도 (m/s) — 클립 배속을 여기서 낸다 */
  speed: number;
  /** 0~1 뒤를 흘끗 본다 (목만, 옆얼굴까지) */
  glance?: number;
}

/**
 * 이 클립이 timeScale 1 에서 표현하는 이동 속도(m/s).
 * 미오 리그의 3.42(`settings.animation.runClipSpeed`)를 키 비율(1.50/1.62)로 줄인 값 —
 * 다리가 짧으면 같은 걸음 수로 덜 간다.
 */
const RUN_CLIP_SPEED = 3.15;
/**
 * 배속 상한. ACT 1 의 달리기는 9 m/s(`act1.ts` SPEED_MUL)라 그대로 나누면 ×2.9 가 된다 —
 * 다리가 프로펠러가 된다. 상한을 걸면 발이 조금 미끄러지는데, 빗속 8 m 시야에서는
 * 발밑 지면이 거의 안 보여서 미끄러짐보다 프로펠러가 훨씬 크게 티가 난다.
 */
const RUN_MAX = 1.9;
/** 사요의 키(m) — 열두 살. 여섯 살 미오(눈높이 1.05 m)보다 한 뼘 반 크다 */
const HEIGHT = 1.49;
/** 쇄골이 따라 여는 한계(rad). 10° */
const CLAV_MAX = 0.175;
/** 목이 돌아가는 한계(rad). 51° — 여기까지가 옆얼굴이다 */
const GLANCE_MAX = 0.9;

export interface SayoOptions {
  url?: string;
  /** 목표 신장(m). 열두 살 — 여섯 살 미오(눈높이 1.05 m)보다 한 뼘 반 크다 */
  height?: number;
  /** 모델의 정면 보정(rad). 기본 −90° — 아래 `YAW_OFFSET` 참고 */
  yawOffset?: number;
}

/**
 * **Tripo 클립의 정면은 +X 다.** (`character/config.ts` 의 `yawOffset` 과 같은 규약)
 *
 * 리깅 산출물의 **바인드 포즈**는 +Z 를 본다(발가락 본이 +Z 를 가리킨다). 그런데 프리셋
 * 애니메이션은 +X 를 정면으로 삼고 만들어져 있어서, 보정 없이 재생하면 **몸은 12시를 보는데
 * 다리는 9시–3시로 흔들린다** — 옆으로 게걸음을 치면서 앞으로 미끄러진다(사용자 리포트:
 * 「달리는 축이 10시인데 무빙은 12시」).
 *
 * 실측으로 확인한 것(`dev/sayo-run.html` 에서):
 *   · 발 궤적의 주축이 모델 **X** 축 (진폭 0.84 m) — Z 방향 변위는 6 cm 뿐
 *   · 몸통이 기우는 방향(엉덩이→머리)도 모델 **+X** — 달리는 사람은 진행 방향으로 기운다
 *   · 그래서 어깨선이 15 cm 기울어 보였다. 롤이 아니라 **앞으로 숙인 것을 옆에서 본 것**이다
 *     (여기서 한 번 "Hip 에 상시 롤이 박혔다"고 오진해서 롤을 깎는 코드를 넣었었다)
 *
 * −90° 를 걸면 모델 +X 가 루트의 +Z 로 가고, 그때부터 `root.rotation.y` 가 곧 진행 방향이다.
 */
const YAW_OFFSET = -Math.PI / 2;

export class Sayo {
  readonly root = new THREE.Group();
  /** 정규화(신장·발바닥) 전용 래퍼 — 애니메이션 채널이 닿지 않는 자리 */
  private inner = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private materials: THREE.Material[] = [];
  /** 왼팔 체인 — 뒤로 뻗어 미오의 손을 잡는 팔 */
  private clav: THREE.Object3D | null = null;
  private upper: THREE.Object3D | null = null;
  private fore: THREE.Object3D | null = null;
  private hand: THREE.Object3D | null = null;
  private head: THREE.Object3D | null = null;
  private neck: THREE.Object3D[] = [];
  /** 팔 IK 가중치 0~1 — 손을 놓으면 0 으로 내려가고 팔이 달리기 클립으로 돌아간다 */
  private armW = 0;
  private lastHand = new THREE.Vector3();
  private glanceNow = 0;
  /** 팔 흔들림 위상 — 팽팽한 팔이 죽은 막대가 되지 않게 목표를 조금 흔든다 */
  private phase = 0;
  private opacity = 1;

  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private v4 = new THREE.Vector3();
  private pole = new THREE.Vector3();
  private elbow = new THREE.Vector3();
  private target = new THREE.Vector3();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private saved: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];

  private constructor(gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }, opts: SayoOptions) {
    const scene = gltf.scene;
    this.root.name = 'sayo';
    this.inner.add(scene);
    this.root.add(this.inner);

    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;   // 스킨드 메시의 바운딩은 바인드 포즈 것이라 못 믿는다
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) this.materials.push(mat);
    });

    // 정규화: **클립 기준 정면**(+X)을 +Z 로 돌린다 (위 `YAW_OFFSET` 주석)
    scene.rotation.y = opts.yawOffset ?? YAW_OFFSET;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(this.v1);
    const target = opts.height ?? HEIGHT;
    const s = size.y > 1e-6 ? target / size.y : 1;
    this.inner.scale.setScalar(s);
    const center = box.getCenter(this.v2);
    this.inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);

    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of gltf.animations) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(clip.name, action);
    }

    scene.traverse((o) => {
      if (o.name === 'L_Clavicle') this.clav = o;
      else if (o.name === 'L_Upperarm') this.upper = o;
      else if (o.name === 'L_Forearm') this.fore = o;
      else if (o.name === 'L_Hand') this.hand = o;
      else if (o.name === 'Head') this.head = o;
      else if (/^NeckTwist\d+$/.test(o.name)) this.neck.push(o);
    });
  }

  static async load(scene: THREE.Scene, opts: SayoOptions = {}): Promise<Sayo> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(opts.url ?? '/models/sayo.glb');
    const sayo = new Sayo(gltf, opts);
    sayo.play('run');
    sayo.groundToClip();
    sayo.root.visible = false;
    scene.add(sayo.root);
    return sayo;
  }

  get clipNames() { return [...this.actions.keys()]; }

  /** 클립 전환 (달리기 하나면 충분하지만 넘어짐 구간에서 걷기로 떨어뜨린다) */
  play(name: string, fade = 0.25) {
    const next = this.actions.get(name);
    if (!next || this.current === next) return;
    next.reset().play();
    next.setEffectiveWeight(1);
    if (this.current) this.current.crossFadeTo(next, fade, true);
    this.current = next;
  }
  private current: THREE.AnimationAction | null = null;

  /**
   * **발을 땅에 붙인다.** Tripo 클립은 Hip 을 원점에 두므로 재생하는 순간 바인드 포즈 기준으로
   * 잡아 둔 발바닥 오프셋이 어긋난다(미오도 `CharacterModel.calibrateOffset` 에서 같은 일을 한다).
   *
   * 달리기는 한 프레임만 봐서는 안 된다 — 그 순간 두 발이 다 떠 있을 수 있다.
   * 한 사이클을 24 등분해 **가장 낮은 발**을 찾고 그 높이를 0 으로 맞춘다.
   */
  private groundToClip() {
    const action = this.actions.get('run') ?? this.actions.get('idle');
    if (!action) return;
    let skinned: THREE.SkinnedMesh | null = null;
    this.inner.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
    if (!skinned) return;
    const sk = skinned as THREE.SkinnedMesh;
    const dur = action.getClip().duration;
    action.reset().play();
    let lo = Infinity;
    const toInner = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      action.time = (dur * i) / 24;
      this.mixer.update(0);
      this.root.updateMatrixWorld(true);
      sk.computeBoundingBox();
      toInner.copy(this.inner.matrixWorld).invert().multiply(sk.matrixWorld);
      lo = Math.min(lo, sk.boundingBox!.clone().applyMatrix4(toInner).min.y);
    }
    action.time = 0;
    this.inner.position.y = -lo * this.inner.scale.y;
    if (import.meta.env.DEV) console.info('[sayo] grounded by run cycle, minY', +lo.toFixed(3));
  }

  /**
   * 투명도. `needsUpdate` 는 **투명 전환이 실제로 바뀔 때만** 건다 —
   * 매 프레임 세우면 셰이더 프로그램 키를 다시 뽑는다(이 프로젝트가 히치로 여러 번 잡힌 자리다).
   */
  setOpacity(v: number) {
    const o = clamp(v, 0, 1);
    if (Math.abs(o - this.opacity) < 1e-3) return;
    const wasTransparent = this.opacity < 0.999;
    this.opacity = o;
    this.root.visible = o > 0.02;
    const nowTransparent = o < 0.999;
    for (const mat of this.materials) {
      mat.transparent = nowTransparent;
      mat.opacity = o;
      mat.depthWrite = !nowTransparent;
      if (nowTransparent !== wasTransparent) mat.needsUpdate = true;
    }
  }

  show(v: boolean) {
    this.root.visible = v;
    if (v) this.setOpacity(1);
  }

  /** 처음 세울 때 — 감쇠 없이 그 자리에 놓는다 (첫 프레임에 화면을 가로질러 날아오지 않게) */
  place(pos: THREE.Vector3, yaw: number) {
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
    this.armW = 0;
    this.glanceNow = 0;
  }

  update(dt: number, p: SayoPose) {
    if (!this.root.visible) return;
    /**
     * --- 자리 ---
     * **수평은 감쇠하지 않는다.** 감쇠는 목표가 서 있을 때만 공짜다 — 목표가 v 로 달리면
     * 정상 상태 지연이 **v / λ** 로 남는다. 5.58 m/s · λ 16 이면 **0.35 m**, 리드(0.29 m)보다 크다.
     * 그래서 튜닝대에서 맞춘 거리가 게임에서는 절반으로 줄어 있었다(실측 0.43 → 0.26).
     * 길 표본(`roadAt`)은 스플라인이라 원래 매끄럽고, 좌우는 플레이어 위치를 물려받으므로
     * 떨림도 플레이어의 것뿐이다 — 그냥 그 자리에 놓는 게 맞다.
     * 높이만 감쇠한다: 지면 높이는 한 프레임에 계단처럼 뛸 수 있다.
     */
    this.root.position.x = p.pos.x;
    this.root.position.z = p.pos.z;
    this.root.position.y = damp(this.root.position.y, p.pos.y, 14, dt);
    this.root.rotation.y = dampAngle(this.root.rotation.y, p.yaw, 7, dt);

    // --- 클립 ---
    if (this.current) this.current.timeScale = clamp(p.speed / RUN_CLIP_SPEED, 0.55, RUN_MAX);
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    this.phase += dt * clamp(p.speed / RUN_CLIP_SPEED, 0.55, RUN_MAX) * 9;

    // --- 잡힌 손 ---
    if (p.hand) this.lastHand.copy(p.hand);
    // 놓는 쪽이 잡는 쪽보다 빠르다 — 손가락이 풀리는 데는 시간이 안 걸린다.
    // 천천히 풀면 팔이 **녹아 사라지는** 것처럼 보인다(0.9 초는 그랬다)
    this.armW = damp(this.armW, p.hand ? 1 : 0, p.hand ? 6 : 9, dt);
    if (this.armW > 0.02) {
      // 팔이 팽팽하면 목표가 사거리 밖이라 결과가 매 프레임 똑같다 = 죽은 막대가 된다.
      // 달리기 위상으로 목표를 2 cm 흔들어 준다 — 어깨가 걸음마다 조금씩 밀린다
      this.target.copy(this.lastHand);
      this.target.y += Math.sin(this.phase) * 0.022;
      this.solveArm(this.target, this.armW);
    }

    // --- 흘끗 --- 몸은 안 돈다. 목만, 옆얼굴까지
    this.glanceNow = damp(this.glanceNow, clamp(p.glance ?? 0, 0, 1), 6, dt);
    if (this.glanceNow > 0.01) this.turnHead(this.glanceNow * GLANCE_MAX);
  }

  /**
   * **2본 IK** — 어깨와 팔꿈치 두 관절로 손을 목표에 가져간다.
   *
   * 순서: ⓪ 쇄골을 조금 연다 → ① 코사인 법칙으로 **팔꿈치가 있어야 할 자리**를 계산해 위팔을
   * 그리로 돌린다 → ② 아래팔을 목표로 돌린다. 최소각 회전 두 번이라 롤이 안 섞인다.
   *
   * **팔꿈치 방향(폴)을 고정한다.** 처음엔 "지금 굽어 있는 방향을 유지"하려고 굽힘 축을
   * 애니메이션 포즈에서 뽑았는데, 그 축이 달리기 사이클마다 돌아가서 **팔꿈치가 한 걸음마다
   * 뒤집혔다**. 뒤로 뻗은 팔의 팔꿈치는 아래·바깥으로 떨어지는 게 맞고, 그건 캐릭터 기준으로
   * 고정된 방향이다 — 그래서 월드 아래(−Y)와 몸의 왼쪽을 섞어 폴로 쓴다.
   *
   * 쇄골 보정은 **10° 로 자른다.** 처음에 "어깨 회전의 22 %"로 뒀더니, 뒤로 150° 넘게 도는
   * 회전의 22 % = 33° 가 그대로 쇄골에 실려 **왼쪽 어깨가 15 cm 내려앉았다**(실측:
   * L_Upperarm y 1.040 vs R 1.194). 사람도 뒤로 뻗을 때 어깨가 열리지만 그건 몇 도다.
   */
  private solveArm(target: THREE.Vector3, weight: number) {
    const clav = this.clav, upper = this.upper, fore = this.fore, hand = this.hand;
    if (!clav || !upper || !fore || !hand) return;

    // 블렌딩용 — 애니메이션이 만든 로컬 회전을 기억해 둔다
    this.saved[0]!.copy(clav.quaternion);
    this.saved[1]!.copy(upper.quaternion);
    this.saved[2]!.copy(fore.quaternion);

    // ⓪ 쇄골 — 목표 쪽으로 조금(≤ CLAV_MAX) 연다
    let sPos = upper.getWorldPosition(this.v1);
    let hPos = hand.getWorldPosition(this.v3);
    this.q1.setFromUnitVectors(
      this.v4.copy(hPos).sub(sPos).normalize(),
      this.v2.copy(target).sub(sPos).normalize(),
    );
    const aim = 2 * Math.acos(clamp(Math.abs(this.q1.w), -1, 1));
    this.q2.identity().slerp(this.q1, aim > 1e-3 ? Math.min(0.22, CLAV_MAX / aim) : 0);
    this.applyWorldDelta(clav, this.q2);

    // --- 팔꿈치가 있어야 할 자리 ---
    sPos = upper.getWorldPosition(this.v1);
    const ePos = fore.getWorldPosition(this.v2);
    hPos = hand.getWorldPosition(this.v3);
    const a = sPos.distanceTo(ePos);   // 위팔
    const b = ePos.distanceTo(hPos);   // 아래팔
    if (a < 1e-4 || b < 1e-4) return;
    // **사거리 밖이면 목표를 자른다.** 늘리는 대신 팔이 팽팽해질 뿐이다 — 메시는 안 뒤틀린다
    const armDir = this.v4.copy(target).sub(sPos);
    const c = clamp(armDir.length(), Math.abs(a - b) + 1e-3, (a + b) * 0.995);
    armDir.normalize();
    // 폴: 월드 아래 + 몸의 왼쪽(뻗은 팔 쪽 바깥). 팔 방향 성분을 빼서 수직 성분만 남긴다
    const yaw = this.root.rotation.y;
    this.pole.set(Math.cos(yaw) * 0.32, -0.95, -Math.sin(yaw) * 0.32).normalize();
    this.pole.addScaledVector(armDir, -this.pole.dot(armDir));
    if (this.pole.lengthSq() < 1e-6) this.pole.set(0, -1, 0).addScaledVector(armDir, -armDir.y);
    this.pole.normalize();
    const A = Math.acos(clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1));   // 어깨에서 벌어지는 각
    this.elbow.copy(sPos)
      .addScaledVector(armDir, Math.cos(A) * a)
      .addScaledVector(this.pole, Math.sin(A) * a);

    // ① 위팔 — 지금 팔꿈치가 있는 방향을 계산된 자리로
    this.q1.setFromUnitVectors(
      this.v3.copy(ePos).sub(sPos).normalize(),
      this.v2.copy(this.elbow).sub(sPos).normalize(),
    );
    this.applyWorldDelta(upper, this.q1);

    // ② 아래팔 — 손을 목표로. (①에서 팔꿈치가 옮겨졌으므로 위치를 다시 읽는다)
    const e2 = fore.getWorldPosition(this.v1);
    const h2 = hand.getWorldPosition(this.v2);
    this.q1.setFromUnitVectors(
      this.v3.copy(h2).sub(e2).normalize(),
      this.v4.copy(target).sub(e2).normalize(),
    );
    this.applyWorldDelta(fore, this.q1);

    // --- 애니메이션 ↔ IK 블렌딩 ---
    if (weight < 0.999) {
      this.blend(clav, this.saved[0]!, weight);
      this.blend(upper, this.saved[1]!, weight);
      this.blend(fore, this.saved[2]!, weight);
      this.root.updateMatrixWorld(true);
    }
  }

  /** 월드 기준 회전 델타를 본에 건다 (부모 회전을 벗겨 로컬로 심는다) */
  private applyWorldDelta(bone: THREE.Object3D, delta: THREE.Quaternion) {
    const world = bone.getWorldQuaternion(this.qw).premultiply(delta);
    bone.parent!.getWorldQuaternion(this.qp).invert();
    bone.quaternion.copy(this.qp).multiply(world);
    bone.updateWorldMatrix(false, true);
  }
  private qw = new THREE.Quaternion();
  private qp = new THREE.Quaternion();
  private qb = new THREE.Quaternion();

  /** 푼 결과와 애니메이션 결과를 섞는다 */
  private blend(bone: THREE.Object3D, animated: THREE.Quaternion, w: number) {
    this.qb.copy(bone.quaternion);
    bone.quaternion.copy(animated).slerp(this.qb, w);
  }

  /**
   * **목만 돌린다.** 축은 본의 로컬이 아니라 **월드 +Y** 다 — 리그의 rest 회전이 본마다 달라
   * 로컬 Y 로 돌리면 고개가 끄덕이거나 갸웃한다(미오에서 `headRoll` 로 같은 교훈을 얻었다).
   * 목 두 마디와 머리에 나눠 걸어야 목뿌리만 꺾이지 않는다.
   */
  private turnHead(ang: number) {
    const share = this.neck.length ? 0.55 : 0;
    const each = this.neck.length ? (ang * share) / this.neck.length : 0;
    for (const b of this.neck) this.rollBone(b, each);
    if (this.head) this.rollBone(this.head, ang * (1 - share));
  }
  private rollBone(bone: THREE.Object3D, ang: number) {
    if (Math.abs(ang) < 1e-4) return;
    bone.parent!.getWorldQuaternion(this.qp).invert();
    this.v1.set(0, 1, 0).applyQuaternion(this.qp).normalize();
    this.q1.setFromAxisAngle(this.v1, ang);
    bone.quaternion.premultiply(this.q1);
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const std = mat as THREE.MeshStandardMaterial;
        for (const t of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap]) t?.dispose();
        mat.dispose();
      }
    });
  }
}
