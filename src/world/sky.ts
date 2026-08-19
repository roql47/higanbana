import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { settings } from '@/core/settings';
import { DEG } from '@/core/math';

/**
 * 프로시저럴 하늘(Preetham) + 그 하늘을 PMREM으로 구워 환경광(IBL)으로 사용 + 태양 DirectionalLight(그림자).
 * Phase 4에서 Poly Haven HDRI로 교체 가능하도록 `scene.environment` 만 바꾸면 되게 분리.
 */
export function createSky(renderer: THREE.WebGLRenderer, scene: THREE.Scene, shadowMapSize = 4096) {
  const sky = new Sky();
  sky.scale.setScalar(2000);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffffff, settings.render.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 4;
  const sc = sun.shadow.camera;
  sc.near = 1; sc.far = 120;
  scene.add(sun);
  scene.add(sun.target);

  // 반구광: 하늘 PMREM 은 절대 밝기가 매우 커서 낮은 강도로만 쓰고, 그림자 속 채움은 반구광이 담당
  const hemi = new THREE.HemisphereLight(0xbfd6ee, 0x6a7a45, settings.render.hemiIntensity);
  scene.add(hemi);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  let envRT: THREE.WebGLRenderTarget | null = null;

  // 환경맵 베이크용 하늘: 태양 원반(sundisc) 항을 제거한 복제 재질.
  // 원반을 포함해 구우면 환경광이 제2의 태양이 되어 밝은 재질(크림색 옷 등)이 날아간다.
  const bakeMat = sky.material.clone() as THREE.ShaderMaterial;
  bakeMat.fragmentShader = bakeMat.fragmentShader.replace('vSunE * 19000.0 * Fex', 'vSunE * 0.0 * Fex');
  bakeMat.uniforms = THREE.UniformsUtils.clone(sky.material.uniforms);
  const bakeSky = new THREE.Mesh(sky.geometry, bakeMat);
  bakeSky.scale.copy(sky.scale);

  const sunDir = new THREE.Vector3();
  const skyScene = new THREE.Scene();
  skyScene.add(bakeSky);

  function updateSun() {
    const el = settings.render.sunElevation * DEG;
    const az = settings.render.sunAzimuth * DEG;
    sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const u = sky.material.uniforms;
    u['sunPosition']!.value.copy(sunDir);
    u['turbidity']!.value = settings.render.turbidity;
    u['rayleigh']!.value = settings.render.rayleigh;
    u['mieCoefficient']!.value = settings.render.mieCoefficient;
    u['mieDirectionalG']!.value = settings.render.mieDirectionalG;

    sun.intensity = settings.render.sunIntensity;
    hemi.intensity = settings.render.hemiIntensity;
    // 지평선 근처에서 태양색을 따뜻하게
    const warm = THREE.MathUtils.clamp(1 - Math.sin(el) * 1.6, 0, 1);
    sun.color.setRGB(1, 1 - warm * 0.35, 1 - warm * 0.6);

    // 하늘(태양 원반 제외)을 환경맵으로 굽기
    const bu = bakeMat.uniforms;
    bu['sunPosition']!.value.copy(sunDir);
    bu['turbidity']!.value = settings.render.turbidity;
    bu['rayleigh']!.value = settings.render.rayleigh;
    bu['mieCoefficient']!.value = settings.render.mieCoefficient;
    bu['mieDirectionalG']!.value = settings.render.mieDirectionalG;
    envRT?.dispose();
    envRT = pmrem.fromScene(skyScene, 0.02, 0.1, 5000); // Sky 박스가 크므로 far 확장
    scene.environment = envRT.texture;
    scene.environmentIntensity = settings.render.envIntensity;
    // 배경은 Sky 메시 자체가 그리므로 scene.background 는 null 유지
  }
  updateSun();

  /** 섀도 프러스텀을 대상(캐릭터) 주변으로 옮긴다 — 매 프레임 호출 */
  const tmp = new THREE.Vector3();
  function follow(target: THREE.Vector3, _dt = 0) {
    const r = settings.render.shadowRadius;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.updateProjectionMatrix();
    // 텍셀 단위로 스냅해 그림자 떨림 방지
    const texel = (r * 2) / sun.shadow.mapSize.width;
    tmp.copy(target);
    tmp.x = Math.round(tmp.x / texel) * texel;
    tmp.z = Math.round(tmp.z / texel) * texel;
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(sunDir, 60);
    sun.target.updateMatrixWorld();
  }

  /** 그림자맵 해상도 런타임 변경 */
  function setShadowMapSize(size: number) {
    if (sun.shadow.mapSize.width === size) return;
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(size, size);
  }

  return { sky, sun, hemi, sunDir, updateSun, follow, setShadowMapSize };
}
