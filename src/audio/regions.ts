export type AudioRegion = 'village' | 'prologue' | 'school' | 'well' | 'sandbox';

/** 공통 이동음은 유지하고 구간 전용 소리만 접근 시 준비한다. 누락 키는 요청 시 로드된다. */
export function audioKeyInRegions(key: string, regions: ReadonlySet<AudioRegion>) {
  if (/^(foot\/|hide\/|heart\/|chochin\/|quake\/|throw\/)/.test(key)) return true;
  if (key === 'amb/thunder') return regions.has('prologue');
  if (/^(amb\/|matsuri\/|yokai\/)/.test(key)) return regions.has('village') || regions.has('prologue');
  if (/^(well\/|water\/)/.test(key)) return regions.has('well');
  if (key.startsWith('yuri/')) return regions.has('school');
  if (key.startsWith('combat/')) return regions.has('sandbox');
  return false;
}
