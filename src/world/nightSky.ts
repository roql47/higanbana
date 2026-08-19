import * as THREE from 'three';
import { settings } from '@/core/settings';
import { DEG } from '@/core/math';

/**
 * 여름밤 하늘: 그라디언트 + 별 + 달을 한 장의 셰이더 구(BackSide)로 그린다.
 * 같은 셰이더에서 별을 끈 버전을 PMREM 으로 구워 아주 약한 환경광(논 수면 반사용)으로 쓴다.
 * 그림자를 만드는 라이트는 초칭 하나뿐 — 달빛은 형태만 살리는 채움광이라 castShadow 를 켜지 않는다.
 */
export function createNightSky(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const uniforms = {
    uZenith: { value: new THREE.Color(0x0a1226) },
    uHorizon: { value: new THREE.Color(0x243550) },
    uGround: { value: new THREE.Color(0x070a12) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonColor: { value: new THREE.Color(0xe8f0ff) },
    uMoonSize: { value: 0.0085 }, // rad (겉보기 반경 — 실제보다 크게 그려야 그림이 된다)
    uStars: { value: 1 },
    uTime: { value: 0 },
  };

  const vert = `
    varying vec3 vDir;
    void main() {
      vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position.z = gl_Position.w; // 항상 최원거리
    }`;

  const frag = `
    varying vec3 vDir;
    uniform vec3 uZenith, uHorizon, uGround, uMoonDir, uMoonColor;
    uniform float uMoonSize, uStars, uTime;

    float hash13(vec3 p3) {
      p3 = fract(p3 * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float starField(vec3 d) {
      vec3 p = d * 240.0;
      vec3 id = floor(p);
      vec3 f = fract(p) - 0.5;
      float h = hash13(id);
      if (h < 0.977) return 0.0;
      float b = (h - 0.977) / 0.023;
      vec3 off = vec3(hash13(id + 11.0), hash13(id + 23.0), hash13(id + 37.0)) - 0.5;
      float dd = length(f - off * 0.6);
      float core = smoothstep(0.20, 0.0, dd);
      float tw = 0.6 + 0.4 * sin(uTime * (1.2 + b * 3.5) + h * 91.0);
      return core * (0.25 + 1.6 * b * b) * tw;
    }

    void main() {
      vec3 d = normalize(vDir);
      float up = clamp(d.y, 0.0, 1.0);
      vec3 col = mix(uHorizon, uZenith, pow(up, 0.42));
      col = mix(col, uGround, smoothstep(0.0, -0.14, d.y));

      // 달: 원반 + 은은한 헤일로
      float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
      float disc = smoothstep(uMoonSize + 0.0025, uMoonSize - 0.0025, ang);
      // 헤일로는 아주 좁게 — 넓게 퍼지면 블룸이 하늘 절반을 먹는다
      float halo = exp(-ang * 90.0) * 0.22 + exp(-ang * 14.0) * 0.03;
      col += uMoonColor * (disc * 1.05 + halo);

      // 별 (지평선 근처는 옅게)
      col += vec3(0.85, 0.9, 1.0) * starField(d) * uStars * smoothstep(-0.02, 0.22, d.y);

      gl_FragColor = vec4(col, 1.0); // 컴포저 타깃은 선형 — 색공간 변환은 후처리 마지막에서 한다
    }`;

  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  dome.scale.setScalar(1500);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  dome.name = 'night-sky';
  scene.add(dome);

  // 달빛: 방향광(그림자 없음) — 실루엣과 논 수면만 살린다
  const moon = new THREE.DirectionalLight(0xaec6ff, settings.night.moonIntensity);
  moon.castShadow = false;
  scene.add(moon);
  scene.add(moon.target);

  // 반구광: 완전한 검정을 피하는 최소한의 채움
  const hemi = new THREE.HemisphereLight(0x2a3a5c, 0x0a0d12, settings.night.hemiIntensity);
  scene.add(hemi);

  // --- 환경맵(별 제외) ---
  const pmrem = new THREE.PMREMGenerator(renderer);
  const bakeMat = mat.clone();
  bakeMat.uniforms = THREE.UniformsUtils.clone(uniforms);
  bakeMat.uniforms['uStars']!.value = 0;
  const bakeScene = new THREE.Scene();
  const bakeDome = new THREE.Mesh(dome.geometry, bakeMat);
  bakeDome.scale.setScalar(1500);
  bakeScene.add(bakeDome);
  let envRT: THREE.WebGLRenderTarget | null = null;

  const moonDir = new THREE.Vector3();
  function updateSun() {
    const el = settings.night.moonElevation * DEG;
    const az = settings.night.moonAzimuth * DEG;
    moonDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    uniforms['uMoonDir']!.value.copy(moonDir);
    bakeMat.uniforms['uMoonDir']!.value.copy(moonDir);
    moon.intensity = settings.night.moonIntensity;
    moon.position.copy(moonDir).multiplyScalar(200);
    moon.target.position.set(0, 0, 0);
    moon.target.updateMatrixWorld();
    hemi.intensity = settings.night.hemiIntensity;
    envRT?.dispose();
    envRT = pmrem.fromScene(bakeScene, 0.02, 0.1, 4000); // sigma 0.1 은 샘플 한계를 넘어 경고가 난다
    scene.environment = envRT.texture;
    scene.environmentIntensity = settings.night.envIntensity;
  }
  updateSun();

  /** 하늘 돔을 카메라에 붙여둔다(무한 원경). 별 반짝임 시간도 여기서 */
  function follow(target: THREE.Vector3, dt = 0) {
    dome.position.copy(target);
    uniforms['uTime']!.value += dt;
  }

  function setShadowMapSize(_size: number) { /* 달빛은 그림자를 만들지 않는다 */ }

  return { dome, sun: moon, moon, hemi, sunDir: moonDir, updateSun, follow, setShadowMapSize };
}
