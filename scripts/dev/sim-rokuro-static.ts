import * as THREE from 'three';
import { RokuroKubi } from '@/ai/rokurokubi';
import type { Sfx } from '@/audio/sfx';

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop }) as Sfx;
const arena = {
  minX: -6.65, maxX: 6.65, minZ: -5.05, maxZ: 5.05,
  floorY: 0.42, escapeX: 9.6,
  blockers: [
    { x: -2.5, z: -2.75, radius: 0.62 },
    { x: -2.5, z: 2.75, radius: 0.62 },
    { x: 2.6, z: -2.75, radius: 0.62 },
    { x: 2.6, z: 2.75, radius: 0.62 },
    { x: 0.1, z: -3.65, radius: 1.2, blocksNeck: false },
    { x: 0.1, z: 3.65, radius: 1.2, blocksNeck: false },
    { x: -5.75, z: 0, radius: 1.35 },
  ],
};

type DebugRokuro = RokuroKubi & {
  model: THREE.Object3D;
  retreatPressure: number;
  arenaPath: THREE.Vector2[];
  arenaPathIndex: number;
};

function makeRokuro(player: THREE.Vector3) {
  const ai = new RokuroKubi({
    url: '', height: 2.15, pos: new THREE.Vector3(6.35, arena.floorY, 0),
    yaw: -Math.PI / 2, arena,
  }, sfx) as DebugRokuro;
  ai.model = new THREE.Group();
  ai.activate(player);
  return ai;
}

function simulateContact(name: string, player: THREE.Vector3) {
  const ai = makeRokuro(player);
  const startX = ai.root.position.x;
  let attacked = false;
  const rows: string[] = [];
  for (let frame = 0; frame < 12 * 60; frame++) {
    ai.update(1 / 60, player, { speed: 0, moving: false, crouching: false });
    if (ai.state === 'coil' || ai.state === 'lunge' || ai.state === 'settle') attacked = true;
    if (frame % 60 === 59) {
      const distance = Math.hypot(player.x - ai.root.position.x, player.z - ai.root.position.z);
      rows.push(`${frame / 60 + 1}s ${ai.state.padEnd(7)} distance=${distance.toFixed(2)} pressure=${ai.retreatPressure.toFixed(2)} path=${ai.arenaPathIndex}/${ai.arenaPath.length}`);
    }
  }
  console.log(`\n[${name}] player=(${player.x.toFixed(2)}, ${player.z.toFixed(2)})`);
  console.log(rows.join('\n'));
  const finalDistance = Math.hypot(player.x - ai.root.position.x, player.z - ai.root.position.z);
  if (startX - ai.root.position.x < 3) throw new Error(`${name}: stationary target was not chased`);
  if (finalDistance > 1.05) throw new Error(`${name}: body stopped before contact (${finalDistance.toFixed(2)}m)`);
  if (attacked) throw new Error(`${name}: stationary target incorrectly triggered a neck attack`);
}

function simulateRetreat() {
  const player = new THREE.Vector3(2.2, arena.floorY, 0);
  const ai = makeRokuro(player);
  let attacked = false;
  let attackTime = 0;
  for (let frame = 0; frame < 9 * 60; frame++) {
    const time = frame / 60;
    const runningAway = time >= 4;
    if (runningAway) player.x -= 3.6 / 60;
    ai.update(1 / 60, player, {
      speed: runningAway ? 3.6 : 0,
      moving: runningAway,
      crouching: false,
    });
    if (ai.state === 'coil' || ai.state === 'lunge' || ai.state === 'settle') {
      attacked = true;
      attackTime = time;
      break;
    }
  }
  console.log(`\n[continuous-retreat] attacked=${attacked} at=${attackTime.toFixed(2)}s pressure=${ai.retreatPressure.toFixed(2)}`);
  if (!attacked) throw new Error('continuous-retreat: no occasional neck attack');
}

simulateContact('open-floor-contact', new THREE.Vector3(-3.55, arena.floorY, 0));
simulateContact('altar-front-contact', new THREE.Vector3(-4.4, arena.floorY, 0));
simulateRetreat();
