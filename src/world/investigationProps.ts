import * as THREE from 'three';

/** 소형 문서 표면. 새 모델/조명 없이 기존 가구 위에 고정하며 상세 문장은 조사와 수첩에서 읽는다. */
export function investigationPaper(parent: THREE.Object3D, pos: THREE.Vector3, title: string, lines: readonly string[], width = 0.42) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#b9a78b'; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#735b43'; c.lineWidth = 2; c.strokeRect(12, 12, 232, 232);
  c.fillStyle = '#51372f'; c.textAlign = 'center'; c.font = 'bold 23px serif';
  c.fillText(title, 128, 53, 210);
  c.font = '19px serif'; lines.forEach((s, i) => c.fillText(s, 128, 104 + i * 37, 210));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(width, width), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  paper.name = 'investigation-paper'; paper.position.copy(pos); paper.rotation.x = -Math.PI / 2;
  paper.receiveShadow = true; parent.add(paper);
  return paper;
}
