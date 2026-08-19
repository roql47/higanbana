import * as THREE from 'three';
import { toFloatGeometry } from '@/core/geom';
import type { CharacterModel } from './model';
import type { ItemDef } from '@/items/items';
import { Props } from '@/world/props';

/**
 * 무기 장착: 오른손 본(R_Hand) 아래 마운트에 무기 메시를 붙이고, 안 쓸 때는 등(Spine02) 칼집 마운트로 옮긴다.
 * 무기 지오메트리는 로드 시 가장 긴 축을 +Y(칼날 방향)로 정렬하고 자루 끝을 원점에 둔다.
 */
export class Equipment {
  private handMount = new THREE.Group();
  private sheathMount = new THREE.Group();
  private handBone: THREE.Object3D | null = null;
  private sheathBone: THREE.Object3D | null = null;
  private weaponObj: THREE.Object3D | null = null;
  private cache = new Map<string, THREE.Object3D>();
  current: ItemDef | null = null;
  drawn = true;
  /** 칼날 길이(정규화 후, m) */
  bladeLength = 1;

  constructor(private model: CharacterModel) {
    model.root.traverse((o) => {
      if (/^(R_Hand|mixamorig:RightHand)$/.test(o.name)) this.handBone = o;
      if (/^(Spine02|mixamorig:Spine2)$/.test(o.name)) this.sheathBone = o;
    });
    this.handMount.name = 'weapon-hand-mount';
    this.sheathMount.name = 'weapon-sheath-mount';
    this.handBone?.add(this.handMount);
    this.sheathBone?.add(this.sheathMount);
  }

  get mount() { return this.drawn ? this.handMount : this.sheathMount; }
  get hasWeapon() { return !!this.weaponObj; }

  async equip(item: ItemDef | null) {
    if (this.weaponObj) { this.weaponObj.removeFromParent(); this.weaponObj = null; }
    this.current = item;
    if (!item?.model) return;
    let obj = this.cache.get(item.id);
    if (!obj) {
      const gltf = await Props.loader().loadAsync(item.model);
      obj = new THREE.Group();
      const geos: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) geos.push({ geo: toFloatGeometry(m.geometry, m.matrixWorld), mat: Array.isArray(m.material) ? m.material[0]! : m.material }); });
      // 주성분(PCA)으로 칼의 길이 방향을 구해 +Y 에 맞춘다 (Tripo 는 대각선으로 놓고 생성하기도 함)
      {
        const pts: THREE.Vector3[] = [];
        const mean = new THREE.Vector3();
        for (const g of geos) {
          const pos = g.geo.attributes['position'] as THREE.BufferAttribute;
          const stride = Math.max(1, Math.floor(pos.count / 4000));
          for (let i = 0; i < pos.count; i += stride) { const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)); pts.push(v); mean.add(v); }
        }
        mean.divideScalar(Math.max(1, pts.length));
        // 공분산 → 파워 이터레이션으로 최대 고유벡터
        let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
        for (const p of pts) { const x = p.x - mean.x, y = p.y - mean.y, z = p.z - mean.z; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
        let axis = new THREE.Vector3(1, 1, 1).normalize();
        for (let it = 0; it < 32; it++) {
          axis.set(xx * axis.x + xy * axis.y + xz * axis.z, xy * axis.x + yy * axis.y + yz * axis.z, xz * axis.x + yz * axis.y + zz * axis.z).normalize();
        }
        const q = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0));
        const rot = new THREE.Matrix4().makeRotationFromQuaternion(q);
        for (const g of geos) g.geo.applyMatrix4(rot);
      }
      const bb = new THREE.Box3();
      for (const g of geos) { g.geo.computeBoundingBox(); bb.union(g.geo.boundingBox!); }
      // 자루가 아래(y=0)로 오도록: 자루 쪽(가드+그립+폼멜)이 정점이 훨씬 많다 → 정점이 많은 절반이 위에 있으면 뒤집는다
      {
        let lower = 0, upper = 0;
        const mid = (bb.min.y + bb.max.y) / 2;
        for (const g of geos) {
          const pos = g.geo.attributes['position'] as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++) { if (pos.getY(i) < mid) lower++; else upper++; }
        }
        const flipIt = item.hiltAtMax ?? (upper > lower);
        if (flipIt) {
          const flip = new THREE.Matrix4().makeRotationX(Math.PI);
          bb.makeEmpty();
          for (const g of geos) { g.geo.applyMatrix4(flip); g.geo.computeBoundingBox(); bb.union(g.geo.boundingBox!); }
        }
      }
      const c = bb.getCenter(new THREE.Vector3());
      const len = bb.max.y - bb.min.y;
      const s = 1.0 / len; // 정규화: 길이 1 → grip.scale 로 실제 길이 결정
      for (const g of geos) {
        g.geo.translate(-c.x, -bb.min.y, -c.z);
        g.geo.scale(s, s, s);
        const mesh = new THREE.Mesh(g.geo, g.mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        obj.add(mesh);
      }
      this.cache.set(item.id, obj);
    }
    this.weaponObj = obj;
    this.applyOffsets();
    this.mount.add(obj);
  }

  /** grip/sheath 오프셋 적용 (툴에서 값 바꾸면 다시 호출) */
  applyOffsets() {
    const it = this.current;
    if (!it) return;
    const g = it.grip ?? { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 };
    // 본 계층에 캐릭터 정규화 스케일이 들어 있으므로, 월드 길이가 grip.scale(m) 이 되도록 나눈다
    this.model.root.updateMatrixWorld(true);
    const ws = new THREE.Vector3(1, 1, 1);
    this.handBone?.getWorldScale(ws);
    const k = 1 / Math.max(1e-6, ws.x);
    this.handMount.position.set(g.pos[0] * k, g.pos[1] * k, g.pos[2] * k);
    this.handMount.rotation.set(...g.rot);
    this.handMount.scale.setScalar(g.scale * k);
    const sh = it.sheath ?? { bone: 'Spine02', pos: [0, 0, 0], rot: [0, 0, 0] };
    this.sheathMount.position.set(sh.pos[0] * k, sh.pos[1] * k, sh.pos[2] * k);
    this.sheathMount.rotation.set(...sh.rot);
    this.sheathMount.scale.setScalar(g.scale * k);
    this.bladeLength = g.scale;
  }

  setDrawn(d: boolean) {
    if (this.drawn === d) return;
    this.drawn = d;
    if (this.weaponObj) { this.weaponObj.removeFromParent(); this.mount.add(this.weaponObj); }
  }

  /** 칼날 위 샘플 지점(월드) t∈[0,1] */
  bladePoint(t: number, out = new THREE.Vector3()) {
    out.set(0, t, 0); // 마운트 로컬 길이 1 = 실제 grip.scale m (마운트 스케일에 포함)
    return this.handMount.localToWorld(out);
  }
}
