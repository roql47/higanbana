import * as THREE from 'three';

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // SMAA(후처리)로 대체 — AO와 하드웨어 MSAA는 궁합이 나쁨
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // 톤매핑은 postprocessing ToneMappingEffect가 담당
  renderer.shadowMap.enabled = true;
  // three r185 부터 `PCFSoftShadowMap` 은 폐지 예정이라 첫 그림자 패스에서 경고를 찍고 스스로
  // `PCFShadowMap` 으로 갈아탄다 — 즉 **이미 PCF 로 돌고 있었다**. 경고만 남던 상태라 명시로 바꾼다.
  // 부드러움은 `light.shadow.radius`(PCF 커널 반경, 텍셀 단위)가 그대로 만든다.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 3, 6);
  return camera;
}
