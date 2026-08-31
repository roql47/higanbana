import * as THREE from 'three';
import type { Sfx } from '@/audio/sfx';
import { L } from '@/core/i18n';
import { Props } from '@/world/props';
import type { HigasatoGround } from './ground';
import { LANES } from './ground';
import type { Hamlet, MinkaSpec } from './minka';

/**
 * ACT 4 「끝나지 않은 축제」 — 생활 흔적 (PLAN-STORY §2.4)
 *
 * 스토리보드의 다섯 줄을 그대로 옮긴다. 마을은 폐허인데 **방금까지 사람이 있었다**:
 *   ① 찻잔에서 김이 난다
 *   ② 빈집 텔레비전에서 잡음 섞인 방송이 나온다
 *   ③ 방금 벗어놓은 것처럼 젖은 게다가 현관에 놓여 있다
 *   ④ 바람이 없는데 풍경이 흔들린다
 *   ⑤ 골목 끝에 사람이 서 있다가 시선을 돌리면 사라진다
 *
 * 다섯 개를 한자리에 모으지 않는다 — **골목을 걷는 동안 하나씩** 스쳐야 "마을이 그렇다"가 된다.
 * 그래서 앵커는 민가(`minka.ts`)에서 가져오고, 다섯 번째만 골목의 **끝**(LANES 폴리라인 종점)에 둔다.
 *
 * 비용: 소품은 전부 정적 메시 몇 개 + 포인트라이트 하나. 갱신은 **가까이 있을 때만** 돈다
 * (김 파티클 20 m · TV 22 m · 풍경 20 m). 멀면 update 가 조기 반환한다.
 */

/** 골목 끝의 사람 — 보고 있으면 서 있고, 시선을 돌리면 없다 */
interface Watcher {
  mesh: THREE.Object3D;
  /** 페이드 대상 재질들 — 빌보드는 1장, 꼬마 유령 모델은 여러 장 */
  mats: { opacity: number; transparent?: boolean }[];
  pos: THREE.Vector3;
  state: 'hidden' | 'showing' | 'gone';
  a: number;
}

export class LifeSigns {
  readonly group = new THREE.Group();
  /** ACT 4 필수 조사 지점. 세 곳 이상 확인해야 중앙 제단의 명령을 읽을 수 있다. */
  readonly cluePositions = new Map<string, THREE.Vector3>();
  private t = 0;
  // ① 찻잔
  private steam: THREE.Points | null = null;
  private steamGeo: THREE.BufferGeometry | null = null;
  private steamAge: Float32Array = new Float32Array(0);
  private steamPos = new THREE.Vector3();
  private teaAsh: THREE.Group | null = null;
  /** 봉납 수. 생활 흔적은 처음 본 모습으로 얼어 있지 않고 봉인이 풀릴수록 망가진다. */
  private storyStage = 0;
  // ② 텔레비전
  private tv: THREE.PointLight | null = null;
  private tvScreen: THREE.MeshBasicMaterial | null = null;
  private tvPos = new THREE.Vector3();
  private tvOn = false;
  private tvCanvas: HTMLCanvasElement | null = null;
  private tvContext: CanvasRenderingContext2D | null = null;
  private tvTexture: THREE.CanvasTexture | null = null;
  private tvFrameT = 0;
  private tvGhostX = 128;
  // ③ 젖은 게다 — 봉납 2 뒤에는 누군가 신은 것처럼 현관에서 골목 쪽으로 옮겨진다.
  private getaObjects: { object: THREE.Object3D; base: THREE.Vector3 }[] = [];
  private getaWet: THREE.Object3D | null = null;
  private getaWetBase = new THREE.Vector3();
  private getaShifted = false;
  private getaTrail: THREE.Group | null = null;
  // ④ 풍경
  private furin: THREE.Group | null = null;
  private furinPos = new THREE.Vector3();
  private furinT = 6;
  private furinPaperCanvas: HTMLCanvasElement | null = null;
  private furinPaperTexture: THREE.CanvasTexture | null = null;
  /** 한 번 흔들린 뒤 잦아드는 양 (1 → 0) */
  private swing = 0;
  // ⑤ 골목 끝 사람
  private watchers: Watcher[] = [];
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, ground: HigasatoGround, hamlet: Hamlet, private sfx: Sfx) {
    const used = new Set<MinkaSpec>();
    /** 마을 한복판(본거리·참배로)에 가까운 집부터 고른다 — 반드시 지나치는 자리여야 한다 */
    const pick = (x: number, z: number, needEngawa = true): MinkaSpec | null => {
      let best: MinkaSpec | null = null, bd = Infinity;
      for (const h of hamlet.houses) {
        if (used.has(h) || h.floor === undefined) continue;
        if (needEngawa && !h.engawa) continue;
        const d = Math.hypot(h.x - x, h.z - z);
        if (d < bd) { bd = d; best = h; }
      }
      if (best) used.add(best);
      return best;
    };
    /** 집 앞(정면 +Z 로컬)의 월드 좌표 */
    const front = (m: MinkaSpec, out: number, up: number) => {
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      return new THREE.Vector3(m.x + fx * (m.d / 2 + out), (m.gy ?? 0) + up, m.z + fz * (m.d / 2 + out));
    };

    // ---------------- ① 찻잔 + 김 ----------------
    const tea = pick(2, 33);
    if (tea) {
      const p = front(tea, 0.55, (tea.floor ?? 0.5) + 0.09);
      const cupMat = new THREE.MeshStandardMaterial({ color: 0xc9c2b0, roughness: 0.55 });
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.06, 12), cupMat);
      cup.position.copy(p);
      this.group.add(cup);
      // 받침(茶托)까지 있어야 "놓여 있다"이지 "굴러다닌다"가 아니다
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.008, 14), new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.8 }));
      saucer.position.set(p.x, p.y - 0.034, p.z);
      this.group.add(saucer);
      this.steamPos.copy(p).add(new THREE.Vector3(0, 0.035, 0));
      this.cluePositions.set('tea', p.clone());
      this.buildSteam();
      // 식은 뒤에만 드러나는 재. 처음에는 차 표면 아래로 숨겨 두고 봉납 1에서 켠다.
      const ash = new THREE.Group();
      ash.position.set(p.x, p.y + 0.032, p.z);
      const ashMat = new THREE.MeshBasicMaterial({ color: 0x171516, transparent: true, opacity: 0.82, depthWrite: false });
      for (let i = 0; i < 9; i++) {
        const grain = new THREE.Mesh(new THREE.CircleGeometry(0.004 + (i % 3) * 0.002, 7), ashMat);
        const a = i * 2.399, r = 0.006 + (i % 4) * 0.006;
        grain.position.set(Math.cos(a) * r, 0.001 + i * 0.0001, Math.sin(a) * r);
        grain.rotation.x = -Math.PI / 2;
        ash.add(grain);
      }
      ash.visible = false;
      this.group.add(ash);
      this.teaAsh = ash;
    }

    // ---------------- ② 빈집 텔레비전 ----------------
    const tv = pick(9, 36.5, false);
    if (tv) {
      // 광원을 **집 안**에 두면 안 된다. 그림자를 안 만드는 포인트라이트라 벽을 통과하긴 하는데,
      // 바깥 벽면의 법선은 광원 반대쪽을 보므로 **N·L < 0 = 완전히 캄캄하다**(실측: 밝기 변화 0).
      // 그래서 광원은 장지문 **바로 앞**에 세운다 — 문틀·툇마루·땅이 같이 물들어야 "새어 나온 빛"이다
      const glow = front(tv, 0.34, (tv.floor ?? 0.5) + 1.0);
      this.tvPos.copy(glow);
      this.cluePositions.set('tv', glow.clone());
      const l = new THREE.PointLight(0x86b4ff, 0, 9, 2);
      l.position.copy(glow);
      l.castShadow = false;
      this.group.add(l);
      this.tv = l;
      // 화면이 비치는 문짝 — 장지문 **바깥**에 얹은 밝은 사각형(기본 재질이라 조명과 무관하게 빛난다).
      // 안쪽에 두면 벽에 가려 아무것도 안 보인다
      this.tvCanvas = document.createElement('canvas');
      this.tvCanvas.width = 256; this.tvCanvas.height = 144;
      this.tvContext = this.tvCanvas.getContext('2d');
      this.tvTexture = new THREE.CanvasTexture(this.tvCanvas);
      this.tvTexture.colorSpace = THREE.SRGBColorSpace;
      this.tvTexture.minFilter = THREE.LinearFilter;
      this.tvTexture.magFilter = THREE.LinearFilter;
      this.tvTexture.generateMipmaps = false;
      this.tvScreen = new THREE.MeshBasicMaterial({ map: this.tvTexture, color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.62), this.tvScreen);
      scr.position.copy(front(tv, 0.1, (tv.floor ?? 0.5) + 1.25));
      scr.rotation.y = tv.yaw;
      this.group.add(scr);
    }

    // ---------------- ③ 젖은 게다 ----------------
    const geta = pick(14, 27);
    if (geta) {
      const p = front(geta, 0.72, 0.02);
      this.cluePositions.set('geta', p.clone().add(new THREE.Vector3(0, 0.25, 0)));
      const yaw = geta.yaw + Math.PI;   // 벗어놓은 신발은 **집을 등지고** 놓인다
      const wood = new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 0.24, metalness: 0.02 });
      const strap = new THREE.MeshStandardMaterial({ color: 0x6a1f22, roughness: 0.6 });
      const boxPair: THREE.Group[] = [];
      for (const side of [-0.075, 0.075]) {
        const g = new THREE.Group();
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.022, 0.235), wood);
        sole.position.y = 0.055;
        g.add(sole);
        for (const tz of [-0.06, 0.06]) {  // 굽 두 개(歯)
          const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.02), wood);
          tooth.position.set(0, 0.022, tz);
          g.add(tooth);
        }
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.14), strap);
        v.position.set(0, 0.07, -0.03);
        v.rotation.x = 0.12;
        g.add(v);
        g.position.set(p.x + Math.cos(yaw) * side, p.y, p.z - Math.sin(yaw) * side);
        g.rotation.y = yaw + (side > 0 ? 0.08 : -0.06);   // 나란하지 않게 — 급히 벗었다
        this.group.add(g);
        boxPair.push(g);
        this.getaObjects.push({ object: g, base: g.position.clone() });
      }
      /**
       * 박스 게다 → 공물 4 의 실물(`offer-geta.glb`)로 교체. **같은 모델인 것이 의도다** —
       * 이 현관의 젖은 게다와 ACT 12 의 「아이의 게다」가 같은 물건으로 읽히는 것이
       * 스토리보드의 복선(조사 지문 "아이의 것이다")과 정확히 맞물린다. 크레딧 0.
       * 정규화는 **가장 긴 변** 기준 — 높이 기준을 믿으면 게다가 30 cm 가 된다(§P 교훈 재사용).
       */
      void Props.loadNormalized('/models/props/offer-geta.glb', 1, 0.7).then((tpl) => {
        const bb = new THREE.Box3().setFromObject(tpl);
        const sz = bb.getSize(new THREE.Vector3());
        tpl.scale.setScalar(0.20 / Math.max(sz.x, sz.z));
        if (sz.x > sz.z) tpl.rotation.y = Math.PI / 2;   // 긴 축을 발 방향(로컬 z)으로
        for (const g of boxPair) {
          const m = tpl.clone(true);
          m.name = 'lifesign-geta';
          m.position.copy(g.position);
          m.rotation.y += g.rotation.y;
          this.group.add(m);
          this.getaObjects.push({ object: m, base: m.position.clone() });
          g.visible = false;
          this.applyGetaStage();
        }
      }).catch(() => { /* 모델이 없으면 박스 게다 유지 */ });
      // 젖은 자국 — 게다 밑에서 번져 나온 물. 이게 없으면 그냥 오래된 신발이다
      const wet = new THREE.Mesh(
        new THREE.CircleGeometry(0.34, 18),
        new THREE.MeshStandardMaterial({ color: 0x1a1712, roughness: 0.16, metalness: 0.0, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      wet.rotation.x = -Math.PI / 2;
      wet.position.set(p.x, ground.heightAt(p.x, p.z) + 0.012, p.z);
      this.group.add(wet);
      this.getaWet = wet;
      this.getaWetBase.copy(wet.position);

      // 봉납 2 뒤, 현관에서 골목으로 이어지는 젖은 발자국. 좌우 간격과 크기를 일부러 같지 않게 한다.
      const trail = new THREE.Group();
      const dir = new THREE.Vector2(0.9, 0.65).normalize();
      const side = new THREE.Vector2(-dir.y, dir.x);
      for (let i = 0; i < 7; i++) {
        const foot = new THREE.Mesh(
          new THREE.CircleGeometry(0.105 - i * 0.004, 14),
          new THREE.MeshStandardMaterial({
            color: 0x121315, roughness: 0.12, transparent: true,
            opacity: 0.48 - i * 0.035, depthWrite: false,
          }),
        );
        const along = 0.18 + i * 0.19;
        const lateral = (i % 2 === 0 ? -1 : 1) * 0.055;
        foot.position.set(
          this.getaWetBase.x + dir.x * along + side.x * lateral,
          ground.heightAt(this.getaWetBase.x + dir.x * along, this.getaWetBase.z + dir.y * along) + 0.014,
          this.getaWetBase.z + dir.y * along + side.y * lateral,
        );
        foot.rotation.x = -Math.PI / 2;
        foot.rotation.z = -Math.atan2(dir.x, dir.y);
        foot.scale.set(0.48, 1.0, 1);
        trail.add(foot);
      }
      trail.visible = false;
      this.group.add(trail);
      this.getaTrail = trail;
    }

    // ---------------- ④ 바람이 없는데 흔들리는 풍경 ----------------
    const fu = pick(5, 22, false);
    if (fu) {
      const p = front(fu, (fu.eave ?? 0.9) * 0.6, (fu.floor ?? 0.5) + (fu.wall ?? 2.4) - 0.12);
      const g = new THREE.Group();
      g.position.copy(p);
      const glass = new THREE.MeshStandardMaterial({ color: 0xdfe9e6, roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.72 });
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), glass);
      bell.position.y = -0.05;
      g.add(bell);
      const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.5 }));
      clapper.position.y = -0.085;
      g.add(clapper);
      // 短冊 — 이게 흔들려야 눈에 띈다. 유리종만으로는 밤에 안 보인다
      this.furinPaperCanvas = document.createElement('canvas');
      this.furinPaperCanvas.width = 256; this.furinPaperCanvas.height = 512;
      this.furinPaperTexture = new THREE.CanvasTexture(this.furinPaperCanvas);
      this.furinPaperTexture.colorSpace = THREE.SRGBColorSpace;
      this.drawFurinPaper();
      const paper = new THREE.Mesh(
        new THREE.PlaneGeometry(0.095, 0.22),
        new THREE.MeshStandardMaterial({ map: this.furinPaperTexture, color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }),
      );
      paper.position.y = -0.22;
      g.add(paper);
      this.group.add(g);
      this.furin = g;
      this.furinPos.copy(p);
      this.cluePositions.set('furin', p.clone());
    }

    // ---------------- ⑤ 골목 끝에 서 있는 사람 ----------------
    // 막다른 골목·뒷골목·서쪽 골목의 **종점**. 셋 다 "가면 아무것도 없는" 자리다.
    // 빌보드 실루엣으로 먼저 세우고, 꼬마 유령 실물(`yokai-kodomo`)이 도착하면 갈아 끼운다 —
    // 어른 실루엣(1.66)이 **아이**(1.1)로 줄어드는 것이 이 연출의 승격이다: 골목 끝에 아이가 서 있다
    const tex = silhouetteTexture();
    const watcherSpots: { x: number; z: number; y: number }[] = [];
    for (const id of ['lane-dead', 'lane-back', 'lane-west']) {
      const lane = LANES.find((l) => l.id === id);
      if (!lane) continue;
      const [ex, ez] = lane.pts[lane.pts.length - 1]!;
      const y = ground.heightAt(ex, ez);
      watcherSpots.push({ x: ex, z: ez, y });
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.66), mat);
      m.position.set(ex, y + 0.84, ez);
      m.renderOrder = 5;
      this.group.add(m);
      this.watchers.push({ mesh: m, mats: [mat], pos: m.position.clone(), state: 'hidden', a: 0 });
      if (!this.cluePositions.has('watcher')) this.cluePositions.set('watcher', m.position.clone());
    }
    /**
     * 꼬마 유령 실물 (§9.1 아이 귀신 — 베이스 1 + 배리에이션 2). 스케일·명도가 조금씩 다른
     * 세 아이가 세 골목에 선다. 페이드·시선 로직은 빌보드 시절 그대로 — 재질 목록만 갈아탄다.
     * 그림자는 만들지 않는다(loadNormalized 기본) — 골목 끝의 그것에 그림자가 있으면 실물이 된다.
     */
    void Props.loadNormalized('/models/yokai-kodomo.glb', 1.1, 0.72).then((tpl) => {
      const variants: { s: number; tint: number }[] = [
        { s: 1.0, tint: 1.0 }, { s: 0.93, tint: 0.85 }, { s: 1.06, tint: 0.7 },
      ];
      this.watchers.forEach((w, i) => {
        const v = variants[i % variants.length]!;
        (w.mesh as THREE.Mesh).visible = false;
        const m = tpl.clone(true);
        m.scale.multiplyScalar(v.s);
        const mats: { opacity: number; transparent?: boolean }[] = [];
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mm = (mesh.material as THREE.MeshStandardMaterial).clone();
          if (mm.color) mm.color.multiplyScalar(v.tint);
          mm.transparent = true;
          mm.opacity = 0;
          mm.depthWrite = false;
          mesh.material = mm;
          mesh.renderOrder = 5;
          mats.push(mm);
        });
        const spot = watcherSpots[i]!;
        m.position.set(spot.x, spot.y, spot.z);
        this.group.add(m);
        w.mesh = m;
        w.mats = mats;
      });
    }).catch(() => { /* 모델이 없으면 빌보드 실루엣 유지 */ });

    this.group.name = 'lifesigns';
    scene.add(this.group);
  }

  /**
   * 봉납 뒤 재방문 변화. `Hamlet.setStoryStage`가 마을 전체의 등불·피안화를 바꾸고,
   * 이 메서드는 ACT 4에서 손으로 만졌던 다섯 물건을 바꾼다.
   */
  setStoryStage(stage: number) {
    const prev = this.storyStage;
    this.storyStage = Math.max(this.storyStage, stage);
    if (this.storyStage >= 1) {
      if (this.teaAsh) this.teaAsh.visible = true;
      if (this.tv) this.tv.color.setHex(0xa8b7d8);
      if (this.tvScreen) this.tvScreen.color.setHex(0xb7c0d6);
    }
    if (this.storyStage >= 2) this.applyGetaStage();
    if (prev < 3 && this.storyStage >= 3) {
      if (this.tv) this.tv.color.setHex(0xff2838);
      if (this.tvScreen) this.tvScreen.color.setHex(0xff3946);
      this.drawFurinPaper();
      this.furinT = 0;
      // 처음 사라졌던 아이들도 다른 골목에 다시 선다. 같은 연출의 반복이 아니라
      // 「사라진 뒤 다시 올 수 있다」는 규칙 공개다.
      for (const w of this.watchers) {
        w.state = 'hidden'; w.a = 0;
        for (const m of w.mats) m.opacity = 0;
      }
    }
  }

  private applyGetaStage() {
    if (this.storyStage < 2) return;
    const shift = new THREE.Vector3(0.9, 0, 0.65);
    for (const e of this.getaObjects) e.object.position.copy(e.base).add(shift);
    if (this.getaWet) this.getaWet.position.copy(this.getaWetBase).add(shift);
    if (this.getaTrail) this.getaTrail.visible = true;
    if (!this.getaShifted) {
      this.cluePositions.get('geta')?.add(shift);
      this.getaShifted = true;
    }
  }

  private buildSteam() {
    const N = 14;
    const pos = new Float32Array(N * 3);
    this.steamAge = new Float32Array(N);
    for (let i = 0; i < N; i++) this.steamAge[i] = (i / N) * 2.4;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: softDot(), size: 0.075, transparent: true, opacity: 0.24,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, color: 0xd8dcd4,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    this.steam = pts; this.steamGeo = geo;
  }

  private drawFurinPaper() {
    const c = this.furinPaperCanvas, tex = this.furinPaperTexture;
    if (!c || !tex) return;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    const paper = x.createLinearGradient(0, 0, c.width, c.height);
    paper.addColorStop(0, '#ded2b5'); paper.addColorStop(1, '#a99977');
    x.fillStyle = paper; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = 'rgba(72,48,33,.18)'; x.lineWidth = 2;
    for (let i = 0; i < 13; i++) {
      const yy = 20 + i * 39 + Math.sin(i * 4.1) * 3;
      x.beginPath(); x.moveTo(8, yy); x.lineTo(248, yy + Math.cos(i) * 3); x.stroke();
    }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 62px "Noto Serif KR", "Noto Serif JP", serif';
    x.fillStyle = 'rgba(37,28,28,.82)';
    const lines = L('대답\n하지\n마', '返事を\nするな').split('\n');
    lines.forEach((line, i) => x.fillText(line, 128, 126 + i * 104));
    if (this.storyStage >= 3) {
      x.save();
      x.translate(132, 338); x.rotate(-0.08);
      x.font = '700 58px "Noto Serif KR", "Noto Serif JP", serif';
      x.fillStyle = 'rgba(125,8,17,.92)';
      x.shadowColor = 'rgba(80,0,4,.55)'; x.shadowBlur = 7;
      x.fillText(L('미오야.', 'ミオ。'), 0, 0);
      x.restore();
      // 젖은 붉은 먹이 아래로 번진다.
      const drip = x.createLinearGradient(0, 365, 0, 510);
      drip.addColorStop(0, 'rgba(115,4,12,.30)'); drip.addColorStop(1, 'rgba(115,4,12,0)');
      x.fillStyle = drip; x.fillRect(80, 360, 8, 142); x.fillRect(174, 360, 5, 105);
    }
    tex.needsUpdate = true;
  }

  /** 낡은 화면은 8 fps로만 갱신한다. 봉납 뒤부터 화면 속 아이가 미오의 이동을 늦게 따라온다. */
  private drawTv(player: THREE.Vector3) {
    const x = this.tvContext, c = this.tvCanvas, tex = this.tvTexture;
    if (!x || !c || !tex) return;
    x.fillStyle = this.storyStage >= 3 ? '#29060c' : '#17202a';
    x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 38; i++) {
      const yy = Math.random() * c.height;
      const a = 0.025 + Math.random() * 0.12;
      x.fillStyle = `rgba(${this.storyStage >= 3 ? '255,45,61' : '165,198,220'},${a})`;
      x.fillRect(Math.random() * 28 - 12, yy, c.width * (0.45 + Math.random()), 1 + Math.random() * 3);
    }
    if (this.storyStage >= 1) {
      const target = 128 + THREE.MathUtils.clamp((player.x - this.tvPos.x) * 4.5, -58, 58);
      this.tvGhostX += (target - this.tvGhostX) * 0.18; // 현재보다 한 박자 늦는 화면
      const gx = this.tvGhostX;
      x.save();
      x.translate(gx, 9);
      x.globalAlpha = this.storyStage >= 3 ? 0.88 : 0.68;
      x.fillStyle = this.storyStage >= 3 ? '#160006' : '#071015';
      // 긴 머리, 머리, 어깨 — 플레이어 모델을 복사하지 않아도 ‘같은 아이’로 읽히는 최소 형상.
      x.beginPath(); x.ellipse(0, 33, 19, 24, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.moveTo(-19, 28); x.quadraticCurveTo(-25, 71, -17, 102);
      x.lineTo(17, 102); x.quadraticCurveTo(25, 71, 19, 28); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(-16, 78); x.quadraticCurveTo(-38, 90, -43, 133);
      x.lineTo(43, 133); x.quadraticCurveTo(38, 90, 16, 78); x.closePath(); x.fill();
      if (this.storyStage >= 3) {
        x.strokeStyle = 'rgba(255,52,69,.72)'; x.lineWidth = 2; x.stroke();
        // 미오 뒤에 화면에만 존재하는 두 번째 얼굴.
        x.globalAlpha = 0.48; x.fillStyle = '#e6ccd0';
        x.beginPath(); x.ellipse(28, 45, 11, 15, 0.08, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#250108'; x.fillRect(23, 43, 3, 2); x.fillRect(31, 43, 3, 2);
      }
      x.restore();
    }
    x.fillStyle = this.storyStage >= 3 ? 'rgba(255,120,130,.72)' : 'rgba(215,230,238,.55)';
    x.font = '12px monospace'; x.textAlign = 'left';
    x.fillText('18:12', 9, 136);
    // CRT 스캔라인
    x.fillStyle = 'rgba(0,0,0,.18)';
    for (let yy = 0; yy < c.height; yy += 4) x.fillRect(0, yy, c.width, 1);
    tex.needsUpdate = true;
  }

  update(dt: number, player: THREE.Vector3, camera: THREE.Camera) {
    this.t += dt;

    // ① 김 — 2.4 초에 걸쳐 올라가며 옆으로 퍼진다. 20 m 밖에서는 돌리지 않는다
    if (this.steam && this.steamGeo) {
      const near = this.steamPos.distanceTo(player) < 20;
      const steaming = near && this.storyStage < 1;
      this.steam.visible = steaming;
      if (steaming) {
        const arr = this.steamGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < this.steamAge.length; i++) {
          let a = this.steamAge[i]! + dt;
          if (a > 2.4) a -= 2.4;
          this.steamAge[i] = a;
          const u = a / 2.4;
          // 위로 갈수록 흩어진다 — 곧게 올라가면 연기가 아니라 막대다
          const sway = Math.sin(this.t * 1.3 + i * 2.1) * 0.035 * u;
          arr.setXYZ(i,
            this.steamPos.x + sway,
            this.steamPos.y + u * 0.42,
            this.steamPos.z + Math.cos(this.t * 1.1 + i * 1.7) * 0.03 * u);
        }
        arr.needsUpdate = true;
        (this.steam.material as THREE.PointsMaterial).opacity = 0.26;
      }
    }

    // ② 텔레비전 — 잡음 화면은 밝기가 **불규칙하게** 튄다. 사인파로 흔들면 숨쉬는 조명이 된다
    if (this.tv) {
      const d = this.tvPos.distanceTo(player);
      const want = d < 22;
      if (want !== this.tvOn) { this.tvOn = want; this.sfx.tvStatic(want, this.tvPos.x, this.tvPos.y, this.tvPos.z); }
      const n = want
        ? 0.55 + 0.45 * (Math.sin(this.t * 21.3) * Math.sin(this.t * 7.7) * Math.sin(this.t * 3.1) * 0.5 + 0.5)
        : 0;
      const corruption = this.storyStage >= 3 ? 1.3 : this.storyStage >= 1 ? 0.72 : 1;
      this.tv.intensity = n * 3.4 * corruption;
      if (this.tvScreen) this.tvScreen.opacity = n * (this.storyStage >= 3 ? 0.88 : 0.7);
      if (want) {
        this.tvFrameT -= dt;
        if (this.tvFrameT <= 0) { this.tvFrameT = 0.125; this.drawTv(player); }
      }
    }

    // ④ 풍경 — **바람이 없는데** 흔들린다. 그래서 흔들림이 바람처럼 불규칙하면 안 된다:
    // 누가 건드린 것처럼 한 번 크게 흔들리고 잦아든다
    if (this.furin) {
      const d = this.furinPos.distanceTo(player);
      if (d < 24) {
        this.furinT -= dt;
        if (this.furinT <= 0) {
          this.furinT = this.storyStage >= 3 ? 2.2 + Math.random() * 2.2 : 7 + Math.random() * 7;
          this.swing = 1;
          this.sfx.furin(this.furinPos.x, this.furinPos.y, this.furinPos.z, 0.55);
        }
        if (this.swing > 0) {
          this.swing = Math.max(0, this.swing - dt * 0.42);
          const a = this.swing * 0.34;
          this.furin.rotation.z = Math.sin(this.t * 7.4) * a;
          this.furin.rotation.x = Math.cos(this.t * 6.1) * a * 0.6;
        }
      }
    }

    // ⑤ 골목 끝 사람 — 시야 안에 있으면 서 있고, 시야에서 벗어나면 **그걸로 끝이다**
    if (this.watchers.length) {
      this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projView);
      for (const w of this.watchers) {
        if (w.state === 'gone') continue;
        const d = w.pos.distanceTo(player);
        const seen = this.frustum.containsPoint(w.pos);
        if (w.state === 'hidden') {
          // 너무 가까우면 나타나지 않는다 — 골목 **끝**에 서 있어야 하는 존재다
          if (seen && d > 9 && d < 30) w.state = 'showing';
        } else {
          if (!seen) {
            // 시선을 돌렸다 — **다 보였을 때만** 사라진다. 스쳐 지나가느라 반쯤 떠 있던 것을
            // 없애 버리면 플레이어는 아무것도 못 본 채 한 번뿐인 연출을 잃는다
            if (w.a >= 0.85) {
              w.state = 'gone'; for (const mm of w.mats) mm.opacity = 0;
              if (d < 26) this.sfx.nopperaVanish();
            } else { w.state = 'hidden'; for (const mm of w.mats) mm.opacity = 0; }
            w.a = 0;
            continue;
          }
          if (d < 6) { w.state = 'gone'; w.a = 0; for (const mm of w.mats) mm.opacity = 0; continue; }
          w.a = Math.min(1, w.a + dt * 1.6);
          // 멀수록 흐리다 — 안개 속에 서 있는 것으로 읽혀야 한다
          const op = w.a * THREE.MathUtils.clamp((30 - d) / 16, 0.15, 0.62);
          for (const mm of w.mats) mm.opacity = op;
          // 늘 이쪽을 본다
          this.tmp.copy(camera.position).sub(w.pos);
          w.mesh.rotation.y = Math.atan2(this.tmp.x, this.tmp.z);
        }
      }
    }
  }
}

/** 사람 실루엣 — 얼굴은 그리지 않는다. 골목 끝에서 보이는 건 형체뿐이다 */
function silhouetteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 256;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, 96, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(206,210,216,0.95)');
  g.addColorStop(0.72, 'rgba(150,156,166,0.8)');
  g.addColorStop(1, 'rgba(120,126,136,0.0)');   // 발밑은 어둠에 잠긴다
  x.fillStyle = g;
  // 머리
  x.beginPath(); x.ellipse(48, 34, 16, 19, 0, 0, Math.PI * 2); x.fill();
  // 어깨~몸통 (아래로 갈수록 넓어지는 기모노 실루엣)
  x.beginPath();
  x.moveTo(30, 62); x.quadraticCurveTo(48, 52, 66, 62);
  x.lineTo(76, 224); x.lineTo(20, 224); x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 부드러운 점 — 김 파티클용 */
function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
