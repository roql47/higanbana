import * as THREE from 'three';
import { SITES, type HigasatoGround } from './ground';

/**
 * 진행 필수 소품과 겹치지 않는 작은 복선 소품.
 * 피안화 군락의 천 조각은 대사만 뜨는 빈 조사점이 되지 않도록 실제 메시로 둔다.
 */
export class ForeshadowProps {
  readonly group = new THREE.Group();
  readonly pairedRibbonPos: THREE.Vector3;

  constructor(scene: THREE.Scene, ground: HigasatoGround) {
    const site = SITES.flower!;
    const x = site.x + 2.15;
    const z = site.z - 1.35;
    const y = ground.heightAt(x, z);
    this.pairedRibbonPos = new THREE.Vector3(x, y + 0.12, z);

    // 꽃 사이에서 천이 뜨지 않게 받쳐 주는 작은 젖은 돌.
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.11, 9),
      new THREE.MeshStandardMaterial({ color: 0x343936, roughness: 1 }),
    );
    stone.position.set(x, y + 0.045, z);
    stone.scale.z = 0.72;
    this.group.add(stone);

    const cloth = (color: number, yaw: number, ox: number, oz: number) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.94, side: THREE.DoubleSide });
      // 한 장이 아니라 매듭에서 갈라진 두 꼬리. 비와 흙을 먹은 낮은 채도다.
      for (const [i, dz] of [-1, 1].entries()) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5 - i * 0.08, 0.018, 0.065), mat);
        strip.position.set(x + ox, y + 0.13 + i * 0.012, z + oz + dz * 0.055);
        strip.rotation.y = yaw + dz * 0.18;
        strip.rotation.z = dz * 0.035;
        this.group.add(strip);
      }
    };
    cloth(0x7b2227, 0.42, -0.12, 0.01);   // 삭은 붉은 천
    cloth(0x33495b, -0.7, 0.12, -0.01);   // 비에 바랜 푸른 천

    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x49262a, roughness: 1 }),
    );
    knot.scale.set(1.25, 0.65, 0.9);
    knot.position.set(x, y + 0.155, z);
    this.group.add(knot);

    scene.add(this.group);
  }
}
