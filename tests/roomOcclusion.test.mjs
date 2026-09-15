import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { boxOccluded, RoomOcclusion } from '../src/world/roomOcclusion.ts';

const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
const target = box(-0.5, 0, -4, 0.5, 1, -3);
const eye = new THREE.Vector3(0, 1, 3);
test('a single opaque wall covers the entire target; wall behind it does not', () => {
  assert.equal(boxOccluded(target, [box(-3, -1, -0.1, 3, 4, 0.1)], eye), true);
  assert.equal(boxOccluded(target, [box(-3, -1, -6, 3, 4, -5.9)], eye), false);
  assert.equal(boxOccluded(target, [box(-3, -1, -0.1, 0, 4, 0.1)], eye), false);
});
test('separate wall segments cannot falsely close a doorway between visible corners', () => {
  const walls = [box(-3, -1, -0.1, -0.1, 4, 0.1), box(0.1, -1, -0.1, 3, 4, 0.1)];
  assert.equal(boxOccluded(target, walls, eye), false);
  assert.equal(boxOccluded(target, [target.clone()], eye), false);
  assert.equal(boxOccluded(target, [box(-3, -1, -0.1, 3, 4, 0.1)], new THREE.Vector3(0, 1, 0)), false);
});
test('hidden furniture preserves potential shadows and restores visibility for other cameras', () => {
  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  const furniture = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  furniture.position.set(0, 0.5, -3.5); root.add(furniture);
  const camera = new THREE.PerspectiveCamera(); camera.position.copy(eye);
  const culler = new RoomOcclusion(); culler.addBox(0, 1.5, 0, 6, 5, 0.2);
  culler.apply(camera, [furniture], []);
  assert.equal(furniture.visible, false);
  culler.restore(); assert.equal(furniture.visible, true);
  const lantern = new THREE.PointLight(0xffffff, 1, 10); lantern.position.set(0, 2, -2);
  culler.apply(camera, [furniture], [lantern]);
  assert.equal(furniture.visible, true, 'light in target room must retain the shadow caster');
  lantern.position.copy(eye);
  culler.apply(camera, [furniture], [lantern]); assert.equal(furniture.visible, false);
  culler.restore(); furniture.visible = false;
  culler.apply(camera, [furniture], []); culler.restore();
  assert.equal(furniture.visible, false, 'story-hidden object must remain hidden');
});
test('directional shadows use parallel rays and an opaque ceiling', () => {
  assert.equal(boxOccluded(target, [box(-4, 2, -6, 4, 2.2, 2)], eye, new THREE.Vector3(0, 1, 0)), true);
  assert.equal(boxOccluded(target, [box(-4, 2, -6, 4, 2.2, 2)], eye, new THREE.Vector3(1, 0, 0)), false);
});
