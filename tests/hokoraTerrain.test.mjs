import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Physics } from '../src/core/physics.ts';
import { HigasatoGround, SITES } from '../src/world/higasato/ground.ts';

test('hokora approach stays walkable and its render and collision heights agree', async () => {
  const physics = await Physics.create();
  const ground = new HigasatoGround(new THREE.Scene(), physics, { map: null, normalMap: null, armMap: null });
  try {
    // Incoming mountain path and the east apron: no abrupt shelf or short graveyard cut.
    for (let z = -13; z < 12; z += .1) {
      const x = -55 + (z + 13) * 8 / 14;
      const slope = Math.abs(ground.heightAt(x + .1 * 8 / 14, z + .1) - ground.heightAt(x, z)) / Math.hypot(.1, .1 * 8 / 14);
      assert.ok(slope < .45, `incoming slope ${slope} at ${x}, ${z}`);
    }
    for (let x = -48; x < -28; x += .1) {
      const slope = Math.abs(ground.heightAt(x + .1, -2) - ground.heightAt(x, -2)) / .1;
      assert.ok(slope < .5, `apron slope ${slope} at ${x}`);
    }
    assert.equal(ground.heightAt(-55, -13), SITES.hokora.y);
    assert.equal(ground.heightAt(-45, -13), SITES.hokora.y);
    physics.world.step();
    const positions = ground.mesh.geometry.attributes.position;
    for (const [x, z] of [[-47, 1], [-44, -6], [-43, -13], [-40, 5]]) {
      const y = ground.heightAt(x, z);
      const index = (z + 100) * 201 + x + 100;
      assert.ok(Math.abs(positions.getY(index) - y) < 1e-5);
      const hit = physics.world.castRay(new physics.R.Ray({ x, y: 30, z }, { x: 0, y: -1, z: 0 }), 60, true);
      assert.ok(hit);
      assert.ok(Math.abs(30 - hit.timeOfImpact - y) < .015, `collision mismatch at ${x}, ${z}`);
    }
  } finally {
    physics.world.free(); ground.mesh.geometry.dispose(); ground.apron.geometry.dispose(); ground.mesh.material.dispose();
  }
});
