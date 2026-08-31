import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import { Props } from '@/world/props';
import type { VillageGround } from './ground';

/**
 * 무연불 묘지(無縁仏) — 뒷산 오솔길 옆, 돌보는 이가 없어 기운 묘석들.
 *
 * 뒷산길은 가장 길고 어두운 길이다. 그 길을 고를 **이유**가 없으면 아무도 안 간다.
 * 여기에 랜드마크를 두어 "저기까지 가면 절반은 온 것"이라는 좌표를 준다.
 *
 * 동시에 **시야를 무릎 높이에서 끊는다** — 대숲이 서서 막는다면 묘석은 웅크렸을 때 막는다.
 * 웅크려 이동하면 묘석 사이로 몸이 가려지지만, 그만큼 느리다.
 *
 * 기준은 거리다. 그런데 이 묘지는 **지나가는 풍경이 아니라 지나가는 길**이다 — 웅크려 묘석
 * 사이로 숨는 곳이라 플레이어가 돌을 코앞에서 본다. 그래서 묘석 두 종(판형·자연석)은 Tripo
 * 모델로 바꿨다. 배치·기울기·콜라이더는 그대로고, `InstancedMesh` 의 지오메트리만 갈아 끼운다 —
 * 로드가 늦거나 실패해도 절차적 돌이 이미 서 있으므로 묘지는 어느 쪽이든 성립한다.
 */
/** 꽃잎 인스턴스 상한 — 아이 셋 × 26 장에 여유. 링버퍼라 넘치면 오래된 것부터 재활용된다 */
const PETAL_MAX = 96;
/**
 * 기둥형 묘석의 기준 높이(m). 인스턴스 스케일 0.8~1.4 를 받아 **1.24~2.17 m** 가 된다.
 * 높은 돌은 전체의 약 1/3만 둔다. 나머지는 낮은 판형·자연석으로 비워야 이동 경로가 읽히고,
 * 드물게 눈높이를 넘는 돌만 강한 시야 차단물로 기능한다.
 * 절차 지오메트리와 Tripo 교체본이 **같은 값을 봐야** 한다(안 그러면 돌만 커진다).
 */
const TALL_GRAVE_H = 1.55;
/**
 * 밭 바깥에 따로 서는 **서사 묘석** 수 — 아이 무덤(ACT 12 공물 자리) + 붉은 천 표식 묘석.
 * 이 둘을 만드는 곳이 여기이므로 수도 여기서 센다. 호출부가 「희생자 총수」로 묘석을 맞출 때
 * 이 값을 빼야 하므로 export 한다 — 양쪽에 2 를 따로 적어 두면 한쪽만 바뀐다.
 */
export const NARRATIVE_GRAVES = 2;

export class Graveyard {
  readonly group = new THREE.Group();
  readonly center = new THREE.Vector3();
  readonly count: number;
  /** 이름이 지워진 아이 무덤 — 게다가 놓인 자리 (ACT 12 의 목적지) */
  readonly getaPos = new THREE.Vector3();
  /** 미로가 한 바퀴 돌았다 — 연출은 main 이 (웃음소리·안개) */
  onLoop: ((n: number) => void) | null = null;
  private childGhosts: THREE.Group[] = [];
  private childMat: THREE.MeshStandardMaterial;
  /** 실물 꼬마 유령의 재질들 — 절차 실루엣과 **같은 haunt 값**으로 함께 페이드된다 */
  private childFadeMats: THREE.MeshStandardMaterial[] = [];
  private decoyMat: THREE.MeshBasicMaterial;
  private decoys: THREE.Mesh[] = [];
  private hauntTarget = 0;
  private haunt = 0;
  private hauntT = 0;
  private mazeOn = false;
  private loopR: number;
  private loopCount = 0;
  private loopCooldown = 0;
  /** 흩어지지 않고 남은 아이의 인덱스 (−1 = 없음) */
  private keepIdx = -1;
  private approachOn = false;
  private petals!: { mesh: THREE.InstancedMesh; pos: Float32Array; vel: Float32Array; life: Float32Array; spin: Float32Array };
  private petalNext = 0;
  private petalDummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, physics: Physics, private ground: VillageGround, opts: {
    center: THREE.Vector3; radius?: number; target?: number;
    /** 다른 부지 — 여기엔 묘석을 놓지 않는다 (할머니의 집·피안화 군락 등) */
    exclude?: { x: number; z: number; w: number; d: number }[];
  }) {
    // 반경은 호출부가 서사의 규모에 맞춘다. 어떤 크기든 초칭 사거리보다 넓어야 가장자리가 어둠에 잠긴다.
    const R = opts.radius ?? 20;
    /**
     * 밭에 뿌릴 수. 호출부가 서사의 수를 갖고 있으면 그쪽이 정한다(히가사토는 참사 87명에서
     * `NARRATIVE_GRAVES` 를 뺀다). 없으면 반경에서 유도 — 예전엔 118 로 고정돼 있어서 반경이
     * 커진 뒤에도 10.6 m²/기까지 성겨졌고, 반대로 개수만 올리면 구 마을 맵(반경 13)에서 돌이 겹쳤다
     */
    const target = opts.target ?? Math.round((Math.PI * R * R) / 6.6);
    const exclude = opts.exclude ?? [];
    this.center.copy(opts.center);
    this.loopR = R - Math.min(2.2, R * 0.12); // 초칭 끝보다 바깥에서 접어야 루프 이음매가 빛에 드러나지 않는다
    this.group.name = 'graveyard';

    // 묘석 격자 — 간격은 고정, 칸 수는 밭을 덮을 만큼만
    const GRID_X = 2.25, GRID_Z = 2.5;
    const GRID_COLS = Math.ceil((2 * R) / GRID_X);
    const GRID_ROWS = Math.ceil((2 * R) / GRID_Z);
    // 같은 격자 칸을 여러 번 뽑던 구 배치는 1 m 안에 묘석이 겹치는 군집을 만들었다.
    // 한 칸에 한 기만 허용하고, 중앙 제의 공간과 두 서사 묘석 주변도 비운다.
    const usedCells = new Set<string>();
    const GETA_A = -Math.PI * 0.28;
    const getaReserveX = this.center.x + Math.cos(GETA_A) * R * 0.62;
    const getaReserveZ = this.center.z + Math.sin(GETA_A) * R * 0.62;
    const markReserveA = GETA_A + Math.PI * 0.86;
    const markReserveX = this.center.x + Math.cos(markReserveA) * R * 0.5;
    const markReserveZ = this.center.z + Math.sin(markReserveA) * R * 0.5;

    const rng = seeded(6931);
    // 밤에 초칭을 받으면 돌은 금방 하얗게 뜬다 — 화강암 반사율(0.35 안팎)보다 훨씬 낮게 깎아 둔다
    const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });

    /**
     * --- 묘석: 세 종류를 인스턴싱 (기둥형 각塔婆 / 판형 / 뭉툭한 자연석) ---
     *
     * ⚠️ 기둥형의 높이 1.05 m 는 **너무 낮았다**. 스케일 최대(1.4)를 받아도 1.47 m 라
     * **한 기도 미오(1.62 m)보다 크지 않았고**, 그래서 밭 한가운데 서면 가장자리까지 다 보였다
     * — ACT 12 의 「끝없는 묘열」 미로가 높이에서 무너진 것이다 (2026-08-26 실측).
     * 1.55 m 로 올리면 0.8~1.4 스케일에서 1.24~2.17 m 가 나와 **기둥형 중 절반 이상이 눈높이를 넘는다**.
     * 실제 和型 묘석도 대좌까지 합하면 1.2~2.5 m 다.
     * 판형(0.62)·자연석은 그대로 둔다 — 다 크면 그것대로 벽이 되고 층이 사라진다.
     */
    const kinds = [slabGeo(0.30, TALL_GRAVE_H, 0.20), slabGeo(0.42, 0.62, 0.22), boulderGeo(0.36)];
    const picks: THREE.Matrix4[][] = [[], [], []];
    const dummy = new THREE.Object3D();
    let n = 0, tries = 0;
    while (n < target && tries < target * 40) {
      tries++;
      // 줄을 맞추되 흐트러뜨린다 — 완전 랜덤은 묘지로 안 보이고, 완전 격자는 인공적이다.
      // 간격 2.6×2.9 는 성겼다 → 2.25×2.5. **칸 수는 반경에서 뽑는다** — 고정해 두면 반경이
      // 작은 맵에서 격자가 밭보다 커져 후보가 원 밖으로 새고, 큰 맵에서는 바깥 고리가 빈다
      const row = Math.floor(rng() * GRID_ROWS) - (GRID_ROWS - 1) / 2;
      const col = Math.floor(rng() * GRID_COLS) - (GRID_COLS - 1) / 2;
      const cellKey = `${row}:${col}`;
      if (usedCells.has(cellKey)) continue;
      const x = this.center.x + col * GRID_X + (rng() - 0.5) * 1.1;
      const z = this.center.z + row * GRID_Z + (rng() - 0.5) * 1.1;
      if (Math.hypot(x - this.center.x, z - this.center.z) > R) continue;
      if (Math.hypot(x - this.center.x, z - this.center.z) < 2.6) continue;
      if (Math.hypot(x - getaReserveX, z - getaReserveZ) < 2.2) continue;
      if (Math.hypot(x - markReserveX, z - markReserveZ) < 1.8) continue;
      if (ground.pathDist(x, z) < 2.0) continue;       // 길은 비운다
      if (ground.slopeAt(x, z) > 0.7) continue;
      // 이웃 부지 침범 금지 — 넓은 묘열이 할머니의 집·피안화 군락까지 닿지 않게 한다.
      // 원을 잘라내면 묘지가 산자락 지형을 따라 흘러 오히려 자연스럽다
      if (exclude.some((e) => Math.abs(x - e.x) < e.w / 2 && Math.abs(z - e.z) < e.d / 2)) continue;
      const h = ground.heightAt(x, z);
      const kindRoll = rng();
      const k = kindRoll < 0.34 ? 0 : kindRoll < 0.76 ? 1 : 2;
      const sc = 0.8 + rng() * 0.6;
      const stoneH = (k === 0 ? TALL_GRAVE_H : k === 1 ? 0.62 : 0.5) * sc;
      // 오래 방치돼 기운다 — 이 기울기가 "돌보는 이가 없다"를 말한다
      const tilt = (rng() - 0.5) * 0.42;
      dummy.position.set(x, h - 0.08, z);
      dummy.rotation.set(tilt, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      picks[k]!.push(dummy.matrix.clone());
      // 콜라이더는 **몸을 가릴 만한 돌에만** 단다. 높이를 돌 종류에서 가져오지 않고 0.9·sc 로
      // 고정해 두었더니, 키운 기둥형(최대 2.17 m)이 1.26 m 짜리 상자만 갖고 있었다
      if (stoneH > 1.0) physics.addStaticBox(new THREE.Vector3(x, h + stoneH / 2, z), new THREE.Vector3(0.22 * sc, stoneH / 2, 0.18 * sc));
      usedCells.add(cellKey);
      n++;
    }
    const instanced: (THREE.InstancedMesh | null)[] = [null, null, null];
    kinds.forEach((geo, i) => {
      const list = picks[i]!;
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, stoneMat, list.length);
      instanced[i] = im;
      list.forEach((m, j) => im.setMatrixAt(j, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false;       // 삼나무·대나무와 같은 이유 (초칭 큐브 그림자 6면)
      im.receiveShadow = true;
      im.frustumCulled = true;
      im.computeBoundingSphere();
      if (im.boundingSphere) im.boundingSphere.radius += 0.25;
      this.group.add(im);
    });

    // --- 한가운데 무연불 석탑: 주인 없는 묘석을 쌓아 올린 무더기 ---
    const stack: THREE.BufferGeometry[] = [];
    let y = 0;
    for (let i = 0; i < 7; i++) {
      const w = 1.05 - i * 0.12, hh = 0.26 - i * 0.015;
      const b = new THREE.BoxGeometry(w, hh, w * 0.85);
      b.rotateY(rng() * 0.5);
      b.translate((rng() - 0.5) * 0.12, y + hh / 2, (rng() - 0.5) * 0.12);
      stack.push(b);
      y += hh;
    }
    const cap = new THREE.SphereGeometry(0.24, 8, 6);
    cap.scale(1, 0.8, 1);
    cap.translate(0, y + 0.18, 0);
    stack.push(cap);
    const merged = mergeGeometries(stack, false)!;
    paint(merged, new THREE.Color(0.055, 0.058, 0.052), new THREE.Color(0.155, 0.163, 0.142));
    const tower = new THREE.Mesh(merged, stoneMat);
    const ch = ground.heightAt(this.center.x, this.center.z);
    tower.position.set(this.center.x, ch - 0.05, this.center.z);
    tower.castShadow = false;
    tower.receiveShadow = true;
    this.group.add(tower);
    physics.addStaticBox(new THREE.Vector3(this.center.x, ch + 0.9, this.center.z), new THREE.Vector3(0.6, 0.9, 0.55));
    this.center.y = ch;

    // --- 이름이 지워진 아이 무덤 (ACT 12 공물) ---
    // 진입 방향(북서)의 **반대편**에 둔다 — 들어서자마자 보이면 미로가 성립하지 않는다.
    // 밭 반경의 0.62 지점: 초칭(15 m)으로는 중앙에서 절대 안 보이고, 지장의 시선을 따라가야 닿는다
    // 방위: 진입로(뒷산길)는 +z 쪽에서 내려오고 사당 출구는 −z 쪽, 할머니의 집·피안화는 +x+z 쪽이다.
    // 남은 빈 방향은 **동북(+x, −z)** 하나뿐 — 여기가 아니면 무덤이 이웃 부지 안에 박힌다(실측:
    // 처음 잡은 +0.34π 는 할머니의 집 선반 한가운데였다)
    const GA = GETA_A;
    const gx = this.center.x + Math.cos(GA) * R * 0.62;
    const gz = this.center.z + Math.sin(GA) * R * 0.62;
    const gyH = ground.heightAt(gx, gz);
    this.getaPos.set(gx, gyH, gz);
    // 아이 무덤 — 어른 묘석의 절반 키. 이름 칸이 **정으로 쪼아 지워졌다**.
    // 절차적 돌로 두면 주변이 전부 Tripo 묘석으로 갈린 뒤 **이것만 허옇게 뜬다**(실측: 정점색
    // 상단 0.15 vs 실물 묘석의 어두운 텍스처). 같은 에셋을 작게 쓰는 것이 유일하게 안전한 길이다
    const smallM = new THREE.Mesh(slabGeo(0.30, 0.46, 0.16), stoneMat);
    smallM.position.set(gx, gyH - 0.03, gz);
    smallM.rotation.y = GA + Math.PI;                // 정면이 참배자 쪽
    smallM.receiveShadow = true;
    this.group.add(smallM);
    // 지워진 이름 자국 — 정으로 쪼아낸 자리. 묘석의 정점색(밝아야 0.15)보다 조금만 밝게 둔다:
    // 0x6e6a5e 로 칠했더니 밤에 **묘석보다 큰 흰 판**으로 떴다(실측). 텍스트가 아니라 「없음」이 읽혀야 한다
    const scar = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.17),
      new THREE.MeshStandardMaterial({ color: 0x35322b, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    scar.position.set(gx - Math.cos(GA) * 0.085, gyH + 0.3, gz - Math.sin(GA) * 0.085);
    scar.rotation.y = GA + Math.PI;
    this.group.add(scar);

    // --- 여섯 지장 — 전부 아이 무덤을 본다 (§5.3.4 파훼: 세는 게 아니라 시선을 읽는다) ---
    // 흩어 두되 어느 하나 곁에 서면 그 시선이 다음 지장을 가리키도록 반경을 계단식으로 좁힌다
    // **여섯이 다 서야 한다** — 부채꼴을 무덤 정반대에 걸치면 두 구가 할머니의 집 선반에 박혀
    // 제외되고 넷만 남았다(실측). 이웃이 없는 방위는 서쪽 호(100°~210°)뿐이라 거기에 늘어세운다.
    // 반경을 들쭉날쭉 주는 건 여섯이 한 줄로 보이면 「배치된 소품」이 되기 때문 — 흩어져 있어야
    // 플레이어가 하나씩 마주치며 **같은 곳을 본다**는 것을 스스로 깨닫는다
    const jizoSpots: { x: number; z: number }[] = [];
    const jizoR = [0.78, 0.55, 0.44, 0.70, 0.50, 0.63];
    for (let i = 0; i < 6; i++) {
      const a = (100 + i * 22) * Math.PI / 180;
      const rr = R * jizoR[i]!;
      const jx = this.center.x + Math.cos(a) * rr, jz = this.center.z + Math.sin(a) * rr;
      if (exclude.some((e) => Math.abs(jx - e.x) < e.w / 2 && Math.abs(jz - e.z) < e.d / 2)) continue;
      jizoSpots.push({ x: jx, z: jz });
    }
    void Props.loadNormalized('/models/props/jizo.glb', 1.15, 0.5).then((tpl) => {
      for (const sp of jizoSpots) {
        const m = tpl.clone(true);
        const jy = ground.heightAt(sp.x, sp.z);
        m.position.set(sp.x, jy - 0.02, sp.z);
        // **전부 게다 무덤을 향한다.** normalize() 가 Tripo 정면(+X)을 +Z 로 돌려 두므로 atan2(dx,dz)
        m.rotation.y = Math.atan2(gx - sp.x, gz - sp.z);
        this.group.add(m);
        physics.addStaticBox(new THREE.Vector3(sp.x, jy + 0.58, sp.z), new THREE.Vector3(0.26, 0.58, 0.26));
      }
    }).catch((e) => console.warn('[graveyard] 지장 모델 로드 실패:', e));

    // --- 붉은 천을 감은 묘석 하나 — 루프를 「알아채게」 하는 표식 ---
    // 되돌려질 때마다 같은 돌을 다시 지나친다. 이 돌이 없으면 반복은 그냥 방향 감각 상실이고,
    // 있으면 **「아까 그 돌이다」** 라는 자각이 된다 — 미로를 공포로 만드는 건 그 한 줄이다
    const markA = markReserveA;
    const mkx = this.center.x + Math.cos(markA) * R * 0.5, mkz = this.center.z + Math.sin(markA) * R * 0.5;
    const mky = ground.heightAt(mkx, mkz);
    const markStone = new THREE.Mesh(slabGeo(0.34, 0.9, 0.2), stoneMat);
    markStone.position.set(mkx, mky - 0.04, mkz);
    markStone.rotation.y = markA;
    this.group.add(markStone);
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x7a1a14, roughness: 0.92, side: THREE.DoubleSide });
    for (let i = 0; i < 2; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.13, 10, 1, true), clothMat);
      band.position.set(mkx, mky + 0.52 - i * 0.17, mkz);
      band.rotation.y = markA + i * 0.4;
      this.group.add(band);
    }
    physics.addStaticBox(new THREE.Vector3(mkx, mky + 0.45, mkz), new THREE.Vector3(0.2, 0.45, 0.14));

    // 아이 무덤·표식 묘석을 실물 묘석으로 — 절차 버전은 폴백으로 남긴다(밭 전체와 같은 규칙)
    void Props.loadNormalized('/models/props/grave-slab.glb', 1.0, 0.42).then((tpl) => {
      const put = (proc: THREE.Mesh, h: number, px: number, pz: number, py: number, yaw: number) => {
        const m = tpl.clone(true);
        m.scale.setScalar(h);
        m.position.set(px, py, pz);
        m.rotation.y = yaw;
        this.group.add(m);
        proc.visible = false;
      };
      put(smallM, 0.46, gx, gz, gyH - 0.03, GA + Math.PI);
      put(markStone, 0.9, mkx, mkz, mky - 0.04, markA);
    }).catch((e) => console.warn('[graveyard] 아이 무덤 모델 로드 실패 — 절차 돌 유지:', e));


    // ACT 12 — 공격하지 않는 아이 셋. 인물 모델보다 묘석 사이에서 순간적으로 읽히는
    // 작은 실루엣이 중요하므로 머리·옷자락만 만들고, 묘지를 떠나면 다시 안개처럼 흐려진다.
    this.childMat = new THREE.MeshStandardMaterial({
      color: 0x9ca5a7,
      emissive: new THREE.Color(0x46505a),
      emissiveIntensity: 0.55,
      roughness: 0.8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    // 밭이 반경 20 으로 넓어졌다 — 셋을 중앙에 모아 두면 넓은 바깥이 텅 빈다.
    // 진입로(북서)·중앙·게다 무덤 쪽에 하나씩 걸쳐 어디로 가든 하나는 시야에 든다
    const childPlaces = [
      [-8.4, -6.2, 0.92], [4.6, 2.3, 1.04], [-1.2, 9.8, 0.84],
    ] as const;
    const childSpots: { x: number; z: number; y: number; s: number }[] = [];
    for (const [ox, oz, scale] of childPlaces) {
      const root = new THREE.Group();
      const x = this.center.x + ox, z = this.center.z + oz;
      const y0 = ground.heightAt(x, z);
      childSpots.push({ x, z, y: y0, s: scale });
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.27 * scale, 0.72 * scale, 10), this.childMat);
      body.position.y = 0.38 * scale; root.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 12, 8), this.childMat);
      head.position.y = 0.88 * scale; root.add(head);
      root.position.set(x, y0, z);
      root.userData['baseY'] = y0;
      root.visible = false;
      this.childGhosts.push(root); this.group.add(root);
    }
    /**
     * 꼬마 유령 실물 — 골목 끝의 그것(`lifesigns.ts`)과 **같은 모델·같은 문법**이다.
     * 그래야 플레이어가 「골목에 서 있던 그 아이들」과 묘지의 아이들을 같은 존재로 읽는다.
     *
     * 원뿔+구 실루엣은 폴백으로 남긴다 — 다만 콘·구는 `childMat` 을 공유해서 그냥 지우면
     * 페이드 로직이 갈 곳을 잃는다. 실물의 재질을 `childFadeMats` 에 모아 **같은 haunt 값**으로 함께 몬다.
     * 그림자는 만들지 않는다(loadNormalized 기본): 묘석 사이의 그것에 그림자가 있으면 실물이 된다.
     */
    void Props.loadNormalized('/models/yokai-kodomo.glb', 1.1, 0.68).then((tpl) => {
      childSpots.forEach((sp, i) => {
        const proc = this.childGhosts[i];
        if (!proc) return;
        const m = tpl.clone(true);
        m.scale.multiplyScalar(sp.s);
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mm = (mesh.material as THREE.MeshStandardMaterial).clone();
          // 아이마다 조금씩 다른 명도 — 셋이 복제본으로 보이면 「소품 3개」가 된다
          if (mm.color) mm.color.multiplyScalar(1 - i * 0.13);
          mm.transparent = true;
          mm.opacity = 0;
          mm.depthWrite = false;
          mesh.material = mm;
          mesh.renderOrder = 5;
          this.childFadeMats.push(mm);
        });
        // 절차 실루엣을 비우고 그 자리(root)에 실물을 넣는다 — 부유·시선 로직이 root 를 몬다
        proc.clear();
        proc.add(m);
      });
    }).catch((e) => console.warn('[graveyard] 꼬마 유령 모델 로드 실패 — 절차 실루엣 유지:', e));

    /**
     * 꽃잎 — 아이가 흩어질 때 그 자리에서 피어오른다(§ACT 12 「피안화 꽃잎처럼 흩어진다」).
     * 피안화의 꽃잎은 뒤로 말린 가느다란 띠라, 사각형보다 **한쪽이 뾰족한 삼각 조각**이 더 그것 같다.
     * 인스턴스 하나가 꽃잎 하나. 발광(Basic)으로 두는 이유는 밤이라 반사광이 없어서 —
     * 스탠다드로 두면 초칭이 닿지 않는 곳에서 검은 종잇조각이 된다.
     */
    const petalGeo = new THREE.BufferGeometry();
    petalGeo.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.032, 0, 0, 0.032, 0, 0, 0, 0.115, 0.014], 3));
    petalGeo.computeVertexNormals();
    const petalMesh = new THREE.InstancedMesh(
      petalGeo,
      new THREE.MeshBasicMaterial({ color: 0xc2202a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
      PETAL_MAX,
    );
    petalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    petalMesh.frustumCulled = false;
    petalMesh.count = PETAL_MAX;
    petalMesh.visible = false;
    this.petals = {
      mesh: petalMesh,
      pos: new Float32Array(PETAL_MAX * 3),
      vel: new Float32Array(PETAL_MAX * 3),
      life: new Float32Array(PETAL_MAX),
      spin: new Float32Array(PETAL_MAX),
    };
    // 수명 0 인 것은 원점이 아니라 **바닥 밑**에 숨긴다 — 0 에 두면 맵 중앙에 붉은 점이 뜬다
    for (let i = 0; i < PETAL_MAX; i++) {
      this.petalDummy.position.set(0, -999, 0);
      this.petalDummy.updateMatrix();
      petalMesh.setMatrixAt(i, this.petalDummy.matrix);
    }
    petalMesh.instanceMatrix.needsUpdate = true;
    this.group.add(petalMesh);

    // 움직이는 길안내 표식 — 정답 게다가 아니라 서로 다른 묘석 뒤를 번갈아 가리킨다.
    // **웃음소리 나는 쪽은 항상 가짜다** — 표식은 게다 무덤 방향(GA)을 절대 가리키지 않게 배치한다.
    // 지장의 시선만이 참이고, 움직이는 것은 전부 거짓이라는 규칙이 이 묘지의 문법이다
    this.decoyMat = new THREE.MeshBasicMaterial({ color: 0xc8d5d7, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const a = GA + Math.PI * (0.45 + i * 0.36);   // GA ±0 을 비켜 간 부채꼴
      const x = this.center.x + Math.cos(a) * R * 0.55, z = this.center.z + Math.sin(a) * R * 0.55;
      const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), this.decoyMat);
      d.position.set(x, ground.heightAt(x, z) + 0.72, z);
      d.visible = false; this.decoys.push(d); this.group.add(d);
    }

    // --- 절차적 돌 → Tripo 묘석. 도착하면 조용히 바뀐다 ---
    // 높이는 절차적 원본과 맞춘다(TALL_GRAVE_H / 0.62 / 0.50). 안 맞추면 배치 행렬이 그대로라 돌만 커진다
    void Promise.all([
      Props.loadNormalized('/models/props/grave-slab.glb', TALL_GRAVE_H, 0.42),
      Props.loadNormalized('/models/props/grave-slab.glb', 0.62, 0.42),
      Props.loadNormalized('/models/props/grave-natural.glb', 0.50, 0.42),
    ]).then((models) => {
      models.forEach((g, i) => {
        const src = g.children[0] as THREE.Mesh | undefined;
        const im = instanced[i];
        if (!src || !im) return;
        im.geometry.dispose();
        im.geometry = src.geometry;
        im.material = src.material as THREE.Material;
        im.computeBoundingSphere();
        if (im.boundingSphere) im.boundingSphere.radius += 0.25;
      });
    }).catch((e) => console.warn('[graveyard] 묘석 모델 로드 실패 — 절차적 돌 유지:', e));

    // 중앙 석탑과 지장 6구는 제의 시설이다. 개별 희생자 묘는 일반 묘열 + 아이 무덤 + 표식 묘석이다.
    this.count = n + NARRATIVE_GRAVES;
    scene.add(this.group);
    console.info(`[graveyard] 희생자 묘석 ${this.count} 기 (일반 ${n} + 서사 ${NARRATIVE_GRAVES})`);
  }

  /** 묘지 안인가 — 앰비언스·요괴 앵커 판정용 */
  contains(p: THREE.Vector3, r = 15) {
    return (p.x - this.center.x) ** 2 + (p.z - this.center.z) ** 2 < r * r;
  }

  beginHaunt() {
    this.hauntTarget = 1;
    this.mazeOn = true;
    this.loopCount = 0;
    for (const g of this.childGhosts) g.visible = true;
    for (const d of this.decoys) d.visible = true;
  }

  /**
   * 게다를 집었다 (§ACT 12) — **전부 사라지는 게 아니다.**
   * 스토리보드: 「아이들이 피안화 꽃잎처럼 흩어진다. **가장 어린 아이 하나만 잠시 남는다**」.
   * 셋을 한꺼번에 페이드하면 그냥 꺼지는 것이고, 둘만 꽃잎으로 흩고 하나를 남겨야
   * 남은 하나가 **의미를 갖는다** — 그 아이가 손바닥에 원을 그릴 아이다.
   *
   * 남은 아이는 가장 가까운(= 미오가 이미 보고 있는) 아이로 고른다. 화면 밖에서 하나가
   * 남으면 플레이어는 「전부 사라졌다」로 읽고, 뒤이은 대사가 허공에서 들린다.
   */
  disperse(playerPos?: THREE.Vector3) {
    this.mazeOn = false;
    if (!playerPos || !this.childGhosts.length) { this.hauntTarget = 0; return; }
    let keep = 0, best = Infinity;
    this.childGhosts.forEach((g, i) => {
      const d = g.position.distanceToSquared(playerPos);
      if (d < best) { best = d; keep = i; }
    });
    this.keepIdx = keep;
    this.childGhosts.forEach((g, i) => { if (i !== keep) this.burstPetals(g.position); });
    /**
     * 남은 아이를 **5 m 지점으로 당긴다.** 있던 자리에서 걸어오게 두면 12 m 라 13 초가 걸리는데,
     * 그동안 대사 넉 줄이 이미 끝난다(실측) — 「코앞까지 와 있다」는 줄이 나올 때 아이는 아직 저 멀리다.
     * 이동은 **방위를 유지한 채 거리만** 줄이므로 옆으로 순간이동하는 것처럼 보이지 않고,
     * 마침 그 순간 다른 둘이 꽃잎으로 터져 시선을 가져간다.
     */
    const kept = this.childGhosts[keep]!;
    const bx = kept.position.x - playerPos.x, bz = kept.position.z - playerPos.z;
    const bd = Math.hypot(bx, bz);
    if (bd > 5) {
      kept.position.x = playerPos.x + (bx / bd) * 5;
      kept.position.z = playerPos.z + (bz / bd) * 5;
      kept.userData['baseY'] = this.ground.heightAt(kept.position.x, kept.position.z);
    }
    this.approachOn = true;
    // hauntTarget 은 1 로 둔다 — 남은 아이가 보여야 하니까. 사라진 둘은 개별로 숨긴다
    this.childGhosts.forEach((g, i) => { if (i !== keep) g.visible = false; });
    for (const d of this.decoys) d.visible = false;
  }

  /** 손바닥 연출이 끝났다 — 남은 아이도 꽃잎이 되어 사라진다 */
  dismissLast() {
    const g = this.keepIdx >= 0 ? this.childGhosts[this.keepIdx] : null;
    if (g) { this.burstPetals(g.position); g.visible = false; }
    this.keepIdx = -1;
    this.approachOn = false;
    this.hauntTarget = 0;
  }

  /** 남은 아이의 월드 위치 — 카메라·대사 앵커 */
  get lastChildPos(): THREE.Vector3 | null {
    return this.keepIdx >= 0 ? (this.childGhosts[this.keepIdx]?.position ?? null) : null;
  }

  /** 꽃잎 물리 — 위로 솟았다가 가라앉으며 사그라든다. 링버퍼라 수명 0 은 바닥 밑에 숨긴다 */
  private updatePetals(dt: number) {
    const P = this.petals;
    if (!P.mesh.visible) return;
    let live = false;
    for (let i = 0; i < PETAL_MAX; i++) {
      if (P.life[i]! <= 0) continue;
      live = true;
      P.life[i] = Math.max(0, P.life[i]! - dt * 0.42);
      const i3 = i * 3;
      // 중력은 약하게, 공기 저항은 세게 — 꽃잎은 떨어지는 게 아니라 **머문다**
      P.vel[i3 + 1] = P.vel[i3 + 1]! - dt * 0.9;
      for (let k = 0; k < 3; k++) {
        P.vel[i3 + k] = P.vel[i3 + k]! * (1 - dt * 1.1);
        P.pos[i3 + k] = P.pos[i3 + k]! + P.vel[i3 + k]! * dt;
      }
      const d = this.petalDummy;
      d.position.set(P.pos[i3]!, P.pos[i3 + 1]!, P.pos[i3 + 2]!);
      d.rotation.set(this.hauntT * P.spin[i]! * 0.6, this.hauntT * P.spin[i]!, P.spin[i]! * 0.4);
      // 수명이 스케일로 — 페이드는 재질 하나를 공유해서 개별로 못 준다(인스턴싱의 대가).
      // 작아지며 사라지는 것이 꽃잎에는 오히려 맞다
      d.scale.setScalar(0.4 + P.life[i]! * 0.8);
      d.updateMatrix();
      P.mesh.setMatrixAt(i, d.matrix);
      if (P.life[i]! <= 0) {
        d.position.set(0, -999, 0); d.updateMatrix(); P.mesh.setMatrixAt(i, d.matrix);
      }
    }
    if (live) P.mesh.instanceMatrix.needsUpdate = true;
    else P.mesh.visible = false;
  }

  /** 꽃잎 한 줌을 터뜨린다 — 아이가 있던 자리에서 위로 흩어져 사그라든다 */
  private burstPetals(at: THREE.Vector3) {
    const P = this.petals;
    P.mesh.visible = true;
    for (let k = 0; k < 26; k++) {
      const i = this.petalNext;
      this.petalNext = (this.petalNext + 1) % PETAL_MAX;
      const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.5;
      P.pos[i * 3] = at.x + (Math.random() - 0.5) * 0.3;
      P.pos[i * 3 + 1] = at.y + 0.35 + Math.random() * 0.7;
      P.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.3;
      P.vel[i * 3] = Math.cos(a) * sp * 0.42;
      P.vel[i * 3 + 1] = 0.55 + Math.random() * 0.75;      // 처음엔 위로 — 「흩어진다」는 상승이다
      P.vel[i * 3 + 2] = Math.sin(a) * sp * 0.42;
      P.life[i] = 1;
      P.spin[i] = (Math.random() - 0.5) * 5;
    }
  }

  /** 로딩 프리워밍 동안만 꽃잎 재질을 노출한다. 실제 플레이 상태는 수명 배열로 복원한다. */
  setHiddenEffectPrewarm(on: boolean) {
    this.petals.mesh.visible = on || this.petals.life.some((life) => life > 0);
  }

  get mazeActive() { return this.mazeOn; }
  get loops() { return this.loopCount; }

  /**
   * ACT 12 미로 — **경계를 넘어 나가려 하면 반대편 같은 반경으로 되돌린다**(§5.3.4 「무덤이 끝없이 반복」).
   *
   * 진행 방향은 건드리지 않는다: 바깥으로 걷던 사람이 반대편에 놓이면 이번엔 밭 **안쪽**을 향하게 되고,
   * 눈앞은 여전히 묘석이라 순간이동의 이음매가 보이지 않는다. 뒤를 돌아본 뒤에야 이상함을 안다.
   * 붉은 천 묘석이 그때 「아까 그 돌」로 돌아온다.
   *
   * 게다를 얻기 전에는 나가는 방향이 **없다** — 파훼는 방향이 아니라 지장의 시선을 읽고
   * 무덤을 찾는 것이다. 실패에 사망은 없고, 빼앗기는 것은 시간이다.
   *
   * @returns 되돌릴 XZ (y 는 호출측이 지형에서 잡는다) · 아니면 null
   */
  loopCheck(p: THREE.Vector3, dt: number): THREE.Vector3 | null {
    if (this.loopCooldown > 0) this.loopCooldown -= dt;
    if (!this.mazeOn || this.loopCooldown > 0) return null;
    const dx = p.x - this.center.x, dz = p.z - this.center.z;
    const r = Math.hypot(dx, dz);
    if (r < this.loopR) return null;
    this.loopCooldown = 1.2;          // 경계에서 진동하며 매 프레임 되돌아가는 것을 막는다
    this.loopCount++;
    this.onLoop?.(this.loopCount);
    const a = Math.atan2(dz, dx) + Math.PI;
    const nr = this.loopR - 2.2;
    return new THREE.Vector3(this.center.x + Math.cos(a) * nr, 0, this.center.z + Math.sin(a) * nr);
  }

  update(dt: number, player: THREE.Vector3) {
    this.hauntT += dt;
    this.updatePetals(dt);
    // 남은 아이가 다가온다 — 「가장 어린 아이 하나만 잠시 남는다」의 그 아이.
    // 말 없이 다가오는 것이 대사보다 낫다: 플레이어가 물러설지 기다릴지 스스로 정한다
    if (this.approachOn && this.keepIdx >= 0) {
      const g = this.childGhosts[this.keepIdx];
      if (g) {
        const dx = player.x - g.position.x, dz = player.z - g.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.15) {
          const v = Math.min(0.85, d * 0.6) * dt;
          g.position.x += (dx / d) * v;
          g.position.z += (dz / d) * v;
          g.userData['baseY'] = this.ground.heightAt(g.position.x, g.position.z);
        }
      }
    }
    const localTarget = this.contains(player, 18) ? this.hauntTarget : 0;
    this.haunt += (localTarget - this.haunt) * (1 - Math.exp(-dt * (localTarget > this.haunt ? 2.2 : 1.35)));
    this.childMat.opacity = this.haunt * 0.52;
    // 실물은 조금 더 진하게 — 형태가 있으니 0.52 로는 안개에 녹아 아예 안 보인다
    for (const m of this.childFadeMats) m.opacity = this.haunt * 0.72;
    this.decoyMat.opacity = this.haunt * (0.38 + 0.24 * Math.sin(this.hauntT * 4.3));
    for (let i = 0; i < this.childGhosts.length; i++) {
      const g = this.childGhosts[i]!;
      g.position.y = (g.userData['baseY'] as number) + Math.sin(this.hauntT * 1.7 + i * 2.1) * 0.07;
      g.lookAt(player.x, g.position.y + 0.65, player.z);
      if (this.haunt < 0.01 && this.hauntTarget === 0) g.visible = false;
    }
    for (let i = 0; i < this.decoys.length; i++) {
      const d = this.decoys[i]!;
      d.position.y += Math.sin(this.hauntT * 3.1 + i) * dt * 0.025;
      d.rotation.y += dt * (0.7 + i * 0.08);
      if (this.haunt < 0.01 && this.hauntTarget === 0) d.visible = false;
    }
  }
}

/** 판형 묘석 — 위가 살짝 좁고 모서리가 닳았다 */
function slabGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 1, 3, 1);
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + h / 2) / h;                 // 0 = 밑, 1 = 위
    const taper = 1 - t * 0.18;
    pos.setX(i, pos.getX(i) * taper);
    pos.setZ(i, pos.getZ(i) * taper);
    if (t > 0.9) pos.setY(i, y - h * 0.03);    // 꼭대기를 살짝 뭉갠다
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  paint(g, new THREE.Color(0.048, 0.052, 0.048), new THREE.Color(0.150, 0.158, 0.135));
  return g;
}

/** 자연석 — 구를 찌그러뜨린다 */
function boulderGeo(r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 7, 5);
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const s = 0.75 + ((Math.sin(pos.getX(i) * 9.1) + Math.cos(pos.getZ(i) * 7.7)) * 0.5 + 0.5) * 0.45;
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.72, pos.getZ(i) * s);
  }
  g.translate(0, r * 0.55, 0);
  g.computeVertexNormals();
  paint(g, new THREE.Color(0.042, 0.046, 0.040), new THREE.Color(0.128, 0.140, 0.118));
  return g;
}

/** 아래는 이끼·흙으로 어둡게, 위는 달빛을 받아 밝게 */
function paint(g: THREE.BufferGeometry, lo: THREE.Color, hi: THREE.Color) {
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.smoothstep(pos.getY(i), bb.min.y, bb.max.y);
    tmp.copy(lo).lerp(hi, t);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
