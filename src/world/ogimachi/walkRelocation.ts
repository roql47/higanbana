import * as THREE from 'three';
import type { CharacterController } from '@/character/controller';
import type { ThirdPersonCamera } from '@/camera/thirdPerson';

/** Move the preview player and camera together, without sweeping through the village. */
export function relocateWalk(controller: CharacterController, camera: ThirdPersonCamera,
  position: THREE.Vector3, lookAt: THREE.Vector3) {
  controller.teleport(position);
  controller.actualVelocity.set(0, 0, 0);
  controller.accel.set(0, 0, 0);
  controller.externalPush.set(0, 0, 0);
  controller.yaw = Math.atan2(lookAt.x - position.x, lookAt.z - position.z);
  camera.snapBehind(position, lookAt);
}
