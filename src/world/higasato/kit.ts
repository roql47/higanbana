import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';

/**
 * 모듈러 구조물 공통 도구 — shrine.ts 의 parts/box/collide/roofGeo 패턴을
 * 스토리 구조물(비석·사당·받침대·블록아웃)이 재사용할 수 있게 뽑았다.
 * 재질별로 병합해 구조물 하나 = 드로우콜 재질 수만큼.
 */
export class PartsBuilder {
  private parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  constructor(private physics: Physics) {}

  mat(c: number, rough = 0.85) { return new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 }); }

  box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, yaw = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (yaw) g.rotateY(yaw);
    g.translate(x, y, z);
    this.parts.push({ geo: g, mat: m });
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, m: THREE.Material, seg = 10) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(x, y, z);
    this.parts.push({ geo: g, mat: m });
  }

  add(geo: THREE.BufferGeometry, m: THREE.Material) { this.parts.push({ geo, mat: m }); }

  /** 맞배지붕 — 용마루가 x 축 방향. yaw 로 돌린다 */
  gable(cx: number, cz: number, halfW: number, halfD: number, base: number, rise: number, m: THREE.Material, yaw = 0) {
    const v = [
      [-halfW, base, -halfD], [halfW, base, -halfD], [halfW, base, halfD], [-halfW, base, halfD],
      [-halfW + 0.3, base + rise, 0], [halfW - 0.3, base + rise, 0],
    ].flat();
    const idx = [0, 1, 5, 0, 5, 4, 2, 3, 4, 2, 4, 5, 0, 4, 3, 1, 2, 5];
    const pos: number[] = [], uv: number[] = [];
    for (const i of idx) { pos.push(v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!); uv.push(0, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (yaw) g.rotateY(yaw);
    g.translate(cx, 0, cz);
    g.computeVertexNormals();
    this.parts.push({ geo: g, mat: m });
  }

  collide(x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0) {
    const q = yaw ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw) : undefined;
    this.physics.addStaticBox(new THREE.Vector3(x, y, z), new THREE.Vector3(hx, hy, hz), q);
  }

  /** 재질별 병합 → 그룹. parts 는 비워진다 (빌더 재사용 가능) */
  build(name: string): THREE.Group {
    const group = new THREE.Group();
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of this.parts) {
      if (!byMat.has(p.mat)) byMat.set(p.mat, []);
      byMat.get(p.mat)!.push(p.geo.index ? p.geo.toNonIndexed() : p.geo);
    }
    for (const [m, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.name = name;
    this.parts = [];
    return group;
  }
}

/** 캔버스 텍스트 텍스처 — 비석 각인·팻말·석판. 글자는 텍스처가 제일 싸다 */
export function textCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
