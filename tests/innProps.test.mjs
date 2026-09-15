import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { layFlatBook, innMirrorFactory } from '../src/world/higasato/innProps.ts';

test('an obliquely authored ledger lies flat, centered, and on the tabletop after fitting', () => {
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.025, 0.6));
  mesh.rotation.set(0.82, 0.37, -0.61); mesh.position.set(0.11, 0.48, -0.13); model.add(mesh);
  const fitted = layFlatBook(model, 0.5), bounds = new THREE.Box3().setFromObject(fitted);
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  assert.ok(size.y < 0.023, `book thickness ${size.y}`);
  assert.ok(Math.abs(Math.max(size.x, size.z) - 0.5) < 1e-6);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(center.x) < 1e-6 && Math.abs(center.z) < 1e-6);
  const thick = new THREE.Group(); thick.add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.6)));
  const compact = new THREE.Box3().setFromObject(layFlatBook(thick, 0.5, 0.06));
  assert.ok(Math.abs(compact.max.y - 0.06) < 1e-6 && Math.abs(compact.min.y) < 1e-6);
});

test('both sides of the passage expose front-facing glass through their frame opening', () => {
  const make = innMirrorFactory(null), scene = new THREE.Scene();
  scene.add(make(true, 'entry', new THREE.Vector3(-0.075, 1.5, 0), -Math.PI / 2));
  scene.add(make(true, 'return', new THREE.Vector3(0.075, 1.5, 0), Math.PI / 2));
  scene.updateMatrixWorld(true);
  for (const [side, name] of [[-1, 'entry-glass'], [1, 'return-glass']]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(side * 1.35, 1.5, 0), new THREE.Vector3(-side, 0, 0));
    assert.equal(ray.intersectObjects(scene.children, true)[0]?.object.name, name);
  }
});
