import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { TerrainTextures } from '../terrain';
import type { Surface } from '@/audio/sfx';
import { settings } from '@/core/settings';
import { HigasatoGround, SITES, PADDY_WATER } from './ground';
// 레이아웃과 무관한 구성 요소는 기존 마을 모듈을 그대로 쓴다 (아래 GroundAdapter 주석 참고)
import { Paddy } from '../village/paddy';
import { ToriiPath } from '../village/torii';
import { Mist } from '../village/mist';
import { Cedars } from '../village/trees';
import { BambooGrove } from '../village/bamboo';
import { Graveyard } from '../village/graveyard';
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
import { Shell, Well, BusStop } from './blockouts';
import { Signposts } from './signposts';
import { Hamlet } from './minka';
import { Speakers } from './speaker';

export { HigasatoGround, SITES, PADDY_WATER, ROUTES } from './ground';
export type { Route } from './ground';

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
  readonly school: Shell;
  readonly inn: Shell;
  readonly manor: Shell;
  readonly well: Well;
  readonly busStop: BusStop;
  /** 골목에 늘어선 민가 */
  readonly hamlet: Hamlet;
  /** 갈래길 입구의 도표 — 어느 길이 어디로 가는지 */
  readonly signposts: Signposts;
  /** 마을 방송탑 + 공고판 (ACT 4) */
  readonly speakers: Speakers;
  readonly eaveChochin: EaveChochin;
  /** 프롤로그가 끝난 뒤 플레이가 시작되는 자리 (금줄 게이트 안쪽) */
  readonly spawn = new THREE.Vector3();
  /**
   * 센본토리이 터널이 시작·끝나는 참배로 호길이. 카메라 구속(`inToriiCorridor`)과
   * 피안화 식재 제외 구간이 같은 숫자를 봐야 한다 — 따로 적어 두면 어긋난다(실제로 어긋났었다).
   */
  readonly toriiS0: number;
  readonly toriiS1: number;

  constructor(scene: THREE.Scene, physics: Physics, textures: TerrainTextures, opts: { riceBudget?: number; treeBudget?: number } = {}) {
    this.ground = new HigasatoGround(scene, physics, textures);
    const g = asGround(this.ground);
    const trees = opts.treeBudget ?? 700;

    this.paddy = new Paddy(scene, g, opts.riceBudget ?? 90000);
    // 센본토리이: 신사 언덕을 오르는 마지막 구간. 길이(count×spacing)가 남은 참배로보다 길면
    // 뒤쪽이 잘린다 — z −8 에서 경내(z −48)까지 약 42 m 에 맞춘 30개
    const TORII_N = 30, TORII_SP = 1.35;
    this.toriiS0 = this.ground.sAtZ(-8);
    this.toriiS1 = this.toriiS0 + TORII_N * TORII_SP;
    this.torii = new ToriiPath(scene, physics, g, { startS: this.toriiS0, count: TORII_N, spacing: TORII_SP });
    const plant = plantingGround(this.ground);
    this.cedars = new Cedars(scene, physics, plant, { target: trees });
    // 대나무 숲: 동쪽 대숲길(⑤)을 감싼다 — 여관과 폐교 사이가 가장 빽빽하다
    this.bamboo = new BambooGrove(scene, physics, plant, {
      area: { x0: 34, z0: 6, x1: 78, z1: 56 },
      target: Math.round(900 * (trees / 700)),
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
    // 무연불 묘지 — 뒷산길 중턱
    this.graveyard = new Graveyard(scene, physics, g, {
      center: new THREE.Vector3(SITES.graveyard!.x, 0, SITES.graveyard!.z), radius: 13,
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
    });
    this.mist = new Mist(scene, 130);

    // --- 스토리 구조물 ---
    this.tablet = new StoneTablet(scene, physics, this.ground);
    this.hokora = new Hokora(scene, physics, this.ground);
    // 제단은 신사가 아니라 **마을 정 가운데**(SITES.altar) — 왕복 동선을 절반으로 줄인다
    this.pedestals = new Pedestals(scene, physics, this.ground, new THREE.Vector3(
      SITES.altar!.x, this.ground.heightAt(SITES.altar!.x, SITES.altar!.z), SITES.altar!.z));
    this.school = new Shell(scene, physics, this.ground, { id: 'school', site: SITES.school!, name: '彼ヶ里小学校', door: 'x-' });
    this.inn = new Shell(scene, physics, this.ground, { id: 'inn', site: SITES.inn!, name: '旅館 ひがん荘', door: 'x-' });
    this.manor = new Shell(scene, physics, this.ground, { id: 'manor', site: SITES.manor!, name: '', door: 'x-' });
    this.well = new Well(scene, physics, this.ground);
    this.busStop = new BusStop(scene, physics, this.ground);
    // 마을 골목 — 민가가 길 양옆에 늘어서며 마을 한복판의 빈 들판을 채운다
    this.hamlet = new Hamlet(scene, physics, this.ground, { lanterns: 5 });
    this.signposts = new Signposts(scene, physics, this.ground);
    // 마을 방송탑 — 초입(공고판)과 광장. ACT 4 의 방송이 여기서 난다
    this.speakers = new Speakers(scene, physics, this.ground);
    // 처마의 초칭 — 미오가 처음 빛을 얻는 자리. 공고판 근처 집에 걸린다(각색 6 C안)
    this.eaveChochin = new EaveChochin(scene, this.ground, this.hamlet, this.speakers.noticePos);

    // 플레이 시작: 금줄 게이트 안쪽 (온 길로는 돌아갈 수 없다)
    const sp = this.ground.roadAt(this.ground.sAtZ(80));
    this.spawn.set(sp.x, this.ground.heightAt(sp.x, sp.z) + 0.05, sp.z);

    scene.fog = new THREE.FogExp2(settings.night.fogColor, settings.night.fogDensity);
  }

  async loadAssets() { await Promise.all([this.landmarks.load(), this.cedars.load()]); }

  update(dt: number, center: THREE.Vector3) {
    this.paddy.update(dt);
    this.square.update(dt);
    this.landmarks.update(dt);
    this.shrine.update(dt);
    this.higanbana.update(dt);
    this.hokora.update(dt);
    this.pedestals.update(dt);
    this.hamlet.update(dt);
    this.eaveChochin.update(dt);
    const indoors = this.isIndoors(center);
    this.mist.group.visible = !indoors;
    if (!indoors) this.mist.update(dt, center);
  }

  isIndoors(p: THREE.Vector3) {
    return this.house.contains(p) || this.hokora.contains(p)
      || this.school.contains(p) || this.inn.contains(p) || this.manor.contains(p);
  }

  inToriiCorridor(p: THREE.Vector3): boolean {
    if (this.torii.count === 0) return false;
    const near = this.ground.nearestRoad(p.x, p.z);
    if (near.d > 2.8) return false;
    return near.s > this.toriiS0 - 2 && near.s < this.toriiS1 + 2;
  }


  heightAt(x: number, z: number) { return this.ground.heightAt(x, z); }
  surfaceAt(p: THREE.Vector3): Surface { return this.house.surfaceAt(p) ?? this.ground.surfaceAt(p); }
  get killY() { return PADDY_WATER - 3; }
}
