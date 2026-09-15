import type {SurveyBuilding} from './survey';
import {LEGACY_GROUND_BOUNDS} from './legacyGround';
/** The authored earth patch owns adjoining yards, including their exposed outer fringe. */
export function usesLegacyEarthYard(b:SurveyBuilding){
  const c=Math.abs(Math.cos(b.angle)),s=Math.abs(Math.sin(b.angle));
  const ex=c*(b.width+3)/2+s*(b.depth+3)/2,ez=s*(b.width+3)/2+c*(b.depth+3)/2;
  const r=LEGACY_GROUND_BOUNDS;
  return b.x+ex>=r.minX&&b.x-ex<=r.maxX&&b.z+ez>=r.minZ&&b.z-ez<=r.maxZ;
}
