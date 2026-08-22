import * as THREE from 'three';
import type { Physics } from '@/core/physics';
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
    this.group.add(b.build('stone-tablet'));

    // 각인면 — 비신 서쪽(참배로 쪽) 면에 살짝 띄운 평면. 평면의 법선은 +z 라
    // −π/2 를 돌려 −x(서쪽)를 보게 하고, 비신과 같은 yaw(−0.06)를 더한다
    this.redraw();
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.98, 1.55),
      new THREE.MeshStandardMaterial({ map: this.tex!, transparent: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    face.rotation.y = -Math.PI / 2 - 0.06;
    face.position.set(x - 0.15, y + 1.3, z);
    this.facePos.copy(face.position);
    face.receiveShadow = true;
    this.group.add(face);

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
      ctx.font = '700 34px "Noto Serif KR", serif';
      ctx.fillText('彼ヶ里 三禁', W / 2, 56);
      ctx.font = '500 19px "Noto Serif KR", serif';
      const lines = [
        ['一. 해가 진 뒤', '   공물을 옮기지 말 것'],
        ['二. 피안화가 핀 길을', '   따라가지 말 것'],
        ['三. 죽은 자가 이름을 불러도', '   대답하지 말 것'],
      ];
      let yy = 116;
      for (const pair of lines) {
        for (const ln of pair) { ctx.fillText(ln, W / 2, yy); yy += 30; }
        yy += 20;
      }
      // 이끼: 블롭은 **한 번만** 뽑아 두고 문턱값으로 지운다. 매번 새로 뽑으면
      // 닦는 동안 이끼가 자리를 옮겨 다녀 "지지직거리는 노이즈"가 된다 (실제로 그랬다)
      if (!this.moss.length) {
        const rnd = seeded(4831);
        for (let i = 0; i < 150; i++) {
          const my = rnd() * H;
          this.moss.push({
            x: rnd() * W, y: my, r: 11 + rnd() * 28,
            c: `rgba(${40 + rnd() * 25 | 0}, ${58 + rnd() * 30 | 0}, ${34 + rnd() * 18 | 0}, ${(0.55 + rnd() * 0.4).toFixed(2)})`,
            // 위에서부터 벗겨진다 — 손이 위에서 아래로 내려간다. ±8 % 흩뜨려 경계선이 자로 그은 듯하지 않게
            at: Math.min(1, Math.max(0, my / H + (rnd() - 0.5) * 0.16)),
          });
        }
      }
      for (const m of this.moss) {
        if (m.at < this.wipeP) continue;
        ctx.fillStyle = m.c;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      }
      // 세 번째 문장 위로 번지는 검은 얼룩 — 안쪽 방울부터 나타난다(번지는 방향이 밖으로)
      if (this.stainP > 0) {
        if (!this.ink.length) {
          const rnd = seeded(2207);
          for (let i = 0; i < 30; i++) {
            const dx = (rnd() - 0.5) * 190, dy = (rnd() - 0.3) * 70;
            this.ink.push({
              x: W / 2 + dx, y: 292 + dy, r: 7 + rnd() * 20, a: 0.35 + rnd() * 0.45,
              at: Math.min(0.95, Math.hypot(dx / 95, dy / 45) * 0.85),
            });
          }
        }
        for (const b of this.ink) {
          if (b.at > this.stainP) continue;
          const grow = Math.min(1, (this.stainP - b.at) * 4);
          ctx.fillStyle = `rgba(8, 4, 6, ${(b.a * grow).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.4 + grow * 0.6), 0, Math.PI * 2); ctx.fill();
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

/** 결정적 난수 — 이끼·얼룩 블롭은 매번 같은 자리에 있어야 한다 */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; };
}
