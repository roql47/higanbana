/** 프레임레이트 독립 지수 감쇠: current → target 으로 `lambda`(1/s) 속도로 수렴 */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** 각도용 damp (−π..π 래핑) */
export function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const DEG = Math.PI / 180;

/** Hermite 보간 (a→b 구간을 0→1 로). a > b 여도 동작(역방향) */
export function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
