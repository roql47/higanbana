export type SurveyPoint=[number,number];
export interface SurveyBuilding {id:number;points:SurveyPoint[];x:number;z:number;width:number;depth:number;angle:number;height:number;levels:number;model:string;roof:string;name:string;reviewId?:string;reviewStatus?:string}
export interface SurveyRoad {id:number;points:SurveyPoint[];kind:string;bridge:boolean;surface?:string;name?:string;oneway?:string;width?:number;widthBasis?:string;reviewId?:string}
export interface SurveyData {
  origin:{lat:number;lon:number;altitude:number};dem:{minX:number;minZ:number;step:number;size:number};
  photo:{minX:number;minZ:number;maxX:number;maxZ:number};
  buildings:SurveyBuilding[];fields:{id:number|string;points:SurveyPoint[];kind:string}[];
  roads:SurveyRoad[];viewpoint:SurveyPoint;credits:string;
}
/** X east, Z south; one world unit is one ground metre at the origin. */
export function surveyPoint(lat:number,lon:number,origin:SurveyData['origin']):SurveyPoint {
  const r=6378137,d=Math.PI/180,c=Math.cos(origin.lat*d);
  return [r*(lon-origin.lon)*d*c,r*(Math.asinh(Math.tan(origin.lat*d))-Math.asinh(Math.tan(lat*d)))*c];
}
export class SurveyHeightfield {
  constructor(readonly data:SurveyData,readonly values:Float32Array){if(values.length!==data.dem.size**2)throw new Error('Invalid GSI DEM dimensions');}
  sample(x:number,z:number){
    const {minX,minZ,step,size}=this.data.dem;
    const u=Math.max(0,Math.min(size-1.000001,(x-minX)/step)),v=Math.max(0,Math.min(size-1.000001,(z-minZ)/step));
    const ix=Math.floor(u),iz=Math.floor(v),a=u-ix,b=v-iz,k=iz*size+ix;
    return this.values[k]!*(1-a)*(1-b)+this.values[k+1]!*a*(1-b)+this.values[k+size]!*(1-a)*b+this.values[k+size+1]!*a*b;
  }
}
export function insideSurveyPolygon(x:number,z:number,points:SurveyPoint[]){
  let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i]!,b=points[j]!;if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
