import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StreamedDetail } from '../src/world/streamedDetail.ts';
import { Props } from '../src/world/props.ts';
import { buildGraveyardHollowArt } from '../src/world/village/graveyardHollowArt.ts';

const bounds = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
const near = new THREE.Vector3(), far = new THREE.Vector3(100, 0, 100);
function mesh() {
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const disposed = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener('dispose', () => disposed.geometry++);
  material.addEventListener('dispose', () => disposed.material++);
  texture.addEventListener('dispose', () => disposed.texture++);
  return { object: new THREE.Mesh(geometry, material), disposed };
}

test('regional detail loads near, survives boundary movement, releases unique shared resources, and reloads', async () => {
  const parent = new THREE.Group(), mirror = new THREE.Group(), fallback = mesh();
  parent.add(fallback.object);
  let loads = 0; const resources = [];
  const detail = new StreamedDetail(parent, bounds, async bundle => {
    loads++; const resource = mesh(); resources.push(resource);
    bundle.root.add(resource.object);
    bundle.attachTo(mirror).add(resource.object.clone());
  }, [fallback.object], 'test');
  await detail.prepare(far); assert.equal(loads, 0);
  await detail.prepare(near);
  assert.equal(detail.resident, true); assert.equal(fallback.object.visible, false);
  assert.equal(mirror.children.length, 1);
  detail.update(20, new THREE.Vector3(40, 0, 0));
  assert.equal(detail.resident, true, 'hysteresis must keep nearby detail');
  detail.update(6, far); assert.equal(detail.resident, true);
  detail.update(6, far); assert.equal(detail.resident, false);
  assert.deepEqual(resources[0].disposed, { geometry: 1, material: 1, texture: 1 });
  assert.deepEqual(fallback.disposed, { geometry: 0, material: 0, texture: 0 });
  assert.equal(parent.children.length, 1); assert.equal(mirror.children.length, 0);
  assert.equal(fallback.object.visible, true);
  await detail.prepare(near); assert.equal(loads, 2); assert.equal(detail.resident, true);
});

test('a late regional load is disposed rather than mounted after the player leaves', async () => {
  const parent = new THREE.Group(), resource = mesh(); let release;
  const detail = new StreamedDetail(parent, bounds, async bundle => {
    bundle.root.add(resource.object);
    await new Promise(resolve => { release = resolve; });
  }, [], 'late');
  const loading = detail.prepare(near);
  detail.update(13, far); release(); await loading;
  assert.equal(detail.resident, false); assert.equal(parent.children.length, 0);
  assert.equal(resource.disposed.texture, 1);
});

test('partial model load failure releases successful assets and retains procedural furniture', async (t) => {
  const resource = mesh(), fallback = new THREE.Group();
  t.mock.method(console, 'warn', () => {});
  t.mock.method(Props, 'loadNormalized', async url => {
    if (url === 'bad') throw new Error('missing');
    const group = new THREE.Group(); group.add(resource.object); return group;
  });
  const detail = new StreamedDetail(new THREE.Group(), bounds, async bundle => {
    await bundle.models([['good', 1, 1], ['bad', 1, 1]]);
  }, [fallback], 'failure');
  await detail.prepare(near);
  assert.equal(detail.resident, false); assert.equal(fallback.visible, true);
  assert.equal(resource.disposed.texture, 1);
});

test('hollow art unload releases attached shoes and its own PBR copies without disposing shared world tiles', async t => {
  const sharedTiles = [], assets = [];
  t.mock.method(THREE.TextureLoader.prototype, 'load', () => {
    const texture = new THREE.Texture(); let disposed = 0;
    texture.addEventListener('dispose', () => disposed++);
    sharedTiles.push(() => disposed); return texture;
  });
  t.mock.method(Props, 'loadNormalized', async () => {
    const asset = mesh(), model = new THREE.Group(); model.add(asset.object); assets.push(asset); return model;
  });
  const parent = new THREE.Group(), shoe = new THREE.Group(), fallback = new THREE.Group();
  shoe.add(fallback);
  const detail = new StreamedDetail(parent, bounds,
    bundle => buildGraveyardHollowArt(bundle, near, -18, [{parent:shoe,fallback,scale:1,repaired:true}]),
    [fallback], 'hollow-art');
  await detail.prepare(near);
  assert.equal(detail.resident, true); assert.equal(shoe.children.length, 2);
  const instances = []; parent.traverse(o => {if(o.isInstancedMesh)instances.push(o);});
  assert.ok(instances.some(o=>o.count===6), 'lantern repetitions must share instanced draws');
  detail.update(13, far);
  assert.equal(shoe.children.length, 1); assert.equal(fallback.visible, true);
  assert.ok(sharedTiles.length>0 && sharedTiles.every(count=>count()===0), 'world PBR cache survives local unload');
  for(const asset of assets) assert.deepEqual(asset.disposed,{geometry:1,material:1,texture:1});
  await detail.prepare(near);
  assert.equal(detail.resident,true); assert.equal(shoe.children.length,2,'return mounts one shoe, not leaked duplicates');
  detail.update(13,far);
});
