import * as THREE from 'three';
import { settings } from '@/core/settings';

/**
 * 캐릭터 채움광 — 카메라와 캐릭터 사이, 머리 높이에 떠 있는 **아주 짧은 사거리**의 점광.
 *
 * 마을의 유일한 그림자 광원인 초칭은 골반 높이에서 옆·아래로 비춘다. 그래서 카메라를 정면으로
 * 돌리면 얼굴 평면에 확산광이 거의 닿지 않고, 이목구비가 검은 덩어리로 뭉개진다
 * (2026-08-20 "정면에서 메시가 뭉개져 보임" 리포트).
 *
 * 사거리를 1.5 m 안쪽으로 묶어두는 것이 핵심이다 — 지면·건물·요괴에는 전혀 새지 않고
 * 캐릭터 상반신만 살린다. 밤의 어둠(= 난이도)은 그대로 두고 실루엣만 읽히게 하는 것이 목적.
 *
 * 세기는 `settings.fill.intensity` 로만 조절한다. `visible` 을 껐다 켜면 씬의 라이트 **개수**가
 * 바뀌어 셰이더가 재컴파일되고 프레임이 튄다 (초칭이 밝기로만 단계를 표현하는 것과 같은 이유).
 * intensity/color/distance 는 전부 유니폼이라 매 프레임 바꿔도 공짜다.
 */
export class FaceFill {
  readonly light: THREE.PointLight;
  private toCam = new THREE.Vector3();

  constructor(scene: THREE.Object3D) {
    const f = settings.fill;
    this.light = new THREE.PointLight(f.color, f.intensity, f.distance, 2);
    this.light.castShadow = false;
    this.light.name = 'face-fill';
    scene.add(this.light);
  }

  /**
   * @param feet      캐릭터 발밑(월드) — controller.position
   * @param camPos    카메라 위치. 이 방향으로 띄워서 **보이는 쪽**을 항상 비춘다
   * @param levelMul  초칭 단계 배율 (등불이 꺼져 있으면 채움광도 같이 죽인다)
   */
  update(feet: THREE.Vector3, camPos: THREE.Vector3, levelMul = 1) {
    const f = settings.fill;
    this.light.color.set(f.color);
    this.light.intensity = f.intensity * levelMul;
    this.light.distance = f.distance;

    this.toCam.set(camPos.x - feet.x, 0, camPos.z - feet.z);
    if (this.toCam.lengthSq() > 1e-6) this.toCam.normalize();
    else this.toCam.set(0, 0, 1);

    this.light.position.set(
      feet.x + this.toCam.x * f.offset,
      feet.y + f.height,
      feet.z + this.toCam.z * f.offset,
    );
  }
}
