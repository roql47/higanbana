import * as THREE from 'three';
import { Props } from '@/world/props';
import { normalize } from './village/landmarks';

/**
 * 버스 창밖 — **실제 3D 풍경이 흘러간다** (ACT 2a).
 *
 * 전에는 캔버스로 그린 톱니 실루엣 두 줄을 UV 로 흘렸다. 멀리서 스치면 통하지만
 * 창가에 앉아 35 초를 보는 장면에서는 **벽지가 미끄러지는 것**으로 읽힌다 —
 * 나무에 두께가 없고, 지나가는 물체 사이에 시차가 없고, 무엇보다 *지나가지 않는다*.
 *
 * ## 컨베이어
 * 버스는 서 있고 세상이 움직인다. 물체마다 z 를 하나씩 갖고 매 프레임 뒤로 밀되,
 * 뒤로 `SPAN` 만큼 빠지면 앞으로 되돌린다. 레인마다 **속도 배율**이 달라 시차가 생긴다:
 * 길가(1.0) → 삼나무 앞줄(1.0) → 뒷줄(1.0, 대신 멀다) → 능선(0.05).
 * *같은 속도로 움직여도 멀면 느려 보인다* — 시차를 만드는 건 배율이 아니라 **거리**다.
 * 능선만 배율을 따로 두는 이유는, 진짜 산은 몇 킬로 밖이라 그 거리를 세트로 만들 수 없기 때문이다.
 *
 * ## 무엇이 있는가
 *  · 아스팔트 노면 + 갓길 자갈 + 중앙선(끊긴 흰 선이 흘러간다 — 속도가 가장 잘 읽히는 물건)
 *  · 가드레일(구간별로 끊긴다) · 전신주(전선이 늘어져 처진다) · 길가 덤불
 *  · 삼나무 두 줄(가까운 줄은 크고 성기게, 먼 줄은 작고 빽빽하게)
 *  · 원경 능선 두 겹 — 판이 아니라 **실제 굴곡을 가진 메시**다. 안개가 색을 먹는다
 *
 * 좌표계는 버스 로컬: **+z 가 진행 방향**, y 0 이 차체 바닥, 노면은 y −1.05.
 */

/** 컨베이어 한 바퀴 길이(m). 11 m/s 에서 약 12 초 — 창 하나를 보는 시간보다 길다 */
const SPAN = 132;
/** 노면 높이 (차체 바닥 기준) */
const ROAD_Y = -1.05;

interface Item {
  obj: THREE.Object3D;
  z: number;
  /** 흐름 배율 — 능선처럼 아주 먼 것만 1 보다 작다 */
  rate: number;
}

export class BusOutside {
  readonly group = new THREE.Group();
  private items: Item[] = [];
  private rng = seeded(20261);
  /**
   * GLB 가 도착하면 안이 갈리는 **소켓**들. 오브젝트를 통째로 바꾸지 않고 소켓의 자식만 바꾼다 —
   * 전신주를 통째로 갈았더니 같은 그룹에 있던 **전선이 같이 사라졌다**(실측).
   * 소켓 밖에 둔 것(전선·기둥 밑동 등)은 무엇으로 갈아도 남는다.
   */
  private slots: { pole: THREE.Group[]; rail: THREE.Group[]; treeNear: THREE.Group[]; treeFar: THREE.Group[] } =
    { pole: [], rail: [], treeNear: [], treeFar: [] };

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    this.buildGround();
    this.buildRoadMarks();
    this.buildRoadside();
    this.buildTrees();
    this.buildFarmland();
    this.buildRidges();
  }

  // ---------------------------------------------------------------- 지면

  /** 노면·갓길·들판. 이건 흐르지 않는다 — 특징이 없어 흘려도 티가 안 나고, 그 위의 물건들이 속도를 만든다 */
  private buildGround() {
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x4c4b48, roughness: 0.95 });
    const gravel = new THREE.MeshStandardMaterial({ color: 0x6a6152, roughness: 1 });
    const field = new THREE.MeshStandardMaterial({ color: 0x55603c, roughness: 1 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7.2, SPAN * 2), asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.y = ROAD_Y;
    this.group.add(road);
    for (const side of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, SPAN * 2), gravel);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(side * 4.4, ROAD_Y + 0.01, 0);
      this.group.add(sh);
      // 들판 — 갓길 밖. 나무 줄 아래를 받쳐 준다
      const f = new THREE.Mesh(new THREE.PlaneGeometry(70, SPAN * 2), field);
      f.rotation.x = -Math.PI / 2;
      f.position.set(side * 40, ROAD_Y - 0.06, 0);
      this.group.add(f);
    }
  }

  /** 중앙선 — 끊긴 흰 선. **속도를 가장 정직하게 말해 주는 물건**이라 제일 먼저 만든다 */
  private buildRoadMarks() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9 });
    const geo = new THREE.PlaneGeometry(0.14, 3.2);
    const N = Math.round(SPAN / 8);
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = ROAD_Y + 0.02;
      this.add(m, -SPAN / 2 + i * (SPAN / N), 1);
    }
  }

  // ---------------------------------------------------------------- 길가

  private buildRoadside() {
    // --- 가드레일: 4 m 구간이 이어지다 **끊긴다**. 계속 이어지면 벽이 된다 ---
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb8b4a6, roughness: 0.72, metalness: 0.25 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8c8878, roughness: 0.8, metalness: 0.2 });
    for (let z = -SPAN / 2; z < SPAN / 2; z += 4) {
      // 구간 세 개마다 하나는 비운다
      if (this.rng() < 0.32) continue;
      const g = new THREE.Group();
      const sock = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 3.9), railMat);
      beam.position.y = 0.62;
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.78, 6), postMat);
      p1.position.set(0, 0.39, -1.85);
      const p2 = p1.clone(); p2.position.z = 1.85;
      sock.add(beam, p1, p2);
      g.add(sock);
      g.position.set(-5.1, ROAD_Y, 0);
      this.add(g, z, 1);
      this.slots.rail.push(sock);
    }

    // --- 전신주: 22 m 간격, 좌우 번갈아. 전선이 다음 기둥까지 **처진다** ---
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x9a9691, roughness: 0.92 });
    const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.75 });
    let side = 1;
    for (let z = -SPAN / 2; z < SPAN / 2; z += 22) {
      const g = new THREE.Group();
      const sock = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 8.4, 7), poleMat);
      pole.position.y = 4.2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), poleMat);
      arm.position.y = 7.5;
      sock.add(pole, arm);
      g.add(sock);
      // 전선 — 카테너리(늘어진 곡선). 직선으로 그으면 빨래줄이 된다
      for (const off of [-0.55, 0.55]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const u = i / 10;
          pts.push(new THREE.Vector3(off, 7.5 - Math.sin(u * Math.PI) * 1.15, u * 22));
        }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      }
      g.position.set(side * 5.9, ROAD_Y, 0);
      this.add(g, z, 1);
      this.slots.pole.push(sock);
      side = -side;
    }

    // --- 갓길 덤불 — 창 바로 밖을 스친다. 속도감의 절반이 여기서 나온다 ---
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x46512e, roughness: 1, flatShading: true });
    for (let i = 0; i < 46; i++) {
      const s = 0.45 + this.rng() * 0.5;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), bushMat);
      b.scale.set(1, 0.65 + this.rng() * 0.3, 1);
      b.rotation.set(this.rng(), this.rng() * 6.28, this.rng());
      b.position.set((this.rng() < 0.5 ? -1 : 1) * (5.0 + this.rng() * 1.4), ROAD_Y + s * 0.4, 0);
      this.add(b, -SPAN / 2 + this.rng() * SPAN, 1);
    }
  }

  // ---------------------------------------------------------------- 나무

  /**
   * 삼나무 두 줄. 자리표시자는 **원뿔**이다 — GLB 가 오면 갈아끼운다.
   * 앞줄은 크고 성기게(창을 순간적으로 가린다), 뒷줄은 작고 빽빽하게(벽을 만든다).
   */
  private buildTrees() {
    const trunk = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1 });
    const leafNear = new THREE.MeshStandardMaterial({ color: 0x2c3a22, roughness: 1, flatShading: true });
    const leafFar = new THREE.MeshStandardMaterial({ color: 0x38452c, roughness: 1, flatShading: true });
    const mkCedar = (h: number, leaf: THREE.Material) => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.022, h * 0.04, h * 0.42, 6), trunk);
      t.position.y = h * 0.21;
      g.add(t);
      // 삼나무는 원뿔 하나가 아니라 **위로 갈수록 좁아지는 원뿔 세 겹**이다
      for (let i = 0; i < 3; i++) {
        const u = i / 3;
        const c = new THREE.Mesh(new THREE.ConeGeometry(h * (0.20 - u * 0.055), h * 0.34, 7), leaf);
        c.position.y = h * (0.30 + u * 0.24);
        c.rotation.y = i * 0.7;
        g.add(c);
      }
      return g;
    };
    // 앞줄 — 길에서 9~14 m
    for (let i = 0; i < 26; i++) {
      const side = this.rng() < 0.5 ? -1 : 1;
      const h = 9 + this.rng() * 7;
      const sock = new THREE.Group();
      sock.add(mkCedar(h, leafNear));
      sock.position.set(side * (9 + this.rng() * 5), ROAD_Y, 0);
      sock.rotation.y = this.rng() * 6.28;
      this.add(sock, -SPAN / 2 + this.rng() * SPAN, 1);
      this.slots.treeNear.push(sock);
    }
    // 뒷줄 — 20~34 m. 빽빽해서 그 너머가 안 보인다
    for (let i = 0; i < 34; i++) {
      const side = this.rng() < 0.5 ? -1 : 1;
      const h = 7 + this.rng() * 6;
      const sock = new THREE.Group();
      sock.add(mkCedar(h, leafFar));
      sock.position.set(side * (20 + this.rng() * 14), ROAD_Y - 0.3, 0);
      sock.rotation.y = this.rng() * 6.28;
      this.add(sock, -SPAN / 2 + this.rng() * SPAN, 1);
      this.slots.treeFar.push(sock);
    }
  }

  // ---------------------------------------------------------------- 논밭

  /**
   * 논·커브미러·농막. 나무와 가드레일만 있으면 **어느 나라 산길이든** 될 수 있다 —
   * 여기가 일본 시골이라는 건 이 셋이 말한다:
   *  · 물을 댄 논이 길 옆까지 와 있다 (하늘을 비추므로 창밖에서 유일하게 밝은 면이다)
   *  · 커브마다 주황색 반사경이 서 있다
   *  · 논 사이에 함석 농막이 하나씩
   */
  private buildFarmland() {
    const water = new THREE.MeshStandardMaterial({ color: 0x7d8a8c, roughness: 0.12, metalness: 0.35 });
    const bund = new THREE.MeshStandardMaterial({ color: 0x5a4f3a, roughness: 1 });
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const w = 12 + this.rng() * 10, len = 14 + this.rng() * 12;
      const g = new THREE.Group();
      // ⚠️ 수면은 들판(ROAD_Y − 0.06)보다 **위**여야 한다. 논이 낮다고 −0.28 에 뒀더니
      //    들판에 묻혀 흙둑만 남고 물이 통째로 안 보였다(실측) — 논은 물이 보여야 논이다
      const w1 = new THREE.Mesh(new THREE.PlaneGeometry(w, len), water);
      w1.rotation.x = -Math.PI / 2;
      w1.position.y = 0.02;
      g.add(w1);
      // 흙둑 — 물을 가두는 테두리. 수면 위로 올라와야 논이 칸으로 나뉘어 보인다
      for (const [dx, dz, sx, sz] of [[0, len / 2, w, 0.55], [0, -len / 2, w, 0.55], [w / 2, 0, 0.55, len], [-w / 2, 0, 0.55, len]] as [number, number, number, number][]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.4, sz), bund);
        m.position.set(dx, 0.16, dz);
        g.add(m);
      }
      g.position.set(side * (13 + this.rng() * 9), ROAD_Y, 0);
      this.add(g, -SPAN / 2 + this.rng() * SPAN, 1);
    }

    // --- 커브 반사경 (道路反射鏡) ---
    const poleO = new THREE.MeshStandardMaterial({ color: 0xd8722a, roughness: 0.75 });
    const mirrorM = new THREE.MeshStandardMaterial({ color: 0xa8b4bc, roughness: 0.18, metalness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const side = this.rng() < 0.5 ? -1 : 1;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.6, 8), poleO);
      pole.position.y = 1.3;
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 16), poleO);
      back.rotation.x = Math.PI / 2;
      back.position.set(0, 2.55, 0.05);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.39, 16), mirrorM);
      face.position.set(0, 2.55, 0.0);
      face.rotation.y = Math.PI;
      g.add(pole, back, face);
      g.position.set(side * 5.4, ROAD_Y, 0);
      g.rotation.y = side > 0 ? 0.5 : -0.5;
      this.add(g, -SPAN / 2 + this.rng() * SPAN, 1);
    }

    // --- 농막 — 함석 지붕 창고. 논 사이에 하나씩 ---
    const tin = new THREE.MeshStandardMaterial({ color: 0x6e6a5e, roughness: 0.6, metalness: 0.3 });
    const wallM = new THREE.MeshStandardMaterial({ color: 0x746a58, roughness: 0.95 });
    for (let i = 0; i < 5; i++) {
      const side = this.rng() < 0.5 ? -1 : 1;
      const w = 3.4 + this.rng() * 2.4, dep = 3 + this.rng() * 2;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 2.3, dep), wallM);
      body.position.y = 1.15;
      // 한쪽으로 흘러내리는 함석 지붕 (편경사) — 맞배지붕보다 농막에 흔하다
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.09, dep + 0.5), tin);
      roof.position.y = 2.4;
      roof.rotation.z = 0.16;
      g.add(body, roof);
      g.position.set(side * (26 + this.rng() * 14), ROAD_Y, 0);
      g.rotation.y = this.rng() * 6.28;
      this.add(g, -SPAN / 2 + this.rng() * SPAN, 1);
    }
  }

  // ---------------------------------------------------------------- 능선

  /**
   * 원경 능선 — **판이 아니라 굴곡을 가진 메시**다. 스카이돔 앞에 세워 두면
   * 안개가 색을 먹어 대기 원근이 생긴다. 아주 느리게(0.05) 흘러 "멀다"를 만든다.
   */
  private buildRidges() {
    const mk = (dist: number, height: number, color: number, seed: number, rate: number) => {
      const rnd = seeded(seed);
      const seg = 72, len = SPAN * 2;
      // **능선은 연속된 선이다.** 구간마다 독립된 사각형을 세웠더니 도시 스카이라인이 됐다(실제로 그랬다).
      // 꼭짓점 높이를 먼저 뽑아 두고 이웃끼리 이어야 산이 된다.
      // 큰 사인(산봉우리) + 작은 사인(능선 굴곡) + 잡음(바위) — 세 겹이라야 산처럼 보인다
      const hs: number[] = [];
      for (let i = 0; i <= seg; i++) {
        const u = (i / seg) * Math.PI * 2;
        const base = 0.55 + Math.sin(u * 1.3 + rnd() * 0.01) * 0.28 + Math.sin(u * 3.7) * 0.12;
        hs.push(Math.max(height * 0.18, height * (base + (rnd() - 0.5) * 0.10)));
      }
      hs[seg] = hs[0]!;   // 컨베이어라 양 끝이 이어져야 한다
      const pos: number[] = [];
      for (let i = 0; i < seg; i++) {
        const z0 = -len / 2 + (len / seg) * i;
        const z1 = z0 + len / seg;
        const h0 = hs[i]!, h1 = hs[i + 1]!;
        pos.push(z0, 0, 0, z1, 0, 0, z1, h1, 0);
        pos.push(z0, 0, 0, z1, h1, 0, z0, h0, 0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        m.position.set(side * dist, ROAD_Y - 1, 0);
        m.renderOrder = -1;
        this.add(m, 0, rate);
      }
    };
    mk(85, 26, 0x5c6a72, 771, 0.10);   // 가까운 능선 — 아직 초록이 남아 있다
    mk(150, 42, 0x7d8b95, 913, 0.04);  // 먼 능선 — 안개색에 가깝다
  }

  // ---------------------------------------------------------------- 공통

  private add(obj: THREE.Object3D, z: number, rate: number): Item {
    obj.position.z = z;
    this.group.add(obj);
    const it = { obj, z, rate };
    this.items.push(it);
    return it;
  }

  /**
   * Tripo GLB 로 자리표시자를 갈아끼운다 — 삼나무·전신주·가드레일.
   * 실패해도 프리미티브가 그대로 남으므로 창밖이 비지 않는다.
   */
  async load() {
    const loader = Props.loader();
    /** 소켓 안을 GLB 로 교체. 소켓의 위치·회전은 그대로이므로 배치는 한 곳(생성부)에만 있다 */
    const swap = async (url: string, sockets: THREE.Group[], height: () => number, yaw = true) => {
      const g = await loader.loadAsync(url);
      for (const sock of sockets) {
        const c = normalize(g.scene.clone(true), height());
        for (const child of [...sock.children]) { sock.remove(child); disposeTree(child); }
        if (yaw) sock.rotation.y = Math.random() * 6.28;
        sock.add(c);
      }
    };
    // 삼나무 — 앞줄은 본품질, 뒷줄은 저폴리
    await Promise.allSettled([
      swap('/models/props/cedar-a.glb', this.slots.treeNear, () => 9 + Math.random() * 7),
      swap('/models/props/cedar-far.glb', this.slots.treeFar, () => 7 + Math.random() * 6),
      swap('/models/props/utility-pole.glb', this.slots.pole, () => 8.4, false),
      swap('/models/props/guardrail.glb', this.slots.rail, () => 0.8, false),
    ]);
  }

  /** @param speed 버스 속도(m/s) — 0 이면 세상이 멈춘다 */
  update(dt: number, speed: number) {
    if (speed <= 0.001) return;
    const d = speed * dt;
    for (const it of this.items) {
      it.z -= d * it.rate;
      if (it.z < -SPAN / 2) it.z += SPAN;
      it.obj.position.z = it.z;
    }
  }
}

/** 결정적 난수 — 창밖 배치는 매번 같아야 컷을 다시 잡을 수 있다 */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; };
}

/**
 * 자리표시자를 버린다. **재질은 건드리지 않는다** — 나무·가드레일·전신주는 재질을
 * 서로 공유하므로 하나를 dispose 하면 아직 남아 있는 나머지가 통째로 깨진다
 * (실측: three 내부에서 `Cannot read properties of undefined (reading 'isReady')`).
 * 지오메트리는 개체마다 새로 만들었으므로 그것만 버린다.
 */
function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.geometry?.dispose();
  });
}
