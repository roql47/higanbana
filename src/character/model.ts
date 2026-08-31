import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterController } from './controller';
import { settings } from '@/core/settings';
import { damp } from '@/core/math';
import { createGLTFLoader } from '@/core/gltf';

export interface CharacterModelOptions {
  /** 기본 모델(GLB). 리깅된 메시 포함 */
  url: string;
  /** 클립별 GLB — 파일명 → 클립 이름. 같은 리그의 애니메이션만 추출해 base 모델에 적용 */
  clips?: Record<string, string>;
  /** 목표 신장(m). 바운딩박스 높이를 이 값으로 정규화 */
  targetHeight?: number;
  /** 모델의 정면이 +Z가 아니면 보정 (rad) */
  yawOffset?: number;
  /** T포즈 리그에 A포즈 이동 클립을 붙일 때 팔의 외전·상향 스윙을 월드 공간에서 제한 */
  constrainLocomotionArms?: boolean;
}

/**
 * Tripo GLB 캐릭터. PlaceholderCharacter 와 같은 인터페이스(update / setVisibility / root).
 * - 발바닥을 원점에, 신장 정규화, +Z 정면
 * - AnimationMixer + 크로스페이드 (Phase 3 상태머신이 play() 를 호출)
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  /** 상체 전용 레이어(두 번째 믹서). 본 믹서 뒤에 갱신되어 상체 본을 덮어쓴다 */
  readonly upperMixer: THREE.AnimationMixer;
  private upperActions = new Map<string, THREE.AnimationAction>();
  private upperCurrent: THREE.AnimationAction | null = null;
  readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private inner = new THREE.Group(); // 스케일/오프셋 보정용
  private materials: THREE.Material[] = [];
  private leanX = 0;
  private leanZ = 0;
  private squash = 0;
  private squashVel = 0;
  private baseScale = 1;
  height = 1.7;
  /** 고개 보정 목표(rad) — 애니메이터가 상태에 따라 갱신 */
  headPitchTarget = 0;
  spinePitchTarget = 0;
  private headPitch = 0;
  private spinePitch = 0;
  private headBone: THREE.Object3D | null = null;
  /**
   * **믹서 출력의 우리 쪽 사본.** 아래 자세 보정들은 전부 믹서가 쓴 본 쿼터니언 **위에** 곱해진다.
   * 그런데 three.js `PropertyMixer.apply()` 는 이번 프레임 값이 지난 프레임과 같으면
   * **본에 쓰지 않는다**(변화가 없으면 씬 그래프를 건드리지 않는 최적화). 미오 클립의
   * `Head`·`NeckTwist02` 는 키가 2개뿐이고 값도 같은 **고정 트랙**이라 이 생략에 걸리고,
   * 특히 **클립 루프가 넘어간 직후 두 프레임 연속으로** 생략된다.
   *
   * 그 두 프레임 동안 보정은 「이미 보정된 값」에 다시 곱해져 **2배·3배**로 쌓인다.
   * 실측(walk, 60 fps 고정 스텝, `Head.quaternion.x`): 0.0636 → **0.1271 → 0.1902** → 0.0636.
   * 클립 한 바퀴(walk 2.375 s = 발소리 4번)마다 고개가 한 프레임 뒤로 꺾였다 돌아온다 —
   * 사용자가 본 「달릴 때·걸을 때 이상한 프레임」이 이것이다.
   *
   * → 매 프레임 **본 값이 우리가 지난 프레임에 쓴 값과 똑같으면 믹서가 건너뛴 것**으로 보고,
   *   보정 전 원본(`raw`)으로 되돌린 뒤 보정을 건다. 그러면 보정은 항상 1회분만 걸린다.
   */
  private poseCache: { bone: THREE.Object3D; raw: THREE.Quaternion; out: THREE.Quaternion }[] = [];
  private poseCacheReady = false;
  /** 목 본(위→아래 순) — 보정을 한 관절에 몰지 않고 목 전체에 나눠 건다 */
  private neckBones: THREE.Object3D[] = [];
  private spineBones: THREE.Object3D[] = [];
  /** 손 본 — 손목 롤 보정(`settings.character.handRoll`)이 여기 걸린다 */
  private handBones: THREE.Object3D[] = [];
  /** 쇄골 — 어깨선 수평·말림 보정이 여기 걸린다 */
  private clavicleBones: THREE.Object3D[] = [];
  private armL: { upper?: THREE.Object3D; fore?: THREE.Object3D; hand?: THREE.Object3D } = {};
  private armR: { upper?: THREE.Object3D; fore?: THREE.Object3D; hand?: THREE.Object3D } = {};
  private constrainLocomotionArms = false;
  private tmpQ2 = new THREE.Quaternion();
  private tmpQ3 = new THREE.Quaternion();
  private tmpQ4 = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private tmpV4 = new THREE.Vector3();
  private innerBaseY = 0;
  private tmpQ = new THREE.Quaternion();
  /** 카메라가 몸 안에 들어왔을 때 표시 상태가 경계에서 깜박이지 않게 하는 히스테리시스 */
  private closeCameraHidden = false;
  private originalMaps = new Map<THREE.MeshStandardMaterial, THREE.Texture>();
  /** 믹서·보정 뒤에 얹는 절차적 포즈 훅 (공격 등) */
  postPose: ((dt: number) => void) | null = null;

  private constructor(gltf: GLTF, opts: CharacterModelOptions, renderer?: THREE.WebGLRenderer) {
    const scene = gltf.scene;
    this.inner.add(scene);
    this.root.add(this.inner);
    this.root.name = 'character';
    this.constrainLocomotionArms = opts.constrainLocomotionArms ?? false;

    // 그림자·재질 정리
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false; // 스킨드 메시는 바운딩이 부정확할 수 있음
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          this.materials.push(mat);
          const std = mat as THREE.MeshStandardMaterial;
          if (std.isMeshStandardMaterial) {
            std.envMapIntensity = 1.0;
          }
        }
      }
    });

    // 정규화: 정면 보정 → 바운딩박스 기준 발바닥 → 원점, 신장 → targetHeight
    scene.rotation.y = opts.yawOffset ?? 0;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const target = opts.targetHeight ?? 1.7;
    const s = size.y > 1e-6 ? target / size.y : 1;
    this.inner.scale.setScalar(s);
    this.baseScale = s;
    const center = box.getCenter(new THREE.Vector3());
    this.inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    this.height = target;

    this.mixer = new THREE.AnimationMixer(scene);
    this.upperMixer = new THREE.AnimationMixer(scene);
    for (const clip of gltf.animations) this.addClip(clip.name, clip);

    scene.traverse((o) => {
      if (/^(Head|mixamorig:Head)$/.test(o.name)) this.headBone = o;
      if (/^(NeckTwist\d+|Neck|mixamorig:Neck)$/.test(o.name)) this.neckBones.push(o);
      if (/^(Spine01|Spine02|mixamorig:Spine1|mixamorig:Spine2)$/.test(o.name)) this.spineBones.push(o);
      if (/^([LR]_Hand|mixamorig:(Left|Right)Hand)$/.test(o.name)) this.handBones.push(o);
      if (/^([LR]_Clavicle|mixamorig:(Left|Right)Shoulder)$/.test(o.name)) this.clavicleBones.push(o);
      if (o.name === 'L_Upperarm') this.armL.upper = o;
      else if (o.name === 'L_Forearm') this.armL.fore = o;
      else if (o.name === 'L_Hand') this.armL.hand = o;
      else if (o.name === 'R_Upperarm') this.armR.upper = o;
      else if (o.name === 'R_Forearm') this.armR.fore = o;
      else if (o.name === 'R_Hand') this.armR.hand = o;
      if ((o as THREE.Bone).isBone) this.poseCache.push({ bone: o, raw: new THREE.Quaternion(), out: new THREE.Quaternion() });
    });
    for (const mat of this.materials) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.isMeshStandardMaterial && std.map) this.originalMaps.set(std, std.map);
    }
  }

  /**
   * 알베도 색보정: 픽셀을 캔버스로 복사하지 않고 map 샘플 직후 셰이더에서 처리한다.
   * KTX2 CompressedTexture는 HTMLImage가 아니므로 drawImage할 수 없고, WebP도 캔버스 복제본을
   * 만들면 같은 알베도가 GPU 메모리에 두 벌 남는다. uniform만 갱신하면 두 경로 모두 원본 한 장이다.
   */
  gradeAlbedo() {
    const g = settings.character;
    for (const [mat] of this.originalMaps) {
      type GradeUniforms = {
        saturation: { value: number };
        contrast: { value: number };
        brightness: { value: number };
        warmth: { value: number };
      };
      let uniforms = mat.userData['characterGrade'] as GradeUniforms | undefined;
      if (!uniforms) {
        uniforms = {
          saturation: { value: g.saturation }, contrast: { value: g.contrast },
          brightness: { value: g.brightness }, warmth: { value: g.warmth },
        };
        mat.userData['characterGrade'] = uniforms;
        const previousCompile = mat.onBeforeCompile;
        const previousKey = mat.customProgramCacheKey.bind(mat);
        mat.onBeforeCompile = (shader, renderer) => {
          previousCompile(shader, renderer);
          shader.uniforms['uGradeSaturation'] = uniforms!.saturation;
          shader.uniforms['uGradeContrast'] = uniforms!.contrast;
          shader.uniforms['uGradeBrightness'] = uniforms!.brightness;
          shader.uniforms['uGradeWarmth'] = uniforms!.warmth;
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
              uniform float uGradeSaturation;
              uniform float uGradeContrast;
              uniform float uGradeBrightness;
              uniform float uGradeWarmth;`)
            .replace('#include <map_fragment>', `#ifdef USE_MAP
              vec4 sampledDiffuseColor = texture2D( map, vMapUv );
              #ifdef DECODE_VIDEO_TEXTURE
                sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
              #endif
              float gradeLuma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              sampledDiffuseColor.rgb = mix(vec3(gradeLuma), sampledDiffuseColor.rgb, uGradeSaturation);
              sampledDiffuseColor.rgb = (sampledDiffuseColor.rgb - 0.5) * uGradeContrast + 0.5;
              sampledDiffuseColor.rgb *= uGradeBrightness;
              sampledDiffuseColor.rgb += vec3(uGradeWarmth, 0.0, -uGradeWarmth);
              diffuseColor *= clamp(sampledDiffuseColor, 0.0, 1.0);
            #endif`);
        };
        mat.customProgramCacheKey = () => `${previousKey()}|character-grade-v1`;
        mat.needsUpdate = true;
      }
      uniforms.saturation.value = g.saturation;
      uniforms.contrast.value = g.contrast;
      uniforms.brightness.value = g.brightness;
      uniforms.warmth.value = g.warmth;
    }
  }

  /** meshopt는 항상, KTX2는 렌더러 지원 검사 뒤에만 붙인다. */
  static loaders(_renderer?: THREE.WebGLRenderer) {
    return createGLTFLoader();
  }

  static async load(opts: CharacterModelOptions, renderer?: THREE.WebGLRenderer): Promise<CharacterModel> {
    const loader = CharacterModel.loaders(renderer);
    const gltf = await loader.loadAsync(opts.url);
    const model = new CharacterModel(gltf, opts, renderer);
    if (opts.clips) {
      const entries = Object.entries(opts.clips);
      const results = await Promise.allSettled(entries.map(([, url]) => loader.loadAsync(url)));
      results.forEach((r, i) => {
        const name = entries[i]![0];
        if (r.status === 'fulfilled') {
          const clip = r.value.animations[0];
          if (clip) model.addClip(name, clip);
          else console.warn(`[character] ${name}: 애니메이션 없음`);
          // 클립 GLB 의 지오메트리는 버림
          r.value.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) { m.geometry.dispose(); }
          });
        } else {
          console.warn(`[character] 클립 로드 실패 ${name}:`, r.reason);
        }
      });
    }
    model.calibrateOffset('idle');
    model.innerBaseY = model.inner.position.y;
    model.gradeAlbedo();
    model.applyAnisotropy(renderer);
    return model;
  }

  /**
   * 이방성 필터링을 GPU 최대치로. 기본값 1 은 비스듬한 각도에서 텍스처가 뭉개진다(거의 무료).
   * **gradeAlbedo() 뒤에 호출해야 한다** — 색보정이 알베도를 캔버스 텍스처로 갈아끼우면서
   * anisotropy 가 1 로 초기화되기 때문(2026-08-19 실측).
   */
  applyAnisotropy(renderer?: THREE.WebGLRenderer) {
    if (!renderer) return;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    for (const mat of this.materials) {
      const mm = mat as THREE.MeshStandardMaterial;
      for (const t of [mm.map, mm.normalMap, mm.roughnessMap, mm.metalnessMap, mm.aoMap]) {
        if (t && t.anisotropy !== maxAniso) { t.anisotropy = maxAniso; t.needsUpdate = true; }
      }
    }
  }

  /**
   * 클립 등록 — **회전만 받는다.**
   *
   * 이 프로젝트의 클립은 `character.glb` 리그에서 만들어졌는데 게임은 `mio.glb` 를 쓴다.
   * 그런데 클립에는 42 본 전부의 **position·scale 트랙**이 들어 있어서, 재생하는 순간
   * 미오의 본 오프셋이 **원본 리그의 비율로 덮어써진다** — 즉 미오가 다른 사람의 골격으로 포즈를 잡는다.
   *
   * 실측(미오 rest 대비 클립이 써 넣는 본 길이):
   * `L_Upperarm` **0.635** · `R_Upperarm` 0.696 · `Head` 0.727 · `L_Forearm` 0.898 /
   * `L_Clavicle` 1.094 · `NeckTwist01` 1.079 · `Spine02` 1.079
   *
   * 어깨 관절이 목 쪽으로 36 % 당겨지니 어깨가 좁아지고 **움츠러들어 보인다**(사용자 지적).
   * v3.1 의 어깨 처짐, v3.7 의 고개 기울기도 전부 이 한 가지에서 나온 증상이다.
   *
   * 그래서 **position·scale 트랙을 버린다**. 리타게팅의 기본 규칙이다 — 회전은 옮겨도 되지만
   * 뼈 길이는 받는 쪽 것을 쓴다. 예외는 `Root`·`Hip` 의 이동(걷기 상하 바운스·루트 모션)뿐이고,
   * Hip 을 원점에 두는 Tripo 관례는 `calibrateOffset()` 이 이미 흡수한다.
   * (`character.glb` 는 자기 리그에서 만든 클립이라 트랙 값이 곧 rest — 버려도 결과가 같다)
   */
  addClip(name: string, clip: THREE.AnimationClip) {
    clip.name = name;
    clip.tracks = clip.tracks.filter((t) => KEEP_TRACK.test(t.name));
    if (CYCLIC_CLIPS.has(name)) makeCyclic(clip);
    const action = this.mixer.clipAction(clip);
    action.enabled = true;
    this.actions.set(name, action);
  }

  /**
   * 애니메이션 좌표계 보정: Tripo 클립은 Hip 을 원점에 두므로 재생 시 바인드 포즈 대비 몸이 내려간다.
   * 기준 클립(idle)의 첫 프레임을 적용한 뒤 스킨 바운딩박스로 발바닥·중심을 다시 맞춘다.
   */
  calibrateOffset(refClip = 'idle') {
    const action = this.actions.get(refClip);
    if (!action) return;
    let sk: THREE.SkinnedMesh | null = null;
    this.inner.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) sk = o as THREE.SkinnedMesh; });
    if (!sk) return;
    const skinned = sk as THREE.SkinnedMesh;
    action.reset().play();
    action.time = 0;
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
    skinned.computeBoundingBox(); // 스키닝 적용된 로컬 바운딩박스
    // skinned 로컬 → inner 의 자식 공간(inner 스케일 적용 전) 으로 변환
    const toInnerChild = new THREE.Matrix4().copy(this.inner.matrixWorld).invert().multiply(skinned.matrixWorld);
    const box = skinned.boundingBox!.clone().applyMatrix4(toInnerChild);
    const center = box.getCenter(new THREE.Vector3());
    const s = this.baseScale;
    this.inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    action.stop();
    if (import.meta.env.DEV) console.info('[character] calibrated offset by', refClip, { posedMinY: +box.min.y.toFixed(3), center: center.toArray().map((v) => +v.toFixed(3)) });
  }

  /** 절차 자세(웅크림 등)가 몸 전체를 낮출 때 — 발바닥 캘리브레이션 기준에서 내린다 */
  setPoseDrop(v: number) { this.inner.position.y = this.innerBaseY - v; }

  get clipNames() { return [...this.actions.keys()]; }
  /** 상체 레이어에서 재생 중인 액션 (없으면 null) */
  getUpperAction(name: string) { return this.upperActions.get(name) ?? null; }

  /** 상체 본만 남긴 서브클립을 상체 레이어에서 원샷 재생 (이동 애니 위에 얹힘) */
  playUpper(name: string, fade = 0.12, opts: { startAt?: number; timeScale?: number } = {}): THREE.AnimationAction | null {
    let action = this.upperActions.get(name);
    if (!action) {
      const src = this.actions.get(name)?.getClip();
      if (!src) return null;
      const tracks = src.tracks.filter((t) => UPPER_BONE_RE.test(t.name.split('.')[0] ?? ''));
      const clip = new THREE.AnimationClip(`${name}__upper`, src.duration, tracks);
      action = this.upperMixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = false;
      this.upperActions.set(name, action);
    }
    action.reset();
    action.enabled = true;
    action.timeScale = opts.timeScale ?? 1;
    if (opts.startAt) action.time = opts.startAt;
    action.setEffectiveWeight(1);
    action.fadeIn(fade);
    action.play();
    if (this.upperCurrent && this.upperCurrent !== action) this.upperCurrent.fadeOut(fade);
    this.upperCurrent = action;
    return action;
  }
  stopUpper(fade = 0.15) {
    if (this.upperCurrent) { this.upperCurrent.fadeOut(fade); this.upperCurrent = null; }
  }
  get upperPlaying() { return !!this.upperCurrent && this.upperCurrent.isRunning() && !((this.upperCurrent as unknown as { _clip: THREE.AnimationClip; time: number }).time >= this.upperCurrent.getClip().duration); }

  /** 크로스페이드 재생. 같은 클립이면 무시. */
  play(name: string, fade = 0.2, opts: { loop?: boolean; timeScale?: number; startAt?: number } = {}) {
    const next = this.actions.get(name);
    if (!next) return false;
    if (this.current === next) {
      if (opts.timeScale !== undefined) next.timeScale = opts.timeScale;
      if (opts.loop === false) { // 원샷 재시작(연속 공격)
        next.reset(); next.time = opts.startAt ?? 0; next.setEffectiveWeight(1); next.play();
      }
      return true;
    }
    next.reset();
    next.setLoop(opts.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = opts.loop === false;
    next.timeScale = opts.timeScale ?? 1;
    if (opts.startAt !== undefined) next.time = opts.startAt;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (this.current) this.current.crossFadeTo(next, fade, true);
    this.current = next;
    return true;
  }

  get currentClip() { return this.current?.getClip().name ?? null; }
  setTimeScale(name: string, scale: number) { const a = this.actions.get(name); if (a) a.timeScale = scale; }

  /**
   * 카메라가 거의 몸 안으로 들어오면 캐릭터를 통째로 숨긴다.
   *
   * 모델 전체를 반투명하게 만들면 한 장의 양면 스킨 메시 안에서 **뒤통수·머리카락을 통과해
   * 앞얼굴이 그대로 보인다.** depthWrite 를 켜도 알파 블렌딩 자체가 앞면 색을 섞으므로 해결되지
   * 않는다. 그래서 평소에는 완전 불투명으로 유지하고, 실제 교차 직전에만 완전 숨김으로 바꾼다.
   * 숨김/복귀 문턱을 다르게 둬 벽 모서리에서 한 프레임씩 깜박이는 것도 막는다.
   */
  setVisibility(v: number) {
    const vis = THREE.MathUtils.clamp(v, 0, 1);
    if (this.closeCameraHidden) {
      if (vis >= 0.24) this.closeCameraHidden = false;
    } else if (vis <= 0.12) this.closeCameraHidden = true;
    // root에는 손을 따라가는 초칭이 별도 자식으로 붙는다. root 자체를 숨기면 1인칭에서
    // 종이등뿐 아니라 이 게임의 주 광원까지 꺼지므로, 캐릭터 메시/뼈가 든 inner만 숨긴다.
    this.root.visible = true;
    this.inner.visible = !this.closeCameraHidden;
    for (const mat of this.materials) {
      mat.transparent = (mat as THREE.MeshStandardMaterial).alphaTest > 0;
      mat.opacity = 1;
      mat.depthWrite = true;
    }
  }

  update(dt: number, ctrl: CharacterController) {
    this.root.position.copy(ctrl.position);
    // Rapier 캐릭터 컨트롤러는 충돌 안정성을 위해 지면과 controllerOffset 만큼 간격을 둔다.
    // ctrl.position 은 캡슐 바닥 좌표라 그 간격까지 포함하고 있으므로, 그대로 따라가면 발이 2 cm 떠 보인다.
    // 물리 캡슐은 유지하고 시각 모델만 같은 양만큼 내려 실제 발바닥을 지면에 붙인다.
    this.root.position.y -= settings.physics.controllerOffset;
    this.root.rotation.y = ctrl.yaw;
    // 가속 기울임(플레이스홀더와 동일 로직, 약하게)
    const m = settings.movement;
    const cy = Math.cos(-ctrl.yaw), sy = Math.sin(-ctrl.yaw);
    const ax = ctrl.accel.x * cy - ctrl.accel.z * sy;
    const az = ctrl.accel.x * sy + ctrl.accel.z * cy;
    this.leanX = damp(this.leanX, THREE.MathUtils.clamp(az / 30, -1, 1) * m.leanAmount * 0.5, 10, dt);
    this.leanZ = damp(this.leanZ, THREE.MathUtils.clamp(-ax / 30, -1, 1) * m.leanAmount * 0.5, 10, dt);
    this.inner.rotation.x = this.leanX;
    this.inner.rotation.z = this.leanZ;

    // 착지 스쿼시(스프링, 약하게) — 스케일은 정규화 스케일에 곱함
    const sq = settings.animation.landSquash;
    if (ctrl.justLanded) this.squashVel += Math.min(1, ctrl.landImpact / 12) * sq * 40;
    if (ctrl.justJumped) this.squashVel -= sq * 0.5 * 40;
    this.squashVel += (-220 * this.squash - 14 * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    const s = THREE.MathUtils.clamp(this.squash, -0.2, 0.25);
    this.inner.scale.set(this.baseScale * (1 + s * 0.5), this.baseScale * (1 - s), this.baseScale * (1 + s * 0.5));

    this.mixer.update(dt);
    this.upperMixer.update(dt);
    if (this.upperCurrent && !this.upperCurrent.isRunning()) this.upperCurrent = null;
    this.rebaseFromMixer(); // 믹서가 이번 프레임에 건너뛴 본을 원본으로 되돌린다 (poseCache 주석 참고)

    // 상체/고개 숙임 보정: 애니메이션이 쓴 회전 위에 척추·목·머리 본을 로컬 X(피치)축으로 펴줌
    this.spinePitch = damp(this.spinePitch, this.spinePitchTarget, 8, dt);
    if (Math.abs(this.spinePitch) > 1e-4 && this.spineBones.length) {
      const each = this.spinePitch / this.spineBones.length;
      for (const b of this.spineBones) { this.tmpQ.setFromAxisAngle(AXIS_X, each); b.quaternion.multiply(this.tmpQ); }
    }
    /**
     * **어깨선 수평 보정.** 애니 클립은 `character.glb` 리그에서 만들어졌는데 이 게임은
     * `mio.glb`(웹 스튜디오 리깅)를 쓴다. 두 리그의 rest 가 Hip 에서 4~7°, 쇄골·상완에서
     * 10~16° 다르고, 그 차이가 **모든 클립에 상시 편향**으로 남는다.
     *
     * 실측(한 사이클 평균, 캐릭터 로컬): 어깨 높이차 idle −17.6 / walk −11.5 / run −13 mm.
     * 세 클립이 같은 값을 내면 그건 연출이 아니라 리그 오차다 — 왼쪽 어깨가 그만큼 내려가 있다.
     *
     * **척추가 아니라 쇄골에 건다.** 척추를 돌리면 어깨선은 펴지지만 그 위의 머리까지 같이
     * 끌려가 옆으로 밀린다(실측: 어깨를 0 으로 맞추는 각에서 머리가 −27 mm 로 갔다).
     * 쇄골은 머리의 부모가 아니므로 어깨만 움직인다.
     *
     * 축은 **캐릭터 전방**이다(좌우로 기우는 회전이므로). 본의 로컬 축은 리그마다 제멋대로라
     * 월드에서 전방을 구해 본의 부모 공간으로 옮겨 쓴다.
     */
    const troll = settings.character.torsoRoll;
    if (Math.abs(troll) > 1e-4 && this.clavicleBones.length) {
      // ⚠️ 전방을 **노드 쿼터니언에서 유추하지 않는다.** `inner`·GLB 루트 어느 쪽으로 잡아도
      //    리그의 회전된 rest 때문에 옆구리나 수직 축이 나왔다(실측: 롤 ±0.06 에 어깨가 양쪽 다 나빠졌다).
      //    컨트롤러 yaw 는 이 프로젝트의 한 곳뿐인 진실이다 — 전방은 (−sin yaw, 0, −cos yaw).
      for (const b0 of this.clavicleBones) {
        this.tmpV.set(-Math.sin(ctrl.yaw), 0, -Math.cos(ctrl.yaw));
        b0.parent!.getWorldQuaternion(this.tmpQ2);
        this.tmpV.applyQuaternion(this.tmpQ2.invert()).normalize(); // 부모 로컬로
        this.tmpQ.setFromAxisAngle(this.tmpV, troll);
        b0.quaternion.premultiply(this.tmpQ);
      }
    }
    // 말린 어깨 보정: 좌우 쇄골을 월드 수직축 주위로 반대 회전해 어깨를 뒤로 연다.
    // 척추를 더 젖혀 보정하면 턱만 앞으로 남아 거북목이 강조되므로, 가슴 피치와 별도로 건다.
    const shoulderBack = settings.character.shoulderBack;
    if (Math.abs(shoulderBack) > 1e-4 && this.clavicleBones.length) {
      for (const b0 of this.clavicleBones) {
        this.tmpV.set(0, 1, 0);
        b0.parent!.getWorldQuaternion(this.tmpQ2);
        this.tmpV.applyQuaternion(this.tmpQ2.invert()).normalize();
        const side = /^(L_|mixamorig:Left)/.test(b0.name) ? 1 : -1;
        this.tmpQ.setFromAxisAngle(this.tmpV, shoulderBack * side);
        b0.quaternion.premultiply(this.tmpQ);
      }
    }
    this.headPitch = damp(this.headPitch, this.headPitchTarget, 8, dt);
    if (Math.abs(this.headPitch) > 1e-4) {
      // 목 몫은 **목 관절 수만큼 나눈다**(척추와 같은 방식). 이 리그의 목은 NeckTwist01·02 두
      // 마디인데 예전엔 01 만 잡아서 17° 를 한 관절이 다 받았다 — 목뿌리에 각이 지고 그 위는
      // 뻣뻣한 막대가 된다. 나눠 걸면 같은 총각도가 **곡선**으로 읽힌다.
      const share = settings.character.neckShare;
      const nb = this.neckBones.length;
      if (nb) {
        const each = (this.headPitch * share) / nb;
        for (const b of this.neckBones) { this.tmpQ.setFromAxisAngle(AXIS_X, each); b.quaternion.multiply(this.tmpQ); }
      }
      if (this.headBone) { this.tmpQ.setFromAxisAngle(AXIS_X, this.headPitch * (nb ? 1 - share : 1)); this.headBone.quaternion.multiply(this.tmpQ); }
    }
    /**
     * **머리 좌우 기울기 보정** — 고개가 상시 오른쪽 어깨 쪽으로 기울어 있었다(사용자 지적).
     * idle 180 스텝 실측 −3.6°(폭 −4.4~−3.1) — **애니 변동이 1.3° 뿐**이라 연기가 아니라 편향이다.
     *
     * 축은 `torsoRoll` 과 같은 이유로 **컨트롤러 yaw 에서 구한 전방**이다. 본 로컬 축을 쓰면
     * 리그 rest 가 돌아가 있어 롤이 아니라 요/피치가 섞인다. 피치와 같은 비율(`neckShare`)로
     * 목·머리에 나눠 걸어 목만 꺾이지 않게 한다.
     */
    const hroll = settings.character.headRoll;
    if (Math.abs(hroll) > 1e-4) {
      const share = settings.character.neckShare;
      const nb = this.neckBones.length;
      const rollBone = (b: THREE.Object3D, ang: number) => {
        this.tmpV.set(-Math.sin(ctrl.yaw), 0, -Math.cos(ctrl.yaw));
        b.parent!.getWorldQuaternion(this.tmpQ2);
        this.tmpV.applyQuaternion(this.tmpQ2.invert()).normalize(); // 부모 로컬로
        this.tmpQ.setFromAxisAngle(this.tmpV, ang);
        b.quaternion.premultiply(this.tmpQ);
      };
      if (nb) { const each = (hroll * share) / nb; for (const b of this.neckBones) rollBone(b, each); }
      if (this.headBone) rollBone(this.headBone, hroll * (nb ? 1 - share : 1));
    }
    this.applyLocomotionArmLimits(ctrl);
    /**
     * **손목 롤 보정** — 이 리그는 손이 팔뚝 축을 기준으로 180° 돌아가 있다.
     *
     * 어떻게 확인했나(눈으로는 앞뒤 구분이 어렵다): 손 위에서 내려다보고 **엄지가 가리키는 방향**을 봤다.
     * 팔을 늘어뜨린 자세에서 엄지는 **앞쪽**을 향해야 하는데 뒤쪽·바깥을 향하고 있었다
     * (덩달아 뒤에서 손바닥이, 앞에서 손등이 보였다 — 즉 손바닥이 뒤를 봤다).
     *
     * 축은 추측하지 않고 쟀다: 팔뚝→손 방향을 손 본의 로컬 좌표로 옮기면 **(±0.2, 0.97, ~0)** 이므로
     * 로컬 **+Y** 가 팔 축이다. 그래서 로컬 Y 로 롤을 건다.
     *
     * 애니메이션 클립이 매 프레임 손 본을 덮어쓰므로 **믹서 뒤에** 곱해야 한다(척추·고개 보정과 같은 자리).
     * 리그를 다시 뽑아 바로잡으면 `handRoll` 을 0 으로 두면 된다.
     */
    const roll = settings.character.handRoll;
    if (Math.abs(roll) > 1e-4) {
      this.tmpQ.setFromAxisAngle(AXIS_Y, roll);
      for (const b of this.handBones) b.quaternion.multiply(this.tmpQ);
    }
    this.postPose?.(dt); // 웅크림 포즈(CrouchPose)·공격 등 절차 자세는 여기서 얹는다
    this.commitPose(); // 이번 프레임에 우리가 남긴 값을 기록 (다음 프레임의 「믹서가 썼나」 판정 기준)
  }

  /** 믹서 뒤 · 보정 앞: 믹서가 쓰기를 건너뛴 본을 지난 프레임의 믹서 출력으로 되돌린다 */
  private rebaseFromMixer() {
    if (!this.poseCacheReady) {
      for (const e of this.poseCache) e.raw.copy(e.bone.quaternion);
      return;
    }
    for (const e of this.poseCache) {
      if (e.bone.quaternion.equals(e.out)) e.bone.quaternion.copy(e.raw); // 믹서가 안 썼다 → 원본 복원
      else e.raw.copy(e.bone.quaternion);                                  // 새 믹서 출력 → 원본 갱신
    }
  }

  /** 모든 자세 보정이 끝난 뒤 호출 — 다음 프레임의 비교 기준을 남긴다 */
  private commitPose() {
    for (const e of this.poseCache) e.out.copy(e.bone.quaternion);
    this.poseCacheReady = true;
  }

  /**
   * 새 미오는 T포즈로 리깅됐지만 이동 클립은 A포즈 리그에서 왔다. 상완 회전 트랙을 그대로
   * 쓰면 달릴 때 팔꿈치가 몸에서 크게 벌어지고 전완까지 위로 접혀 손이 머리 높이로 솟는다.
   *
   * 로컬 Euler 각은 좌우 본 축이 서로 달라 안전하지 않다. 믹서가 만든 실제 관절 방향을 월드에서
   * 읽고, 캐릭터의 좌우·전방 축으로 분해해 **바깥쪽 성분과 위쪽 성분만** 제한한다. 앞뒤 스윙은
   * 남으므로 달리기 리듬은 유지된다. 공격 상체 레이어와 점프·낙하는 의도된 큰 동작이라 건드리지 않는다.
   */
  private applyLocomotionArmLimits(ctrl: CharacterController) {
    if (!this.constrainLocomotionArms || this.upperPlaying) return;
    const clip = this.currentClip;
    if (!clip || !['idle', 'walk', 'run', 'look_around', 'standing_relax'].includes(clip)) return;

    const kind = clip === 'run' ? 'run' : clip === 'walk' ? 'walk' : 'idle';
    const upper = kind === 'run'
      ? { sideMin: 0.02, sideMax: 0.12, up: 0.22, forward: 0.75, strength: 0.92 }
      : kind === 'walk'
        ? { sideMin: 0.04, sideMax: 0.14, up: -0.55, forward: 0.45, strength: 0.88 }
        : { sideMin: 0.04, sideMax: 0.12, up: -0.78, forward: 0.15, strength: 0.88 };
    const fore = kind === 'run'
      ? { sideMin: -0.06, sideMax: 0.14, up: 0.18, forward: 0.72, strength: 0.92 }
      : kind === 'walk'
        ? { sideMin: -0.04, sideMax: 0.14, up: -0.35, forward: 0.55, strength: 0.84 }
        : { sideMin: 0.02, sideMax: 0.10, up: -0.65, forward: 0.22, strength: 0.86 };

    // 컨트롤러 yaw가 캐릭터 축의 단일 소스다. +right, +forward 모두 월드 공간.
    this.tmpV3.set(Math.cos(ctrl.yaw), 0, -Math.sin(ctrl.yaw));
    this.tmpV4.set(-Math.sin(ctrl.yaw), 0, -Math.cos(ctrl.yaw));
    this.root.updateMatrixWorld(true);
    this.limitArm(this.armL, upper, fore);
    this.limitArm(this.armR, upper, fore);
  }

  private limitArm(
    arm: { upper?: THREE.Object3D; fore?: THREE.Object3D; hand?: THREE.Object3D },
    upperLimit: { sideMin: number; sideMax: number; up: number; forward: number; strength: number },
    foreLimit: { sideMin: number; sideMax: number; up: number; forward: number; strength: number },
  ) {
    if (!arm.upper || !arm.fore || !arm.hand) return;
    arm.upper.getWorldPosition(this.tmpV);
    this.root.getWorldPosition(this.tmpV2);
    const sideSign: -1 | 1 = this.tmpV.sub(this.tmpV2).dot(this.tmpV3) < 0 ? -1 : 1;
    this.limitBoneDirection(arm.upper, arm.fore, sideSign, upperLimit);
    arm.upper.updateWorldMatrix(false, true);
    this.limitBoneDirection(arm.fore, arm.hand, sideSign, foreLimit);
    arm.fore.updateWorldMatrix(false, true);
  }

  private limitBoneDirection(
    bone: THREE.Object3D,
    child: THREE.Object3D,
    sideSign: -1 | 1,
    limit: { sideMin: number; sideMax: number; up: number; forward: number; strength: number },
  ) {
    bone.getWorldPosition(this.tmpV);
    child.getWorldPosition(this.tmpV2);
    this.tmpV2.sub(this.tmpV).normalize();

    const side = THREE.MathUtils.clamp(this.tmpV2.dot(this.tmpV3) * sideSign, limit.sideMin, limit.sideMax);
    const up = Math.min(this.tmpV2.y, limit.up);
    const forward = THREE.MathUtils.clamp(this.tmpV2.dot(this.tmpV4), -limit.forward, limit.forward);
    this.tmpV.copy(this.tmpV3).multiplyScalar(side * sideSign)
      .addScaledVector(AXIS_Y, up)
      .addScaledVector(this.tmpV4, forward)
      .normalize();
    if (this.tmpV2.dot(this.tmpV) > 0.99999 || !bone.parent) return;

    // 월드 회전 델타를 부모 로컬 공간으로 옮겨 현재 믹서 포즈 위에 적용한다.
    this.tmpQ.setFromUnitVectors(this.tmpV2, this.tmpV);
    bone.parent.getWorldQuaternion(this.tmpQ2);
    this.tmpQ3.copy(this.tmpQ2).invert().multiply(this.tmpQ).multiply(this.tmpQ2).multiply(bone.quaternion);
    bone.quaternion.slerp(this.tmpQ3, limit.strength);
  }
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
/** 리타게팅: 회전 트랙 + Root·Hip 이동만 남긴다 (`addClip` 주석 참고) */
const KEEP_TRACK = /(\.quaternion$)|^(Root|Hip)\.position$/;
/** 루프로 재생하는 이동 클립 — 첫 키와 마지막 키의 자세가 맞아야 한다 */
const CYCLIC_CLIPS = new Set(['idle', 'walk', 'run']);

/**
 * **루프 이음매 보정.** run 클립은 첫 키와 마지막 키가 어긋나 있다 — 실측 `R_Upperarm` **18.98°** ·
 * `L_Forearm` 16.86° · 허벅지 12° 등 14개 본. 루프가 넘어가는 **한 프레임에 그만큼 툭 튄다**
 * (idle·walk 는 0° 라 이 함수가 아무 일도 하지 않는다). 더 나은 루프 지점도 없다 — 20~30번 키를
 * 전부 첫 키와 비교했을 때 마지막 키가 이미 최선(잔차 합 116° vs 그 다음이 275°)이었다.
 *
 * → 어긋난 만큼을 **클립 전체에 선형으로 나눠 흡수**한다. `D = key[0] · key[n−1]⁻¹` 을 구해
 *   키 i 앞에 `slerp(단위, D, i/(n−1))` 을 곱하면 첫 키는 그대로, 마지막 키는 첫 키와 같아진다.
 *   19° 를 1.25 s 에 퍼뜨리므로 초당 15° — 달리기 본의 정상 변화(~95°/s)에 묻힌다.
 */
function makeCyclic(clip: THREE.AnimationClip) {
  const qA = new THREE.Quaternion();
  const qB = new THREE.Quaternion();
  const qD = new THREE.Quaternion();
  const qS = new THREE.Quaternion();
  for (const t of clip.tracks) {
    if (!t.name.endsWith('.quaternion')) continue;
    const n = t.times.length;
    const v = t.values;
    if (n < 3 || v.length !== n * 4) continue; // 큐빅 스플라인(값 3배)은 건드리지 않는다
    qA.fromArray(v, 0);
    qB.fromArray(v, (n - 1) * 4);
    if (qA.angleTo(qB) < 1e-3) continue; // 이미 순환한다
    qD.copy(qB).invert().premultiply(qA); // key[n−1] → key[0] 로 보내는 회전
    for (let i = 1; i < n; i++) {
      qS.identity().slerp(qD, i / (n - 1));
      qA.fromArray(v, i * 4).premultiply(qS).toArray(v, i * 4);
    }
  }
}
const AXIS_Y = new THREE.Vector3(0, 1, 0);
/** 상체 레이어에 포함할 본 (Tripo / Mixamo 네이밍) */
const UPPER_BONE_RE = /^(Spine\d*|Waist|NeckTwist\d*|Neck|Head|[LR]_(Clavicle|Upperarm|UpperarmTwist\d*|Forearm|ForearmTwist\d*|Hand)|mixamorig:(Spine\d*|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand)))$/;
