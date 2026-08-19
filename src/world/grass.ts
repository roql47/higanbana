import * as THREE from 'three';
import type { Island } from './terrain';
import { Simplex2D } from './noise';

/**
 * 인스턴스 풀잎: 삼각 블레이드 2장을 교차한 저폴리 다발을 섬 전체에 흩뿌리고,
 * 정점 셰이더에서 시간·위치 기반으로 흔들림. 그림자는 받기만 함.
 */
export class Grass {
  /** 청크(격자)별 InstancedMesh — 프러스텀 컬링이 청크 단위로 걸리도록 */
  readonly chunks: THREE.InstancedMesh[] = [];
  readonly group = new THREE.Group();
  private uniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0.4) } };

  constructor(scene: THREE.Scene, island: Island, count = 140000, seed = 3) {
    // 블레이드 지오메트리: 높이 1(스케일로 조절), 아래 넓고 위 뾰족한 삼각 2개를 90° 교차
    const blade = new THREE.BufferGeometry();
    const w = 0.022, h = 1;
    const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
    const addQuad = (rot: number) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      const base = verts.length / 3;
      // 4정점: 좌하, 우하, 좌상(약간 안쪽), 정점(끝)
      const pts = [[-w, 0], [w, 0], [-w * 0.35, h * 0.55], [w * 0.35, h * 0.55], [0, h]];
      for (const [x, y] of pts) { verts.push(x! * c, y!, x! * s); uvs.push((x! / w + 1) / 2, y! / h); }
      idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
    };
    addQuad(0); addQuad(Math.PI / 2);
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    blade.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    blade.setIndex(idx);
    blade.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x6f9c49,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const uniforms = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = uniforms.uTime;
      shader.uniforms['uWind'] = uniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; uniform vec2 uWind;
          varying float vTip;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vTip = uv.y;
          // 인스턴스 월드 위치로 위상 차이 → 물결치는 바람
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float phase = dot(wp.xz, vec2(0.35, 0.27));
          float gust = sin(uTime * 1.3 + phase) * 0.6 + sin(uTime * 2.7 + phase * 1.7) * 0.25 + sin(uTime * 0.6 + phase * 0.5) * 0.4;
          float sway = gust * 0.22 * uv.y * uv.y; // 끝일수록 많이
          transformed.x += uWind.x * sway;
          transformed.z += uWind.y * sway;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vTip;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // 뿌리는 어둡게, 끝은 밝고 노랗게
          diffuseColor.rgb *= mix(vec3(0.5, 0.58, 0.4), vec3(1.05, 1.1, 0.9), vTip);`);
    };

    const rng = (() => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();
    const noise = new Simplex2D(seed + 11);
    const dummy = new THREE.Object3D();
    const half = island.size * 0.5;
    // 배치 결과를 청크별로 모은 뒤 InstancedMesh 생성
    const CH = 8; // 8×8 청크
    const cell = (half * 2 * 0.9) / CH;
    const buckets: THREE.Matrix4[][] = Array.from({ length: CH * CH }, () => []);
    let n = 0, tries = 0;
    while (n < count && tries < count * 4) {
      tries++;
      const x = (rng() * 2 - 1) * half * 0.9, z = (rng() * 2 - 1) * half * 0.9;
      const hgt = island.heightAt(x, z);
      if (hgt < island.waterLevel + 0.5) continue;
      if (island.slopeAt(x, z) > 0.7) continue;
      // 밀도 노이즈: 군데군데 빈 곳
      const density = noise.fbm(x / 18, z / 18, 2) * 0.5 + 0.5;
      if (rng() > 0.35 + density * 0.65) continue;
      dummy.position.set(x, hgt - 0.02, z);
      dummy.rotation.set(0, rng() * Math.PI, 0);
      const s = 0.22 + rng() * 0.33;
      dummy.scale.set(1 + rng() * 0.5, s, 1 + rng() * 0.5);
      dummy.updateMatrix();
      const cx = Math.min(CH - 1, Math.floor((x + half * 0.9) / cell)), cz = Math.min(CH - 1, Math.floor((z + half * 0.9) / cell));
      buckets[cz * CH + cx]!.push(dummy.matrix.clone());
      n++;
    }
    this.group.name = 'grass';
    for (const b of buckets) {
      if (!b.length) continue;
      const mesh = new THREE.InstancedMesh(blade, mat, b.length);
      for (let i = 0; i < b.length; i++) mesh.setMatrixAt(i, b[i]!);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.frustumCulled = true;
      mesh.computeBoundingSphere();
      // 바람 흔들림만큼 바운딩 여유
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.6;
      this.chunks.push(mesh);
      this.group.add(mesh);
    }
    scene.add(this.group);
  }

  get count() { return this.chunks.reduce((a, m) => a + m.count, 0); }
  private fullCounts: number[] | null = null;
  /** 런타임에 표시 다발 수를 줄임 (인스턴스 뒤쪽은 그리지 않음) */
  setBudget(total: number) {
    this.fullCounts ??= this.chunks.map((m) => m.count);
    const full = this.fullCounts.reduce((a, b) => a + b, 0);
    const k = Math.min(1, total / Math.max(1, full));
    this.chunks.forEach((m, i) => { m.count = Math.max(0, Math.round(this.fullCounts![i]! * k)); });
  }

  update(dt: number) { this.uniforms.uTime.value += dt; }
}
