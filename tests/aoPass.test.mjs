import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DisposableAOPass } from '../src/core/aoPass.ts';

test('disabling AO releases its targets and quad materials without disposing scene or input depth', () => {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ transparent: true }));
  scene.add(mesh);
  const pass = new DisposableAOPass(scene, new THREE.PerspectiveCamera(), 320, 180);
  pass.configuration.halfRes = true;
  const depth = new THREE.DepthTexture(320, 180);
  pass.setDepthTexture(depth);

  const counts = new Map();
  const watch = (resource) => {
    if (!resource || counts.has(resource)) return;
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  };
  // Observe the real library's owned targets/materials, including optional half-res and transparency resources.
  for (const value of Object.values(pass)) {
    if (value?.isWebGLRenderTarget || value?.isTexture || value?.isMaterial) watch(value);
    if (value?.material?.isMaterial) watch(value.material);
  }
  for (const resource of [mesh.geometry, mesh.material, pass.copyQuad._mesh.geometry]) watch(resource);
  pass.dispose();
  for (const [resource, count] of counts) {
    const shared = [depth, mesh.geometry, mesh.material, pass.copyQuad._mesh.geometry].includes(resource);
    assert.equal(count, shared ? 0 : 1, resource.name || resource.type || resource.constructor.name);
  }
  assert.ok(counts.size >= 15, 'the test must cover the real N8AO resources');
});
