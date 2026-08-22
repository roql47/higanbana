import * as THREE from 'three';
import { L, serifFamily } from '@/core/i18n';
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
    { text: L('뒷산길 — 묘지 · 오래된 사당', '裏山道 — 墓地 · 古い祠'), toward: [-30, 91] },
    { text: L('참배로 — 제단 · 신사', '参道 — 祭壇 · 社'), toward: [0, 42] },
  ] },
  // 논두렁길 입구
  { x: -2.2, z: 73.4, boards: [{ text: L('논두렁길 — 할머니 집', '畦道 — 祖母の家'), toward: [-17.9, 72.1] }] },
  // 대숲길 입구
  { x: 4.2, z: 62.6, boards: [{ text: L('대숲길 — 여관 · 폐교', '竹林道 — 旅館 · 廃校'), toward: [20, 58] }] },
  // 제단 바로 앞 — 마을 한복판. 돌아온 플레이어가 제단을 못 찾는 일이 없게
  { x: 2.4, z: 27.5, boards: [{ text: L('제단', '祭壇'), toward: [7, 24] }] },
  // 광장 옆 — 돌계단 뒷길
  { x: 29.4, z: 22.4, boards: [{ text: L('돌계단 뒷길 — 저택', '石段の裏道 — 屋敷'), toward: [33, 8] }] },
  // 묘지 갈림 — 여기서 사당까지 한 번 더 짚어 준다 (길이 길어서 중간 확인이 필요하다)
  { x: -41.8, z: 17.0, boards: [{ text: L('오래된 사당', '古い祠'), toward: [-47, 1] }] },
];

/** 한 기둥에 걸린 팻말 하나 — HUD 가 「가까이 있는 팻말」을 읽어 줄 때 쓴다 */
export interface SignBoard {
  /** 기둥 밑동(월드) */
  pos: THREE.Vector3;
  text: string;
  /** 이 팻말이 가리키는 목적지(월드 xz) */
  toward: THREE.Vector2;
}

export class Signposts {
  readonly group = new THREE.Group();
  /**
   * 세워진 팻말 전체. **글자를 읽으려고 코를 박지 않아도 되게** HUD 가 이 목록을 훑어
   * 가까운 기둥의 문구를 화면에 띄운다 (사용자 지시 2026-08-22 「표지판 알림… 접근성」).
   */
  readonly boards: SignBoard[] = [];

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
        this.boards.push({
          pos: new THREE.Vector3(def.x, y, def.z),
          text: board.text,
          toward: new THREE.Vector2(board.toward[0], board.toward[1]),
        });
        boardY -= 0.42;
      }
    }
    this.group.add(b.build('signposts'));
    scene.add(this.group);
  }
}

/** 판자 하나 — +X 끝이 `toward` 를 가리키게 돌린다. 글자는 앞뒤 양면 */
function makeBoard(text: string, x: number, y: number, z: number, toward: [number, number]): THREE.Mesh {
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2d1e, roughness: 0.95 });
  /**
   * **앞면과 뒷면은 같은 그림일 수 없다.**
   *
   * BoxGeometry 는 +Z 면의 u 가 월드 +X 로, −Z 면의 u 가 월드 −X 로 늘어난다(양쪽 다 글씨는
   * 바로 읽힌다). 그래서 두 면에 같은 텍스처를 붙이면 **화살표가 서로 반대쪽 끝**에 걸린다 —
   * 판자의 +X 끝이 목적지인데, 뒤에서 보면 화살이 반대편을 가리켰다
   * (사용자 리포트 2026-08-22 「앞뒤로 보는 것에 따라 방향이 달라짐」).
   *
   * 실제 나무 팻말은 화살이 **판자의 한쪽 끝에 물리적으로** 있다. 그러니 뒷면은
   * 화살을 왼쪽에 두고 왼쪽을 가리켜야 한다 — 그래야 두 면 다 월드 +X 를 가리킨다.
   */
  const draw = (label: string) => textCanvas(512, 96, (ctx) => {
    // 삭은 판자
    ctx.fillStyle = '#3a2d1e';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const yy = 10 + i * 15 + Math.random() * 6; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(512, yy + (Math.random() - 0.5) * 8); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(210,190,150,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, 502, 86);
    ctx.fillStyle = 'rgba(236,222,190,0.95)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 판자 폭에 맞춰 글자를 줄인다 — 긴 문구가 테두리를 넘어가면 못 읽는다
    let px = 42;
    do { ctx.font = `700 ${px}px ${serifFamily()}`; px -= 2; }
    while (px > 22 && ctx.measureText(label).width > 470);
    ctx.fillText(label, 256, 50);
  });
  const faceFor = (label: string) => {
    const tex = draw(label);
    return new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.9,
      // 밤에 겨우 읽힐 만큼만 — 간판이 빛나면 유령 마을이 아니다
      emissive: new THREE.Color(0xffd9a0), emissiveMap: tex, emissiveIntensity: 0.3,
    });
  };
  const front = faceFor(`${text}  →`);   // +Z 면: 오른쪽 끝이 월드 +X
  const back = faceFor(`←  ${text}`);    // −Z 면: 왼쪽 끝이 월드 +X
  // 사람 눈높이에서 몇 걸음 떨어져 읽혀야 한다 — 처음엔 0.96×0.18 이라 글씨가 안 읽혔다
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.95, 0.37, 0.05),
    [wood, wood, wood, wood, front, back],   // ±z 면에 글자
  );
  const dx = toward[0] - x, dz = toward[1] - z;
  // yaw θ 에서 로컬 +X 는 (cosθ, 0, −sinθ) — 이것이 (dx, dz) 방향이 되게
  const yaw = Math.atan2(-dz, dx);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  // 판자를 기둥 **바깥쪽으로** 통째로 내민다 — 목적지 쪽으로 뻗은 팻말의 모양이다.
  // 0.84 였을 때는 판자 왼쪽 13 cm 가 기둥 뒤로 들어가 첫 글자가 가려졌다(실측)
  mesh.translateX(1.06);
  return mesh;
}
