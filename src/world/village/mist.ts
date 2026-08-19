import * as THREE from 'three';
import { Simplex2D } from '../noise';
import { settings } from '@/core/settings';

/**
 * 논에서 올라오는 밤안개. 카메라를 따라다니는 큰 평면 3장에 타일링 노이즈를 흘린다.
 * 가장자리는 방사형 창(window)으로 죽여서 "판때기"가 보이지 않게 한다.
 */
export class Mist {
  readonly group = new THREE.Group();
  private uniforms = {
    uNoise: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uOpacity: { value: settings.night.mistOpacity },
    uColor: { value: new THREE.Color(0x2b3d55) },
    uScale: { value: 3.0 },
  };
  private layers: THREE.Mesh[] = [];
  private baseY: number[] = [];

  constructor(scene: THREE.Scene, size = 170) {
    this.uniforms.uNoise.value = makeNoiseTexture(256);
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);

    const layerDefs = [
      { y: 0.18, scale: 2.2, op: 1.0 },
      { y: 0.55, scale: 3.4, op: 0.75 },
      { y: 1.05, scale: 5.1, op: 0.45 },
    ];
    for (const d of layerDefs) {
      const u = {
        uNoise: this.uniforms.uNoise,
        uTime: this.uniforms.uTime,
        uOpacity: { value: this.uniforms.uOpacity.value * d.op },
        uColor: this.uniforms.uColor,
        uScale: { value: d.scale },
        uOpMul: { value: d.op },
        uMaster: this.uniforms.uOpacity,
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec2 vUv;
          uniform sampler2D uNoise;
          uniform float uTime, uScale, uOpMul, uMaster;
          uniform vec3 uColor;
          void main() {
            float n1 = texture2D(uNoise, vUv * uScale + vec2(uTime * 0.0055, uTime * 0.0038)).r;
            float n2 = texture2D(uNoise, vUv * uScale * 2.3 - vec2(uTime * 0.0105, uTime * 0.0072)).r;
            float n = smoothstep(0.40, 0.95, n1 * 0.7 + n2 * 0.42);
            float r = length(vUv - 0.5) * 2.0;
            float win = smoothstep(0.03, 0.34, r) * (1.0 - smoothstep(0.58, 0.99, r));
            float a = n * win * uMaster * uOpMul;
            if (a < 0.004) discard;
            gl_FragColor = vec4(uColor, a);
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 3;
      m.frustumCulled = false;
      this.layers.push(m);
      this.baseY.push(d.y);
      this.group.add(m);
    }
    this.group.name = 'mist';
    scene.add(this.group);
  }

  /** 카메라(플레이어)를 수평으로만 따라간다 — 높이는 논 수면 기준으로 고정 */
  update(dt: number, center: THREE.Vector3) {
    this.uniforms.uTime.value += dt;
    const h = settings.night.mistHeight;
    this.uniforms.uOpacity.value = settings.night.mistOpacity;
    this.layers.forEach((m, i) => {
      m.position.set(center.x, this.baseY[i]! * h, center.z);
    });
  }
}

/** 타일링 fBm 알파 텍스처 */
function makeNoiseTexture(size: number) {
  const s = new Simplex2D(1717);
  const data = new Uint8Array(size * size * 4);
  const scale = 3;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
    const nx = Math.cos(a) * scale, ny = Math.sin(a) * scale, nz = Math.cos(b) * scale, nw = Math.sin(b) * scale;
    const v = s.fbm(nx + nz * 0.7, ny + nw * 0.7, 4) * 0.5 + 0.5;
    const i = (y * size + x) * 4;
    const c = Math.max(0, Math.min(255, v * 255));
    data[i] = c; data[i + 1] = c; data[i + 2] = c; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
