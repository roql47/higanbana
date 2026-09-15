import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { investigationPaper } from '../investigationProps';
import { L } from '@/core/i18n';

/** 기울어져 제작된 책을 얇은 면 기준으로 눕힌다. 로드 때 한 번만 주축을 계산한다. */
export function layFlatBook(model: THREE.Group, length = 0.5, maxThickness = 0.06) {
  model.updateWorldMatrix(true, true);
  const points: THREE.Vector3[] = [], mean = new THREE.Vector3();
  model.traverse(o => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position'), stride = Math.max(1, Math.ceil(pos.count / 2048));
    for (let i = 0; i < pos.count; i += stride) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      points.push(p); mean.add(p);
    }
  });
  const root = new THREE.Group(); root.add(model);
  if (!points.length) return root;
  mean.multiplyScalar(1 / points.length);
  const a = new Array<number>(9).fill(0), v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (const p of points) {
    const d = p.sub(mean).toArray();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a[r * 3 + c]! += d[r]! * d[c]!;
  }
  // 대칭 3×3 공분산의 Jacobi 회전. 가장 작은 분산 축이 책 표지의 법선이다.
  for (let step = 0; step < 20; step++) {
    let p = 0, q = 1;
    for (const [r, c] of [[0, 2], [1, 2]] as const) if (Math.abs(a[r * 3 + c]!) > Math.abs(a[p * 3 + q]!)) { p = r; q = c; }
    const apq = a[p * 3 + q]!; if (Math.abs(apq) < 1e-12) break;
    const app = a[p * 3 + p]!, aqq = a[q * 3 + q]!;
    const angle = 0.5 * Math.atan2(2 * apq, aqq - app), c = Math.cos(angle), s = Math.sin(angle);
    for (let k = 0; k < 3; k++) {
      if (k !== p && k !== q) {
        const akp = a[k * 3 + p]!, akq = a[k * 3 + q]!;
        a[k * 3 + p] = a[p * 3 + k] = c * akp - s * akq;
        a[k * 3 + q] = a[q * 3 + k] = s * akp + c * akq;
      }
      const vkp = v[k * 3 + p]!, vkq = v[k * 3 + q]!;
      v[k * 3 + p] = c * vkp - s * vkq; v[k * 3 + q] = s * vkp + c * vkq;
    }
    a[p * 3 + p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q * 3 + q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p * 3 + q] = a[q * 3 + p] = 0;
  }
  const axes = [0, 1, 2].sort((i, j) => a[i * 3 + i]! - a[j * 3 + j]!);
  const axis = (i: number) => new THREE.Vector3(v[i]!, v[3 + i]!, v[6 + i]!).normalize();
  const up = axis(axes[0]!), along = axis(axes[2]!); if (up.y < 0) up.negate();
  const across = new THREE.Vector3().crossVectors(up, along).normalize();
  along.crossVectors(across, up).normalize();
  model.applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, up, along)).invert());
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(length / Math.max(size.x, size.z, 0.001));
  bounds.setFromObject(model); const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  // 생성 원본의 과장된 책등 두께는 접수대 소품 크기로 보정한다. 눕힌 뒤의 Y축만 줄인다.
  root.scale.y = Math.min(1, maxThickness / Math.max(0.001, bounds.max.y - bounds.min.y));
  return root;
}

/** 벽의 양쪽과 와쿄 세계가 같은 입체 프레임을 공유한다. 반사 렌더 타깃은 추가하지 않는다. */
export function innMirrorFactory(woodMap: THREE.Texture | null) {
  const outer = new THREE.Shape();
  outer.moveTo(-0.46, -0.64); outer.lineTo(0.46, -0.64); outer.lineTo(0.46, 0.57);
  outer.quadraticCurveTo(0.46, 0.66, 0.36, 0.66); outer.lineTo(-0.36, 0.66);
  outer.quadraticCurveTo(-0.46, 0.66, -0.46, 0.57); outer.closePath();
  const opening = new THREE.Path();
  opening.moveTo(-0.365, -0.545); opening.lineTo(-0.365, 0.545);
  opening.lineTo(0.365, 0.545); opening.lineTo(0.365, -0.545); opening.closePath();
  outer.holes.push(opening);
  const frame = new THREE.ExtrudeGeometry(outer, { depth: 0.052, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.009, bevelSegments: 1, curveSegments: 4 });
  const back = new THREE.BoxGeometry(0.9, 1.27, 0.018); back.translate(0, 0, -0.012);
  const backFlat = back.toNonIndexed();
  const frameGeo = mergeGeometries([frame, backFlat])!;
  frame.dispose(); back.dispose(); backFlat.dispose();
  const trimParts: THREE.BufferGeometry[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    for (const [w, h, dx, dy] of [[0.14, 0.028, -0.05, 0], [0.028, 0.14, 0, -0.05]]) {
      const g = new THREE.BoxGeometry(w, h, 0.012);
      g.translate(x * (0.417 + dx!), y * (0.59 + dy!), 0.061); trimParts.push(g.toNonIndexed()); g.dispose();
    }
    const pin = new THREE.SphereGeometry(0.012, 6, 4); pin.scale(1, 1, 0.45);
    pin.translate(x * 0.417, y * 0.59, 0.073); trimParts.push(pin.toNonIndexed()); pin.dispose();
  }
  const trimGeo = mergeGeometries(trimParts)!; trimParts.forEach(g => g.dispose());
  const glassGeo = new THREE.PlaneGeometry(0.744, 1.102); glassGeo.translate(0, 0, 0.029);
  const palettes = [true, false].map(burnt => ({
    wood: new THREE.MeshStandardMaterial({ map: woodMap, color: burnt ? 0x765544 : 0xb89668, roughness: 0.87 }),
    trim: new THREE.MeshStandardMaterial({ color: burnt ? 0x635947 : 0x948164, metalness: 0.6, roughness: 0.65 }),
    glass: new THREE.MeshStandardMaterial({ map: silvering(burnt), color: 0xb8c8d3, metalness: 0.62, roughness: burnt ? 0.25 : 0.15,
      emissive: 0x35444c, emissiveIntensity: 0.24 }),
  }));
  return (burnt: boolean, name: string, pos: THREE.Vector3, yaw: number, scale = 1) => {
    const group = new THREE.Group(); group.name = name;
    const mat = palettes[burnt ? 0 : 1]!;
    for (const [geo, material, part] of [[frameGeo, mat.wood, 'frame'], [trimGeo, mat.trim, 'brackets'], [glassGeo, mat.glass, 'glass']] as const) {
      const mesh = new THREE.Mesh(geo, material); mesh.name = `${name}-${part}`;
      mesh.receiveShadow = true; group.add(mesh);
    }
    group.position.copy(pos); group.rotation.y = yaw; group.scale.set(scale, scale, 1);
    return group;
  };
}

/** 산화된 은막과 닦인 세로 결. 창문처럼 투명하거나 포털처럼 발광하는 면은 만들지 않는다. */
function silvering(burnt: boolean) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
  const c = canvas.getContext('2d')!;
  const fill = c.createLinearGradient(0, 0, 128, 45);
  fill.addColorStop(0, '#172126'); fill.addColorStop(0.25, '#52636a');
  fill.addColorStop(0.52, '#29373d'); fill.addColorStop(0.78, '#78848a'); fill.addColorStop(1, '#1c272c');
  c.fillStyle = fill; c.fillRect(0, 0, 128, 256);
  c.strokeStyle = '#d2d6cd'; c.globalAlpha = 0.16;
  for (let i = 0; i < 15; i++) {
    const x = (i * 31 + 7) % 128;
    c.beginPath(); c.moveTo(x, (i * 23) % 128); c.lineTo(x - 6, 120 + (i * 11) % 136); c.stroke();
  }
  c.globalAlpha = 1;
  if (burnt) {
    c.fillStyle = '#171a18';
    for (let i = 0; i < 85; i++) {
      const y = (i * 71) % 256, edge = i % 2 ? 126 : 2;
      c.beginPath(); c.ellipse(edge, y, 3 + i % 8, 2 + i % 11, i, 0, Math.PI * 2); c.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** GLB 숙박부의 폴백도 책 두께·제본·펼친 페이지를 갖는다. */
export function innLedger(pos: THREE.Vector3) {
  const group = new THREE.Group(); group.name = 'inn-ledger-fallback';
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.022, 0.38), new THREE.MeshStandardMaterial({ color: 0x3c2721, roughness: 1 }));
  cover.position.set(pos.x, pos.y - 0.034, pos.z); group.add(cover);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.026, 0.35), new THREE.MeshStandardMaterial({ color: 0x978774, roughness: 1 }));
  pages.position.set(pos.x, pos.y - 0.012, pos.z); group.add(pages);
  investigationPaper(group, pos, L('宿泊簿 · 숙박부', '宿泊簿'), [L('매화 → 소나무', '梅 → 松'), L('열쇠 반납', '鍵返却'), L('퇴실 ＿＿', '退室 ＿＿')], 0.34);
  return group;
}

export function innReturnedKey(parent: THREE.Group, pos: THREE.Vector3) {
  const group = new THREE.Group(); group.name = 'inn-returned-key'; group.position.copy(pos);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.018, 0.18), new THREE.MeshStandardMaterial({ color: 0x392d27, roughness: 0.9 })); group.add(tray);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9c8354, roughness: 0.55, metalness: 0.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 4, 10), metal); ring.rotation.x = -Math.PI / 2;
  ring.position.set(-0.046, 0.017, 0); group.add(ring);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.009, 0.008), metal); stem.position.set(0.01, 0.017, 0); group.add(stem);
  for (const x of [0.033, 0.05]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.009, 0.024), metal); tooth.position.set(x, 0.017, 0.009); group.add(tooth);
  }
  parent.add(group); return group;
}

export function innLuggageTag(parent: THREE.Group, pos: THREE.Vector3) {
  const group = new THREE.Group(); group.name = 'inn-luggage-tag';
  const tagPos = pos.clone().add(new THREE.Vector3(-0.24, 0.006, 0.12));
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.008, 0.19), new THREE.MeshStandardMaterial({ color: 0x897353, roughness: 1 }));
  tag.position.copy(tagPos); tag.rotation.y = 0.3; group.add(tag);
  const needles: THREE.BufferGeometry[] = [];
  for (const angle of [-0.38, 0, 0.38]) {
    const needle = new THREE.BoxGeometry(0.004, 0.001, 0.074);
    needle.translate(0, 0.005, -0.025); needle.rotateY(angle);
    needles.push(needle.toNonIndexed()); needle.dispose();
  }
  const pine = new THREE.Mesh(mergeGeometries(needles)!, new THREE.MeshStandardMaterial({ color: 0x26302a, roughness: 1 }));
  needles.forEach(g => g.dispose()); tag.add(pine);
  const curve = new THREE.CatmullRomCurve3([
    tagPos.clone().add(new THREE.Vector3(0, 0.005, -0.07)),
    pos.clone().add(new THREE.Vector3(-0.3, 0, -0.18)),
    pos.clone().add(new THREE.Vector3(-0.36, -0.07, -0.22)),
    pos.clone().add(new THREE.Vector3(-0.43, -0.25, -0.22)),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 9, 0.006, 4, false), new THREE.MeshStandardMaterial({ color: 0x675e46, roughness: 1 })));
  parent.add(group);
}

/** 단서에 나오는 끌린 짐 자국의 마지막 구간. 통로를 막는 콜라이더는 추가하지 않는다. */
export function innLuggageScuffs(parent: THREE.Group, floorY: number, table: { x: number; z: number }, mirror: THREE.Vector3) {
  const points = [new THREE.Vector2(table.x + 0.6, table.z + 0.3), new THREE.Vector2(table.x + 1, table.z + 0.3),
    new THREE.Vector2(table.x + 1.15, mirror.z), new THREE.Vector2(mirror.x - 0.14, mirror.z)];
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, dir = b.clone().sub(a), count = Math.ceil(dir.length() / 0.15);
    const sideways = new THREE.Vector2(-dir.y, dir.x).normalize();
    for (let j = 0; j < count; j++) for (const side of [-1, 1]) {
      if ((i + j) % 7 === 0) continue;
      const at = a.clone().lerp(b, (j + 0.5) / count).addScaledVector(sideways, side * 0.14);
      const geo = new THREE.PlaneGeometry(0.014 + (j % 3) * 0.006, dir.length() / count * 0.83);
      geo.rotateX(-Math.PI / 2); geo.rotateY(Math.atan2(dir.x, dir.y));
      geo.translate(at.x, floorY + 0.006, at.y); pieces.push(geo.toNonIndexed()); geo.dispose();
    }
  }
  const geo = mergeGeometries(pieces)!; pieces.forEach(p => p.dispose());
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x877660, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  mesh.name = 'inn-luggage-scuffs'; parent.add(mesh);
}
