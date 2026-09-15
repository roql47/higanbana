import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeHouseMaterials } from '@/world/village/houseMaterials';
import { tileTex } from './kit';

/** Permanent manor geometry shares the village PBR maps; streamed GLBs retain their own maps. */
let materials: ReturnType<typeof createMaterials> | undefined;
function createMaterials() {
  const house = makeHouseMaterials();
  const surface = (source: THREE.MeshStandardMaterial, name: string, color: number, repeat = 3) => {
    const mat = source.clone(); mat.name = name; mat.vertexColors = false;
    mat.color.setHex(color); mat.userData['worldUV'] = repeat; return mat;
  };
  const wood = surface(house.plank, 'manor-aged-cedar', 0xc2ab8b);
  const dark = surface(house.plankDark, 'manor-dark-cedar', 0x665449);
  const edge = surface(house.timber, 'manor-worn-wood-edge', 0xdfc29a);
  const lacquer = surface(house.plankDark, 'manor-worn-lacquer', 0x514031);
  lacquer.roughness = 0.66;
  const plaster = surface(house.mud, 'manor-aged-plaster', 0xb7ac97, 2);
  // One small woven swatch, shared by the packet, drawer lining and writing kit.
  const swatch = document.createElement('canvas'); swatch.width = swatch.height = 128;
  const sc = swatch.getContext('2d')!, height = document.createElement('canvas'); height.width = height.height = 128;
  const nc = height.getContext('2d')!;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const warp = (x % 4 < 2) !== (y % 4 < 2), fleck = (x * 17 + y * 31) % 13;
    const v = (warp ? 173 : 153) + fleck;
    sc.fillStyle = `rgb(${v},${v - 12},${v - 29})`; sc.fillRect(x, y, 1, 1);
    nc.fillStyle = `rgb(${128 + (x % 4 - 1.5) * 15},${128 + (y % 4 - 1.5) * 15},250)`; nc.fillRect(x, y, 1, 1);
  }
  const fabricMap = new THREE.CanvasTexture(swatch), fabricNormal = new THREE.CanvasTexture(height);
  fabricMap.colorSpace = THREE.SRGBColorSpace;
  for (const t of [fabricMap, fabricNormal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  const cloth = new THREE.MeshStandardMaterial({ name: 'manor-wrapping-cloth', color: 0xd3c8b4,
    map: fabricMap, normalMap: fabricNormal, normalScale: new THREE.Vector2(0.25, 0.25), roughness: 1 });
  cloth.userData['worldUV'] = 3;
  const tatami = surface(house.tatami, 'manor-bedroom-tatami', 0xaaa080, 2);
  const stone = new THREE.MeshStandardMaterial({
    name: 'manor-archive-stone', color: 0xa3a49c, roughness: 1,
    map: tileTex('/textures/stone/japanese_stone_wall_diff_1k.webp', true),
    normalMap: tileTex('/textures/stone/japanese_stone_wall_nor_gl_1k.webp', false),
    normalScale: new THREE.Vector2(0.45, 0.45),
  });
  stone.userData['worldUV'] = 0.7;
  const iron = new THREE.MeshStandardMaterial({ name: 'manor-oxidised-iron', color: 0x766b59,
    metalness: 0.65, roughness: 0.7, roughnessMap: wood.roughnessMap });
  const brass = new THREE.MeshStandardMaterial({ name: 'manor-aged-brass', color: 0xb6965d,
    metalness: 0.45, roughness: 0.68, roughnessMap: wood.roughnessMap });
  return { wood, dark, edge, lacquer, plaster, cloth, tatami, stone, iron, brass };
}
export function manorMaterials() { return materials ??= createMaterials(); }

/** Small bevels catch the lantern. UV density follows real dimensions, including moving parts. */
export function manorBox(parent: THREE.Object3D, size: readonly number[], at: readonly number[], material: THREE.Material, bevel = 0.008) {
  const [w, h, d] = size as [number, number, number];
  const geo = bevel ? new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, w / 4, h / 4, d / 4)) : new THREE.BoxGeometry(w, h, d);
  const pos = geo.getAttribute('position'), normal = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
  const repeat = (material.userData['worldUV'] as number | undefined) ?? 1;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    const u = ny >= nx && ny >= nz ? pos.getX(i) : nx > nz ? pos.getZ(i) : pos.getX(i);
    const v = ny >= nx && ny >= nz ? pos.getZ(i) : pos.getY(i);
    uv.setXY(i, u * repeat + at[0]! * 0.17, v * repeat + at[2]! * 0.23);
  }
  const mesh = new THREE.Mesh(geo, material); mesh.position.set(at[0]!, at[1]!, at[2]!);
  mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

/** Merge only unnamed mesh siblings: interaction pivots and named animated surfaces stay intact. */
export function batchManorCraft(root: THREE.Object3D) {
  for (const child of [...root.children]) if (!(child instanceof THREE.Mesh)) batchManorCraft(child);
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of root.children) {
    if (!(child instanceof THREE.Mesh) || child.name || Array.isArray(child.material)) continue;
    const bucket = buckets.get(child.material) ?? []; bucket.push(child); buckets.set(child.material, bucket);
  }
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => {
      mesh.updateMatrix();
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return g.applyMatrix4(mesh.matrix);
    });
    const merged = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
    if (!merged) continue;
    const originals = new Set<THREE.BufferGeometry>();
    meshes.forEach(mesh => { root.remove(mesh); originals.add(mesh.geometry); });
    originals.forEach(g => g.dispose());
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material); mesh.receiveShadow = true; root.add(mesh);
  }
}

/** Fit authoring axes to the collision footprint without shrinking the supporting surface height. */
export function fitManorFurniture(model: THREE.Group, width: number, height: number, depth: number) {
  const root = new THREE.Group(); root.add(model);
  let bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
  if (size.z > size.x) { model.rotation.y += Math.PI / 2; bounds.setFromObject(root); bounds.getSize(size); }
  const flat = Math.min(width / Math.max(size.x, 0.001), depth / Math.max(size.z, 0.001));
  root.scale.set(flat, height / Math.max(size.y, 0.001), flat);
  bounds.setFromObject(root); const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x / flat, bounds.min.y / root.scale.y, center.z / flat));
  return root;
}
