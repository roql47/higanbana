import * as THREE from 'three';
import { makeWaterNormal } from '../water';
import { PADDY_WATER, type VillageGround } from './ground';

/**
 * 논: 배미마다 얕은 수면 쿼드(하나로 병합) + 줄지어 심은 벼(InstancedMesh).
 * 벼는 실제처럼 **줄 간격 0.45 m, 포기 간격 0.30 m** 로 심어야 논처럼 보인다 — 랜덤 스캐터로는 안 나온다.
 */
export class Paddy {
  readonly group = new THREE.Group();
  private waterMat: THREE.MeshPhysicalMaterial;
  private uniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0.35) } };
  private t = 0;
  private riceChunks: THREE.InstancedMesh[] = [];

  constructor(scene: THREE.Scene, ground: VillageGround, riceBudget = 90000) {
    const cells = ground.paddyCells();

    // --- 수면: 배미 쿼드를 하나의 지오메트리로 ---
    const normal = makeWaterNormal(256, 4);
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a1a20,
      roughness: 0.16,
      metalness: 0,
      transparent: true,
      opacity: 0.72,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.30, 0.30),
      envMapIntensity: 2.4, // 밤하늘·달을 비추는 게 논의 전부다
      clearcoat: 0.35,
      clearcoatRoughness: 0.12,
      depthWrite: false,
    });
    const wPos: number[] = [], wUv: number[] = [], wNor: number[] = [], wIdx: number[] = [];
    for (const c of cells) {
      const b = wPos.length / 3;
      const pts: [number, number][] = [[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z1]];
      for (const [x, z] of pts) { wPos.push(x, PADDY_WATER, z); wNor.push(0, 1, 0); wUv.push(x / 3, z / 3); }
      wIdx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
    wGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wNor, 3));
    wGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
    wGeo.setIndex(wIdx);
    const water = new THREE.Mesh(wGeo, this.waterMat);
    water.name = 'paddy-water';
    water.renderOrder = 1;
    this.group.add(water);

    // --- 벼 ---
    const blade = riceBlade();
    const riceMat = new THREE.MeshStandardMaterial({ color: 0x4a5c30, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    const u = this.uniforms;
    riceMat.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = u.uTime;
      shader.uniforms['uWind'] = u.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; uniform vec2 uWind; varying float vTip;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vTip = uv.y;
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float phase = dot(wp.xz, vec2(0.28, 0.21));
          float gust = sin(uTime * 1.1 + phase) * 0.6 + sin(uTime * 2.3 + phase * 1.6) * 0.22;
          float sway = gust * 0.16 * uv.y * uv.y;
          transformed.x += uWind.x * sway;
          transformed.z += uWind.y * sway;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vTip;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(vec3(0.42, 0.48, 0.34), vec3(1.05, 1.02, 0.72), vTip);`);
    };

    // 배미마다 줄 심기 → 8×8 청크로 나눠 프러스텀 컬링
    const rng = seeded(4021);
    const CH = 8;
    const buckets: THREE.Matrix4[][] = Array.from({ length: CH * CH }, () => []);
    const dummy = new THREE.Object3D();
    const ROW = 0.38, STEP = 0.25;
    const half = ground.size * 0.5;
    let total = 0;
    for (const c of cells) {
      for (let z = c.z0 + 0.5; z < c.z1 - 0.3; z += ROW) {
        for (let x = c.x0 + 0.4; x < c.x1 - 0.3; x += STEP) {
          const jx = x + (rng() - 0.5) * 0.07, jz = z + (rng() - 0.5) * 0.07;
          const h = ground.heightAt(jx, jz);
          if (h > PADDY_WATER + 0.02) continue; // 논두렁 쪽은 건너뜀
          dummy.position.set(jx, h, jz);
          dummy.rotation.set(0, rng() * Math.PI, 0);
          dummy.scale.set(0.9 + rng() * 0.25, 0.62 + rng() * 0.26, 0.9 + rng() * 0.25);
          dummy.updateMatrix();
          const cx = Math.min(CH - 1, Math.max(0, Math.floor(((jx + half) / (half * 2)) * CH)));
          const cz = Math.min(CH - 1, Math.max(0, Math.floor(((jz + half) / (half * 2)) * CH)));
          buckets[cz * CH + cx]!.push(dummy.matrix.clone());
          total++;
        }
      }
    }
    // 예산 초과 시 균등 솎아내기
    const keep = Math.min(1, riceBudget / Math.max(1, total));
    for (const b of buckets) {
      const n = Math.round(b.length * keep);
      if (n < 1) continue;
      const mesh = new THREE.InstancedMesh(blade, riceMat, n);
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, b[Math.floor(i / keep)] ?? b[i]!);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.5;
      this.riceChunks.push(mesh);
      this.group.add(mesh);
    }

    this.group.name = 'paddy';
    scene.add(this.group);
  }

  get riceCount() { return this.riceChunks.reduce((a, m) => a + m.count, 0); }

  private fullCounts: number[] | null = null;
  setBudget(total: number) {
    this.fullCounts ??= this.riceChunks.map((m) => m.count);
    const full = this.fullCounts.reduce((a, b) => a + b, 0);
    const k = Math.min(1, total / Math.max(1, full));
    this.riceChunks.forEach((m, i) => { m.count = Math.max(0, Math.round(this.fullCounts![i]! * k)); });
  }

  update(dt: number) {
    this.t += dt;
    this.uniforms.uTime.value = this.t;
    const n = this.waterMat.normalMap!;
    n.offset.set(this.t * 0.004, this.t * 0.003);
  }
}

/** 벼 한 포기: 위로 갈수록 좁아지는 잎 3장을 방사 배치 */
function riceBlade() {
  const g = new THREE.BufferGeometry();
  const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
  const w = 0.016, h = 1.0;
  for (let k = 0; k < 3; k++) {
    const rot = (k / 3) * Math.PI * 2 + 0.4;
    const c = Math.cos(rot), s = Math.sin(rot);
    const bend = 0.12 * (k % 2 === 0 ? 1 : -1); // 잎이 살짝 벌어짐
    const base = verts.length / 3;
    const pts: [number, number][] = [[-w, 0], [w, 0], [-w * 0.4, h * 0.6], [w * 0.4, h * 0.6], [bend, h]];
    for (const [x, y] of pts) { verts.push(x * c, y, x * s); uvs.push((x / w + 1) / 2, y / h); }
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
