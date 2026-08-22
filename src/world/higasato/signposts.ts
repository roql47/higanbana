import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { HigasatoGround } from './ground';
import { PartsBuilder, textCanvas } from './kit';

/**
 * 도표(道標) — 갈래길 입구의 나무 이정표.
 *
 * 히가사토는 참배로에서 갈래길 4개가 뻗는 구조인데, 입구에 아무 표지가 없어서
 * 「오래된 사당」 같은 목표가 **어느 길인지 알 수 없었다**(사용자: "사당이 어디 있는지 모르겠어").
 * 낡은 시골 마을의 문법에 맞는 해법은 미니맵이 아니라 **팻말**이다 — 손글씨 판자가
 * 목적지 방향을 가리킨다. 판자의 +X 끝이 실제 경로 쪽을 향하도록 돌린다.
 *
 * 밤에 읽혀야 하므로 글자판에 아주 옅은 자발광을 준다(초칭을 비추면 또렷해진다).
 */

interface SignDef {
  x: number; z: number;
  boards: { text: string; toward: [number, number] }[];
}

const SIGNS: SignDef[] = [
  // 참배로 남단 — 뒷산 오솔길 입구. **사당은 이 길 끝이다**. 제단 방향도 같이 알려 준다
  { x: -2.7, z: 90.2, boards: [
    { text: '뒷산길 — 묘지 · 오래된 사당', toward: [-30, 91] },
    { text: '참배로 — 제단 · 신사', toward: [0, 42] },
  ] },
  // 논두렁길 입구
  { x: -2.2, z: 73.4, boards: [{ text: '논두렁길 — 할머니 집', toward: [-17.9, 72.1] }] },
  // 대숲길 입구
  { x: 4.2, z: 62.6, boards: [{ text: '대숲길 — 여관 · 폐교', toward: [20, 58] }] },
  // 제단 바로 앞 — 마을 한복판. 돌아온 플레이어가 제단을 못 찾는 일이 없게
  { x: 2.4, z: 27.5, boards: [{ text: '제단', toward: [7, 24] }] },
  // 광장 옆 — 돌계단 뒷길
  { x: 29.4, z: 22.4, boards: [{ text: '돌계단 뒷길 — 저택', toward: [33, 8] }] },
  // 묘지 갈림 — 여기서 사당까지 한 번 더 짚어 준다 (길이 길어서 중간 확인이 필요하다)
  { x: -41.8, z: 17.0, boards: [{ text: '오래된 사당', toward: [-47, 1] }] },
];

export class Signposts {
  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    this.group.name = 'signposts';
    const b = new PartsBuilder(physics);
    const mPost = b.mat(0x2c2115, 0.95);

    for (const def of SIGNS) {
      const y = ground.heightAt(def.x, def.z);
      // 기둥 + 갓 (병합 대상 — 글자판은 텍스처가 달라 따로)
      b.cyl(0.06, 0.075, 2.05, def.x, y + 1.02, def.z, mPost, 8);
      b.box(0.2, 0.04, 0.2, def.x, y + 2.07, def.z, mPost);
      b.collide(def.x, y + 1.0, def.z, 0.1, 1.0, 0.1);

      let boardY = y + 1.72;
      for (const board of def.boards) {
        this.group.add(makeBoard(board.text, def.x, boardY, def.z, board.toward));
        boardY -= 0.42;
      }
    }
    this.group.add(b.build('signposts'));
    scene.add(this.group);
  }
}

/** 판자 하나 — +X 끝이 `toward` 를 가리키게 돌린다. 글자는 앞뒤 양면 */
function makeBoard(text: string, x: number, y: number, z: number, toward: [number, number]): THREE.Mesh {
  const tex = textCanvas(512, 96, (ctx) => {
    // 삭은 판자
    ctx.fillStyle = '#3a2d1e';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const yy = 10 + i * 15 + Math.random() * 6; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(512, yy + (Math.random() - 0.5) * 8); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(210,190,150,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, 502, 86);
    // 글씨 + 방향 화살 — 화살이 +X(판자 끝) 쪽이다
    ctx.fillStyle = 'rgba(232,216,182,0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 40px "Noto Serif KR", serif';
    ctx.fillText(`${text}  →`, 256, 50);
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2d1e, roughness: 0.95 });
  const face = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.9,
    // 밤에 겨우 읽힐 만큼만 — 간판이 빛나면 유령 마을이 아니다
    emissive: new THREE.Color(0xffd9a0), emissiveMap: tex, emissiveIntensity: 0.22,
  });
  // 사람 눈높이에서 몇 걸음 떨어져 읽혀야 한다 — 처음엔 0.96×0.18 이라 글씨가 안 읽혔다
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.32, 0.045),
    [wood, wood, wood, wood, face, face],   // ±z 면에 글자
  );
  const dx = toward[0] - x, dz = toward[1] - z;
  // yaw θ 에서 로컬 +X 는 (cosθ, 0, −sinθ) — 이것이 (dx, dz) 방향이 되게
  const yaw = Math.atan2(-dz, dx);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  // 판자 원점을 기둥에 물리고 살짝 밖으로 (기둥 옆에 못 박은 모양)
  mesh.translateX(0.72);
  return mesh;
}
