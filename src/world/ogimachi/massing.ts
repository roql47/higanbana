import type {SurveyBuilding} from './survey';
import {ONSEN_ID,onsenProfile} from './onsenStudy';
/** Roof treatment for blockout review only; no claim of identifying unreviewed houses. */
export function massingRoof(b:SurveyBuilding):'steep'|'low'|'shed'{
  if(b.model==='wada-itakura')return 'steep';
  if(b.model==='wada-hasagoya')return 'low';
  if(b.model==='storehouse'||b.width<6)return 'shed';
  if(['farmhouse','wada-main','hakusuien','irori-shop','irori-restaurant'].includes(b.model))return 'steep';
  if(b.reviewId)return 'low';
  return b.x>-50&&b.x<330&&b.z>-220&&b.z<1350&&b.width>7&&b.width<16&&b.depth>11&&b.depth<27?'steep':'low';
}
export function massingSize(b:SurveyBuilding){
  const roof=massingRoof(b),wall=roof==='shed'?2.5:roof==='steep'?3.3:Math.min(6.2,Math.max(3,b.levels*2.6));
  const generic={roof,wall,eave:wall,rise:roof==='steep'?b.width*.78:roof==='shed'?b.width*.20:b.width*.24,bodyWidth:b.width*.89,bodyDepth:b.depth*.91,roofWidth:b.width,roofDepth:b.depth,thickness:roof==='steep'?.45:.12,reviewed:false};
  // Reuse the individually authored silhouette estimates, not a generic pitch.
  // Wada's recorded dimensions describe its body; the others describe roof envelopes.
  const profiles:Record<string,Partial<typeof generic>>={
    'wada-main':{wall:3.5,eave:3.65,rise:8.8,bodyWidth:12.8,bodyDepth:22.3,roofWidth:15,roofDepth:24.1,thickness:.65},
    hakusuien:{wall:3.05,eave:3.73,rise:6.82,bodyWidth:10,bodyDepth:17.85,thickness:.65},
    'irori-restaurant':{wall:3.4,eave:3.98,rise:6,bodyWidth:8.7,bodyDepth:11.9,thickness:.55},
    'irori-shop':{wall:3.5,eave:4.08,rise:7,bodyWidth:7.1,bodyDepth:8.85,thickness:.55},
    'mori-workshop':{wall:6.3,eave:6.36,rise:2.05,bodyWidth:10,bodyDepth:12.8,thickness:.12},
  };
  return {...generic,...profiles[b.model],reviewed:!!profiles[b.model],...(b.id===ONSEN_ID?onsenProfile:{})};
}
