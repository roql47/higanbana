import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { SITES, type HigasatoGround } from './ground';
import { PartsBuilder, textCanvas, tileTex } from './kit';
import { L, serifFamily } from '@/core/i18n';
import { Props } from '@/world/props';

/**
 * 공동우물 지하 — ACT 10~11 「동전 세 닢」의 무대 (PLAN-STORY §2.3, §5.3.3)
 *
 * 지상 우물(`blockouts.ts` Well)은 그대로 두고, **지형 12 m 아래에 바닥 수공간을 판다**:
 * 원형 석실 + 발목 수면 + 제단(동전) + 벽 각인 「내 아이가 아니다」 + 니치 3.
 * 하강·상승은 밧줄 인터랙트다 — 좁은 구멍을 물리로 내려보내는 대신 **연출 텔레포트**
 * (§5.3.3 「하강은 안전」— 게임은 바닥에서 시작하고, 상승이 추격이다).
 *
 * ## 천장의 원반 하나가 이 방의 전부다
 * 12 m 위 개구로 **달빛 기둥**이 떨어진다(스폿라이트) — 방의 유일한 방향감이자
 * 「올라가야 하는 곳」의 시각화. 그 빛이 수면에 비쳐 방 전체가 은은하게 찰랑인다.
 */
export class WellShaft {
  readonly group = new THREE.Group();
  /** 바닥 착지점(밧줄 아래) */
  readonly landing: THREE.Vector3;
  /** 동전 제단(월드) */
  readonly altarPos: THREE.Vector3;
  /** 벽 각인 조사 지점 */
  readonly carvingPos: THREE.Vector3;
  /** 지상 우물가(하강 인터랙트·즉사 체크포인트) */
  readonly topPos: THREE.Vector3;
  /** 방 기하 — 우물의 여자가 이 안을 유영한다 */
  readonly chamber: { cx: number; cz: number; r: number; floorY: number; waterY: number };
  /** 니치(벽감) 3곳 — 몸을 붙이면 그녀의 접근 판정 밖 */
  readonly niches: THREE.Vector3[] = [];
  /** 벽 안쪽이 아니라 플레이어가 실제로 설 수 있는 벽감 입구 조사점 */
  readonly nicheInspectPositions: THREE.Vector3[] = [];
  /** ACT 10-1 지상 선택 조사 — 장례 쟁반 · 잘린 구조 밧줄 · 들어가기만 한 발자국. */
  readonly surfaceCluePositions: THREE.Vector3[] = [];
  /** 첫 조사 벽감 뒤에 열리는 짧은 우회 포켓. 조사 순서가 탈출 동선을 바꾼다. */
  readonly detourPositions: THREE.Vector3[] = [];
  /** 바닥에서 주워 물소리 유인에 쓰는 조약돌 더미. */
  readonly pebblePilePos: THREE.Vector3;
  /** 위에서 아래 순서. 하강 기억과 상승 안전 지점이 같은 세 매듭을 공유한다. */
  readonly ropeKnotYs: readonly number[];
  /** 조약돌이 수면에 닿는 순간. 위치 음향과 AI 유인을 같은 프레임에 묶는다. */
  onPebbleSplash: ((position: THREE.Vector3) => void) | null = null;

  private waterMat: THREE.MeshStandardMaterial;
  private water: THREE.Mesh;
  private baseWaterY: number;
  private waterTargetY: number;
  private floodedNiche = -1;
  private detourNiche = -1;
  private floodVeils: THREE.Mesh[] = [];
  private detourMarks: THREE.Mesh[] = [];
  private pebbleFlights: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number }[] = [];
  private splashRipples: { mesh: THREE.Mesh; t: number }[] = [];
  /** 가짜 하루 — 진실을 말할 때만 수면 위로 드러나는 리깅된 실물. */
  private falseHaru = new THREE.Group();
  private falseHaruMixer: THREE.AnimationMixer | null = null;
  private falseHaruMaterials: THREE.Material[] = [];
  private falseHaruT = 0;
  private t = 0;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.well!;
    const cx = s.x, cz = s.z;
    const gy = ground.heightAt(cx, cz);
    this.topPos = new THREE.Vector3(cx, gy, cz);

    const R = 3.4;                  // 석실 반경
    const floorY = gy - 12;
    const waterY = floorY + 0.16;   // 발목 물
    this.chamber = { cx, cz, r: R, floorY, waterY };
    this.baseWaterY = waterY;
    this.waterTargetY = waterY;
    this.landing = new THREE.Vector3(cx + 1.4, floorY, cz + 0.6);
    // 서쪽 벽감과 1.9 m 공물 판정이 겹치지 않게 방 중앙 쪽으로 뺀다.
    // 이전 위치(cx-R+1, cz-.8)는 마지막 벽감 앞에서 동전 프롬프트가 E 입력을 가로챘다.
    this.altarPos = new THREE.Vector3(cx - 1.25, floorY, cz - 1.1);
    this.carvingPos = new THREE.Vector3(cx, floorY, cz + R - 0.9);
    this.pebblePilePos = new THREE.Vector3(cx + 1.75, floorY + 0.08, cz + 0.95);
    this.ropeKnotYs = [floorY + 9.25, floorY + 6.2, floorY + 3.1];

    const k = new PartsBuilder(physics);
    // 벽은 일본식 돌담 PBR — 달빛 기둥이 스칠 때 노멀맵의 돌 이음매가 드러난다.
    // 바닥·천장(mDark)은 물 아래·암부라 단색 유지 (cyl 이라 worldUV 도 안 탄다)
    const stoneD = tileTex('/textures/stone/japanese_stone_wall_diff_1k.webp', true);
    const stoneN = tileTex('/textures/stone/japanese_stone_wall_nor_gl_1k.webp', false);
    const woodD = tileTex('/textures/wood/japanese_cedar_planks_diff_1k.webp', true);
    const woodN = tileTex('/textures/wood/japanese_cedar_planks_nor_gl_1k.webp', false);
    const mStone = k.texMat(stoneD, stoneN, 0x3d423c, { boost: 2.0, rough: 1.0, repeat: 0.4, normalScale: 1.0 });
    const mDark = k.mat(0x14171a, 1.0);
    const mAltar = k.texMat(woodD, woodN, 0x2c2115, { rough: 0.9 });

    // ---------- 원형 석실: 8각 벽 세그먼트 + 니치 3곳(움푹) ----------
    const SEG = 10;
    const nicheAt = [2, 5, 8];      // 세그먼트 인덱스 — 서·남동·북동에 벽감
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const isNiche = nicheAt.includes(i);
      const r = isNiche ? R + 0.7 : R;
      const wx = cx + Math.cos(a) * r, wz = cz + Math.sin(a) * r;
      const segW = (2 * Math.PI * r) / SEG + 0.4;
      k.box(segW, 4.0, 0.5, wx, floorY + 2.0, wz, mStone, -a + Math.PI / 2);
      k.collide(wx, floorY + 2.0, wz, segW / 2, 2.0, 0.25, -a + Math.PI / 2);
      if (isNiche) {
        // 벽감 입구 좌우 기둥 — 움푹함이 실루엣으로 읽히게
        for (const sgn of [-1, 1]) {
          const ba = a + sgn * (Math.PI / SEG) * 0.9;
          k.box(0.35, 4.0, 0.35, cx + Math.cos(ba) * R, floorY + 2.0, cz + Math.sin(ba) * R, mStone);
        }
        this.niches.push(new THREE.Vector3(cx + Math.cos(a) * (R + 0.45), floorY, cz + Math.sin(a) * (R + 0.45)));
        // 퀘스트 마커와 조사 판정은 움푹 팬 벽의 중심이 아니라 입구 바닥을 가리킨다.
        // 벽 중심을 그대로 쓰면 캡슐 콜라이더 때문에 마커 정중앙까지 갈 수 없었다.
        this.nicheInspectPositions.push(new THREE.Vector3(
          cx + Math.cos(a) * (R - 0.35), floorY + 0.75, cz + Math.sin(a) * (R - 0.35),
        ));
        // 벽감 안쪽의 한 방향으로 돌아 들어가는 반 걸음짜리 포켓. 첫 조사 벽감만 탈출 때 열린다.
        this.detourPositions.push(new THREE.Vector3(
          cx + Math.cos(a) * (R - 0.15) - Math.sin(a) * 0.82,
          floorY,
          cz + Math.sin(a) * (R - 0.15) + Math.cos(a) * 0.82,
        ));
      }
    }
    // 바닥 + 천장(개구를 남긴 링)
    k.cyl(R + 1.2, R + 1.2, 0.3, cx, floorY - 0.15, cz, mDark, 16);
    k.collide(cx, floorY - 0.15, cz, R + 1.2, 0.15, R + 1.2);
    const ceil = new THREE.RingGeometry(0.75, R + 1.2, 20);
    ceil.rotateX(Math.PI / 2); ceil.translate(cx, floorY + 4.0, cz);
    k.add(ceil, mDark);
    // 샤프트 원통(개구 → 지상) — 안쪽 면
    const shaft = new THREE.CylinderGeometry(0.75, 0.75, 8.2, 12, 1, true);
    shaft.translate(cx, floorY + 4.0 + 4.1, cz);
    k.add(shaft, new THREE.MeshStandardMaterial({ color: 0x272b27, roughness: 1, side: THREE.BackSide }));
    // 밧줄 — 직선 6각 원기둥을 없애고 세 가닥 꼬임·처짐·젖은 올풀림까지 가진 별도 메시로 만든다.
    this.group.add(makeBraidedWellRope(cx + 0.3, floorY, cz + 0.15, this.ropeKnotYs));

    // ---------- 제단 — 동전이 놓이는 낮은 석대 ----------
    k.box(0.9, 0.5, 0.6, this.altarPos.x, floorY + 0.25, this.altarPos.z, mAltar);
    k.collide(this.altarPos.x, floorY + 0.25, this.altarPos.z, 0.45, 0.25, 0.3);
    this.altarPos.y = floorY + 0.55;

    // ---------- 벽 각인 「내 아이가 아니다」 — 같은 문장이 벽을 덮는다 (§2.3) ----------
    const tex = textCanvas(512, 512, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(0, 0, 512, 512);
      ctx.fillStyle = 'rgba(190, 178, 158, 0.55)';
      const line = L('내 아이가 아니다', 'うちの子じゃない');
      for (let row = 0; row < 9; row++) {
        const size = 26 + Math.sin(row * 2.7) * 8;
        ctx.font = `${row % 3 === 0 ? 700 : 400} ${size}px ${serifFamily()}`;
        const jitter = Math.sin(row * 5.3) * 24;
        // 뒤로 갈수록 글씨가 무너진다 — 아홉 번째 줄은 거의 긁힘이다
        ctx.globalAlpha = 1 - row * 0.055;
        ctx.fillText(line.repeat(row % 2 ? 2 : 1), 14 + jitter, 48 + row * 52);
      }
    });
    const carve = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 2.6),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    carve.position.set(cx, floorY + 1.7, cz + R - 0.28);
    carve.rotation.y = Math.PI;
    this.group.add(carve);

    // ---------- 지상: 끝나지 않은 장례의 물증 3종 ----------
    // 우물 블록아웃과 겹치지 않도록 가장자리 세 방향에 놓고, 조사 앵커도 실물 바로 위에 둔다.
    const wetWood = new THREE.MeshStandardMaterial({ color: 0x443425, roughness: 0.82, metalness: 0 });
    const stain = new THREE.MeshBasicMaterial({ color: 0x17120e, transparent: true, opacity: 0.62, depthWrite: false });
    const trayPos = new THREE.Vector3(cx + 1.45, gy + 0.05, cz - 1.25);
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.055, 20), wetWood);
    tray.position.copy(trayPos); tray.castShadow = true; this.group.add(tray);
    for (let i = 0; i < 3; i++) {
      const mark = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.075, 16), stain);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(trayPos.x + (i - 1) * 0.18, trayPos.y + 0.031, trayPos.z + 0.02);
      this.group.add(mark);
    }
    this.surfaceCluePositions.push(trayPos.clone().add(new THREE.Vector3(0, 0.35, 0)));

    const cutPos = new THREE.Vector3(cx - 1.35, gy + 0.08, cz - 1.2);
    const cutCurve = new THREE.CatmullRomCurve3([
      cutPos.clone().add(new THREE.Vector3(-0.45, 0, 0.12)),
      cutPos.clone().add(new THREE.Vector3(-0.08, 0.025, -0.05)),
      cutPos.clone().add(new THREE.Vector3(0.42, 0, 0.1)),
    ]);
    const cutRopeFallback = new THREE.Group();
    const cutRope = new THREE.Mesh(new THREE.TubeGeometry(cutCurve, 22, 0.035, 7, false), wetWood);
    cutRope.castShadow = true; cutRopeFallback.add(cutRope);
    // 칼로 잘린 면은 밝은 섬유색 두 장을 서로 마주 보게 세운다.
    const fiberCut = new THREE.MeshStandardMaterial({ color: 0xb59a6b, roughness: 1 });
    for (const sx of [-0.045, 0.045]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.037, 8), fiberCut);
      face.position.set(cutPos.x + sx, cutPos.y + 0.025, cutPos.z - 0.045);
      face.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
      cutRopeFallback.add(face);
    }
    this.group.add(cutRopeFallback);
    // 가까이서 절단 방향을 읽는 핵심 물증이라, 완성 모델이 준비되면 절차 폴백만 교체한다.
    void Props.loadNormalized('/models/props/cut-rescue-rope.glb', 0.24, 0.72).then((model) => {
      model.position.copy(cutPos).add(new THREE.Vector3(0, -0.015, 0));
      model.rotation.y = -0.38;
      model.name = 'well-cut-rescue-rope-tripo';
      this.group.add(model);
      cutRopeFallback.visible = false;
    }).catch((error) => console.warn('[well] cut rescue rope fallback retained', error));
    this.surfaceCluePositions.push(cutPos.clone().add(new THREE.Vector3(0, 0.35, 0)));

    const footOrigin = new THREE.Vector3(cx - 1.15, gy + 0.012, cz + 1.1);
    this.group.add(makeWetFootprintTrail(footOrigin));
    this.surfaceCluePositions.push(footOrigin.clone().add(new THREE.Vector3(0.35, 0.3, -0.45)));

    // ---------- 지하: 벽감 물증·침수/우회 상태를 읽게 하는 실물 ----------
    this.niches.forEach((n, i) => {
      const a = Math.atan2(n.z - cz, n.x - cx);
      this.group.add(makeNicheEvidence(i, n, a, floorY));
      const flood = new THREE.Mesh(
        new THREE.CircleGeometry(0.78, 18),
        new THREE.MeshStandardMaterial({ color: 0x071116, roughness: 0.08, metalness: 0.28, transparent: true, opacity: 0 }),
      );
      flood.rotation.x = -Math.PI / 2;
      flood.position.set(n.x, waterY + 0.01, n.z);
      this.floodVeils.push(flood); this.group.add(flood);

      const detour = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 1.7),
        new THREE.MeshBasicMaterial({ color: 0x050708, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      );
      detour.position.copy(this.detourPositions[i]!).add(new THREE.Vector3(0, 0.9, 0));
      detour.rotation.y = -a + Math.PI / 2;
      this.detourMarks.push(detour); this.group.add(detour);
    });

    // 손에 쥘 만큼만 남은 조약돌. 빛나는 픽업이 아니라 바닥 재질과 가까운 낮은 실루엣이다.
    const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x5b5c57, roughness: 0.96 });
    for (let i = 0; i < 7; i++) {
      const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055 + (i % 3) * 0.012, 1), pebbleMat);
      pebble.scale.y = 0.55;
      pebble.position.copy(this.pebblePilePos).add(new THREE.Vector3((i % 3) * 0.09 - 0.09, 0.015 * (i % 2), Math.floor(i / 3) * 0.08 - 0.07));
      pebble.rotation.set(i * 0.3, i * 0.8, i * 0.2);
      pebble.castShadow = true; this.group.add(pebble);
    }

    // ---------- 수면 — 발목 물. 달빛을 받아 찰랑인다 ----------
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x0c1216, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.92,
    });
    this.water = new THREE.Mesh(new THREE.CircleGeometry(R + 0.9, 24), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(cx, waterY, cz);
    this.group.add(this.water);

    // ---------- 가짜 하루 — 수면 중앙의 짧은 증거 apparition ----------
    this.falseHaru.name = 'false-haru-apparition';
    this.falseHaru.visible = false;
    this.falseHaru.position.set(cx + 0.15, waterY - 0.04, cz + 0.05);
    this.falseHaru.rotation.y = -Math.PI / 2;
    this.group.add(this.falseHaru);
    void this.loadFalseHaru();

    // ---------- 달빛 기둥 — 개구에서 수면으로 ----------
    const moon = new THREE.SpotLight(0xbfd0e6, 14, 20, 0.32, 0.5, 1.2);
    moon.position.set(cx, floorY + 12, cz);
    moon.target.position.set(cx, floorY, cz);
    moon.castShadow = false;
    this.group.add(moon, moon.target);
    // 방 전체 아주 약한 암부 채움 — 칠흑이면 벽 각인도 니치도 없다
    const fill = new THREE.PointLight(0x2a3440, 2.2, 9, 1.6);
    fill.position.set(cx, floorY + 2.4, cz);
    this.group.add(fill);

    this.group.add(k.build('well-shaft', { spatialCellSize: 10 }));
    scene.add(this.group);
  }

  private async loadFalseHaru() {
    try {
      const gltf = await Props.loader().loadAsync('/models/yokai-fake-haru.glb');
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = 1.12 / Math.max(0.01, size.y);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const materials = sources.map((source) => {
          const material = source.clone();
          material.transparent = true;
          material.opacity = 0;
          material.depthWrite = false;
          const standard = material as THREE.MeshStandardMaterial;
          if (standard.isMeshStandardMaterial) {
            standard.emissive = new THREE.Color(0x34262b);
            standard.emissiveIntensity = 0.22;
            standard.roughness = Math.min(0.72, standard.roughness);
          }
          this.falseHaruMaterials.push(material);
          return material;
        });
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0]!;
      });
      this.falseHaru.add(model);
      if (gltf.animations[0]) {
        this.falseHaruMixer = new THREE.AnimationMixer(model);
        this.falseHaruMixer.clipAction(gltf.animations[0]).play();
      }
      console.info(`[well] false Haru loaded · ${gltf.animations.map((clip) => clip.name).join(', ') || 'static'}`);
    } catch (error) {
      console.warn('[well] false Haru model failed — water-face cue retained', error);
    }
  }

  /** 진실 분기와 마지막 아이 목소리에서만 짧게 보여, 평소 추격 실루엣과 경쟁하지 않는다. */
  showFalseHaru(seconds = 3.8) {
    this.falseHaruT = Math.max(this.falseHaruT, seconds);
    this.falseHaru.visible = true;
  }

  /** 마지막 매듭 숏이 가짜 하루의 얼굴 높이를 안정적으로 겨냥한다. */
  falseHaruFocus(out = new THREE.Vector3()) {
    return out.set(this.falseHaru.position.x, this.chamber.waterY + 0.96, this.falseHaru.position.z);
  }

  /** 플레이어가 니치 안에 있는가 — 그녀의 접근 판정 밖 (§5.3.3 파훼 ①) */
  inNiche(p: THREE.Vector3): boolean {
    for (let i = 0; i < this.niches.length; i++) {
      const n = this.niches[i]!;
      if (i !== this.floodedNiche && Math.hypot(p.x - n.x, p.z - n.z) < 0.75) return true;
      if (i === this.detourNiche && Math.hypot(p.x - this.detourPositions[i]!.x, p.z - this.detourPositions[i]!.z) < 0.7) return true;
    }
    return false;
  }

  nicheIndexAt(p: THREE.Vector3): number {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.niches.length; i++) {
      const d = Math.hypot(p.x - this.niches[i]!.x, p.z - this.niches[i]!.z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD < 1.05 ? best : -1;
  }

  get floodedNicheIndex() { return this.floodedNiche; }
  get detourNicheIndex() { return this.detourNiche; }

  /** 조사 수와 실제 순서를 월드에 투영한다: 수위·침수 벽감·열린 우회 포켓이 동시에 바뀐다. */
  setRitualProgress(order: readonly number[]) {
    const valid = order.filter((v, i, all) => Number.isInteger(v) && v >= 0 && v < 3 && all.indexOf(v) === i);
    const progress = Math.min(3, valid.length);
    this.waterTargetY = this.baseWaterY + [0, 0.10, 0.24, 0.46][progress]!;
    this.floodedNiche = progress >= 3 ? valid[2]! : -1;
    this.detourNiche = progress >= 3 ? valid[0]! : -1;
  }

  /** 카메라가 향한 반대편 수면 안으로 목표를 제한한다. 벽 밖에 가짜 소리를 만들지 않는다. */
  waterPointInDirection(origin: THREE.Vector3, direction: THREE.Vector3, distance = 3.8) {
    const c = this.chamber;
    const d = new THREE.Vector3(direction.x, 0, direction.z);
    if (d.lengthSq() < 1e-5) d.set(c.cx - origin.x, 0, c.cz - origin.z);
    d.normalize();
    const out = new THREE.Vector3(origin.x + d.x * distance, c.waterY + 0.025, origin.z + d.z * distance);
    const dx = out.x - c.cx, dz = out.z - c.cz;
    const r = Math.hypot(dx, dz), limit = c.r - 0.55;
    if (r > limit) { out.x = c.cx + dx / r * limit; out.z = c.cz + dz / r * limit; }
    return out;
  }

  /** 작은 투사체를 실제 포물선으로 보여 준 뒤, 착수 프레임에 파문과 AI 콜백을 낸다. */
  throwPebble(from: THREE.Vector3, to: THREE.Vector3) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.045, 1),
      new THREE.MeshStandardMaterial({ color: 0x77766f, roughness: 0.95 }),
    );
    const start = from.clone().add(new THREE.Vector3(0, 1.15, 0));
    const target = to.clone().setY(this.chamber.waterY + 0.02);
    mesh.position.copy(start); mesh.castShadow = true;
    this.group.add(mesh);
    this.pebbleFlights.push({ mesh, from: start, to: target, t: 0 });
  }

  /** 바닥 공간 안인가 */
  inChamber(p: THREE.Vector3): boolean {
    const c = this.chamber;
    return p.y < c.floorY + 4.5 && Math.hypot(p.x - c.cx, p.z - c.cz) < c.r + 1.4;
  }

  update(dt: number) {
    this.t += dt;
    const waterY = THREE.MathUtils.lerp(this.chamber.waterY, this.waterTargetY, 1 - Math.exp(-dt * 1.15));
    this.chamber.waterY = waterY;
    this.water.position.y = waterY;
    this.falseHaruMixer?.update(dt * 0.58);
    if (this.falseHaruT > 0) {
      this.falseHaruT = Math.max(0, this.falseHaruT - dt);
      const fade = Math.min(1, this.falseHaruT * 1.8);
      const pulse = 0.72 + Math.sin(this.t * 7.1) * 0.08;
      for (const material of this.falseHaruMaterials) material.opacity = fade * pulse;
      this.falseHaru.position.y = waterY - 0.08 + Math.sin(this.t * 1.3) * 0.025;
      if (this.falseHaruT === 0) this.falseHaru.visible = false;
    }
    // 수면 찰랑임 — 러프니스가 미세하게 숨쉰다 (지오메트리를 흔드는 것보다 싸고, 달빛 반사가 흔들린다)
    this.waterMat.roughness = 0.12 + 0.05 * Math.sin(this.t * 1.7) * Math.sin(this.t * 0.9 + 1.2);
    for (let i = 0; i < this.floodVeils.length; i++) {
      const veil = this.floodVeils[i]!;
      veil.position.y = waterY + 0.012;
      const mat = veil.material as THREE.MeshStandardMaterial;
      const target = i === this.floodedNiche ? 0.9 : 0;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, target, 1 - Math.exp(-dt * 3));
      const mark = this.detourMarks[i]!;
      const markMat = mark.material as THREE.MeshBasicMaterial;
      markMat.opacity = THREE.MathUtils.lerp(markMat.opacity, i === this.detourNiche ? 0.72 : 0, 1 - Math.exp(-dt * 3));
    }

    for (let i = this.pebbleFlights.length - 1; i >= 0; i--) {
      const f = this.pebbleFlights[i]!;
      f.t += dt / 0.58;
      const p = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, p);
      f.mesh.position.y += Math.sin(p * Math.PI) * 1.05;
      f.mesh.rotation.x += dt * 13; f.mesh.rotation.z += dt * 9;
      if (p < 1) continue;
      const at = f.to.clone();
      f.mesh.removeFromParent(); (f.mesh.geometry as THREE.BufferGeometry).dispose();
      (f.mesh.material as THREE.Material).dispose();
      this.pebbleFlights.splice(i, 1);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.08, 0.12, 20),
        new THREE.MeshBasicMaterial({ color: 0x91a6b1, transparent: true, opacity: 0.72, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2; ring.position.copy(at);
      this.group.add(ring); this.splashRipples.push({ mesh: ring, t: 0 });
      this.onPebbleSplash?.(at);
    }
    for (let i = this.splashRipples.length - 1; i >= 0; i--) {
      const r = this.splashRipples[i]!; r.t += dt;
      r.mesh.scale.setScalar(1 + r.t * 5.5);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.72 - r.t * 1.05);
      if (r.t < 0.72) continue;
      r.mesh.removeFromParent(); (r.mesh.geometry as THREE.BufferGeometry).dispose();
      (r.mesh.material as THREE.Material).dispose(); this.splashRipples.splice(i, 1);
    }
  }
}

/** 우물 깊이에 맞춘 12m 삼연 로프. 중심 곡선을 따라 세 가닥이 38번 감긴다. */
function makeBraidedWellRope(x: number, floorY: number, z: number, knotYs: readonly number[]): THREE.Group {
  const out = new THREE.Group();
  out.name = 'well-rope-braided';
  const bottomY = floorY + 0.25;
  const topY = floorY + 12.25;
  const center = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, bottomY, z),
    new THREE.Vector3(x - 0.055, floorY + 2.8, z + 0.035),
    new THREE.Vector3(x + 0.035, floorY + 6.0, z - 0.025),
    new THREE.Vector3(x - 0.018, floorY + 9.2, z + 0.018),
    new THREE.Vector3(x, topY, z),
  ]);
  const tubular = 240;
  const frames = center.computeFrenetFrames(tubular, false);

  // 섬유 결을 범프맵으로 반복한다. 가까이 비춰도 매끈한 플라스틱 호스로 보이지 않는다.
  const fiberCanvas = document.createElement('canvas');
  fiberCanvas.width = 64; fiberCanvas.height = 256;
  const fc = fiberCanvas.getContext('2d')!;
  fc.fillStyle = '#777'; fc.fillRect(0, 0, 64, 256);
  for (let i = -64; i < 320; i += 9) {
    fc.strokeStyle = i % 18 ? '#b8b8b8' : '#353535'; fc.lineWidth = 3;
    fc.beginPath(); fc.moveTo(0, i); fc.lineTo(64, i + 36); fc.stroke();
  }
  const fiber = new THREE.CanvasTexture(fiberCanvas);
  fiber.wrapS = fiber.wrapT = THREE.RepeatWrapping;
  fiber.repeat.set(1.4, 34);
  fiber.colorSpace = THREE.NoColorSpace;

  const colors = [0x9d875f, 0xb39b6b, 0x806d4e];
  for (let strand = 0; strand < 3; strand++) {
    const pts: THREE.Vector3[] = [];
    const phase = strand * Math.PI * 2 / 3;
    for (let i = 0; i <= tubular; i++) {
      const u = i / tubular;
      const p = center.getPointAt(u);
      const a = phase + u * Math.PI * 2 * 38;
      const n = frames.normals[i]!;
      const b = frames.binormals[i]!;
      pts.push(p.clone().addScaledVector(n, Math.cos(a) * 0.021).addScaledVector(b, Math.sin(a) * 0.021));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, tubular, 0.014, 6, false);
    const material = new THREE.MeshStandardMaterial({
      color: colors[strand], roughness: 0.86, metalness: 0,
      bumpMap: fiber, bumpScale: 0.55,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    out.add(mesh);
  }

  // 하단 한 뼘은 물을 먹어 짙고 무겁다. 감긴 실끈이 세 가닥을 한 번 더 묶는다.
  const wetMat = new THREE.MeshStandardMaterial({ color: 0x493c2c, roughness: 0.72, bumpMap: fiber, bumpScale: 0.4 });
  const wetCore = new THREE.Mesh(new THREE.TubeGeometry(
    new THREE.LineCurve3(new THREE.Vector3(x, bottomY - 0.02, z), new THREE.Vector3(x - 0.01, bottomY + 0.34, z + 0.006)),
    18, 0.036, 8, false,
  ), wetMat);
  wetCore.castShadow = true;
  out.add(wetCore);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.005, 5, 18), wetMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, bottomY + 0.27 + i * 0.014, z);
    out.add(ring);
  }

  // 하강 때 들은 과거와 상승 때의 안전 지점이 같은 물건임을 실루엣으로 기억시킨다.
  for (const y of knotYs) {
    for (let i = 0; i < 4; i++) {
      const knot = new THREE.Mesh(new THREE.TorusGeometry(0.072 - i * 0.005, 0.012, 6, 18), wetMat);
      knot.rotation.x = Math.PI / 2 + (i % 2 ? 0.16 : -0.12);
      knot.position.set(x + (i - 1.5) * 0.006, y + i * 0.014, z);
      knot.castShadow = true; out.add(knot);
    }
  }

  // 잘린 끝은 여섯 올로 풀려 수면 아래까지 닿는다. 모두 같은 방향이면 빗자루처럼 보여 흩는다.
  const frayMat = new THREE.MeshStandardMaterial({ color: 0x66513a, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + 0.35;
    const r = 0.045 + (i % 3) * 0.012;
    const fray = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, bottomY + 0.02, z),
      new THREE.Vector3(x + Math.cos(a) * r * 0.45, bottomY - 0.055, z + Math.sin(a) * r * 0.45),
      new THREE.Vector3(x + Math.cos(a) * r, floorY + 0.075 + (i % 2) * 0.025, z + Math.sin(a) * r),
    ]);
    const strand = new THREE.Mesh(new THREE.TubeGeometry(fray, 10, 0.0035, 4, false), frayMat);
    strand.castShadow = true;
    out.add(strand);
  }
  return out;
}

/**
 * 금줄 안으로만 이어지는 성인 여성의 젖은 맨발 자국.
 * 검은 원판을 늘여 놓는 대신 발뒤꿈치·아치·발볼·다섯 발가락이 갈라진 반사 데칼을 만들고,
 * 한 InstancedMesh로 좌우 일곱 보를 그린다. 가까이서는 물막의 끊긴 가장자리가 보이고 비용은 1 draw call이다.
 */
function makeWetFootprintTrail(origin: THREE.Vector3) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const wet = ctx.createLinearGradient(0, 40, 0, 470);
  wet.addColorStop(0, 'rgba(190,210,214,0.78)');
  wet.addColorStop(0.55, 'rgba(126,155,162,0.67)');
  wet.addColorStop(1, 'rgba(84,111,118,0.48)');
  ctx.fillStyle = wet;

  // 왼발 한 장만 만든 뒤 인스턴스의 X 스케일을 뒤집어 오른발로 쓴다.
  ctx.beginPath();
  ctx.moveTo(91, 430);
  ctx.bezierCurveTo(60, 401, 61, 350, 84, 316);
  ctx.bezierCurveTo(103, 288, 88, 252, 88, 213);
  ctx.bezierCurveTo(88, 165, 109, 125, 145, 116);
  ctx.bezierCurveTo(180, 107, 205, 130, 204, 162);
  ctx.bezierCurveTo(203, 194, 175, 219, 161, 246);
  ctx.bezierCurveTo(145, 277, 165, 321, 163, 370);
  ctx.bezierCurveTo(161, 418, 125, 450, 91, 430);
  ctx.fill();

  const toes = [
    [174, 72, 27, 31, -0.12], [138, 61, 21, 26, -0.04], [106, 68, 18, 23, 0.06],
    [80, 82, 15, 19, 0.13], [60, 101, 12, 16, 0.2],
  ] as const;
  for (const [x, y, rx, ry, rot] of toes) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
  }

  // 물이 고르게 묻은 도장처럼 보이지 않도록 작은 마른 틈과 가장자리 파손을 낸다.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  let seed = 173;
  for (let i = 0; i < 54; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const x = 52 + (seed / 233280) * 150;
    seed = (seed * 9301 + 49297) % 233280;
    const y = 54 + (seed / 233280) * 384;
    seed = (seed * 9301 + 49297) % 233280;
    const r = 2 + (seed / 233280) * 7;
    ctx.globalAlpha = 0.18 + (i % 4) * 0.08;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r, i * 0.43, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x26363b,
    map: texture,
    alphaMap: texture,
    transparent: true,
    opacity: 0.76,
    alphaTest: 0.025,
    depthWrite: false,
    roughness: 0.08,
    metalness: 0,
    clearcoat: 0.92,
    clearcoatRoughness: 0.1,
    side: THREE.DoubleSide,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const geometry = new THREE.PlaneGeometry(0.24, 0.44, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const count = 7;
  const trail = new THREE.InstancedMesh(geometry, material, count);
  trail.name = 'well-wet-footprints-instanced';
  trail.castShadow = false;
  trail.receiveShadow = true;
  trail.renderOrder = 3;
  const forward = new THREE.Vector3(0.56, 0, -0.83).normalize();
  const side = new THREE.Vector3(-forward.z, 0, forward.x);
  const yaw = Math.atan2(-forward.x, -forward.z);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0;
    dummy.position.copy(origin)
      .addScaledVector(forward, i * 0.29)
      .addScaledVector(side, left ? -0.075 : 0.075);
    dummy.position.y += i * 0.0012;
    dummy.rotation.set(0, yaw + (left ? -0.055 : 0.075), 0);
    const size = 0.95 + (i % 3) * 0.025;
    dummy.scale.set((left ? 1 : -1) * size, 1, size);
    dummy.updateMatrix();
    trail.setMatrixAt(i, dummy.matrix);
    const fade = 0.72 + i * 0.038;
    trail.setColorAt(i, new THREE.Color(0x26363b).multiplyScalar(fade));
  }
  trail.instanceMatrix.needsUpdate = true;
  if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
  trail.computeBoundingSphere();
  return trail;
}

/** 빈 벽감이 아니라, 가까이 가기 전에도 서로 다른 물증임을 읽을 수 있는 저비용 실루엣. */
function makeNicheEvidence(index: number, anchor: THREE.Vector3, angle: number, floorY: number) {
  const out = new THREE.Group();
  out.position.set(anchor.x, floorY + 0.18, anchor.z);
  out.rotation.y = -angle + Math.PI / 2;
  const fallback = new THREE.Group();
  out.add(fallback);
  const wetCloth = new THREE.MeshStandardMaterial({ color: index === 0 ? 0xc3c7bf : 0x6f5d58, roughness: 0.96 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5f4025, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x251914, roughness: 1 });
  if (index === 0) {
    // 접힌 Tripo 묶음은 작은 침대처럼 읽혔다. 벽걸이 실루엣과 이름표가 한눈에 보이는 환자복으로 교체한다.
    fallback.add(makeHangingHospitalGown());
  } else if (index === 1) {
    const sleeve = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.42), wetCloth);
    sleeve.rotation.x = -Math.PI / 2; sleeve.rotation.z = -0.3; sleeve.position.y = 0.02; fallback.add(sleeve);
    for (let i = 0; i < 8; i++) {
      const nail = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.12 + (i % 3) * 0.03, 5), dark);
      nail.rotation.z = Math.PI / 2 + (i % 2 ? 0.12 : -0.08);
      nail.position.set(-0.34 + i * 0.1, 0.05, 0.2 - (i % 2) * 0.08); fallback.add(nail);
    }
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.16), wood);
    body.position.y = 0.28; body.castShadow = true; fallback.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.3, 7), wood);
    neck.position.set(0.15, 0.47, 0); neck.rotation.z = -0.34; fallback.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.16, 0.14), wood);
    head.position.set(0.22, 0.61, 0); fallback.add(head);
    for (const x of [-0.15, 0.15]) for (const z of [-0.1, 0.1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 10), dark);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(x, 0.15, z); fallback.add(wheel);
    }
  }

  const hero = index === 1
    ? { url: '/models/props/wet-sleeve-nails.glb', height: 0.14, tint: 0.72, yaw: -0.22 }
    : index === 2
      ? { url: '/models/props/wooden-horse-haru.glb', height: 0.62, tint: 0.72, yaw: -0.12 }
      : null;
  if (hero) void Props.loadNormalized(hero.url, hero.height, hero.tint).then((model) => {
      model.rotation.y = hero.yaw;
      model.position.y = index === 2 ? -0.02 : 0.015;
      model.name = `well-niche-evidence-tripo-${index}`;
      out.add(model);
      fallback.visible = false;
    }).catch((error) => console.warn(`[well] niche ${index} evidence fallback retained`, error));
  return out;
}

/** 접힌 침구가 아니라 어린이용 옷으로 읽히는, 젖은 벽걸이 환자복. */
function makeHangingHospitalGown() {
  const out = new THREE.Group();
  out.name = 'well-haru-hanging-hospital-gown';
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xaab9bd, roughness: 0.88, metalness: 0,
    emissive: new THREE.Color(0x10191b), emissiveIntensity: 0.08,
  });
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x6f858b, roughness: 0.92 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x474d4e, roughness: 0.4, metalness: 0.65 });

  const shape = new THREE.Shape();
  shape.moveTo(-0.29, 0.04);
  shape.lineTo(-0.34, 0.56);
  shape.lineTo(-0.54, 0.45);
  shape.lineTo(-0.62, 0.61);
  shape.lineTo(-0.39, 0.82);
  shape.lineTo(-0.17, 0.88);
  shape.quadraticCurveTo(-0.08, 0.75, 0, 0.72);
  shape.quadraticCurveTo(0.08, 0.75, 0.17, 0.88);
  shape.lineTo(0.39, 0.82);
  shape.lineTo(0.62, 0.61);
  shape.lineTo(0.54, 0.45);
  shape.lineTo(0.34, 0.56);
  shape.lineTo(0.29, 0.04);
  shape.quadraticCurveTo(0, -0.015, -0.29, 0.04);
  const gown = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth: 0.025, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.012, bevelThickness: 0.009, curveSegments: 5,
  }), clothMat);
  gown.position.set(0, 0.03, 0);
  gown.rotation.z = -0.025;
  gown.castShadow = true;
  out.add(gown);

  const tube = (points: THREE.Vector3[], radius = 0.006, material = seamMat) => {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, radius, 5, false), material);
    mesh.castShadow = true; out.add(mesh); return mesh;
  };
  tube([new THREE.Vector3(-0.17, 0.91, 0.05), new THREE.Vector3(0, 0.75, 0.055), new THREE.Vector3(0.17, 0.91, 0.05)], 0.008);
  tube([new THREE.Vector3(-0.25, 0.1, 0.053), new THREE.Vector3(-0.18, 0.42, 0.057), new THREE.Vector3(-0.2, 0.72, 0.052)], 0.0045);
  tube([new THREE.Vector3(0.25, 0.1, 0.053), new THREE.Vector3(0.18, 0.42, 0.057), new THREE.Vector3(0.2, 0.72, 0.052)], 0.0045);
  for (let i = 0; i < 4; i++) {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.008, 10), metal);
    button.rotation.x = Math.PI / 2;
    button.position.set(0.035, 0.59 - i * 0.12, 0.061);
    out.add(button);
  }

  const tagTexture = textCanvas(256, 112, (ctx) => {
    ctx.fillStyle = '#ddd8c8'; ctx.fillRect(0, 0, 256, 112);
    ctx.fillStyle = '#403b36'; ctx.font = `700 32px ${serifFamily()}`; ctx.fillText(L('하루', 'ハル'), 16, 42);
    ctx.font = `22px ${serifFamily()}`; ctx.fillText('9 / 20', 16, 82);
    ctx.strokeStyle = '#746d64'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, 250, 106);
  });
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.09),
    new THREE.MeshStandardMaterial({ map: tagTexture, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  tag.position.set(0.19, 0.61, 0.066);
  tag.rotation.z = -0.08;
  out.add(tag);

  const wetHem = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.085),
    new THREE.MeshStandardMaterial({ color: 0x52676c, roughness: 0.3, transparent: true, opacity: 0.58, depthWrite: false }),
  );
  wetHem.position.set(0, 0.095, 0.062);
  wetHem.rotation.z = -0.025;
  out.add(wetHem);

  // 옷걸이와 갈고리를 함께 보여 줘 가로로 놓인 침구가 아니라 걸린 옷임을 멀리서도 고정한다.
  tube([new THREE.Vector3(-0.34, 0.85, -0.015), new THREE.Vector3(0, 0.7, -0.012), new THREE.Vector3(0.34, 0.85, -0.015)], 0.009, metal);
  tube([
    new THREE.Vector3(0, 0.72, -0.012), new THREE.Vector3(0, 0.98, -0.012),
    new THREE.Vector3(0.1, 1.05, -0.012), new THREE.Vector3(0.16, 0.98, -0.012),
  ], 0.009, metal);
  return out;
}

/** 우물 기록물 — 벽 각인 조사 대사 (§4.2 ACT 10~11: 벽 각인, 명부 +9) */
export const WELL_RECORDS = {
  carving: [
    { text: L('벽 한 면이 같은 문장으로 덮여 있다 — 「내 아이가 아니다」.', '壁一面が同じ文で覆われている — 「うちの子じゃない」。') },
    { text: L('아홉 번째 줄부터는 글씨가 아니라 긁힘이다.', '九行目からは、字ではなく引っ掻き傷だ。') },
    { text: L('긁힘의 높이가… 아이 키만큼 낮아진다.', '傷の高さが…子供の背ほどに低くなっていく。') },
  ],
};
