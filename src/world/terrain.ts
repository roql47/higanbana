import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { Simplex2D } from './noise';
import { clamp, lerp } from '@/core/math';

export interface IslandOptions {
  size?: number; // 한 변 (m)
  resolution?: number; // 셀 수 (한 변)
  seed?: number;
  waterLevel?: number; // 물 높이(월드 y)
}

/**
 * 프로시저럴 초원 섬: fBm 하이트맵 + 원형 폴오프(가장자리는 수면 아래) + 중앙 완만한 스폰 지대.
 * 렌더 메시(정점색으로 풀/흙 변화) + Rapier heightfield 콜라이더.
 */
export class Island {
  readonly mesh: THREE.Mesh;
  readonly size: number;
  readonly resolution: number;
  readonly waterLevel: number;
  private heights: Float32Array; // (res+1)^2, row-major [z][x]
  private noise: Simplex2D;

  constructor(scene: THREE.Scene, physics: Physics, textures: TerrainTextures, opts: IslandOptions = {}) {
    this.size = opts.size ?? 180;
    this.resolution = opts.resolution ?? 180;
    this.waterLevel = opts.waterLevel ?? 0;
    this.noise = new Simplex2D(opts.seed ?? 20260818);
    const N = this.resolution, S = this.size;
    this.heights = new Float32Array((N + 1) * (N + 1));

    // --- 하이트맵 ---
    for (let iz = 0; iz <= N; iz++) {
      for (let ix = 0; ix <= N; ix++) {
        const x = (ix / N - 0.5) * S, z = (iz / N - 0.5) * S;
        this.heights[iz * (N + 1) + ix] = this.heightAt(x, z);
      }
    }

    // --- 렌더 메시 ---
    const geo = new THREE.PlaneGeometry(S, S, N, N);
    geo.rotateX(-Math.PI / 2); // XZ 평면, +Y up. 정점 순서: z 행(위→아래) × x 열
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const uv = geo.attributes['uv'] as THREE.BufferAttribute;
    // 정점색은 텍스처에 곱해지므로 1 근처의 틴트로 사용 (텍스처 자체가 어두운 편)
    const grass = new THREE.Color(0.98, 1.22, 0.86), grassDark = new THREE.Color(0.74, 1.0, 0.66), dirt = new THREE.Color(0.98, 0.84, 0.62), rock = new THREE.Color(0.9, 0.9, 0.86), sand = new THREE.Color(1.15, 1.08, 0.88);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.sampleHeight(x, z);
      pos.setY(i, h);
      // 정점색: 노이즈로 풀 톤 변화, 경사면은 흙/바위, 수면 근처는 모래
      const slope = this.slopeAt(x, z);
      const macro = this.noise.fbm(x / 23 + 7.1, z / 23 - 3.3, 3) * 0.5 + 0.5;
      c.copy(grass).lerp(grassDark, macro);
      const dirtiness = clamp((slope - 0.35) / 0.35, 0, 1) * (0.6 + 0.4 * this.noise.noise(x / 6, z / 6));
      c.lerp(dirt, dirtiness);
      c.lerp(rock, clamp((slope - 0.75) / 0.3, 0, 1));
      const beach = clamp(1 - (h - this.waterLevel) / 1.2, 0, 1);
      c.lerp(sand, beach * 0.85);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      // 타일 UV (m 단위 → 5 m 마다 반복)
      uv.setXY(i, (x + S / 2) / 5, (z + S / 2) / 5);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // aoMap 은 uv2(three r15x 이후엔 uv1) 사용 — 같은 UV 재사용
    geo.setAttribute('uv1', uv.clone());

    const mat = new THREE.MeshStandardMaterial({
      map: textures.map,
      normalMap: textures.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      aoMap: textures.armMap,
      aoMapIntensity: 0.35,
      roughnessMap: textures.armMap,
      metalnessMap: textures.armMap,
      metalness: 0,
      roughness: 1,
      vertexColors: true,
      color: 0xffffff,
    });
    // 안티타일링: 알베도를 두 스케일로 샘플해 섞는다
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 texA = texture2D( map, vMapUv );
          vec4 texB = texture2D( map, vMapUv * 0.27 + vec2( 0.31, 0.57 ) );
          vec4 sampledDiffuseColor = mix( texA, texB, 0.45 );
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      );
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'island';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    scene.add(this.mesh);

    // --- Rapier heightfield (column-major: index = col*(nrows+1)+row, col→x, row→z) ---
    const hf = new Float32Array((N + 1) * (N + 1));
    for (let iz = 0; iz <= N; iz++) {
      for (let ix = 0; ix <= N; ix++) hf[ix * (N + 1) + iz] = this.heights[iz * (N + 1) + ix]!;
    }
    const R = physics.R;
    const body = physics.world.createRigidBody(R.RigidBodyDesc.fixed());
    physics.world.createCollider(R.ColliderDesc.heightfield(N, N, hf, { x: S, y: 1, z: S }).setFriction(1.0), body);
  }

  /** 지형 높이 함수 (해석적, 콜라이더/스캐터링 공용) */
  heightAt(x: number, z: number): number {
    const S = this.size;
    const r = Math.hypot(x, z) / (S * 0.5);
    // 가장자리 폴오프: r 0.55~0.98 사이에서 1→0, 살짝 노이즈로 해안선 불규칙
    const edgeNoise = this.noise.fbm(x / 30 + 11, z / 30 - 5, 2) * 0.08;
    const mask = 1 - smoothstep(0.55 + edgeNoise, 0.98, r);
    const hills = this.noise.fbm(x / 48, z / 48, 3, 2, 0.45) * 5.5; // 큰 굴곡
    const detail = this.noise.fbm(x / 14 + 3, z / 14 + 9, 2) * 0.35; // 잔굴곡(약하게)
    const ridge = Math.pow(Math.max(0, this.noise.noise(x / 60 + 20, z / 60)), 2) * 8; // 언덕 하나
    let h = 2.2 + hills + detail + ridge;
    // 중앙 스폰 지대는 완만하게
    const center = 1 - smoothstep(4, 18, Math.hypot(x, z));
    h = lerp(h, 3.0 + detail * 0.3, center);
    // 폴오프 → 수면 아래로
    return h * mask - (1 - mask) * 6;
  }

  private sampleHeight(x: number, z: number) { return this.heightAt(x, z); }

  /** 경사도 (|∇h|) */
  slopeAt(x: number, z: number) {
    const e = 0.5;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()) {
    const e = 0.5;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out.set(-dx, 1, -dz).normalize();
  }
}

export interface TerrainTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  armMap: THREE.Texture;
}

export async function loadTerrainTextures(renderer: THREE.WebGLRenderer): Promise<TerrainTextures> {
  const loader = new THREE.TextureLoader();
  const load = (url: string, srgb: boolean) => loader.loadAsync(url).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const [map, normalMap, armMap] = await Promise.all([
    load('/textures/grass/aerial_grass_rock_diff_2k.webp', true),
    load('/textures/grass/aerial_grass_rock_nor_gl_2k.webp', false),
    load('/textures/grass/aerial_grass_rock_arm_2k.webp', false),
  ]);
  return { map, normalMap, armMap };
}

function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
