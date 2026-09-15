import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Props } from '../src/world/props.ts';
import { modelSprite } from '../src/story/modelSprite.ts';

test('sprite readback failure frees temporary model resources and restores the game render target', async (t) => {
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  t.mock.method(Props, 'loader', () => ({ loadAsync: async () => ({ scene: root }) }));
  const disposed = new Map();
  const watch = (resource) => {
    disposed.set(resource, 0);
    resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  };
  for (const resource of [geometry, material, texture]) watch(resource);
  const original = new THREE.WebGLRenderTarget(16, 16);
  let target = original, alpha = 0.75;
  const renderer = {
    getRenderTarget: () => target,
    getClearAlpha: () => alpha,
    setClearAlpha: (v) => { alpha = v; },
    setRenderTarget(v) { if (v !== original) watch(v); target = v; },
    clear() {}, render() {},
    readRenderTargetPixels() { throw new Error('readback failed'); },
  };
  await assert.rejects(modelSprite(renderer, '/sprite.glb', { size: 16 }), /readback failed/);
  assert.equal(target, original);
  assert.equal(alpha, 0.75);
  assert.equal(disposed.size, 4);
  for (const count of disposed.values()) assert.equal(count, 1);
});
