import * as THREE from 'three';
import type { Physics } from '@/core/physics';

const PALETTE = {
  ground: 0x6f8f4a,
  groundAlt: 0x668644,
  cream: 0xe8dfc9,
  teal: 0x2f5c5a,
  leather: 0x5a3e2b,
  stone: 0x9a968c,
};

/** 조작감 검증용 테스트 지형: 바닥·박스·경사로·계단·기둥·벽·단차 */
export function createPlayground(scene: THREE.Scene, physics: Physics) {
  const group = new THREE.Group();
  group.name = 'playground';
  scene.add(group);

  // --- 바닥: 부드러운 체커 텍스처(공간 감각용) ---
  const groundSize = 160;
  const tex = makeCheckerTexture(PALETTE.ground, PALETTE.groundAlt, 8);
  tex.repeat.set(groundSize / 4, groundSize / 4);
  const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  physics.addStaticBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(groundSize / 2, 0.5, groundSize / 2));

  const mats = {
    cream: new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.8 }),
    teal: new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.6 }),
    leather: new THREE.MeshStandardMaterial({ color: PALETTE.leather, roughness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ color: PALETTE.stone, roughness: 0.9 }),
  };

  function box(
    center: [number, number, number],
    size: [number, number, number],
    mat: THREE.Material,
    rotY = 0,
    rotX = 0,
    rotZ = 0,
  ) {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center[0], center[1], center[2]);
    mesh.rotation.set(rotX, rotY, rotZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
    physics.addStaticBox(mesh.position.clone(), new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2), q);
    return mesh;
  }

  // --- 박스들 (다양한 높이: 0.25 자동스텝, 0.5 점프, 1.2 점프 한계, 2 불가) ---
  box([4, 0.125, 2], [2, 0.25, 2], mats.cream);
  box([6.5, 0.25, 2], [2, 0.5, 2], mats.cream);
  box([9, 0.6, 2], [2, 1.2, 2], mats.cream);
  box([11.5, 1.0, 2], [2, 2.0, 2], mats.cream);

  // --- 계단 (0.2m × 8단) ---
  for (let i = 0; i < 8; i++) {
    const top = 0.2 * (i + 1);
    box([-4 - i * 0.6, top / 2, 4], [0.6, top, 3], mats.stone);
  }
  box([-4 - 8 * 0.6 - 1.5, 0.8, 4], [3, 1.6, 3], mats.stone); // 계단 위 플랫폼

  // --- 경사로 (25°, 35°, 50°) ---
  const rampLen = 6;
  for (const [i, deg] of [25, 35, 50].entries()) {
    const rad = (deg * Math.PI) / 180;
    const h = Math.sin(rad) * rampLen;
    // -Z 방향으로 올라가는 경사 (X축 +회전이면 -Z 끝이 위로)
    box([0 + i * 4, h / 2 - 0.1, -8 - (rampLen / 2) * Math.cos(rad)], [3, 0.2, rampLen], mats.teal, 0, rad, 0);
    // 경사로 끝의 받침대
    box([0 + i * 4, h / 2, -8 - rampLen * Math.cos(rad) - 1], [3, h, 2], mats.leather);
  }

  // --- 기둥 & 벽 (카메라 충돌 테스트) ---
  for (let i = 0; i < 5; i++) {
    box([-8 + i * 1.6, 1.5, -3], [0.5, 3, 0.5], mats.leather);
  }
  box([-12, 1.5, 0], [0.4, 3, 10], mats.stone); // 긴 벽
  box([-14, 1.5, 6], [4, 3, 0.4], mats.stone); // 코너

  // --- 좁은 통로 (폭 1m) ---
  box([12, 1, -6], [0.3, 2, 6], mats.teal);
  box([13.3, 1, -6], [0.3, 2, 6], mats.teal);

  // --- 위치 감각용 랜드마크 ---
  const pillar = box([0, 4, 20], [1, 8, 1], mats.cream);
  pillar.name = 'landmark';

  return { group };
}

function makeCheckerTexture(colorA: number, colorB: number, cells: number) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const cell = size / cells;
  const ca = '#' + colorA.toString(16).padStart(6, '0');
  const cb = '#' + colorB.toString(16).padStart(6, '0');
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? ca : cb;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
