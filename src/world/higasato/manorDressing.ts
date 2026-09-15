import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { PartsBuilder, MIO_CLEAR_DOOR_HEIGHT } from './kit';
import { batchManorCraft, manorBox, manorMaterials } from './manorCraft';

/** Architecture and clues remain present when the streamed furniture is unloaded. */
export function manorDressing(parent: THREE.Group, physics: Physics, floorY: number, basementY: number,
  cx: number, cz: number, width: number, depth: number) {
  const { wood, dark, edge, lacquer, tatami, iron, brass, cloth } = manorMaterials();
  const k = new PartsBuilder(physics), group = new THREE.Group(); group.name = 'manor-crafted-interior';
  parent.add(group);
  const x0 = cx - width / 2, x1 = cx + width / 2, z0 = cz - depth / 2, z1 = cz + depth / 2;
  // Separate board seams and staggered joints, combined into material batches after construction.
  for (let row = 0; row < 35; row++) {
    const z = z0 + 0.15 + row * ((depth - 0.3) / 35);
    for (let col = 0; col < 5; col++) {
      const a = Math.max(x0 + 0.09, x0 + col * 3.1 - (row % 2) * 1.4);
      const b = Math.min(x1 - 0.09, x0 + (col + 1) * 3.1 - (row % 2) * 1.4);
      if (b > a) k.box(b - a - 0.007, 0.012, (depth - 0.3) / 35 - 0.004, (a + b) / 2, floorY + 0.006, z, wood);
    }
  }
  // Timber framing and waist boards follow the existing door openings exactly.
  const frameWall = (axis: 'x' | 'z', across: number, a: number, b: number, door?: number) => {
    const put = (length: number, height: number, along: number, y: number, thick: number, mat: THREE.Material) => {
      if (axis === 'x') k.box(thick, height, length, across, y, along, mat);
      else k.box(length, height, thick, along, y, across, mat);
    };
    const spans = door === undefined ? [[a, b]] : [[a, door - 0.6], [door + 0.6, b]];
    for (const [lo, hi] of spans as [number, number][]) {
      put(hi - lo, 0.48, (lo + hi) / 2, floorY + 0.25, 0.122, dark);
      for (const yy of [0.04, 0.52, 2.52]) put(hi - lo, 0.055, (lo + hi) / 2, floorY + yy, 0.15, wood);
      for (const along of [lo, hi]) put(0.068, 2.57, along, floorY + 1.285, 0.155, wood);
      for (let along = lo + 0.36; along < hi - 0.15; along += 0.36) put(0.012, 0.44, along, floorY + 0.27, 0.13, wood);
    }
    if (door !== undefined) put(1.2, 0.07, door, floorY + MIO_CLEAR_DOOR_HEIGHT + 0.035, 0.17, edge);
  };
  frameWall('x', x0 + 2.6, z0 + 0.1, z1 - 0.1, cz);
  frameWall('x', x0 + 10.8, z0 + 0.1, z1 - 0.1, cz);
  frameWall('z', cz - 2.6, x0 + 2.6, x0 + 10.8, x0 + 3.5);
  frameWall('z', cz + 2.6, x0 + 2.6, x0 + 10.8, x0 + 9.6);
  for (const z of [z0 + 0.09, z1 - 0.09]) frameWall('z', z, x0 + 0.13, x1 - 0.13);
  for (const x of [x0 + 0.1, x0 + 10.8, x1 - 0.1]) k.box(0.15, 0.17, depth - 0.1, x, floorY + 2.45, cz, dark);
  for (let z = z0 + 0.7; z < z1; z += 1.55) k.box(width - 0.2, 0.13, 0.12, cx, floorY + 2.48, z, wood);

  // Bedroom tatami border and three woven mats, kept clear of the hallway threshold.
  for (let i = 0; i < 3; i++) {
    const x = x0 + 5.1 + i * 0.91, z = z1 - 1.25;
    k.box(0.9, 0.026, 1.85, x, floorY + 0.013, z, tatami);
    for (const dx of [-0.431, 0.431]) k.box(0.028, 0.003, 1.84, x + dx, floorY + 0.029, z, dark);
  }

  // Seven physically recessed seal slots: the last one stays empty, matching the archive text.
  const shelfX = x0 + 9.3, shelfZ = cz + 1.7;
  const seals = new THREE.Group(); seals.name = 'manor-seven-seal-rack'; group.add(seals);
  for (const yy of [0.62, 1.18]) manorBox(seals, [1.7, 0.09, 0.5], [shelfX, basementY + yy, shelfZ], wood);
  for (const dx of [-0.8, 0.8]) manorBox(seals, [0.075, 1.25, 0.48], [shelfX + dx, basementY + 0.625, shelfZ], dark);
  manorBox(seals, [1.65, 0.65, 0.035], [shelfX, basementY + 0.9, shelfZ + 0.225], dark);
  for (let i = 0; i < 7; i++) {
    const x = x0 + 8.68 + i * 0.21;
    manorBox(seals, [0.188, 0.007, 0.24], [x, basementY + 1.228, shelfZ], dark, 0);
    for (const dx of [-0.096, 0.096]) manorBox(seals, [0.012, 0.02, 0.26], [x + dx, basementY + 1.239, shelfZ], edge, 0);
    for (const dz of [-0.123, 0.123]) manorBox(seals, [0.19, 0.02, 0.014], [x, basementY + 1.239, shelfZ + dz], edge, 0);
    // Counting notches communicate seven places without introducing extra readable lore.
    manorBox(seals, [0.018, 0.022, 0.004], [x, basementY + 1.179, shelfZ - 0.255], brass, 0);
  }
  // Ceiling bracing and wall footings make the cellar a constructed room, not a plain cube.
  for (const x of [x0 + 8.48, x1 - 0.48]) for (const z of [cz - 2.32, cz + 2.32]) {
    k.box(0.11, 2.95, 0.11, x, basementY + 1.475, z, dark);
  }
  for (const z of [cz - 2.15, cz, cz + 2.15]) k.box(5.2, 0.17, 0.13, cx + 4, basementY + 2.87, z, wood);

  // Writing kit belongs to the study desk, beside the actual order paper.
  const writing = new THREE.Group(); writing.name = 'manor-writing-kit';
  writing.position.set(x0 + 9.5, floorY + 0.42, z0 + 0.85); group.add(writing);
  manorBox(writing, [0.22, 0.032, 0.14], [0.35, 0.016, 0.06], iron);
  manorBox(writing, [0.145, 0.004, 0.08], [0.35, 0.033, 0.06], dark);
  const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.24, 7), edge);
  brush.rotation.z = Math.PI / 2; brush.rotation.y = 0.25; brush.position.set(0.32, 0.039, -0.03); writing.add(brush);
  manorBox(writing, [0.11, 0.018, 0.11], [-0.39, 0.009, 0.11], cloth);
  manorBox(writing, [0.05, 0.06, 0.05], [-0.39, 0.047, 0.11], wood);
  // An actual open niche replaces the closed-door GLB that hid the seal even after unlocking.
  const altar = new THREE.Group(); altar.name = 'manor-fuda-altar';
  altar.position.set(cx + 2, floorY, cz); group.add(altar);
  manorBox(altar, [1.18, 0.08, 1.3], [0, 0.04, 0], dark);
  manorBox(altar, [1.02, 0.06, 1.12], [0, 0.11, 0], edge);
  manorBox(altar, [0.82, 0.41, 0.95], [0.02, 0.345, 0], lacquer);
  manorBox(altar, [0.94, 0.07, 1.04], [0, 0.585, 0], wood);
  for (const z of [-0.447, 0.447]) manorBox(altar, [0.81, 0.78, 0.065], [0.03, 0.98, z], wood);
  manorBox(altar, [0.06, 0.78, 0.86], [0.397, 0.98, 0], lacquer);
  // Tarnished inner panel is behind the item, never across the opening.
  manorBox(altar, [0.007, 0.55, 0.62], [0.362, 0.99, 0], brass, 0.002);
  manorBox(altar, [0.5, 0.045, 0.66], [0.09, 0.65, 0], dark);
  // The fuda rests directly on this shelf at the fixed story anchor, without a generic pedestal.
  manorBox(altar, [0.55, 0.215, 0.61], [0.03, 0.7825, 0], lacquer);
  manorBox(altar, [0.58, 0.018, 0.64], [0.03, 0.881, 0], edge);
  for (const z of [-0.37, 0.37]) {
    manorBox(altar, [0.075, 0.73, 0.055], [-0.345, 0.97, z], edge);
    manorBox(altar, [0.088, 0.048, 0.07], [-0.345, 0.66, z], brass);
    manorBox(altar, [0.088, 0.048, 0.07], [-0.345, 1.285, z], brass);
  }
  // Recessed lower panels, pulls and a stepped cornice echo the moving door's joinery.
  for (const z of [-0.225, 0.225]) {
    manorBox(altar, [0.023, 0.27, 0.37], [-0.4, 0.35, z], wood);
    manorBox(altar, [0.03, 0.018, 0.1], [-0.425, 0.35, z], brass);
  }
  for (const [w, h, d, y] of [[0.94, 0.065, 1.03, 1.36], [1.02, 0.05, 1.13, 1.415], [0.89, 0.065, 0.98, 1.47]]) {
    manorBox(altar, [w!, h!, d!], [0.015, y!, 0], y! === 1.415 ? edge : dark);
  }
  for (let i = 0; i < 7; i++) manorBox(altar, [0.026, 0.065, 0.045], [-0.465, 1.345, -0.36 + i * 0.12], brass);
  group.add(k.build('manor-joinery', { spatialCellSize: 8 }));
  batchManorCraft(group);
}
