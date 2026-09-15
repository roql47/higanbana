import type { SurveyPoint } from '@/world/ogimachi/survey';

/** A story route in survey metres. Legacy sAtZ markers map to distance, never terrain coordinates. */
export class OgimachiStoryRoute {
  readonly roadLength: number;
  private cumulative = [0];
  constructor(readonly points: SurveyPoint[], readonly heightAt: (x: number, z: number) => number) {
    if (points.length < 2) throw new Error('Story route needs at least two points');
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      this.cumulative.push(this.cumulative[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.roadLength = this.cumulative.at(-1)!;
  }
  sAtZ(legacyZ: number) { return 94 - legacyZ; }
  private pointAt(s: number, out: { x: number; z: number }) {
    s = Math.max(0, Math.min(s, this.roadLength));
    let i = 1;
    while (i < this.points.length - 1 && this.cumulative[i]! < s) i++;
    const a = this.points[i - 1]!, b = this.points[i]!;
    const length = this.cumulative[i]! - this.cumulative[i - 1]!;
    const t = (s - this.cumulative[i - 1]!) / length;
    out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
    return out;
  }
  private before = { x: 0, z: 0 };
  private after = { x: 0, z: 0 };
  roadAt(s: number, out = { x: 0, z: 0, dirX: 0, dirZ: 0 }) {
    s = Math.max(0, Math.min(s, this.roadLength));
    this.pointAt(s, out);
    // Survey roads are polylines. Blend heading across their corners without
    // moving the surveyed centreline or changing story distance markers.
    this.pointAt(s - 2, this.before); this.pointAt(s + 2, this.after);
    const dx = this.after.x - this.before.x, dz = this.after.z - this.before.z;
    const length = Math.hypot(dx, dz);
    out.dirX = dx / length; out.dirZ = dz / length;
    return out;
  }
  nearestRoad(x: number, z: number) {
    let result = { x: 0, z: 0, s: 0, d: Infinity };
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!, b = this.points[i]!, dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < result.d) result = { x: px, z: pz, s: this.cumulative[i - 1]! + Math.hypot(dx, dz) * t, d };
    }
    return result;
  }
  paddyMask() { return 0; }
  slopeAt(x: number, z: number) { return Math.hypot(this.heightAt(x + .5, z) - this.heightAt(x - .5, z), this.heightAt(x, z + .5) - this.heightAt(x, z - .5)); }
}
