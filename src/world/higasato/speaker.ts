import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { HigasatoGround } from './ground';
import { PartsBuilder, textCanvas } from './kit';
import { Props } from '@/world/props';

/**
 * 마을 방송탑(防災無線) + 공고판 — ACT 4 「끝나지 않은 축제」 (PLAN-STORY §2.4)
 *
 * 스토리보드에서 방송은 **갑자기 켜진다**. 그러려면 소리가 나올 물건이 화면에 먼저 있어야 한다 —
 * 아무것도 없는 하늘에서 나는 안내방송은 연출이 아니라 UI 다. 그래서 전주를 세운다:
 *   · 마을 초입(참배로 ↔ 본거리 갈림) — 반드시 지나치는 자리. **공고판이 여기 달려 있다**
 *   · 광장 — 봉납 3·5 회의 방송(ACT 11)이 여기서 난다
 *
 * 공고판이 이 ACT 의 물증이다. 스토리보드: *방송 장치에 적힌 날짜는 10년 전 피안제 당일이다.*
 * 종이는 **새것처럼** 붙어 있고, 날짜만 10년 전이다 — 그 어긋남 하나가 마을의 상태를 설명한다.
 */
export class Speakers {
  readonly group = new THREE.Group();
  /** 나팔 위치(월드) — 소리의 원점 */
  readonly horns: THREE.Vector3[] = [];
  /** 공고판 조사 지점 */
  readonly noticePos: THREE.Vector3;
  private noticeTex: THREE.CanvasTexture | null = null;
  /** 절차적 나팔 — 모델이 도착하면 통째로 감춘다 */
  private hornProc = new THREE.Group();
  /** 나팔이 놓일 자리와 향하는 방향 */
  private hornAims: { at: THREE.Vector3; dir: THREE.Vector3 }[] = [];
  private read = false;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const b = new PartsBuilder(physics);
    const mPole = b.mat(0x7a7570, 0.92);      // 콘크리트 전주
    const mHorn = b.mat(0x8e9088, 0.7);       // 알루미늄 나팔
    const mWood = b.mat(0x4b3b2c, 0.9);

    // 마을 초입 — 참배로 동측. 길 가장자리(반폭 1.9)에서 0.6 m 물러난다
    const A = new THREE.Vector3(2.6, 0, 42.5);
    // 광장 서남 — 노점 고리(반경 9.5) 밖
    const B = new THREE.Vector3(24, 0, 24);
    for (const [i, p] of [A, B].entries()) {
      p.y = ground.heightAt(p.x, p.z);
      const H = 5.4;
      // 전주는 위로 갈수록 가늘다 — 콘크리트 전주의 형태가 그렇다
      b.cyl(0.075, 0.115, H, p.x, p.y + H / 2, p.z, mPole, 8);
      b.collide(p.x, p.y + H / 2, p.z, 0.14, H / 2, 0.14);
      // 나팔 둘 — 서로 반대쪽을 본다 (마을 전체에 들려야 한다). 그리고 **살짝 아래를 향한다**:
      // 방재무선 나팔은 길을 향해 숙여 달린다. 수평으로 두면 하늘에 대고 방송하는 꼴이다
      const hy = p.y + H - 0.45;
      const base = i === 0 ? -0.4 : 2.5;
      for (const yaw of [base, base + Math.PI]) {
        const dir = new THREE.Vector3(Math.sin(yaw), -0.16, Math.cos(yaw)).normalize();
        const cone = new THREE.ConeGeometry(0.17, 0.4, 14);
        // 원뿔은 +Y 가 꼭짓점, −Y 가 입이다. 입이 dir 을 보게 하려면 **+Y 를 −dir 로** 돌린다
        cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate()));
        cone.translate(p.x + dir.x * 0.32, hy + dir.y * 0.32, p.z + dir.z * 0.32);
        // 전주 본체(`b`)가 아니라 별도 그룹에 쌓는다 — 모델이 도착하면 이 그룹만 통째로 걷어낸다
        this.hornProc.add(new THREE.Mesh(cone, mHorn));
        // 나팔 목 — 원뿔만 있으면 공중에 뜬 깔때기다
        const neck = new THREE.BoxGeometry(0.09, 0.09, 0.2);
        neck.rotateY(yaw);
        neck.translate(p.x + dir.x * 0.13, hy + dir.y * 0.13, p.z + dir.z * 0.13);
        this.hornProc.add(new THREE.Mesh(neck, mHorn));
        this.hornAims.push({ at: new THREE.Vector3(p.x + dir.x * 0.28, hy + dir.y * 0.28, p.z + dir.z * 0.28), dir: dir.clone() });
      }
      this.horns.push(new THREE.Vector3(p.x, hy, p.z));
      // 배선함
      b.box(0.24, 0.34, 0.16, p.x, p.y + 1.55, p.z + 0.14, mPole);
    }

    // --- 공고판: 마을 초입 전주에 붙는다 ---
    const nx = A.x + 0.34, nz = A.z - 0.1;
    const ny = A.y + 1.15;
    // 판 · 기둥 · 지붕은 **틀**이다. Tripo 공고판이 도착하면 이 묶음만 감춘다 —
    // 날짜가 적힌 종이(아래 `paper`)는 캔버스라 그대로 남아야 한다. 그게 이 ACT 의 물증이다
    const nb = new PartsBuilder(physics);
    nb.box(0.06, 1.0, 0.06, nx - 0.42, ny, nz, mWood);
    nb.box(0.06, 1.0, 0.06, nx + 0.42, ny, nz, mWood);
    nb.box(0.96, 0.72, 0.05, nx, ny + 0.42, nz, mWood);
    // 작은 지붕 — 게시판은 비를 맞으면 안 된다
    nb.box(1.08, 0.05, 0.22, nx, ny + 0.82, nz + 0.05, mWood, 0.0);
    b.collide(nx, ny + 0.4, nz, 0.5, 0.5, 0.1);
    this.group.add(b.build('speakers'));
    const noticeProc = nb.build('notice-frame');
    this.group.add(noticeProc);

    this.group.add(this.hornProc);
    /**
     * 나팔을 Tripo 모델로 바꾼다. 모델 로컬에서 **나팔 입은 +X** 를 향한다(정점 분포로 확인:
     * x = +0.45 근방 평균 반경 0.28, x = −0.45 근방 0.13). 그래서 +X 를 `dir` 로 돌리면 된다.
     * 방송이 나오는 좌표(`horns`)는 절차적일 때와 같은 자리라 오디오 쪽은 손대지 않는다.
     */
    void Props.loadNormalized('/models/props/speaker-horn.glb', 0.37, 0.6).then((tpl) => {
      const box = new THREE.Box3().setFromObject(tpl);
      const c = box.getCenter(new THREE.Vector3());
      for (const aim of this.hornAims) {
        const m = tpl.clone(true);
        m.position.sub(c);                                    // 나팔 한가운데를 회전 중심으로
        const holder = new THREE.Group();
        holder.add(m);
        holder.position.copy(aim.at);
        holder.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), aim.dir);
        this.group.add(holder);
      }
      this.hornProc.visible = false;
    }).catch((e) => console.warn('[speakers] 나팔 모델 로드 실패 — 절차적 원뿔 유지:', e));

    // 공고문 — 판 앞면에 살짝 띄운 평면. 게시판은 **남쪽**을 본다:
    // 플레이어는 남쪽(비석 쪽)에서 올라오므로, 걸어오는 사람의 정면에 종이가 있어야 한다
    this.redrawNotice();
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.58),
      new THREE.MeshStandardMaterial({ map: this.noticeTex!, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    paper.position.set(nx, ny + 0.44, nz - 0.03);
    paper.rotation.y = Math.PI;
    this.group.add(paper);
    void Props.loadNormalized('/models/props/notice-board.glb', 1.6, 0.55).then((m) => {
      // 판면은 모델 로컬 **+X** 다(씬에서 네 방향 돌려 확인). 남쪽(−Z)을 보게 −90° 돌린다 —
      // 플레이어는 남쪽 비석 쪽에서 걸어 올라오므로 그쪽에 글이 있어야 읽는다
      m.rotation.y = -Math.PI / 2;
      m.position.set(nx, A.y - 0.02, nz + 0.16);
      m.updateMatrixWorld(true);
      this.group.add(m);
      noticeProc.visible = false;
      /**
       * 종이를 **모델 판면 위로 옮긴다.** 절차적 틀에 맞춰 박아 둔 좌표(ny + 0.44)를 그대로 두면
       * 종이가 판 뒤로 들어가거나 공중에 뜬다 — 판의 크기·두께가 다르기 때문이다.
       * 그래서 좌표를 상수로 적지 않고 **로드된 모델의 바운딩 박스에서 계산한다**.
       */
      const bb = new THREE.Box3().setFromObject(m);
      paper.position.set((bb.min.x + bb.max.x) / 2, bb.min.y + (bb.max.y - bb.min.y) * 0.56, bb.min.z - 0.02);
    }).catch((e) => console.warn('[speakers] 공고판 모델 로드 실패 — 절차적 틀 유지:', e));
    this.noticePos = new THREE.Vector3(nx, A.y, nz);

    scene.add(this.group);
  }

  /** 플레이어에게 가장 가까운 나팔 — 방송이 여기서 난다 */
  nearestHorn(p: THREE.Vector3): THREE.Vector3 {
    let best = this.horns[0]!, bd = Infinity;
    for (const h of this.horns) { const d = h.distanceToSquared(p); if (d < bd) { bd = d; best = h; } }
    return best;
  }

  /** 가까이서 들여다봤다 — 지금까지 안 보이던 **날짜**가 읽힌다 */
  reveal() { if (!this.read) { this.read = true; this.redrawNotice(); } }

  private redrawNotice() {
    const draw = (ctx: CanvasRenderingContext2D) => {
      const W = 312, H = 232;
      // 종이 — 누렇게 뜬 갱지인데 **가장자리가 상하지 않았다**. 어제 붙인 종이다
      ctx.fillStyle = '#d9cfae';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(120,104,72,0.13)';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * W, Math.random() * H, 3 + Math.random() * 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#241d14';
      ctx.textAlign = 'center';
      ctx.font = '700 25px "Noto Serif KR", serif';
      ctx.fillText('彼ヶ里 秋季 彼岸祭', W / 2, 40);
      ctx.strokeStyle = 'rgba(36,29,20,0.6)';
      ctx.beginPath(); ctx.moveTo(28, 52); ctx.lineTo(W - 28, 52); ctx.stroke();
      ctx.font = '500 16px "Noto Serif KR", serif';
      ctx.textAlign = 'left';
      const lines = [
        '一. 저녁 여섯 시, 신사 경내에 모일 것',
        '二. 각 가구는 공물을 지참할 것',
        '三. 해가 진 뒤 공물에 손대지 말 것',
      ];
      let y = 82;
      for (const ln of lines) { ctx.fillText(ln, 30, y); y += 28; }
      // 날짜 — 이 게시판의 본체. 붉은 접수인 위에 적혀 있다
      ctx.save();
      ctx.translate(W - 74, H - 52);
      ctx.rotate(-0.12);
      ctx.strokeStyle = this.read ? 'rgba(150,38,32,0.85)' : 'rgba(150,38,32,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(-30, -26, 60, 52);
      ctx.fillStyle = this.read ? 'rgba(150,38,32,0.9)' : 'rgba(150,38,32,0.55)';
      ctx.textAlign = 'center';
      ctx.font = '700 15px "Noto Serif KR", serif';
      ctx.fillText('彼ヶ里', 0, -4);
      ctx.fillText('区長', 0, 15);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#241d14';
      ctx.font = '600 19px "Noto Serif KR", serif';
      // 읽기 전에는 흐릿하다 — 멀리서 보면 "뭔가 적혀 있다"까지만 보여야 한다
      ctx.globalAlpha = this.read ? 1 : 0.35;
      ctx.fillText('二〇一五年 九月 二十三日', 30, H - 34);
      ctx.globalAlpha = 1;
    };
    if (!this.noticeTex) this.noticeTex = textCanvas(312, 232, draw);
    else {
      const ctx = (this.noticeTex.image as HTMLCanvasElement).getContext('2d');
      if (ctx) { draw(ctx); this.noticeTex.needsUpdate = true; }
    }
  }
}
