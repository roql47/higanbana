import * as THREE from 'three';
import { Props } from '@/world/props';
import type { Physics } from '@/core/physics';
import { settings } from '@/core/settings';
import { createSpatialInstancedMeshes, fogCullDistance, updateChunkDistanceVisibility } from '@/world/instancing';
import type { HigasatoGround } from './ground';

/**
 * 돌 — 산자락의 무너진 지형에만 드물게 놓인다.
 *
 * 맵의 덤불은 제거한다(2026-08-27 사용자 지시). 이 모듈은 `rock-mossy`·`rock-sharp`만
 * 배치하며 삼나무·대나무·벼·피안화는 각 전용 시스템이 맡는다.
 *
 * 왜 `Props.scatter` 를 그대로 못 쓰나: 그쪽은 **초원 섬 전용**이다 — 정사각 전체에 뿌리고
 * "원점에서 keepOut 반경"으로만 비운다. 히가사토는 비켜야 할 것이 길·부지·논이고, 그 판정은
 * `HigasatoGround` 만 안다. 그래서 배치 규칙은 여기가 갖고, 로딩·정규화는 `Props` 를 재사용한다.
 *
 * 그림자는 만들지 않는다 (삼나무·대나무와 같은 이유 — 초칭 큐브 그림자 6면).
 */

interface Kind {
  url: string;
  /** 목표 높이 범위(m) */
  height: [number, number];
  /** 알베도를 눌러 주는 계수 — 낮 기준으로 구워진 텍스처가 초칭을 받으면 하얗게 뜬다 */
  tint: number;
  count: number;
  minSlope: number;
  maxSlope: number;
  /** 길 노면에서 이만큼은 떨어뜨린다 — 통행을 막지 않기 위해 */
  clearPath: number;
  /**
   * 길에 가까울수록 잘 놓인다(어깨를 채운다). 0 이면 거리와 무관.
   * ⚠️ 너무 세게 주면 **길에서 먼 들판이 통째로 빈다** — 처음에 0.8 까지 걷어냈더니 남동
   * 사분면(길이 없는 구역)이 그대로 맨 풀밭이었다. 상한은 아래 `HUG_MAX` 로 묶는다.
   */
  hugPath: number;
  minSpacing: number;
  /** 지형 기울기를 따라 눕힌다 (돌) */
  alignGround: boolean;
  /** 이 높이를 넘는 개체에만 콜라이더 */
  colliderAbove: number;
  /**
   * **무리 짓기** — 씨앗 하나에 `n[0]~n[1]` 개를 반경 `radius` 안에 몰아 놓는다.
   * 균등 랜덤은 "고르게 흩뿌린" 것으로 읽혀 정신없다(사용자 지적 2026-08-26): 실제 바위는
   * 경사가 무너진 자리에 몰려 있다. 눈은 개체가 아니라 **무리**를 센다.
   */
  cluster: { n: [number, number]; radius: number };
  /** 마을 평지 바닥을 피한다 — 사람이 사는 땅에 바위가 굴러다니면 안 된다 */
  avoidVillage: boolean;
}

/**
 * 마을 한복판 — 민가가 늘어선 생활 구역(`Hamlet` 실측 바운딩 48.7×46.6 @ (7,23)).
 * `SITES` 에 없어서 `inSiteZone` 이 못 잡는다. 돌은 여기 들이지 않는다.
 */
const VILLAGE_CORE = { x0: -19, x1: 33, z0: -2, z1: 47 };

/**
 * 뿌리는 범위 — **플레이 공간만**. 지형 판은 200×200 이지만 바깥 테두리는 `rimAt` 이 17~18 m
 * 솟은 산자락이라 플레이어가 갈 일이 없다. 처음엔 판 전체(±94)에 뿌렸더니 경사 조건 때문에
 * 절반 이상이 그 테두리로 갔다 — **눈에 보이지도 않는 곳에 예산을 쓴 것**이다(실측 2026-08-26).
 */
const AREA = { x0: -64, x1: 76, z0: -70, z1: 96 };
/** 길 편중의 상한 — 이 값을 넘겨 걷어내면 길 없는 구역이 빈다 */
const HUG_MAX = 0.5;

const KINDS: Kind[] = [
  /**
   * 돌 — **거의 없다**(사용자 지시 2026-08-26). 산자락이 바위로 부서지는 자리에만 몇 덩이
   * 남긴다. 완만한 땅에 구르는 돌이 「정신없다」의 주범이었다.
   * 아예 없애려면 `count: 0` — 배치 루프가 그대로 건너뛴다.
   */
  { url: '/models/props/rock-mossy.glb', height: [0.5, 1.5], tint: 0.45, count: 20,
    minSlope: 0.38, maxSlope: 0.95, clearPath: 2.2, hugPath: 0, minSpacing: 2.2, alignGround: true, colliderAbove: 1.2,
    cluster: { n: [2, 4], radius: 2.8 }, avoidVillage: true },
  { url: '/models/props/rock-sharp.glb', height: [0.6, 1.9], tint: 0.45, count: 14,
    minSlope: 0.55, maxSlope: 1.3, clearPath: 2.4, hugPath: 0, minSpacing: 2.6, alignGround: true, colliderAbove: 1.3,
    cluster: { n: [2, 4], radius: 2.4 }, avoidVillage: true },
];

interface Slot { kind: number; m: THREE.Matrix4 }

export class Undergrowth {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[] = [];
  count = 0;
  private slots: Slot[] = [];

  constructor(scene: THREE.Scene, private physics: Physics, private ground: HigasatoGround, opts: { density?: number } = {}) {
    this.group.name = 'undergrowth';
    scene.add(this.group);

    const density = opts.density ?? 1;
    const rng = seeded(4517);
    const dummy = new THREE.Object3D();
    const normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const placed: { x: number; z: number; r: number }[] = [];
    let colliders = 0;

    /** 그 자리에 이 종류를 놓아도 되는가 — 씨앗과 무리 구성원이 같은 규칙을 본다 */
    const fits = (kind: Kind, x: number, z: number) => {
      if (x < AREA.x0 || x > AREA.x1 || z < AREA.z0 || z > AREA.z1) return null;
      const h = ground.heightAt(x, z);
      /**
       * ⚠️ 여유를 `waterLevel + 0.6`(= 0.08 m)으로 잡았더니 **마을 한복판이 통째로 물로
       * 판정**됐다 — 이 맵의 평지는 y 0 안팎이고 `waterLevel` 은 **논 수면**(−0.52)이라
       * 둘의 간격이 0.5 m 밖에 안 된다. 실측: 그 구간 후보의 98 %가 여기서 걸렸다.
       * 논은 바로 아래 `paddyMask` 가 거르므로, 여기서는 수면 아래만 막으면 된다.
       */
      if (h < ground.waterLevel + 0.05) return null;
      if (ground.paddyMask(x, z) > 0) return null;         // 배미 안은 물이다
      if (ground.inSiteZone(x, z, 1)) return null;         // 건물 터·경내·광장
      if (kind.avoidVillage && x > VILLAGE_CORE.x0 && x < VILLAGE_CORE.x1
        && z > VILLAGE_CORE.z0 && z < VILLAGE_CORE.z1) return null;
      if (ground.pathDist(x, z) < kind.clearPath) return null;
      const slope = ground.slopeAt(x, z);
      if (slope < kind.minSlope || slope > kind.maxSlope) return null;
      return h;
    };

    KINDS.forEach((kind, ki) => {
      const target = Math.round(kind.count * density);
      let n = 0, tries = 0;
      while (n < target && tries < target * 40) {
        tries++;
        // --- ① 무리의 씨앗 자리 ---
        const sx = AREA.x0 + rng() * (AREA.x1 - AREA.x0);
        const sz = AREA.z0 + rng() * (AREA.z1 - AREA.z0);
        if (fits(kind, sx, sz) === null) continue;
        // 길 편중은 **씨앗에만** 건다 — 구성원마다 걸면 무리가 너덜너덜해진다
        const spd = ground.pathDist(sx, sz);
        if (kind.hugPath > 0 && rng() > 1 - Math.min(HUG_MAX, spd / kind.hugPath)) continue;

        // --- ② 그 둘레에 무리 하나를 앉힌다 ---
        // 무리마다 크기 성격을 준다: 한 덩어리 안에서 크기가 제각각이면 다시 산만해진다
        const groupScale = 0.72 + rng() * 0.56;
        const [gMin, gMax] = kind.cluster.n;
        const groupN = gMin + Math.floor(rng() * (gMax - gMin + 1));
        for (let i = 0; i < groupN && n < target; i++) {
          // √ 분포라 반경 안에 고르게 퍼진다(중심에 뭉치지 않는다)
          const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * kind.cluster.radius;
          const x = sx + Math.cos(a) * rr, z = sz + Math.sin(a) * rr;
          const h = fits(kind, x, z);
          if (h === null) continue;

          const span = kind.height[1] - kind.height[0];
          const height = Math.min(kind.height[1],
            Math.max(kind.height[0], kind.height[0] + span * groupScale * (0.75 + rng() * 0.5)));
          const r = height * 0.42;
          let ok = true;
          for (const p of placed) {
            if ((p.x - x) ** 2 + (p.z - z) ** 2 < Math.max(kind.minSpacing, p.r + r) ** 2) { ok = false; break; }
          }
          if (!ok) continue;

          dummy.position.set(x, h - height * 0.06, z);     // 밑동을 살짝 묻는다
          dummy.rotation.set(0, rng() * Math.PI * 2, 0);
          dummy.scale.setScalar(height);                    // 정규화 높이 1 m 기준
          if (kind.alignGround) {
            groundNormal(ground, x, z, normal);
            dummy.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(up, normal));
          }
          dummy.updateMatrix();
          this.slots.push({ kind: ki, m: dummy.matrix.clone() });
          placed.push({ x, z, r });
          if (height > kind.colliderAbove && colliders < 140) {
            physics.addStaticBox(new THREE.Vector3(x, h + height * 0.4, z), new THREE.Vector3(r * 0.8, height * 0.4, r * 0.8));
            colliders++;
          }
          n++;
        }
      }
    });
    this.count = this.slots.length;
    console.info(`[undergrowth] ${this.count} 개 배치 · 콜라이더 ${colliders}`);
  }

  /**
   * GLB 를 읽어 인스턴싱한다. **실패하면 조용히 아무것도 안 놓는다** — 돌은 없어도 맵이
   * 성립하므로 폴백 지오메트리를 만들지 않는다 (삼나무와 다른 점: 삼나무는 없으면 민둥산이다).
   */
  async load() {
    const results = await Promise.allSettled(
      KINDS.map((k) => Props.loadNormalized(k.url, 1, k.tint)),   // 높이 1 m 로 정규화 → 인스턴스 스케일이 곧 높이
    );
    results.forEach((res, ki) => {
      if (res.status !== 'fulfilled') {
        console.warn(`[undergrowth] ${KINDS[ki]!.url} 로드 실패(건너뜀):`, res.reason);
        return;
      }
      const src = res.value.children[0] as THREE.Mesh | undefined;
      if (!src) return;
      const mine = this.slots.filter((s) => s.kind === ki);
      if (!mine.length) return;
      const { meshes } = createSpatialInstancedMeshes(
        this.group, src.geometry, src.material as THREE.Material,
        mine.map((s) => ({ matrix: s.m })),
        // 청크가 22 m 면 400 개가 **133 청크**로 쪼개진다 — 하나에 3 개꼴이라 프러스텀 컬링으로
        // 아끼는 것보다 드로우콜이 더 든다. 소품은 삼나무·대나무처럼 빽빽하지 않으니 크게 묶는다
        { cellSize: 48, name: `undergrowth-${ki}`, receiveShadow: true, boundsPadding: 1.0 },
      );
      this.meshes.push(...meshes);
    });
  }

  update(center: THREE.Vector3, maxDistance = fogCullDistance(settings.night.fogDensity)) {
    updateChunkDistanceVisibility(this.meshes, center, maxDistance);
  }
}

/** 지형 노멀 — `HigasatoGround` 는 `normalAt` 을 갖고 있지 않아 높이차로 구한다 */
function groundNormal(ground: HigasatoGround, x: number, z: number, out: THREE.Vector3) {
  const e = 0.5;
  const dx = (ground.heightAt(x + e, z) - ground.heightAt(x - e, z)) / (2 * e);
  const dz = (ground.heightAt(x, z + e) - ground.heightAt(x, z - e)) / (2 * e);
  return out.set(-dx, 1, -dz).normalize();
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
