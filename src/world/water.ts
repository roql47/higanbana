import * as THREE from 'three';
import { Simplex2D } from './noise';

/** 섬 주변 바다: 큰 평면 + 프로시저럴 노멀맵 스크롤. 환경맵 반사(PBR)로 하늘을 비춘다. */
export class Water {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshPhysicalMaterial;
  private t = 0;

  constructor(scene: THREE.Scene, level = 0, size = 1200) {
    const normal = makeWaterNormal(256, 4);
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(size / 12, size / 12);
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0x1d5b66,
      roughness: 0.14,
      metalness: 0.0,
      transparent: true,
      opacity: 0.86,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: 1.2,
      clearcoat: 0.3,
      clearcoatRoughness: 0.2,
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = level;
    this.mesh.name = 'water';
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  update(dt: number) {
    this.t += dt;
    const n = this.mat.normalMap!;
    n.offset.set(this.t * 0.012, this.t * 0.009);
  }
}

/** 노이즈 하이트 → 노멀맵 (탄젠트 공간, +Z up) */
export function makeWaterNormal(size: number, scale: number) {
  const s = new Simplex2D(99);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // 타일링을 위해 원환면 좌표로 샘플
    const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
    const nx = Math.cos(a) * scale, ny = Math.sin(a) * scale, nz = Math.cos(b) * scale, nw = Math.sin(b) * scale;
    h[y * size + x] = s.fbm(nx + nz * 0.7, ny + nw * 0.7, 3) * 0.5 + s.fbm(nx * 2.3 - nw, ny * 2.3 + nz, 2) * 0.25;
  }
  const data = new Uint8Array(size * size * 4);
  const strength = 6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)]!, r = h[y * size + ((x + 1) % size)]!;
    const u = h[((y - 1 + size) % size) * size + x]!, d = h[((y + 1) % size) * size + x]!;
    const nx = -(r - l) * strength, ny = -(d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    data[i] = ((nx / len) * 0.5 + 0.5) * 255;
    data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
    data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
