import {REFERENCE_FOOTPRINTS} from './referenceTrace';
import {clearTracedRoads} from './roadClearance';
import {corridor,overlapsBounds,polygonArea,rectangle,subtractPolygon} from './parcelGeometry';
export type Point = readonly [number,number];
export interface VillageLot {id:string;x:number;z:number;kind:'farmhouse'|'merchant'|'storehouse';width:number;depth:number;yaw:number;source?:{u:number;v:number}}
export interface VillagePath {id:string;width:number;points:Point[]}
export interface FieldPlot {id:string;corners:Point[];crop:'water'|'rice'|'vegetable';parcelId?:string}
export interface Annex extends VillageLot {parentId:string;variant:'lean-to'|'workshop'|'woodshed'}
// North points left, east up. The first reading of the raster scale legend produced ~177 ha
// for the traced lowland, inconsistent with the map's 45.6 ha property label and ~1.5 km length.
// Calibrate the approximate traced boundary to that area instead; this is still not a survey.
export const MAP_SCALE=.88335;
export const mapPoint=(u:number,v:number):Point=>[(900-v)*MAP_SCALE,(u-1280)*MAP_SCALE];
const trace=(points:Point[]):Point[]=>points.map(([u,v])=>mapPoint(u,v));
// Roads digitized in a crop whose source-image origin is (775,585).
const core=(points:Point[]):Point[]=>trace(points.map(([u,v])=>[u+775,v+585]));
export const MAIN_STREET=core([[0,320],[100,285],[230,255],[300,253],[430,279],[530,299],[650,329],[760,367],[865,395],[1045,475]]);
export const RIVER=trace([[280,1490],[440,1300],[650,1110],[800,1030],[1010,960],[1190,985],[1220,1080],[1290,1160],[1490,1150],[1700,1130],[1800,1170],[1810,1430],[1800,1690],[1900,1890]]);
export const TRIBUTARY=trace([[790,100],[785,290],[718,465],[620,600],[610,730],[690,835],[745,900],[715,1000],[650,1110]]);
export const BRIDGE_SPAN=trace([[1385,1110],[1395,1200]]);
export const PATHS:VillagePath[]=[
  {id:'main-street',width:6,points:MAIN_STREET},
  {id:'northern-approach',width:5,points:trace([[775,905],[690,935],[605,980],[480,1075],[400,1160]])},
  {id:'upper-farm-lane',width:2.8,points:core([[25,310],[38,222],[165,218],[270,210],[350,195],[438,207],[555,240]])},
  {id:'north-farm-fork',width:2.6,points:core([[38,222],[63,171],[143,176],[230,207],[265,170],[321,119],[361,94]])},
  {id:'northern-gardens',width:2.5,points:core([[265,170],[270,97],[279,72],[361,94],[453,106],[551,130],[634,160],[688,190]])},
  {id:'north-yard-link',width:2.5,points:core([[270,210],[267,249]])},
  {id:'central-north-link',width:3,points:core([[430,279],[438,207],[453,106],[461,49]])},
  {id:'middle-lane',width:3,points:core([[530,299],[555,240],[572,162],[551,130]])},
  {id:'temple-lane',width:3,points:core([[650,329],[663,290],[671,248],[688,190],[716,131]])},
  {id:'eastern-lane',width:2.8,points:core([[760,367],[807,314],[829,286],[769,235],[716,224],[688,190]])},
  {id:'south-gable-lane',width:2.8,points:core([[865,395],[905,358],[938,322],[957,287]])},
  {id:'riverside-lane',width:2.8,points:core([[530,299],[519,371],[548,417],[684,447],[805,469],[945,490],[1018,477]])},
  {id:'lower-yard-link',width:2.5,points:core([[650,329],[638,386],[609,444]])},
  {id:'south-yard-link',width:2.5,points:core([[760,367],[740,405],[764,460]])},
  {id:'south-fields-road',width:4,points:trace([[1820,1060],[1860,1110],[1910,1190],[1920,1360],[1945,1530],[1950,1660]])},
  {id:'north-outlying-lane',width:3,points:trace([[605,980],[545,820],[480,700],[530,650],[560,550],[535,480],[620,430],[685,345],[710,290],[710,230]])},
  {id:'river-bridge-road',width:4,points:trace([[1384,1029],[1385,1110],[1395,1200],[1550,1275],[1531,1371]])},
];
export const TERRACES:Point[][]=[trace([
  [595,980],[770,910],[799,745],[850,685],[1050,647],[1110,601],[1230,608],[1400,625],[1545,692],[1605,768],[1735,795],[1790,965],
  [1840,1005],[2020,1100],[2120,1165],[2120,1390],[2220,1440],[2110,1580],[2050,1680],[1940,1710],[1890,1570],[1860,1430],
  [1880,1290],[1840,1130],[1780,1070],[1700,1100],[1540,1110],[1430,1130],[1290,1090],[1260,1020],[1240,900],[1180,888],
  [1110,918],[970,910],[830,945],[680,1000],[430,1160],[435,1120]
]),trace([[605,980],[530,865],[480,790],[420,705],[510,651],[540,560],[510,480],[588,433],[670,344],[690,288],[684,181],[700,166],[726,260],[717,355],[652,440],[570,500],[550,600],[550,740],[595,791],[620,871]]),
trace([[1370,1270],[1460,1290],[1560,1300],[1535,1390],[1480,1410],[1400,1380],[1360,1310]])];
export const LOTS:VillageLot[]=REFERENCE_FOOTPRINTS.map((f,i)=>{
  const [x,z]=mapPoint(f.u,f.v);
  return {id:`traced-${f.color}-${i}`,x,z,kind:f.color==='red'?'farmhouse':f.pixels>280?'merchant':'storehouse',
    width:Math.max(4,f.dv*MAP_SCALE*.72),depth:Math.max(5,f.du*MAP_SCALE*.72),yaw:0,source:{u:f.u,v:f.v}};
});
// Uncoloured building centres read individually from the same crop; no frontage-row generator.
const ordinary:Point[]=[
  [59,264],[86,278],[106,256],[126,244],[148,236],[171,242],[199,240],[208,269],[235,283],[265,275],[287,280],[313,280],
  [54,200],[78,204],[98,210],[153,199],[177,191],[206,195],[245,189],[257,152],[306,140],[321,175],[346,148],
  [368,152],[382,131],[399,123],[413,155],[400,185],[366,200],[334,224],[362,235],[390,241],[410,263],
  [310,99],[381,80],[409,81],[433,85],[484,84],[519,84],[534,101],[583,93],[605,98],[629,105],
  [486,179],[515,176],[541,173],[502,206],[475,229],[453,248],[477,269],[588,272],[607,258],[632,246],
  [598,138],[623,146],[650,163],[631,210],[657,205],[702,249],[700,305],[725,322],[749,334],
  [589,339],[610,348],[629,358],[658,374],[676,354],[705,363],[729,385],[782,384],
  [826,341],[848,350],[868,362],[844,371],[836,413],[868,426],[809,437],[788,418],[762,441],
  [566,443],[555,474],[602,481],[654,485],[690,491],[775,491],[825,490],[847,475],[898,469],
  [868,247],[872,267],[887,284],[917,302],[898,316],[934,355],[961,376],[1007,413],[983,447],
];
// A small blue symbol abuts a red footprint in the source; keep its centre and reduce the proxy envelope.
LOTS.find(h=>h.id==='traced-blue-86')!.width*=.62;
LOTS.find(h=>h.id==='traced-blue-86')!.depth*=.62;
clearTracedRoads(PATHS,LOTS);
for(const [i,[u,v]] of ordinary.entries()) {
  const [x,z]=mapPoint(u+775,v+585),lot:VillageLot={id:`traced-ordinary-${i}`,x,z,width:10+(i%3)*2,depth:13+(i%4),kind:'merchant',yaw:i%2?Math.PI:0,source:{u:u+775,v:v+585}};
  if(LOTS.some(h=>Math.abs(x-h.x)<(lot.width+h.width)/2+3&&Math.abs(z-h.z)<(lot.depth+h.depth)/2+3))continue;
  if(PATHS.some(p=>lotPathClearance(lot,p)<p.width/2+1))continue;
  LOTS.push(lot);
}
// Keep residential-sized footprints. Expanding ordinary houses to fill gaps made
// the single-storey proxies read as warehouses instead of the film's taller houses.
// Authored extensions based on the film's mixed roof volumes; not additional surveyed households.
export const ANNEXES:Annex[]=[];
for(const [index,parent] of LOTS.entries()){
  if(parent.kind==='storehouse'||!parent.source||parent.source.u<800||parent.source.u>1810)continue;
  const count=parent.kind==='farmhouse'?2:1;
  for(let wing=0;wing<count;wing++){
    const width=wing===1?6:8+(index%3),depth=wing===1?5:9+(index%4);
    const options:Point[]=[[parent.x+parent.width/2+width/2+1,parent.z+parent.depth*.18],[parent.x-parent.width/2-width/2-1,parent.z-parent.depth*.17],[parent.x+parent.width*.2,parent.z+parent.depth/2+depth/2+1],[parent.x-parent.width*.2,parent.z-parent.depth/2-depth/2-1]];
    for(const [x,z] of options){
      const candidate:Annex={id:`${parent.id}-wing-${wing}`,parentId:parent.id,x,z,width,depth,kind:'storehouse',yaw:0,variant:wing===1?'woodshed':index%3?'lean-to':'workshop'};
      if([...LOTS,...ANNEXES].some(h=>Math.abs(x-h.x)<(width+h.width)/2+.6&&Math.abs(z-h.z)<(depth+h.depth)/2+.6))continue;
      if(PATHS.some(p=>lotPathClearance(candidate,p)<p.width/2+1))continue;
      ANNEXES.push(candidate);break;
    }
  }
}
export const ALL_BUILDINGS:VillageLot[]=[...LOTS,...ANNEXES];
const fieldSectors:Point[][]=[
  [[40,133],[89,107],[100,151],[61,158]],[[101,108],[146,103],[148,157],[109,151]],
  [[151,105],[213,104],[211,168],[153,155]],[[219,103],[256,105],[257,156],[224,181]],
  [[48,174],[87,179],[89,204],[48,208]],[[95,181],[137,184],[140,208],[95,209]],
  [[147,267],[189,257],[190,279],[157,289]],[[138,297],[180,283],[183,318],[144,327]],
  [[192,283],[226,275],[226,318],[193,321]],[[242,294],[278,294],[278,323],[241,322]],
  [[292,295],[331,300],[332,327],[291,323]],[[309,115],[338,113],[326,134],[306,142]],
  [[349,112],[372,116],[370,136],[345,135]],[[345,165],[362,165],[361,184],[342,187]],
  [[374,160],[398,167],[398,190],[374,182]],[[456,158],[480,160],[474,190],[449,183]],
  [[492,149],[516,151],[515,166],[489,165]],[[481,232],[511,240],[501,267],[480,260]],
  [[553,296],[584,305],[580,331],[545,323]],[[602,397],[627,399],[621,422],[597,421]],
  [[658,415],[682,421],[674,439],[650,432]],
];
export const FIELDS:FieldPlot[]=[];
const addField=(id:string,corners:Point[],crop:FieldPlot['crop'])=>{
  if(ALL_BUILDINGS.some(h=>pointInPolygon(h.x,h.z,corners)||corners.some(([x,z])=>Math.abs(x-h.x)<h.width/2+2&&Math.abs(z-h.z)<h.depth/2+2)))return;
  if(PATHS.some(p=>corners.some((a,i)=>{const b=corners[(i+1)%corners.length]!,n=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/2);for(let j=0;j<=n;j++)if(lineDistance(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n,p.points)<p.width/2+.6)return true;return false;})))return;
  FIELDS.push({id,corners,crop});
};
fieldSectors.forEach((p,i)=>addField(`traced-field-${i}`,core(p),i%4===0?'vegetable':i%3===0?'rice':'water'));
for(const [i,sector] of [
  [[1938,1210],[2074,1200],[2080,1290],[1943,1300]],[[1945,1310],[2082,1300],[2082,1390],[1950,1400]],
  [[1955,1410],[2110,1400],[2074,1500],[1972,1510]],[[1978,1520],[2065,1510],[2025,1630],[1980,1640]],
].entries())for(let strip=0;strip<4;strip++) {
  const a=sector[0]!,b=sector[1]!,c=sector[2]!,d=sector[3]!,lo=strip/4+.012,hi=(strip+1)/4-.012;
  const mix=(p:number[],q:number[],t:number):Point=>[p[0]!+(q[0]!-p[0]!)*t,p[1]!+(q[1]!-p[1]!)*t];
  addField(`southern-cadastral-${i}-${strip}`,trace([mix(a,b,lo),mix(a,b,hi),mix(d,c,hi),mix(d,c,lo)]),(i+strip)%3?'rice':'water');
}
// Complete the continuous cultivated ground between mapped residential plots. These are authored
// parcel subdivisions inside the observed agricultural/residential sectors, not cadastral tracings.
const sectors:Point[][]=[
  [[30,105],[260,88],[255,208],[28,220]],[[38,228],[270,216],[270,330],[30,345]],
  [[280,82],[445,88],[439,199],[277,207]],[[282,208],[430,213],[427,321],[284,328]],
  [[457,64],[632,90],[649,225],[450,208]],[[455,218],[660,246],[651,337],[446,296]],
  [[530,310],[731,368],[720,485],[545,460]],[[671,209],[823,252],[847,357],[665,320]],
  [[743,376],[920,397],[929,488],[735,482]],[[833,282],[957,302],[1008,470],[900,445]],
];
const obstacles:Point[][]=[...ALL_BUILDINGS.map(h=>rectangle(h.x,h.z,h.width+10,h.depth+9)),...FIELDS.map(f=>f.corners),...PATHS.flatMap(p=>p.points.slice(1).map((b,i)=>corridor(p.points[i]!,b,p.width+3)))];
for(const [sectorIndex,sector] of sectors.entries()){
  const columns=sectorIndex<2?4:3,rows=sectorIndex<2?3:2;
  const lerp=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const at=(u:number,v:number)=>lerp(lerp(sector[0]!,sector[1]!,u),lerp(sector[3]!,sector[2]!,u),v);
    const u0=(col+.016)/columns,u1=(col+.984)/columns,v0=(row+.016)/rows,v1=(row+.984)/rows;
    let pieces=[core([at(u0,v0),at(u1,v0),at(u1,v1),at(u0,v1)])];
    for(const obstacle of obstacles)pieces=pieces.flatMap(p=>overlapsBounds(p,obstacle)?subtractPolygon(p,obstacle):[p]);
    for(const [part,corners] of pieces.entries()){
      if(polygonArea(corners)<35)continue;
      FIELDS.push({id:`garden-infill-${sectorIndex}-${row}-${col}-${part}`,parcelId:`garden-${sectorIndex}-${row}-${col}`,corners,crop:(sectorIndex+row+col)%5===0?'vegetable':(row+col)%3?'rice':'water'});
    }
  }
}
export function pointInPolygon(x:number,z:number,points:Point[]) {
  let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i]!,b=points[j]!;if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;
}
export function lineDistance(x:number,z:number,points:Point[]) {
  let distance=Infinity;for(let i=1;i<points.length;i++){const [ax,az]=points[i-1]!,[bx,bz]=points[i]!,dx=bx-ax,dz=bz-az;const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));distance=Math.min(distance,Math.hypot(x-ax-dx*t,z-az-dz*t));}return distance;
}
export function lotPathClearance(lot:VillageLot,path:VillagePath) {
  let best=Infinity;for(let i=1;i<path.points.length;i++){const a=path.points[i-1]!,b=path.points[i]!,n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);for(let k=0;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n;best=Math.min(best,Math.hypot(Math.max(0,Math.abs(x-lot.x)-lot.width/2-1.8),Math.max(0,Math.abs(z-lot.z)-lot.depth/2-1)));}}return best;
}
export function terraceDistance(x:number,z:number) {
  let d=Infinity;for(const poly of TERRACES){if(pointInPolygon(x,z,poly))return 0;d=Math.min(d,lineDistance(x,z,[...poly,poly[0]!]));}return d;
}
export function riverX(z:number) {
  for(let i=1;i<RIVER.length;i++){const a=RIVER[i-1]!,b=RIVER[i]!;if(z>=Math.min(a[1],b[1])&&z<=Math.max(a[1],b[1]))return a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]);}return RIVER[0]![0];
}
