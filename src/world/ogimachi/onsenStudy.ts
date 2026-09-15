import type {SurveyBuilding} from './survey';

export const ONSEN_ID=236248626;
export const onsenProfile={wall:6.55,eave:6.75,rise:2.25,bodyWidth:13.1,bodyDepth:52.4,thickness:.14,reviewed:true};
export const onsenEntryPad={x:-7.9,z:14,halfWidth:1.6,halfDepth:3.9};
type Tone='timber'|'glazing'|'low'|'foundation'|'linen';
export interface OnsenPart {name:string;size:[number,number,number];position:[number,number,number];tone:Tone;tilt?:number}
/** Photo-observed facade elements; bay dimensions and entrance offset remain estimates.
 * Original OSM orientation retained: local -X is the east-facing long side.
 * No invented transverse roof wings or route through the neighbouring house plots.
 */
export function onsenParts(b:SurveyBuilding):OnsenPart[]{
  if(b.id!==ONSEN_ID)return [];
  const parts:OnsenPart[]=[],front=-onsenProfile.bodyWidth/2;
  const box=(name:string,size:OnsenPart['size'],position:OnsenPart['position'],tone:Tone,tilt?:number)=>parts.push({name,size,position,tone,tilt});
  box('stone plinth',[13.12,.48,52.42],[0,.24,0],'foundation');
  // Distinct lower timber screen and upper glazed bays give the long facade scale.
  for(const z of [-22,-16,-10,-4,2,8,14,20]){
    box('upper window bay',[.04,1.75,4.5],[front-.025,4.9,z],'glazing');
    for(const dz of [-2.25,0,2.25])box('upper bay division',[.11,1.85,.12],[front-.07,4.9,z+dz],'timber');
    if(z<8)box('lower screen band',[.04,1.12,4.65],[front-.025,1.78,z],'glazing');
    box('facade post',[.16,6.05,.16],[front-.09,3.35,z-2.7],'timber');
  }
  for(const z of [-18,-6,6]){
    box('projecting balcony base',[.85,.16,9.2],[front-.42,3.83,z],'timber');
    box('balcony top rail',[.13,.13,9.2],[front-.82,4.66,z],'timber');
    for(let dz=-4.5;dz<=4.5;dz+=.9)box('balcony upright',[.11,.83,.09],[front-.82,4.22,z+dz],'timber');
  }
  box('floor belt',[.18,.20,52.4],[front-.09,3.28,0],'timber');
  box('entrance recess',[.05,2.72,4.9],[front-.03,1.82,14],'glazing');
  box('entrance canopy',[2.8,.17,6.5],[front-1.15,3.35,14],'low',.12);
  for(const z of [11.2,16.8])box('porch post',[.20,2.9,.20],[front-2.15,1.65,z],'timber');
  box('entrance fabric mass',[.055,1.0,2.65],[front-.14,2.45,14],'linen');
  return parts;
}
