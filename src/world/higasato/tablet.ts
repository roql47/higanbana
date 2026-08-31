import * as THREE from 'three';
import { L, lang, serifFamily } from '@/core/i18n';
import type { Physics } from '@/core/physics';
import { Props } from '@/world/props';
import type { HigasatoGround } from './ground';
import { PartsBuilder, textCanvas } from './kit';

/**
 * 돌비석 — 「彼ヶ里 三禁」 (ACT 3, PLAN-STORY §2.3)
 *
 * 참배로 초입, 스폰 북쪽. 각인은 캔버스 텍스처이고 상태는 **두 개의 연속값**이다:
 *   `wipe` 0→1  이끼가 벗겨진다 (E 꾹 누르기와 물려 있다)
 *   `stain` 0→1 세 번째 문장에 검은 얼룩이 번진다 (금기 三 위반)
 *
 * 단계가 아니라 연속값인 이유: 스토리보드의 「플레이어가 표면을 닦으면 글자가 나타난다」는
 * **닦이는 것을 보는 장면**이다. 한 번에 갈아 끼우면 그냥 텍스처가 바뀐 것이고,
 * 서서히 벗겨져야 손이 하고 있는 일이 화면에 있다.
 *
 * 이끼는 **위에서부터** 벗겨진다(블롭마다 y 기준 문턱값). 그래서 제목 → 一 → 二 → 三 순으로
 * 드러나고, **마지막에 드러나는 문장이 세 번째 금기**다 — 목소리가 그 위에 얹힌다.
 */
export class StoneTablet {
  readonly group = new THREE.Group();
  /** 조사 지점(월드) */
  readonly pos: THREE.Vector3;
  /** **각인면 한가운데**(월드) — 카메라가 「글자를 본다」고 할 때 보는 점 (ACT 3) */
  readonly facePos = new THREE.Vector3();
  private tex: THREE.CanvasTexture | null = null;
  /** 이끼가 벗겨진 정도 0~1 */
  private wipeP = 0;
  /** 얼룩이 번진 정도 0~1 */
  private stainP = 0;
  /** 마지막으로 그린 값 — 프레임마다 캔버스를 다시 그리지 않기 위한 문턱 */
  private drawn = -1;
  private moss: { x: number; y: number; r: number; c: string; at: number }[] = [];
  private ink: { x: number; y: number; r: number; a: number; at: number }[] = [];

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    // 참배로 동측, 금줄 게이트를 지나 마을로 내려가는 길목 — 반드시 지나친다
    const rp = ground.roadAt(ground.sAtZ(72));
    const x = rp.x + 2.7, z = rp.z;
    const y = ground.heightAt(x, z);
    this.pos = new THREE.Vector3(x, y, z);

    const b = new PartsBuilder(physics);
    const mStone = b.mat(0x555a52, 1.0);
    const mBase = b.mat(0x3f443d, 1.0);
    // 2단 기단 + 비신(살짝 뒤로 기운 노석).
    // **넓은 면이 서쪽(참배로)을 본다** — 비석은 길에서 읽으라고 세우는 것이다.
    // 폭을 x 에 주면 넓은 면이 남북을 보게 되고, 그러면 각인면이 두께 26 cm 짜리
    // 모서리에 붙어 양옆으로 튀어나온다 (그 상태였다 — 초록 이끼판이 돌 옆에 떠 있었다)
    b.box(1.2, 0.24, 1.8, x, y + 0.12, z, mBase);
    b.box(0.9, 0.22, 1.4, x, y + 0.34, z, mBase);
    const slab = new THREE.BoxGeometry(0.26, 1.75, 1.15);
    // 뒤(동쪽)로 기운다 — 넓은 면이 x 를 보므로 기울기는 **z 축** 회전이다
    slab.rotateZ(-0.05); slab.rotateY(-0.06);
    slab.translate(x, y + 0.45 + 0.85, z);
    b.add(slab, mStone);
    b.collide(x, y + 0.9, z, 0.6, 0.9, 0.9);
    const proc = b.build('stone-tablet');
    this.group.add(proc);

    /**
     * 각인면 — 비신 서쪽(참배로 쪽) 면에 2 cm 띄운 평면.
     *
     * ⚠️ **비신과 같은 기울기를 줘야 한다.** 예전에는 각인면에 yaw(−0.06)만 주고 비신의
     * z 축 기울기(−0.05)는 빼먹었는데, 노석이 뒤로 기운 만큼 아래로 갈수록 돌이 앞으로 나와서
     * **각인면 아래 24 % 가 돌 속에 파묻혔다**. 하필 그 자리가 세 번째 금기의 마지막 줄이라
     * 「대답하지 말 것」이 잘려 보였다(사용자 리포트 2026-08-22 「비석 밑에 글씨 짤림」).
     *
     * 그래서 비신과 **똑같은 변환 순서**로 만든다: 평면을 −x 로 돌리고(법선을 참배로 쪽으로),
     * 표면 바깥으로 밀고, 그다음 비신의 rotateZ → rotateY → translate 를 그대로 태운다.
     */
    this.redraw();
    // 크기를 뒤에서 바꿀 수 있게 지오메트리 조립을 함수로 — 변환이 통째로 구워지므로
    // mesh.scale 로 줄이면 **월드 원점 기준**으로 날아간다 (scale 금지, 재생성만)
    const buildFaceGeo = (w: number, h: number) => {
      const g = new THREE.PlaneGeometry(w, h);
      g.rotateY(-Math.PI / 2);      // 법선 +z → −x (참배로 쪽)
      g.translate(-0.15, 0, 0);     // 비신 반두께 0.13 + 2 cm
      g.rotateZ(-0.05); g.rotateY(-0.06);
      g.translate(x, y + 0.45 + 0.85, z);
      return g;
    };
    const fg = buildFaceGeo(0.98, 1.55);
    const face = new THREE.Mesh(
      fg,
      new THREE.MeshStandardMaterial({ map: this.tex!, transparent: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    fg.computeBoundingSphere();
    this.facePos.copy(fg.boundingSphere!.center);
    face.receiveShadow = true;
    this.group.add(face);

    /**
     * 자연석 비석 (Tripo `prop-stele`) — 도착하면 박스 비신·기단을 감추고 그 자리에 선다.
     * 각인 캔버스와 콜라이더는 그대로다. 캔버스는 상수 좌표가 아니라 **레이캐스트로 실제 돌 표면을
     * 찾아** 그 앞 2 cm 로 옮긴다 — 모델의 정면이 박스와 같은 평면에 있으리라는 보장이 없다
     * (공고판 종이를 모델 판면 위로 옮긴 것과 같은 이유, speaker.ts 참조).
     */
    void Props.loadNormalized('/models/props/stele.glb', 2.15, 0.45).then((m) => {
      m.rotation.set(0, -0.06, -0.05);        // 비신과 같은 기울기 (rotateZ → rotateY 순서와 등가)
      m.position.set(x, y - 0.03, z);         // 경사지라 3 cm 묻는다
      m.updateMatrixWorld(true);
      this.group.add(m);
      proc.visible = false;
      // 각인면의 바깥 법선(서쪽 + 기울기) — 지오메트리에 태운 회전과 같은 순서로 계산한다
      const n = new THREE.Vector3(-1, 0, 0)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.05)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.06);
      const rc = new THREE.Raycaster(this.facePos.clone().addScaledVector(n, 1.2), n.clone().negate(), 0, 2.4);
      const hit = rc.intersectObject(m, true)[0];
      if (hit) {
        // facePos 에서 표면까지 법선 방향 부호 거리 (양수 = 표면이 캔버스보다 서쪽)
        const off = 1.2 - hit.distance;
        face.position.copy(n).multiplyScalar(off + 0.02);
        this.facePos.addScaledVector(n, off + 0.02);
      }
      // 이 모델은 정면에 각인용 패널 홈이 파여 있다 — 캔버스를 그 안쪽 폭에 맞춰 다시 굽는다
      face.geometry.dispose();
      face.geometry = buildFaceGeo(0.82, 1.42);
    }).catch((e) => console.warn('[tablet] 비석 모델 로드 실패 — 절차적 비석 유지:', e));

    scene.add(this.group);
  }

  /** 이끼를 닦는다 (0~1). 진행 중 매 프레임 불려도 되게 4 % 이상 변할 때만 다시 그린다 */
  wipe(p: number) {
    this.wipeP = Math.max(this.wipeP, Math.min(1, Math.max(0, p)));
    if (Math.abs(this.wipeP - this.drawn) > 0.04 || this.wipeP >= 1) { this.drawn = this.wipeP; this.redraw(); }
  }
  /** 표면을 다 닦은 상태 (되감기·디버그용) */
  reveal() { this.wipeP = 1; this.drawn = 1; this.redraw(); }
  /** 세 번째 금기 위반 — 세 번째 문장에 검은 얼룩이 번진다 (0~1) */
  stainTo(p: number) {
    const q = Math.min(1, Math.max(0, p));
    if (Math.abs(q - this.stainP) < 0.03 && q < 1) return;
    this.stainP = q;
    this.redraw();
  }
  stain() { this.stainTo(1); }
  get wiped() { return this.wipeP >= 1; }

  private redraw() {
    const draw = (ctx: CanvasRenderingContext2D) => {
      const W = 256, H = 400;
      ctx.clearRect(0, 0, W, H);
      // 각인 글자 — 어둡게 파인 느낌 (그림자 없이 톤만)
      ctx.fillStyle = 'rgba(20, 22, 18, 0.88)';
      ctx.textAlign = 'center';
      ctx.font = `700 ${TITLE_PX}px ${serifFamily()}`;
      ctx.fillText(TITLE, W / 2, 56);
      ctx.font = `500 ${BODY_PX}px ${serifFamily()}`;
      let yy = BODY_Y0;
      for (const pair of RULES) {
        for (const ln of pair) { ctx.fillText(ln, W / 2, yy); yy += LINE_H; }
        yy += PAIR_GAP;
      }
      // 이끼: 블롭은 **한 번만** 뽑아 두고 문턱값으로 지운다. 매번 새로 뽑으면
      // 닦는 동안 이끼가 자리를 옮겨 다녀 "지지직거리는 노이즈"가 된다 (실제로 그랬다)
      if (!this.moss.length) {
        const rnd = seeded(4831);
        for (let i = 0; i < 150; i++) {
          const my = rnd() * H;
          this.moss.push({
            x: rnd() * W, y: my, r: 11 + rnd() * 28,
            // 채도를 누른 올리브 — 박스 시절의 쨍한 초록은 실물 돌 텍스처 위에서 위장무늬처럼 떴다
            c: `rgba(${26 + rnd() * 14 | 0}, ${38 + rnd() * 18 | 0}, ${24 + rnd() * 10 | 0}, ${(0.42 + rnd() * 0.3).toFixed(2)})`,
            // 위에서부터 벗겨진다 — 손이 위에서 아래로 내려간다. ±8 % 흩뜨려 경계선이 자로 그은 듯하지 않게.
            // 상한은 1 이 아니라 0.985 — 1 이면 `at < wipeP` 가 끝까지 거짓이라 **다 닦아도 밑동에 이끼가 남는다**
            at: Math.min(0.985, Math.max(0, my / H + (rnd() - 0.5) * 0.16)),
          });
        }
      }
      for (const m of this.moss) {
        if (m.at < this.wipeP) continue;
        ctx.fillStyle = m.c;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      }
      /**
       * 세 번째 문장 위로 번지는 검은 얼룩 — 안쪽 방울부터 밖으로.
       *
       * 예전에는 방울 30 개를 무작위로 흩뿌려서 **다 번져도 글자가 읽혔다**
       * (사용자 리포트 2026-08-22 「얼룩이 글씨를 다 안 가리고 있어」).
       * 이 얼룩은 연출이 아니라 **사건의 증거**다 — 세 번째 금기가 지워져 있어야 한다.
       * 그래서 방울을 **세 번째 문장의 외접 사각형(STAIN)** 위 격자에 뿌리고, 칸보다 큰 반지름을
       * 줘서 겹치게 한다. stainP = 1 이면 그 사각형이 통째로 검다.
       */
      if (this.stainP > 0) {
        if (!this.ink.length) {
          const rnd = seeded(2207);
          const cx = (STAIN.x0 + STAIN.x1) / 2, cy = (STAIN.y0 + STAIN.y1) / 2;
          const rx = (STAIN.x1 - STAIN.x0) / 2, ry = (STAIN.y1 - STAIN.y0) / 2;
          const GX = 13, GY = 5;
          for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
            const bx = STAIN.x0 + ((gx + 0.5 + (rnd() - 0.5) * 0.6) / GX) * (rx * 2);
            const by = STAIN.y0 + ((gy + 0.5 + (rnd() - 0.5) * 0.6) / GY) * (ry * 2);
            this.ink.push({
              x: bx, y: by, r: 15 + rnd() * 11, a: 0.82 + rnd() * 0.18,
              // 가운데에서 밖으로 — 정규화 거리가 곧 번지는 순서다
              at: Math.min(0.9, Math.hypot((bx - cx) / rx, (by - cy) / ry) * 0.78),
            });
          }
        }
        for (const b of this.ink) {
          if (b.at > this.stainP) continue;
          const grow = Math.min(1, (this.stainP - b.at) * 4);
          ctx.fillStyle = `rgba(8, 4, 6, ${(b.a * grow).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.45 + grow * 0.55), 0, Math.PI * 2); ctx.fill();
        }
      }
    };
    if (!this.tex) this.tex = textCanvas(256, 400, draw);
    else {
      const ctx = (this.tex.image as HTMLCanvasElement).getContext('2d');
      if (ctx) { draw(ctx); this.tex.needsUpdate = true; }
    }
  }
}

/**
 * 각인 레이아웃 (캔버스 256 × 400). 얼룩 사각형이 여기서 계산돼 나오므로,
 * 문구를 고치면 얼룩도 따라온다 — 따로 적어 두면 어긋난다.
 */
const TITLE = L('세 가지 금기', '彼ヶ里 三禁');
const TITLE_PX = 34;
const RULES: readonly (readonly [string, string])[] = lang() === 'ja'
  ? [
    ['一. 日が落ちたのち', '   供物を動かすべからず'],
    ['二. 彼岸花の咲く道を', '   辿るべからず'],
    ['三. 死者が名を呼んでも', '   応えるべからず'],
  ]
  : [
    ['하나. 해가 진 뒤', '   공물을 옮기지 말 것'],
    ['둘. 피안화가 핀 길을', '   따라가지 말 것'],
    ['셋. 죽은 자가 이름을 불러도', '   대답하지 말 것'],
  ];
const BODY_PX = 19;
const BODY_Y0 = 116;   // 첫 줄 베이스라인
const LINE_H = 30;
const PAIR_GAP = 20;
/** 세 번째 문장 두 줄의 외접 사각형 + 여유 — 얼룩이 덮어야 할 범위 */
const STAIN = (() => {
  const first = BODY_Y0 + (RULES.length - 1) * (2 * LINE_H + PAIR_GAP);
  return { x0: 12, x1: 244, y0: first - BODY_PX - 5, y1: first + LINE_H + BODY_PX * 0.4 };
})();

/** 결정적 난수 — 이끼·얼룩 블롭은 매번 같은 자리에 있어야 한다 */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; };
}
