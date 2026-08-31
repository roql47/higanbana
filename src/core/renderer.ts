import * as THREE from 'three';
import { installFrontToBackOpaqueSort, installPointLightEarlyOut } from './losslessGpu';

export function createRenderer(canvas: HTMLCanvasElement, losslessGpu = true) {
  /**
   * `installPointLightEarlyOut()` 는 THREE.ShaderChunk 전역을 바꾸므로 여기서 기본 적용하면 안 된다.
   *
   * 2026-08-28 특정 Windows 외장 GPU에서 하늘(ShaderMaterial)과 원경 카드
   * (MeshBasicMaterial)는 보이지만 지형·건물·캐릭터(MeshStandardMaterial)만 검게 빠졌다.
   * ANGLE/드라이버가 이 분기 변형을 잘못 컴파일한 패턴과 일치한다. 정렬 최적화는 결과 셰이더를
   * 건드리지 않으므로 유지하고, 점광원 분기는 명시적인 개발 A/B에서만 켠다.
   */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // SMAA(후처리)로 대체 — AO와 하드웨어 MSAA는 궁합이 나쁨
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
    // 티저 녹화(src/teaser/run.ts)는 present 뒤에 drawImage 로 캔버스를 읽는다 —
    // 버퍼 보존 없이는 읽는 시점의 내용이 보장되지 않는다. ?teaser 없는 일반 플레이는 기존 그대로.
    preserveDrawingBuffer: new URLSearchParams(location.search).has('teaser'),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // 숨겨진 탭(백그라운드)에서 로드되면 innerWidth 가 0 — 0×0 렌더타깃은 프리워밍의
  // compileAsync/render 를 영영 못 끝내게 한다. 최소 1px 로 만들고 이후 onResize 가 바로잡는다
  renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // 톤매핑은 postprocessing ToneMappingEffect가 담당
  renderer.shadowMap.enabled = true;
  // three r185 부터 `PCFSoftShadowMap` 은 폐지 예정이라 첫 그림자 패스에서 경고를 찍고 스스로
  // `PCFShadowMap` 으로 갈아탄다 — 즉 **이미 PCF 로 돌고 있었다**. 경고만 남던 상태라 명시로 바꾼다.
  // 부드러움은 `light.shadow.radius`(PCF 커널 반경, 텍셀 단위)가 그대로 만든다.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  if (losslessGpu) installFrontToBackOpaqueSort(renderer);
  return renderer;
}

/** 특정 GPU 회귀를 재현하기 위한 개발 전용 스위치. 프로덕션에서는 절대 기본으로 켜지 않는다. */
export function enableExperimentalPointLightEarlyOut() {
  installPointLightEarlyOut();
}

export function createCamera() {
  // 0/0 = NaN 종횡비 가드 (숨겨진 탭 로드) — onResize 가 실제 값으로 되잡는다
  const camera = new THREE.PerspectiveCamera(55, window.innerHeight ? window.innerWidth / window.innerHeight : 16 / 9, 0.1, 400);
  camera.position.set(0, 3, 6);
  return camera;
}
