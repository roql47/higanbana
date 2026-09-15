import * as THREE from 'three';
import { AsyncPool } from '@/core/asyncPool';
import { Props } from './props';

const modelLoads = new AsyncPool(2);
export type DetailModel = readonly [url: string, height: number, tint: number];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** 한 지역의 실물 모델과 거울 복제만 소유한다. 공용 건축 재질·충돌·스토리 객체는 포함하지 않는다. */
export class DetailBundle {
  readonly root = new THREE.Group();
  private owned: THREE.Object3D[] = [];
  private mounts: [THREE.Object3D, THREE.Group][];
  constructor(parent: THREE.Object3D) { this.mounts = [[parent, this.root]]; }
  attachTo(parent: THREE.Object3D) {
    const root = new THREE.Group(); this.mounts.push([parent, root]); return root;
  }
  async models<const T extends readonly DetailModel[]>(specs: T): Promise<{ [I in keyof T]: THREE.Group }> {
    const results = await Promise.allSettled(specs.map(([url, height, tint]) => modelLoads.run(async () => {
      const model = await Props.loadNormalized(url, height, tint);
      this.owned.push(model);
      return model;
    })));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    return results.map((r) => (r as PromiseFulfilledResult<THREE.Group>).value) as { [I in keyof T]: THREE.Group };
  }
  mount() { for (const [parent, root] of this.mounts) parent.add(root); }
  dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const roots = [...this.owned, ...this.mounts.map(([, root]) => root)];
    for (const root of roots) root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value as THREE.Texture);
    }
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const [, root] of this.mounts) root.removeFromParent();
    for (const root of roots) root.clear();
    this.owned.length = 0; this.mounts.length = 0;
  }
}

/** 접근 선로딩 + 더 먼 해제 경계 + 유예 시간으로 문턱 왕복 시 로드/해제 반복을 막는다. */
export class StreamedDetail {
  private bundle: DetailBundle | null = null;
  private pending: Promise<void> | null = null;
  private wanted = false;
  private outsideTime = 0;
  private retryTime = 0;
  get resident() { return this.bundle !== null; }
  get loading() { return this.pending !== null; }
  /** Only the real-world furniture, never its independent mirror clones. */
  get renderRoots(): readonly THREE.Object3D[] { return this.bundle?.root.children ?? []; }
  constructor(
    private parent: THREE.Object3D,
    private bounds: Bounds,
    private build: (bundle: DetailBundle) => Promise<void>,
    private fallbacks: THREE.Object3D[],
    private label: string,
  ) {}
  prepare(center: THREE.Vector3) { this.update(0, center); return this.pending ?? Promise.resolve(); }
  update(dt: number, center: THREE.Vector3) {
    this.retryTime = Math.max(0, this.retryTime - dt);
    const dx = Math.max(this.bounds.minX - center.x, 0, center.x - this.bounds.maxX);
    const dz = Math.max(this.bounds.minZ - center.z, 0, center.z - this.bounds.maxZ);
    const distance2 = dx * dx + dz * dz;
    if (distance2 <= 24 * 24) { this.wanted = true; this.outsideTime = 0; }
    else if (distance2 > 44 * 44) {
      this.outsideTime += dt;
      if (this.outsideTime >= 12) {
        this.wanted = false;
        this.bundle?.dispose(); this.bundle = null;
        for (const fallback of this.fallbacks) fallback.visible = true;
      }
    } else this.outsideTime = 0;
    if (this.wanted && !this.bundle && !this.pending && this.retryTime === 0) this.load();
  }
  private load() {
    const bundle = new DetailBundle(this.parent);
    this.pending = (async () => {
      try {
        await this.build(bundle);
        if (!this.wanted) { bundle.dispose(); return; }
        bundle.mount(); this.bundle = bundle;
        for (const fallback of this.fallbacks) fallback.visible = false;
      } catch (error) {
        bundle.dispose(); this.retryTime = 15;
        console.warn('[detail] ' + this.label + ' 로드 실패 — 절차 가구 유지', error);
      }
    })().finally(() => { this.pending = null; });
  }
}
