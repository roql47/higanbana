import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { CharacterController } from './controller';
import { settings } from '@/core/settings';
import { damp } from '@/core/math';

export interface CharacterModelOptions {
  /** 기본 모델(GLB). 리깅된 메시 포함 */
  url: string;
  /** 클립별 GLB — 파일명 → 클립 이름. 같은 리그의 애니메이션만 추출해 base 모델에 적용 */
  clips?: Record<string, string>;
  /** 목표 신장(m). 바운딩박스 높이를 이 값으로 정규화 */
  targetHeight?: number;
  /** 모델의 정면이 +Z가 아니면 보정 (rad) */
  yawOffset?: number;
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
  private neckBone: THREE.Object3D | null = null;
  private spineBones: THREE.Object3D[] = [];
  private innerBaseY = 0;
  private tmpQ = new THREE.Quaternion();
  private originalMaps = new Map<THREE.MeshStandardMaterial, THREE.Texture>();
  /** 믹서·보정 뒤에 얹는 절차적 포즈 훅 (공격 등) */
  postPose: ((dt: number) => void) | null = null;

  private constructor(gltf: GLTF, opts: CharacterModelOptions, renderer?: THREE.WebGLRenderer) {
    const scene = gltf.scene;
    this.inner.add(scene);
    this.root.add(this.inner);
    this.root.name = 'character';

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
      if (/^(NeckTwist01|Neck|mixamorig:Neck)$/.test(o.name)) this.neckBone = o;
      if (/^(Spine01|Spine02|mixamorig:Spine1|mixamorig:Spine2)$/.test(o.name)) this.spineBones.push(o);
    });
    for (const mat of this.materials) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.isMeshStandardMaterial && std.map) this.originalMaps.set(std, std.map);
    }
  }

  /**
   * 알베도 색보정: 원본 텍스처 이미지를 캔버스로 재가공(채도/대비/밝기/따뜻함) 후 교체.
   * settings.character 값을 바꾸고 다시 호출하면 원본 기준으로 재적용된다.
   */
  gradeAlbedo() {
    const g = settings.character;
    for (const [mat, orig] of this.originalMaps) {
      const img = orig.image as ImageBitmap | HTMLImageElement | HTMLCanvasElement | undefined;
      if (!img || !('width' in img)) continue;
      const w = img.width, h = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img as CanvasImageSource, 0, 0);
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;
      const sat = g.saturation, con = g.contrast, bri = g.brightness, warm = g.warmth * 255;
      for (let i = 0; i < px.length; i += 4) {
        let r = px[i]!, gg = px[i + 1]!, b = px[i + 2]!;
        // 채도 (luma 기준)
        const l = 0.299 * r + 0.587 * gg + 0.114 * b;
        r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat;
        // 대비 (128 기준) + 밝기
        r = ((r - 128) * con + 128) * bri; gg = ((gg - 128) * con + 128) * bri; b = ((b - 128) * con + 128) * bri;
        // 따뜻함
        r += warm; b -= warm;
        px[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        px[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
        px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
      ctx.putImageData(data, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = orig.flipY;
      tex.wrapS = orig.wrapS; tex.wrapT = orig.wrapT;
      tex.anisotropy = orig.anisotropy;
      tex.minFilter = orig.minFilter; tex.magFilter = orig.magFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      const prev = mat.map;
      mat.map = tex;
      mat.needsUpdate = true;
      if (prev && prev !== orig) prev.dispose();
    }
  }

  /** 에셋은 meshopt + WebP 로 빌드하므로 Draco/KTX2 디코더는 넣지 않는다(번들 -1.9 MB) */
  static loaders(_renderer?: THREE.WebGLRenderer) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
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

  addClip(name: string, clip: THREE.AnimationClip) {
    clip.name = name;
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

  setVisibility(v: number) {
    const vis = THREE.MathUtils.clamp(v, 0, 1);
    this.root.visible = vis > 0.02;
    for (const mat of this.materials) {
      mat.transparent = vis < 0.999 || (mat as THREE.MeshStandardMaterial).alphaTest > 0;
      mat.opacity = vis;
      mat.depthWrite = vis >= 0.999;
    }
  }

  update(dt: number, ctrl: CharacterController) {
    this.root.position.copy(ctrl.position);
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

    // 상체/고개 숙임 보정: 애니메이션이 쓴 회전 위에 척추·목·머리 본을 로컬 X(피치)축으로 펴줌
    this.spinePitch = damp(this.spinePitch, this.spinePitchTarget, 8, dt);
    if (Math.abs(this.spinePitch) > 1e-4 && this.spineBones.length) {
      const each = this.spinePitch / this.spineBones.length;
      for (const b of this.spineBones) { this.tmpQ.setFromAxisAngle(AXIS_X, each); b.quaternion.multiply(this.tmpQ); }
    }
    this.headPitch = damp(this.headPitch, this.headPitchTarget, 8, dt);
    if (Math.abs(this.headPitch) > 1e-4) {
      const share = settings.character.neckShare;
      if (this.neckBone) { this.tmpQ.setFromAxisAngle(AXIS_X, this.headPitch * share); this.neckBone.quaternion.multiply(this.tmpQ); }
      if (this.headBone) { this.tmpQ.setFromAxisAngle(AXIS_X, this.headPitch * (this.neckBone ? 1 - share : 1)); this.headBone.quaternion.multiply(this.tmpQ); }
    }
    this.postPose?.(dt); // 웅크림 포즈(CrouchPose)·공격 등 절차 자세는 여기서 얹는다
  }
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
/** 상체 레이어에 포함할 본 (Tripo / Mixamo 네이밍) */
const UPPER_BONE_RE = /^(Spine\d*|Waist|NeckTwist\d*|Neck|Head|[LR]_(Clavicle|Upperarm|UpperarmTwist\d*|Forearm|ForearmTwist\d*|Hand)|mixamorig:(Spine\d*|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand)))$/;
