import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { TerrainTextures } from '../terrain';
import type { Surface } from '@/audio/sfx';
import { settings } from '@/core/settings';
import { VillageGround, PADDY_WATER } from './ground';
import { Paddy } from './paddy';
import { ToriiPath } from './torii';
import { Mist } from './mist';
import { Cedars } from './trees';
import { House } from './house';
import { MatsuriSquare } from './matsuri';
import { Landmarks } from './landmarks';
import { Shrine } from './shrine';
import { Higanbana } from './higanbana';

export { VillageGround, PADDY_WATER } from './ground';

/**
 * 마을 한 구역. Phase H1 은 **논두렁 → 센본토리이 참배로 → 신사 언덕** 까지만 세운다.
 * (마을 골목·야구라·배전·피안화는 H3~H4)
 */
export class Village {
  readonly ground: VillageGround;
  readonly paddy: Paddy;
  readonly torii: ToriiPath;
  readonly cedars: Cedars;
  readonly house: House;
  readonly square: MatsuriSquare;
  readonly landmarks: Landmarks;
  readonly shrine: Shrine;
  readonly higanbana: Higanbana;
  readonly mist: Mist;
  /** 스폰: 참배로 남쪽 끝, 논 한가운데. 북(−Z)을 보면 토리이 터널이 보인다 */
  readonly spawn = new THREE.Vector3();

  constructor(scene: THREE.Scene, physics: Physics, textures: TerrainTextures, opts: { riceBudget?: number; treeBudget?: number } = {}) {
    this.ground = new VillageGround(scene, physics, textures);
    this.paddy = new Paddy(scene, this.ground, opts.riceBudget ?? 90000);
    this.torii = new ToriiPath(scene, physics, this.ground, { startS: this.ground.sAtZ(12), count: 40, spacing: 1.35 });
    this.cedars = new Cedars(scene, physics, this.ground, { target: opts.treeBudget ?? 700 });
    // 폐가: 논두렁 서쪽, 참배로에서 보이는 자리. 현관이 동쪽(참배로 쪽)을 본다
    this.house = new House(scene, physics, {
      position: new THREE.Vector3(-18.2, 0.06, 25.2),
      yaw: -Math.PI / 2,
    });
    // 마츠리 광장: 참배로 동쪽. 불은 켜져 있고 사람은 없다
    this.square = new MatsuriSquare(scene, physics, this.ground, { center: new THREE.Vector3(56, 0, 24), radius: 9.5 });
    this.landmarks = new Landmarks(scene, physics, this.ground);
    this.shrine = new Shrine(scene, physics, this.ground);
    this.higanbana = new Higanbana(scene, this.ground);
    this.mist = new Mist(scene, 130);

    const p = this.ground.roadAt(this.ground.sAtZ(56)); // 스폰: 논 남쪽 — 확장 전(z 34)보다 뒤에서 시작해 접근 거리 ↑
    this.spawn.set(p.x, this.ground.heightAt(p.x, p.z) + 0.05, p.z);

    scene.fog = new THREE.FogExp2(settings.night.fogColor, settings.night.fogDensity);
  }

  /** 비동기 에셋(지장·석등) — 생성자 밖에서 await */
  async loadAssets() { await this.landmarks.load(); }

  update(dt: number, center: THREE.Vector3) {
    this.paddy.update(dt);
    this.square.update(dt);
    this.landmarks.update(dt);
    this.shrine.update(dt);
    this.higanbana.update(dt);
    // 실내에서는 안개 평면이 방을 가로지르므로 끈다
    const indoors = this.house.contains(center);
    this.mist.group.visible = !indoors;
    if (!indoors) this.mist.update(dt, center);
  }

  /** 실내(폐가)인가 */
  isIndoors(p: THREE.Vector3) { return this.house.contains(p); }

  /** 센본토리이 통로 안인가 — 카메라를 조이는 판정에 쓴다 (H2 에서 은신·시야 판정에도) */
  inToriiCorridor(p: THREE.Vector3): boolean {
    if (this.torii.count === 0) return false;
    const near = this.ground.nearestRoad(p.x, p.z);
    if (near.d > 2.8) return false;
    return near.s > this.toriiS0 - 2 && near.s < this.toriiS1 + 2;
  }
  private get toriiS0() { return this.ground.sAtZ(12); }
  private get toriiS1() { return this.toriiS0 + 40 * 1.35; }

  heightAt(x: number, z: number) { return this.ground.heightAt(x, z); }
  surfaceAt(p: THREE.Vector3): Surface { return this.house.surfaceAt(p) ?? this.ground.surfaceAt(p); }
  /** 이 아래로 떨어지면 리스폰 */
  get killY() { return PADDY_WATER - 3; }
}
