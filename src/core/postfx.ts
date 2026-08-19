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
import { N8AOPostPass } from 'n8ao';
import { settings } from './settings';
import type { QualityProfile } from './quality';

/**
 * 후처리 체인: Render → N8AO(SSAO) → [Bloom, ToneMapping(ACES), Vignette, SMAA]
 * 톤매핑은 여기서만 수행 (renderer.toneMapping = NoToneMapping).
 */
export function createPostFX(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality?: QualityProfile) {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: 0,
  });

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const w = window.innerWidth, h = window.innerHeight;
  const ao = new N8AOPostPass(scene, camera, w, h);
  ao.configuration.aoRadius = settings.render.aoRadius;
  ao.configuration.intensity = settings.render.aoIntensity;
  ao.configuration.distanceFalloff = 1.0;
  ao.configuration.screenSpaceRadius = false;
  ao.configuration.halfRes = quality?.aoHalfRes ?? false;
  ao.configuration.gammaCorrection = false; // 톤매핑/색공간 변환은 뒤에서
  ao.setQualityMode(quality && quality.ao !== 'off' ? quality.ao : 'Medium');
  if (quality?.ao !== 'off') composer.addPass(ao);

  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: settings.render.bloomThreshold,
    luminanceSmoothing: 0.2,
    intensity: settings.render.bloomIntensity,
    radius: 0.7,
    levels: 6,
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
  }

  /** Tweakpane 등에서 값이 바뀌었을 때 호출 */
  function applySettings() {
    ao.configuration.aoRadius = settings.render.aoRadius;
    ao.configuration.intensity = settings.render.aoIntensity;
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
    const wantAO = q.ao !== 'off';
    const hasAO = composer.passes.includes(ao);
    if (wantAO && !hasAO) { composer.removePass(effectPass); composer.addPass(ao); composer.addPass(effectPass); }
    if (!wantAO && hasAO) composer.removePass(ao);
    if (wantAO) { ao.configuration.halfRes = q.aoHalfRes; ao.setQualityMode(q.ao as 'Low' | 'Medium' | 'High'); }
  }

  return { composer, resize, applySettings, applyQuality, ao, bloom, vignette, toneMapping };
}
