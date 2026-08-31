import * as THREE from 'three';
import { L } from '@/core/i18n';
import type { Physics } from '@/core/physics';
import type { TerrainTextures } from '../terrain';
import type { Surface } from '@/audio/sfx';
import { settings } from '@/core/settings';
import { fogCullDistance } from '@/world/instancing';
import { HigasatoGround, SITES, PADDY_WATER } from './ground';
// 레이아웃과 무관한 구성 요소는 기존 마을 모듈을 그대로 쓴다 (아래 GroundAdapter 주석 참고)
import { Paddy } from '../village/paddy';
import { ToriiPath } from '../village/torii';
import { Mist } from '../village/mist';
import { Cedars } from '../village/trees';
import { BambooGrove } from '../village/bamboo';
import { Graveyard, NARRATIVE_GRAVES } from '../village/graveyard';
import { House } from '../village/house';
import { MatsuriSquare } from '../village/matsuri';
import { Landmarks } from '../village/landmarks';
import { Shrine } from '../village/shrine';
import { Higanbana } from '../village/higanbana';
import type { VillageGround } from '../village/ground';
// 스토리 구조물
import { StoneTablet } from './tablet';
import { Hokora } from './hokora';
import { Pedestals } from './pedestals';
import { EaveChochin } from './eaveChochin';
import { SchoolInterior } from './school';
import { WellShaft } from './wellShaft';
import { Shell, Well, BusStop } from './blockouts';
import { InnInterior } from './inn';
import { ManorInterior } from './manor';
import { ShrineCrypt } from './crypt';
import { Signposts } from './signposts';
import { Hamlet } from './minka';
import { Speakers } from './speaker';
import { ForeshadowProps } from './foreshadowProps';
import { Undergrowth } from './undergrowth';

type RenderZone = 'outside' | 'threshold' | 'interior' | 'underground';

/**
 * 지상 실내의 창문 너머에는 최소한 이 거리까지의 숲·꽃을 남긴다.
 * 통째로 숨기면 드로우콜은 더 줄지만 창밖이 빈 배경색으로 바뀌므로, 청크 단위로만 좁힌다.
 */
const INTERIOR_VEGETATION_DISTANCE = 34;

export { HigasatoGround, SITES, PADDY_WATER, ROUTES } from './ground';
export type { Route } from './ground';

/** 피안제 참사 공식 사망·실종자 수. 묘지 자체가 후반 명부의 숫자를 미리 품는다. */
const HIGASATO_CASUALTIES = 87;
/** 통로·빈 제의 공간까지 포함해 한 사람당 약 12 m². 초칭 사거리(15 m)보다도 넓다. */
const GRAVEYARD_RADIUS = Math.sqrt((HIGASATO_CASUALTIES * 12) / Math.PI);

/**
 * 기존 마을 모듈들은 `VillageGround` 를 타입으로 받는다. `HigasatoGround` 는 그 모듈들이 실제로
 * 쓰는 11개 메서드(heightAt·slopeAt·pathDist·roadAt·roadLength·sAtZ·nearestRoad·paddyMask·
 * paddyCells·size·surfaceAt)를 전부 같은 시그니처로 갖지만, 클래스의 private 필드 때문에
 * TypeScript 구조적 호환이 막힌다. **기존 파일을 건드리지 않기 위해** 여기서 한 번만 캐스팅한다.
 */
export const asGround = (g: HigasatoGround) => g as unknown as VillageGround;

/**
 * 식재용 지형. 삼나무·대나무는 "길에서 `pathDist` 미만이면 심지 않는다"로 공터를 만든다 —
 * **부지 안에서 그 거리를 0 으로 돌려주면** 모듈을 고치지 않고도 건물 터가 비워진다.
 * (프로토타입 체인이라 나머지 메서드·필드는 원본 그대로를 본다)
 */
const plantingGround = (g: HigasatoGround) => {
  const proxy = Object.create(g) as HigasatoGround;
  proxy.pathDist = (x: number, z: number) => (g.inSiteZone(x, z, 3) ? 0 : g.pathDist(x, z));
  return asGround(proxy);
};
/** 같은 이유로, 마을 전체를 받는 모듈(Hiding·Scares)에 넘길 때 쓰는 어댑터 */
export const asVillage = (v: Higasato) => v as unknown as import('../village').Village;

/**
 * 히가사토 — 스토리 맵 (PLAN-STORY §2).
 *
 * 갈래길 5개의 끝마다 목적지가 하나씩 있고, 신사가 허브다.
 *   ① 참배로 → 신사 (도중 서측 골목에 공동우물)
 *   ② 논두렁길 → 할머니의 집
 *   ③ 뒷산 오솔길 → 무연불 묘지 → 오래된 사당
 *   ④ 돌계단 뒷길 → 촌장의 저택
 *   ⑤ 대숲길 → 폐여관 → 폐교
 */
export class Higasato {
  readonly ground: HigasatoGround;
  readonly paddy: Paddy;
  readonly torii: ToriiPath;
  readonly cedars: Cedars;
  readonly bamboo: BambooGrove;
  readonly graveyard: Graveyard;
  readonly house: House;
  readonly square: MatsuriSquare;
  readonly landmarks: Landmarks;
  readonly shrine: Shrine;
  readonly higanbana: Higanbana;
  readonly mist: Mist;
  // 스토리 구조물
  readonly tablet: StoneTablet;
  readonly hokora: Hokora;
  readonly pedestals: Pedestals;
  /** v6.2 부터 폐교는 SchoolInterior 가 건물 전체를 짓는다 — doorPos·contains 등 구 셸 API 를 그대로 제공 */
  readonly school: SchoolInterior;
  /** 폐교 실내 — ACT 8~9 (셸이 외피, 이 모듈이 안) */
  readonly schoolInterior: SchoolInterior;
  /** 공동우물 지하 — ACT 10~11 */
  readonly wellShaft: WellShaft;
  readonly inn: Shell;
  readonly innInterior: InnInterior;
  readonly manor: Shell;
  readonly manorInterior: ManorInterior;
  readonly crypt: ShrineCrypt;
  readonly well: Well;
  readonly busStop: BusStop;
  /** 골목에 늘어선 민가 */
  readonly hamlet: Hamlet;
  /** 갈래길 입구의 도표 — 어느 길이 어디로 가는지 */
  readonly signposts: Signposts;
  /** 마을 방송탑 + 공고판 (ACT 4) */
  readonly speakers: Speakers;
  readonly eaveChochin: EaveChochin;
  /** 메인 게이트와 무관한 선택 복선 소품. */
  readonly foreshadowProps: ForeshadowProps;
  /** 산자락에만 드물게 배치하는 돌. 덤불은 맵에서 제거했다. */
  readonly undergrowth: Undergrowth;
  /** 프롤로그가 끝난 뒤 플레이가 시작되는 자리 (금줄 게이트 안쪽) */
  readonly spawn = new THREE.Vector3();
  /**
   * 센본토리이 터널이 시작·끝나는 참배로 호길이. 카메라 구속(`inToriiCorridor`)과
   * 피안화 식재 제외 구간이 같은 숫자를 봐야 한다 — 따로 적어 두면 어긋난다(실제로 어긋났었다).
   */
  readonly toriiS0: number;
  readonly toriiS1: number;
  /** 지하에서는 지형까지 완전히 가려져 있으므로 렌더만 끌 수 있는 지상 그룹들. */
  private readonly exteriorRenderGroups: THREE.Object3D[] = [];
  private renderZone: RenderZone = 'outside';

  constructor(scene: THREE.Scene, physics: Physics, textures: TerrainTextures, opts: {
    riceBudget?: number;
    treeBudget?: number;
    /** 삼나무와 독립적인 대숲·희귀 바위 품질 배율. */
    vegetationScale?: number;
  } = {}) {
    this.ground = new HigasatoGround(scene, physics, textures);
    const g = asGround(this.ground);
    const trees = opts.treeBudget ?? 420;
    const vegetationScale = opts.vegetationScale ?? 1;

    this.paddy = new Paddy(scene, g, opts.riceBudget ?? 3000);
    /**
     * 신사 언덕을 오르는 마지막 구간의 토리이.
     *
     * 예전엔 30 기를 1.35 m 간격으로 세운 센본토리이였는데, **작고 똑같은 문이 한 줄로 반복**돼서
     * 복도가 아니라 무늬로 보였다(사용자 지시 2026-08-22 「도리이 크기 더 크게, 너무 일렬로
     * 중복해서 깔지 말 것」). 크기를 1.5 배로 올리고(기둥 안쪽 3.9 m · 입목 4.9 m — 실물 명신형
     * 치수) 개수를 절반 이하로 줄여 **하나하나가 문으로 보이게** 한다.
     * 간격·색·좌우 위치는 `ToriiPath` 가 흔들어 준다.
     * 길이(count×spacing)는 z −8 에서 경내(z −48)까지 약 42 m 에 맞춘다.
     */
    const TORII_N = 12, TORII_SP = 3.5, TORII_SCALE = 1.5;
    this.toriiS0 = this.ground.sAtZ(-8);
    this.toriiS1 = this.toriiS0 + TORII_N * TORII_SP;
    this.torii = new ToriiPath(scene, physics, g, { startS: this.toriiS0, count: TORII_N, spacing: TORII_SP, scale: TORII_SCALE });
    const plant = plantingGround(this.ground);
    this.cedars = new Cedars(scene, physics, plant, { target: trees });
    // 대나무 숲: 동쪽 대숲길(⑤)을 감싼다 — 여관과 폐교 사이가 가장 빽빽하다.
    // 예전 44×50 m / 900대는 폐교 바깥까지 직사각형으로 번져 숲의 경계도 둔하고 콜라이더도
    // 과했다. 길의 시작·여관·폐교를 잇는 중심부만 38×44 m로 조이고, 줄기는 250대로 낮춘다.
    // 면적과 수를 같이 줄여 외곽은 비우되 길 양옆의 시야 4 m 성격은 남긴다.
    this.bamboo = new BambooGrove(scene, physics, plant, {
      area: { x0: 37, z0: 9, x1: 75, z1: 53 },
      target: Math.round(250 * vegetationScale),
      colliderLimit: Math.round(60 * vegetationScale),
    });
    // 할머니의 집 — 논 남단. 현관이 동쪽(논두렁길 쪽)을 본다
    this.house = new House(scene, physics, {
      position: new THREE.Vector3(SITES.house!.x, this.ground.heightAt(SITES.house!.x, SITES.house!.z) + 0.02, SITES.house!.z),
      yaw: -Math.PI / 2,
    });
    // 마츠리 광장 — 마을 동측. 불은 켜져 있고 사람은 없다
    this.square = new MatsuriSquare(scene, physics, g, {
      center: new THREE.Vector3(SITES.square!.x, 0, SITES.square!.z), radius: 9.5,
    });
    // 길가 피안화가 민가 외벽·툇마루를 피하려면 집들의 회전된 실제 footprint가 먼저 필요하다.
    this.hamlet = new Hamlet(scene, physics, this.ground, { lanterns: 5 });
    // 무연불 묘지 — 뒷산길 중턱. 일반 묘열 85 + 서사 묘석 2 = 참사 희생자 87명.
    // 반경은 인원수 × 12 m²에서 역산한다. 무작정 큰 40 m 밭이 아니라 숫자에 근거한 공간이면서,
    // 여전히 초칭 사거리(15 m) 밖에 어둠이 남아 ACT 12 미로가 성립한다.
    this.graveyard = new Graveyard(scene, physics, g, {
      center: new THREE.Vector3(SITES.graveyard!.x, 0, SITES.graveyard!.z),
      radius: GRAVEYARD_RADIUS,
      // 아이 무덤·붉은 천 표식 묘석은 별도 메시라 일반 묘열에서 뺀다 (수는 graveyard.ts 가 센다)
      target: HIGASATO_CASUALTIES - NARRATIVE_GRAVES,
      exclude: [SITES.house!, SITES.flower!, SITES.hokora!].map((s) => ({ x: s.x, z: s.z, w: s.w + 2, d: s.d + 2 })),
    });
    this.landmarks = new Landmarks(scene, physics, g);
    this.shrine = new Shrine(scene, physics, g);
    // 피안화: 터널 구간만 비우고, **남단 → 도리이 앞**을 붉은 길로 조인다.
    //   기본값(구 마을의 s 44~101)을 그대로 쓰면 ACT 1 이 달리는 구간이 통째로 제외된다.
    //   군락(안전지대)도 이 맵의 `flower` 부지 위로 옮긴다 — 구 마을 좌표 그대로면 논 한복판이었다
    this.higanbana = new Higanbana(scene, g, {
      tunnel: [this.toriiS0 - 2, this.toriiS1],
      cluster: { x: SITES.flower!.x, z: SITES.flower!.z, r: 5.5 },
      corridor: { s0: this.ground.sAtZ(70), s1: this.toriiS0 - 3 },
      reject: (x, z) => {
        // 고정 부지 — 꽃밭 자체만 예외. 0.8 m 여유로 벽·기단의 두께까지 비운다.
        for (const s of Object.values(SITES)) {
          if (s.id === 'flower') continue;
          if (Math.abs(x - s.x) < s.w / 2 + 0.8 && Math.abs(z - s.z) < s.d / 2 + 0.8) return true;
        }
        // 절차 민가 — 회전된 지붕/평상 외곽을 로컬 사각형으로 검사한다.
        for (const h of this.hamlet.houses) {
          const dx = x - h.x, dz = z - h.z;
          const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
          const lx = dx * c - dz * s;
          const lz = dx * s + dz * c;
          const roof = (h.eave ?? 1) + 0.25;
          const front = h.engawa ? 1.35 : roof;
          if (Math.abs(lx) < h.w / 2 + roof && Math.abs(lz) < h.d / 2 + front) return true;
        }
        return false;
      },
    });
    this.foreshadowProps = new ForeshadowProps(scene, this.ground);
    this.undergrowth = new Undergrowth(scene, physics, this.ground, { density: vegetationScale });
    this.mist = new Mist(scene, 130);

    // --- 스토리 구조물 ---
    this.tablet = new StoneTablet(scene, physics, this.ground);
    this.hokora = new Hokora(scene, physics, this.ground);
    // 제단은 신사가 아니라 **마을 정 가운데**(SITES.altar) — 왕복 동선을 절반으로 줄인다
    this.pedestals = new Pedestals(scene, physics, this.ground, new THREE.Vector3(
      SITES.altar!.x, this.ground.heightAt(SITES.altar!.x, SITES.altar!.z), SITES.altar!.z));
    // 폐교 — v6.2 부터 SchoolInterior 가 **건물 전체**(하미판 외벽·창 줄·현관·지붕)를 짓는다.
    // 범용 셸은 여관·저택만 남고, `school` 필드는 같은 인스턴스의 별칭(doorPos·contains 구 API 유지)
    this.schoolInterior = new SchoolInterior(scene, physics, this.ground);
    this.school = this.schoolInterior;
    this.wellShaft = new WellShaft(scene, physics, this.ground);
    this.inn = new Shell(scene, physics, this.ground, { id: 'inn', site: SITES.inn!, name: L('여관 히간장', '旅館 ひがん荘'), door: 'x-', h: 6.2 });
    this.innInterior = new InnInterior(scene, physics, this.ground);
    /**
     * 촌장 저택 — `h` 를 넘기지 않아 기본값 3.4 를 쓰고 있었다. 그 결과 지붕까지 5.57 m 로
     * **마을에서 제일 낮은 집**이 됐다: 민가 용마루 7.48 · 할머니의 집 7.4 · 여관 8.7.
     * 마을에서 가장 힘센 집이 가장 작아 보이면 ACT 13~15 의 무게가 안 선다 (2026-08-26 실측).
     * 6.6 은 `Shell` 의 2층 분기(h ≥ 5)도 켠다 — 2층 바닥 슬래브 + 위층 판자창 줄이 붙어
     * 벽만 높은 창고가 아니라 층이 있는 집으로 읽힌다. 지붕까지 9.1 m 로 마을 최고가 된다.
     */
    this.manor = new Shell(scene, physics, this.ground, { id: 'manor', site: SITES.manor!, name: '', door: 'x-', h: 6.6 });
    this.manorInterior = new ManorInterior(scene, physics, this.ground);
    // 신사 지하·검은 문 (ACT 17~18 무대) — 입구 격자는 닫힌 채, 공간·앵커만 상주
    this.crypt = new ShrineCrypt(scene, physics, this.ground);
    this.well = new Well(scene, physics, this.ground);
    this.busStop = new BusStop(scene, physics, this.ground);
    this.signposts = new Signposts(scene, physics, this.ground);
    // 마을 방송탑 — 초입(공고판)과 광장. ACT 4 의 방송이 여기서 난다
    this.speakers = new Speakers(scene, physics, this.ground);
    // 처마의 초칭 — 미오가 처음 빛을 얻는 자리. 공고판 근처 집에 걸린다(각색 6 C안)
    this.eaveChochin = new EaveChochin(scene, this.ground, this.hamlet, this.speakers.noticePos);

    // 물리 콜라이더와 스토리 객체는 건드리지 않는다. `visible` 은 렌더 트리만 끄므로
    // 우물 석실·저택 기록실·신사 지하에서 가려진 지상을 GPU가 계속 그리는 낭비만 없앤다.
    this.exteriorRenderGroups.push(
      this.ground.mesh, this.ground.apron,
      this.paddy.group, this.torii.group, this.cedars.group, this.bamboo.group,
      this.graveyard.group, this.house.group, this.square.group, this.landmarks.group,
      this.shrine.group, this.higanbana.group, this.mist.group, this.tablet.group,
      this.hokora.group, this.pedestals.group, this.schoolInterior.group,
      this.inn.group, this.innInterior.group, this.manor.group,
      this.well.group, this.busStop.group, this.hamlet.group, this.signposts.group,
      this.speakers.group, this.eaveChochin.group, this.foreshadowProps.group,
      this.undergrowth.group,
    );

    // 플레이 시작: 금줄 게이트 안쪽 (온 길로는 돌아갈 수 없다)
    const sp = this.ground.roadAt(this.ground.sAtZ(80));
    this.spawn.set(sp.x, this.ground.heightAt(sp.x, sp.z) + 0.05, sp.z);

    scene.fog = new THREE.FogExp2(settings.night.fogColor, settings.night.fogDensity);
  }

  async loadAssets() {
    await Promise.all([
      this.landmarks.load(), this.cedars.load(), this.bamboo.load(), this.undergrowth.load(),
      this.busStop.loadAssets(),
    ]);
  }

  update(dt: number, center: THREE.Vector3, entryReveal = 1) {
    const zone = this.zoneAt(center);
    if (zone !== this.renderZone) {
      this.renderZone = zone;
      const showExterior = zone !== 'underground';
      for (const group of this.exteriorRenderGroups) group.visible = showExterior;
    }
    // 지상 실내는 창밖 근경을 유지하고, 안개에 묻혀 보이지 않는 원경 청크만 일찍 자른다.
    // 지하는 부모 그룹 자체가 꺼져 있어 0은 상태 정리를 위한 값일 뿐 실제 드로우는 없다.
    // 하차 직후 카메라는 남쪽의 높은 위치에서 162° 돌아 마을을 본다. 회전 첫 프레임부터
    // 안개 너머의 숲 청크까지 전부 활성화하면, 아직 화면에 들어오지도 않은 청크가 한꺼번에
    // 렌더 목록에 붙는다. 진행률에 맞춰 가시 거리를 넓히면 카메라가 향하는 범위와 활성 범위가
    // 함께 열린다. 마지막에는 기존 fogCullDistance와 정확히 같아져 플레이 화질은 바뀌지 않는다.
    const reveal = THREE.MathUtils.clamp(entryReveal, 0, 1);
    const revealDistance = reveal < 0.999
      ? THREE.MathUtils.lerp(70, fogCullDistance(settings.night.fogDensity), THREE.MathUtils.smoothstep(reveal, 0, 1))
      : undefined;
    const vegetationDistance = zone === 'outside' || zone === 'threshold' ? revealDistance
      : zone === 'interior' ? INTERIOR_VEGETATION_DISTANCE : 0;

    this.paddy.update(dt);
    this.square.update(dt);
    this.landmarks.update(dt);
    this.shrine.update(dt);
    this.cedars.update(center, vegetationDistance);
    this.bamboo.update(center, vegetationDistance);
    this.undergrowth.update(center, vegetationDistance);
    this.higanbana.update(dt, center, vegetationDistance);
    this.hokora.update(dt);
    this.pedestals.update(dt);
    this.graveyard.update(dt, center);
    this.hamlet.update(dt);
    this.eaveChochin.update(dt);
    this.schoolInterior.update(dt);
    this.wellShaft.update(dt);
    this.well.update(dt);
    this.inn.update(dt);
    this.manor.update(dt);
    const indoors = zone !== 'outside';
    this.mist.group.visible = !indoors;
    if (!indoors) this.mist.update(dt, center);
  }

  isIndoors(p: THREE.Vector3) {
    return this.zoneAt(p) !== 'outside';
  }

  /** 숨은 서사 효과도 첫 등장 때 끊기지 않도록 로딩 화면 아래에서만 재질을 굽는다. */
  setHiddenEffectsPrewarm(on: boolean) {
    this.hamlet.setHiddenEffectPrewarm(on);
    this.pedestals.setHiddenEffectPrewarm(on);
    this.graveyard.setHiddenEffectPrewarm(on);
  }

  private zoneAt(p: THREE.Vector3): RenderZone {
    // 지하 셋은 천장/벽으로 지상과 완전히 분리돼 있다. XZ만 보지 않고 높이도 함께 봐야
    // 지상에서 같은 좌표를 지날 때 마을이 사라지지 않는다.
    if (this.wellShaft.inChamber(p)) return 'underground';
    if (p.y < this.manorInterior.archiveFloorY + 2.7
      && p.distanceToSquared(this.manorInterior.archiveEnter) < 11 * 11) return 'underground';
    if (p.y < this.crypt.floorY + 3.2
      && (p.distanceToSquared(this.crypt.landing) < 16 * 16
        || p.distanceToSquared(this.crypt.gatePos) < 16 * 16)) return 'underground';

    // 문턱에서 원경 청크가 한꺼번에 바뀌지 않도록 문 밖 앵커에서 조금 더 들어간 뒤만
    // 포털 컬링을 켠다. 기존 `isIndoors` 용도(안개/카메라)는 아래의 얕은 판정으로 보존한다.
    const deep = (inside: boolean, door: THREE.Vector3, threshold: number) => inside
      && Math.hypot(p.x - door.x, p.z - door.z) > threshold;
    if (deep(this.house.contains(p), this.house.entrance, 3.2)
      || deep(this.hokora.contains(p), this.hokora.ejectPos, 4.5)
      || deep(this.school.contains(p), this.school.doorPos, 3.2)
      || deep(this.inn.contains(p), this.inn.doorPos, 3.2)
      || deep(this.manor.contains(p), this.manor.doorPos, 3.2)) return 'interior';

    if (this.house.contains(p) || this.hokora.contains(p) || this.school.contains(p)
      || this.inn.contains(p) || this.manor.contains(p)) return 'threshold';
    return 'outside';
  }

  inToriiCorridor(p: THREE.Vector3): boolean {
    if (this.torii.count === 0) return false;
    const near = this.ground.nearestRoad(p.x, p.z);
    if (near.d > 2.8) return false;
    return near.s > this.toriiS0 - 2 && near.s < this.toriiS1 + 2;
  }


  heightAt(x: number, z: number) { return this.ground.heightAt(x, z); }
  surfaceAt(p: THREE.Vector3): Surface { return this.house.surfaceAt(p) ?? this.ground.surfaceAt(p); }
  get killY() {
    // 우물 지하(지형 −12 m)가 생기면서 킬 평면이 방 하나를 통째로 삼키면 안 된다.
    // 방 바닥보다 3 m 아래 — 진짜 낙사(지오메트리 틈)만 잡는다.
    // 신사 지하·저택 기록실도 같은 가드에 넣는다
    return Math.min(PADDY_WATER - 3, this.wellShaft.chamber.floorY - 3, this.crypt.floorY - 3, this.manorInterior.archiveFloorY - 3);
  }
}
