import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BlendFunction,
  HueSaturationEffect,
  BrightnessContrastEffect,
} from 'postprocessing';
import { DisposableAOPass } from './aoPass';
import { settings } from './settings';
import type { QualityProfile } from './quality';

export interface PostFxSupport {
  /** RGBA16F 렌더타깃을 실제로 완성할 수 있는가. 확장 이름만 보지 않고 FBO까지 만든 결과다. */
  halfFloatColorBuffer: boolean;
}

/**
 * 브라우저가 말하는 확장 목록과 실제 드라이버 동작이 다른 경우가 있어 2×2 FBO를 직접 확인한다.
 * 실패하면 후처리는 RGBA8로 내려가고, 내부에 HalfFloat 타깃을 만드는 N8AO는 생성하지 않는다.
 */
export function probePostFxSupport(renderer: THREE.WebGLRenderer): PostFxSupport {
  const gl = renderer.getContext();
  if (!gl.getExtension('EXT_color_buffer_float')) return { halfFloatColorBuffer: false };

  const previous = renderer.getRenderTarget();
  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  });
  let complete = false;
  try {
    renderer.setRenderTarget(target);
    complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } catch {
    complete = false;
  } finally {
    renderer.setRenderTarget(previous);
    target.dispose();
  }
  return { halfFloatColorBuffer: complete };
}

interface PostFxOptions {
  support?: PostFxSupport;
  /** URL `?gpu=safe` 진단·복구 경로. 지원 GPU에서도 RGBA8 + AO off를 강제한다. */
  forceCompatibility?: boolean;
}

/**
 * 후처리 체인: Render → N8AO(SSAO) → [Bloom, ToneMapping(ACES), Vignette, SMAA]
 * 톤매핑은 여기서만 수행 (renderer.toneMapping = NoToneMapping).
 */
export function createPostFX(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  quality?: QualityProfile,
  options: PostFxOptions = {},
) {
  // 정지 화면은 설정이나 크기가 바뀔 때만 다시 그린다.
  let revision = 0;
  const support = options.support ?? probePostFxSupport(renderer);
  const hdrTargets = support.halfFloatColorBuffer && !options.forceCompatibility;
  const composer = new EffectComposer(renderer, {
    frameBufferType: hdrTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
    multisampling: 0,
  });

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let ao: DisposableAOPass | null = null;
  let aoQuality = quality;
  if (!hdrTargets) {
    console.warn('[gpu] Half-float 렌더타깃 미지원/안전 모드 — RGBA8 후처리, AO off');
  }
  /** 품질 프리셋이 AO 를 허용하는가 (low·medium 은 'off') */
  let aoAllowed = hdrTargets && quality?.ao !== 'off';

  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: settings.render.bloomThreshold,
    luminanceSmoothing: 0.2,
    intensity: settings.render.bloomIntensity,
    radius: 0.7,
    // 4단계면 현재 내부 해상도에서 초롱의 넓은 헤일로는 남으면서, 왕복 블러 패스는 11→7회다.
    levels: 4,
  });

  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });

  const vignette = new VignetteEffect({
    offset: settings.render.vignetteOffset,
    darkness: settings.render.vignetteDarkness,
    blendFunction: BlendFunction.NORMAL,
  });

  const smaa = new SMAAEffect({ preset: quality?.level === 'ultra' ? SMAAPreset.HIGH : SMAAPreset.MEDIUM });
  const grade = new HueSaturationEffect({ saturation: settings.render.saturation });
  const contrast = new BrightnessContrastEffect({ contrast: settings.render.contrast, brightness: settings.render.brightness });

  // 하나의 EffectPass 안에서 순서대로 합성됨. 색보정은 톤매핑 뒤(LDR), SMAA는 마지막.
  const effectPass = new EffectPass(camera, bloom, toneMapping, grade, contrast, vignette, smaa);
  composer.addPass(effectPass);

  function resize(width: number, height: number) {
    composer.setSize(width, height);
    revision++;
  }

  /**
   * AO 패스를 체인에 넣고 뺀다.
   *
   * ⚠️ **`intensity = 0` 으로 끄면 안 된다.** N8AO 는 세기 0 에서도 자기 버퍼로 합성을 계속하는데,
   * 창 크기가 바뀐 뒤 그 버퍼가 화면과 어긋나 **오른쪽 4 분의 1 이 검게** 남았다(실측 재현).
   * 끌 때는 패스를 빼고 전용 자원도 해제한다. 다시 켤 때 현재 렌더 해상도로 생성한다.
   */
  function setAO(on: boolean) {
    if (!on) {
      if (ao) { composer.removePass(ao); ao.dispose(); ao = null; }
      return;
    }
    if (ao) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    ao = new DisposableAOPass(scene, camera, size.x, size.y);
    ao.configuration.aoRadius = settings.render.aoRadius;
    ao.configuration.intensity = settings.render.aoIntensity;
    ao.configuration.distanceFalloff = 1.0;
    ao.configuration.screenSpaceRadius = false;
    ao.configuration.halfRes = aoQuality?.aoHalfRes ?? false;
    ao.configuration.gammaCorrection = false;
    ao.setQualityMode(aoQuality && aoQuality.ao !== 'off' ? aoQuality.ao : 'Medium');
    // EffectPass를 빼고 다시 초기화하지 않고 Render와 Effect 사이에 삽입한다.
    composer.addPass(ao, 1);
  }

  /** Tweakpane 등에서 값이 바뀌었을 때 호출 */
  function applySettings() {
    revision++;
    if (ao) {
      ao.configuration.aoRadius = settings.render.aoRadius;
      ao.configuration.intensity = settings.render.aoIntensity;
    }
    setAO(aoAllowed && settings.render.aoIntensity > 0);
    bloom.intensity = settings.render.bloomIntensity;
    bloom.luminanceMaterial.threshold = settings.render.bloomThreshold;
    vignette.darkness = settings.render.vignetteDarkness;
    vignette.offset = settings.render.vignetteOffset;
    grade.saturation = settings.render.saturation;
    contrast.contrast = settings.render.contrast;
    contrast.brightness = settings.render.brightness;
    renderer.toneMappingExposure = settings.render.exposure;
  }
  applySettings();

  /** 런타임 품질 변경 (AO on/off·해상도) */
  function applyQuality(q: QualityProfile) {
    revision++;
    aoQuality = q;
    aoAllowed = hdrTargets && q.ao !== 'off';
    const wantAO = aoAllowed && settings.render.aoIntensity > 0;
    if (ao && aoAllowed) { ao.configuration.halfRes = q.aoHalfRes; ao.setQualityMode(q.ao as 'Low' | 'Medium' | 'High'); }
    smaa.applyPreset(q.level === 'ultra' ? SMAAPreset.HIGH : SMAAPreset.MEDIUM);
    setAO(wantAO);
  }

  return { composer, resize, applySettings, applyQuality, get ao() { return ao; }, bloom, vignette, toneMapping, get revision() { return revision; } };
}
