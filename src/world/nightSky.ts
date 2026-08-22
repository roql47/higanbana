import * as THREE from 'three';
import { settings } from '@/core/settings';
import { DEG } from '@/core/math';

/**
 * 여름밤 하늘: 그라디언트 + 별 + 달을 한 장의 셰이더 구(BackSide)로 그린다.
 * 같은 셰이더에서 별을 끈 버전을 PMREM 으로 구워 아주 약한 환경광(논 수면 반사용)으로 쓴다.
 *
 * **달빛 그림자** (2026-08-21): 오래 `castShadow = false` 였다. 그래서 밤의 야외에는 그림자가
 * 통째로 없었고 — 삼나무도 민가도 토리이도 지면에 붙질 않아 전부 배경판처럼 떠 보였다.
 * 초칭(점광)이 유일한 그림자 광원이라 반경 13 m 밖은 완전히 납작했다.
 *
 * 켜면서 세 가지를 낮은 쪽으로 잡았다 — **이건 타협이 아니라 달빛의 성질이다**:
 *   · 해상도는 낮의 절반(상한 2048). 달 그림자는 원래 흐리다. 선명하면 오히려 낮처럼 보인다
 *   · 프러스텀은 0.75 배로 조인다. 밤안개가 55 m 에서 시야를 닫으므로 먼 그림자는 어차피 안 보이고,
 *     좁힐수록 낮은 해상도에서도 텍셀 밀도가 산다
 *   · `shadow.radius` 를 크게 — 실제 달의 겉보기 반경(≈0.26°)이 만드는 반그림자
 */
export function createNightSky(renderer: THREE.WebGLRenderer, scene: THREE.Scene, shadowMapSize = 0) {
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

  // 달빛: 방향광. shadowMapSize 0 이면 그림자 없음(low·medium 품질)
  const moon = new THREE.DirectionalLight(0xaec6ff, settings.night.moonIntensity);
  const mapSize = shadowMapSize > 0 ? Math.min(2048, Math.max(512, shadowMapSize >> 1)) : 0;
  moon.castShadow = mapSize > 0;
  if (mapSize > 0) {
    moon.shadow.mapSize.set(mapSize, mapSize);
    // 지형이 완만해서 표면과 광선의 각이 얕다 → 상수 bias 보다 normalBias 가 여드름을 훨씬 잘 잡는다
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.06;
    moon.shadow.radius = 6;
    // ⚠️ 섀도맵을 격 프레임만 굽는 스로틀(`shadow.autoUpdate = false`)을 넣었다가 **뺐다**.
    // 실측상 이득이 없었다(격 프레임 +4.8 ms · 매 프레임 +4.3 ms — 노이즈 안). 비용이 섀도맵을 *굽는* 쪽이
    // 아니라 **픽셀당 PCF 샘플링**이라 프레임마다 그대로 든다. 이 프로젝트의 기존 결론
    // (`core/quality.ts`: "부하가 거의 전부 픽셀 수에 비례한다")과 같은 이야기다.
    const msc = moon.shadow.camera;
    msc.near = 1; msc.far = 150;
  }
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
  /** 그림자 프러스텀 반경(m) — 밤안개가 시야를 닫으므로 낮보다 좁게 */
  const shadowScale = 0.75;
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

  /**
   * 하늘 돔을 카메라에 붙여둔다(무한 원경) + 그림자 프러스텀을 캐릭터 주변으로 옮긴다.
   * 프러스텀 중심을 **텍셀 단위로 스냅**하지 않으면 걸을 때 그림자 가장자리가 계단처럼 기어간다.
   */
  const tmp = new THREE.Vector3();
  function follow(target: THREE.Vector3, dt = 0) {
    dome.position.copy(target);
    uniforms['uTime']!.value += dt;
    if (!moon.castShadow) { moon.position.copy(target).addScaledVector(moonDir, 200); return; }
    const r = settings.render.shadowRadius * shadowScale;
    const msc = moon.shadow.camera;
    if (msc.right !== r) { msc.left = -r; msc.right = r; msc.top = r; msc.bottom = -r; msc.updateProjectionMatrix(); }
    const texel = (r * 2) / moon.shadow.mapSize.width;
    tmp.copy(target);
    tmp.x = Math.round(tmp.x / texel) * texel;
    tmp.z = Math.round(tmp.z / texel) * texel;
    moon.target.position.copy(tmp);
    moon.position.copy(tmp).addScaledVector(moonDir, 80);
    moon.target.updateMatrixWorld();
  }

  /** 그림자맵 해상도 런타임 변경. 0 이면 달빛 그림자를 끈다 (품질 하향) */
  function setShadowMapSize(size: number) {
    const want = size > 0 ? Math.min(2048, Math.max(512, size >> 1)) : 0;
    moon.castShadow = want > 0;
    if (want === 0 || moon.shadow.mapSize.width === want) return;
    moon.shadow.map?.dispose();
    moon.shadow.map = null;
    moon.shadow.mapSize.set(want, want);
  }

  /**
   * 하늘 색을 바꾼다 (시간대 전환용 — `world/timeOfDay.ts`).
   * 천정·지평선·지면 반사색과 달(해) 색·크기·별 밀도가 시간대를 결정한다.
   */
  function setSkyColors(o: { zenith?: number; horizon?: number; ground?: number; moonColor?: number; moonSize?: number; stars?: number }) {
    if (o.zenith !== undefined) uniforms['uZenith']!.value.setHex(o.zenith);
    if (o.horizon !== undefined) uniforms['uHorizon']!.value.setHex(o.horizon);
    if (o.ground !== undefined) uniforms['uGround']!.value.setHex(o.ground);
    if (o.moonColor !== undefined) uniforms['uMoonColor']!.value.setHex(o.moonColor);
    if (o.moonSize !== undefined) uniforms['uMoonSize']!.value = o.moonSize;
    if (o.stars !== undefined) uniforms['uStars']!.value = o.stars;
    // 하늘이 바뀌면 환경맵도 다시 구워야 한다 (PMREM 은 캐시다)
    bakeMat.uniforms['uZenith']!.value.copy(uniforms['uZenith']!.value);
    bakeMat.uniforms['uHorizon']!.value.copy(uniforms['uHorizon']!.value);
    bakeMat.uniforms['uGround']!.value.copy(uniforms['uGround']!.value);
  }

  return { dome, sun: moon, moon, hemi, sunDir: moonDir, updateSun, follow, setShadowMapSize, setSkyColors };
}
