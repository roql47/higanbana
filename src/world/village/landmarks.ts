import * as THREE from 'three';
import { Props } from '@/world/props';
import { toFloatGeometry } from '@/core/geom';
import type { Physics } from '@/core/physics';
import type { VillageGround } from './ground';

/**
 * 랜드마크 소품 — 석등(이시도로)·지장보살. Tripo GLB 를 정규화해 배치하고 콜라이더를 단다.
 * 지장 6구는 "움직이는 지장" 연출(scares.ts)이 위치·방향을 스크립트로 바꾸므로 개별 메시.
 */
export interface Placed { obj: THREE.Object3D; base: THREE.Vector3; yaw: number }

export class Landmarks {
  readonly group = new THREE.Group();
  readonly jizo: Placed[] = [];
  readonly lanterns: Placed[] = [];
  readonly lanternLights: THREE.PointLight[] = [];
  private t = 0;

  constructor(private scene: THREE.Scene, private physics: Physics, private ground: VillageGround) {
    this.group.name = 'landmarks';
    scene.add(this.group);
  }

  async load() {
    const loader = Props.loader();
    const [jizoG, lanG] = await Promise.all([
      loader.loadAsync('/models/props/jizo.glb'),
      loader.loadAsync('/models/props/ishidoro.glb'),
    ]);
    const jizoT = normalize(jizoG.scene, 1.15);   // 지장 1.15 m
    const lanT = normalize(lanG.scene, 2.1);      // 석등 2.1 m

    // ---- 여섯 지장(六地蔵): 스폰 북쪽·토리이 진입 전 평지, 참배로 서편에 한 줄 ----
    // (처음 s=16 에 뒀더니 남쪽 산자락 경사(y 1.8)에 걸려 기울어 보였다 → s=36 평지로)
    const rp = this.ground.roadAt(36);
    for (let i = 0; i < 6; i++) {
      const x = rp.x - 3.2, z = rp.z + 3.5 - i * 1.15;
      this.place(jizoT, x, z, Math.PI / 2, this.jizo, 0.28); // 동쪽(참배로)을 본다
    }
    // ---- 석등: 토리이 진입부 좌우 한 쌍 + 참배로 중간 좌우 + 신사 언덕 위 한 쌍 ----
    for (const s of [44, 70, 96]) {
      const p = this.ground.roadAt(Math.min(s, this.ground.roadLength - 3));
      const nx = -p.dirZ, nz = p.dirX; // 진행 방향의 좌측 법선
      for (const side of [-1, 1]) {
        const x = p.x + nx * side * 2.6, z = p.z + nz * side * 2.6;
        const yaw = Math.atan2(p.dirX, p.dirZ);
        this.place(lanT, x, z, yaw, this.lanterns, 0.32);
        // 석등 속 불 — 그림자 없는 약한 포인트라이트
        const y = this.ground.heightAt(x, z);
        const l = new THREE.PointLight(0xffb060, 1.2, 6.5, 2);
        l.position.set(x, y + 1.45, z);
        l.castShadow = false;
        this.lanternLights.push(l);
        this.group.add(l);
      }
    }
    console.info('[landmarks] jizo', this.jizo.length, '· ishidoro', this.lanterns.length);
  }

  private place(tpl: THREE.Object3D, x: number, z: number, yaw: number, into: Placed[], colR: number) {
    const obj = tpl.clone(true);
    const y = this.ground.heightAt(x, z);
    obj.position.set(x, y - 0.02, z);
    obj.rotation.y = yaw;
    this.group.add(obj);
    into.push({ obj, base: new THREE.Vector3(x, y, z), yaw });
    const h = (obj.userData['height'] as number) ?? 1;
    this.physics.addStaticBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(colR, h / 2, colR));
  }

  update(dt: number) {
    this.t += dt;
    for (let i = 0; i < this.lanternLights.length; i++) {
      this.lanternLights[i]!.intensity = 1.2 * (0.82 + 0.18 * Math.sin(this.t * 3.1 + i * 2.1) * Math.sin(this.t * 7.7 + i));
    }
  }
}

/** Tripo 소품 정규화: 목표 높이, 바닥 원점, XZ 중심. 정면은 Tripo +X → +Z */
function normalize(root: THREE.Object3D, targetH: number) {
  root.updateMatrixWorld(true);
  const geos: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) geos.push({ geo: toFloatGeometry(m.geometry, m.matrixWorld), mat: Array.isArray(m.material) ? m.material[0]! : m.material }); });
  const bb = new THREE.Box3();
  for (const g of geos) { g.geo.computeBoundingBox(); bb.union(g.geo.boundingBox!); }
  const size = bb.getSize(new THREE.Vector3());
  const s = targetH / Math.max(0.01, size.y);
  const c = bb.getCenter(new THREE.Vector3());
  const out = new THREE.Group();
  for (const g of geos) {
    g.geo.translate(-c.x, -bb.min.y, -c.z);
    g.geo.scale(s, s, s);
    g.geo.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(g.geo, g.mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  out.userData['height'] = targetH;
  return out;
}
