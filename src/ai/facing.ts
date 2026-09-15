/** +Z가 정면인 배우의 수평 회전. 근접 시 방향을 유지하고 최단 호로만 돈다. */
export function facingYaw(current: number, dx: number, dz: number, dt: number, deadZone = 0.7, speed = 1.25) {
  if (dx * dx + dz * dz < deadZone * deadZone || dt <= 0) return current;
  const target = Math.atan2(dx, dz);
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const step = Math.min(Math.abs(delta) * (1 - Math.exp(-4 * dt)), speed * dt);
  return current + Math.sign(delta) * step;
}
