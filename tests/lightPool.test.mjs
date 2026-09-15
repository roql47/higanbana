import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, PointLight, Vector3 } from 'three';
import { LightPool } from '../src/light/lightPool.ts';

test('pooled lights respect hidden ancestors without changing shader light count', () => {
  const scene = new Scene(), room = new Group();
  scene.add(room);
  const source = new PointLight(0xff0000, 3, 10);
  room.add(source);
  const pool = new LightPool(scene, 1);
  pool.update(0.12, new Vector3());
  const slot = scene.getObjectByName('light-slot-0');
  assert.equal(slot.intensity, 3);
  room.visible = false;
  pool.update(0.01, new Vector3());
  assert.equal(slot.intensity, 0);
  assert.equal(slot.visible, true);
  assert.equal(pool.slotCount, 1);
  room.visible = true;
  pool.update(0.12, new Vector3());
  assert.equal(slot.intensity, 3);
});

test('selected moving lights follow every frame while selection is throttled', () => {
  const scene = new Scene(), source = new PointLight(0xffffff, 3, 10);
  scene.add(source);
  const pool = new LightPool(scene, 1);
  pool.update(0.12, new Vector3());
  source.position.x = 1;
  source.intensity = 2;
  pool.update(0.01, new Vector3());
  const slot = scene.getObjectByName('light-slot-0');
  assert.equal(slot.position.x, 1);
  assert.equal(slot.intensity, 2);
});

test('zero-delta prewarm reselects lights for each camera position', () => {
  const scene = new Scene();
  const a = new PointLight(0xff0000, 3, 10), b = new PointLight(0x0000ff, 4, 10);
  b.position.x = 30;
  scene.add(a, b);
  const pool = new LightPool(scene, 1);
  pool.update(0, new Vector3());
  pool.update(0, new Vector3(30, 0, 0));
  assert.equal(scene.getObjectByName('light-slot-0').intensity, 4);
});
