import * as THREE from 'three';
import { modelSprite } from './modelSprite';

export interface PalmGestureSprites {
  palm: string;
  tracing: string;
  /** 구운 이미지 안의 검지 접촉점. 화면 크기에 관계없이 손바닥에 맞춘다. */
  contact: { x: number; y: number };
}

const ZOOM = 1.08;
// palm-b.glb의 손가락 뿌리와 방향. 원본의 높이를 1로 정규화한 손바닥 좌표다.
const FINGERS = [
  { x: 0.006, y: 0.13, dx: 0.31, length: 0.40 },
  { x: 0.095, y: 0.08, dx: 0.54, length: 0.34 },
  { x: 0.18, y: 0.00, dx: 0.72, length: 0.26 },
];

/**
 * 손가락 본이 없는 기존 palm-b를 한 번만 구부려 검지를 내민 자세로 굽는다.
 * 손등이 카메라를 향하고 손가락 안쪽이 미오의 손바닥을 향한다.
 * 연출 중에는 두 PNG의 위치만 바꾸며, 임시 모델/텍스처/RT는 modelSprite가 해제한다.
 */
export async function loadPalmGestureSprites(renderer: THREE.WebGLRenderer): Promise<PalmGestureSprites> {
  const palm = await modelSprite(renderer, '/models/props/palm-a.glb', {
    size: 512, zoom: 1.02, faceThinAxis: true,
  });
  const contact = { x: 0.5, y: 0.05 };
  const tracing = await modelSprite(renderer, '/models/props/palm-b.glb', {
    size: 384, zoom: ZOOM,
    pose: (root) => {
      root.updateMatrixWorld(true);
      const span = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
      const p = new THREE.Vector3();
      const tip = new THREE.Vector3(0, -Infinity, 0);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const source = mesh.geometry.attributes.position!;
        const positions = new Float32Array(source.count * 3);
        for (let i = 0; i < source.count; i++) {
          p.fromBufferAttribute(source, i).applyMatrix4(mesh.matrixWorld).divideScalar(span);
          const x = -p.z, y = p.y, z = p.x;
          let nx = x, ny = y, nz = z;
          // 검지와 엄지를 보존하고 중지·약지·소지만 손바닥 쪽으로 느슨하게 접는다.
          if (x > -0.035 + Math.max(0, y - 0.12) * 0.13 && y > 0.01) {
            const finger = FINGERS.reduce((a, b) =>
              Math.abs(x - a.x - (y - a.y) * a.dx) < Math.abs(x - b.x - (y - b.y) * b.dx) ? a : b);
            const len = Math.hypot(finger.dx, 1), ux = finger.dx / len, uy = 1 / len;
            const s = (x - finger.x) * ux + (y - finger.y) * uy;
            const side = (x - finger.x) * uy - (y - finger.y) * ux;
            if (s > 0) {
              const k = 2.8 / finger.length, a = Math.min(Math.PI, s * k);
              const depth = z + 0.10;
              const along = Math.sin(a) / k - depth * Math.sin(a);
              nx = finger.x + along * ux + side * uy;
              ny = finger.y + along * uy - side * ux;
              nz = -0.10 + (1 - Math.cos(a)) / k + depth * Math.cos(a);
            }
          }
          positions.set([-nx, ny, -nz], i * 3);
          if (ny > tip.y) tip.set(-nx, ny, -nz);
        }
        mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
        mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.setScalar(1);
      });
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const frame = Math.max(size.x, size.y, size.z) * ZOOM;
      contact.x = 0.5 + (tip.x - center.x) / frame;
      contact.y = 0.5 - (tip.y - 0.018 - center.y) / frame;
    },
  });
  return { palm, tracing, contact };
}
