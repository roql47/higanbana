import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { TerrainTextures } from '../terrain';
import type { Surface } from '@/audio/sfx';
import { settings } from '@/core/settings';
import { VillageGround, PADDY_WATER } from './ground';
import { Paddy } from './paddy';
import { ToriiPath } from './torii';
import { Mist } from './mist';

export { VillageGround, PADDY_WATER } from './ground';

/**
 * 마을 한 구역. Phase H1 은 **논두렁 → 센본토리이 참배로 → 신사 언덕** 까지만 세운다.
 * (마을 골목·야구라·배전·피안화는 H3~H4)
 */
export class Village {
  readonly ground: VillageGround;
  readonly paddy: Paddy;
  readonly torii: ToriiPath;
  readonly mist: Mist;
  /** 스폰: 참배로 남쪽 끝, 논 한가운데. 북(−Z)을 보면 토리이 터널이 보인다 */
  readonly spawn = new THREE.Vector3();

  constructor(scene: THREE.Scene, physics: Physics, textures: TerrainTextures, opts: { riceBudget?: number } = {}) {
    this.ground = new VillageGround(scene, physics, textures);
    this.paddy = new Paddy(scene, this.ground, opts.riceBudget ?? 90000);
    this.torii = new ToriiPath(scene, physics, this.ground, { startS: 70, count: 52, spacing: 1.35 });
    this.mist = new Mist(scene);

    const p = this.ground.roadAt(26);
    this.spawn.set(p.x, this.ground.heightAt(p.x, p.z) + 0.05, p.z);

    scene.fog = new THREE.FogExp2(settings.night.fogColor, settings.night.fogDensity);
  }

  update(dt: number, center: THREE.Vector3) {
    this.paddy.update(dt);
    this.mist.update(dt, center);
  }

  heightAt(x: number, z: number) { return this.ground.heightAt(x, z); }
  surfaceAt(p: THREE.Vector3): Surface { return this.ground.surfaceAt(p); }
  /** 이 아래로 떨어지면 리스폰 */
  get killY() { return PADDY_WATER - 3; }
}
