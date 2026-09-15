/** Story hall footprint and a pedestrian approach avoiding the existing long house. */
export const HOKORA_SITE={x:-535,z:-585};
export const HOKORA_APPROACH:readonly (readonly [number,number])[]=[[-523,-585],[-521,-571],[-511.821,-564.119]];
export function hokoraSiteHeight(x:number,z:number,original:number,base:number,road:number){
 if(x<-557||x>-506||z<-602||z>-559)return original;
 const edge=Math.max(Math.abs(x-HOKORA_SITE.x)-14,Math.abs(z-HOKORA_SITE.z)-9);
 const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
 let y=edge<8?base+(original-base)*smooth(Math.max(0,edge)/8):original;
 let best=Infinity,level=base;
 const lengths=HOKORA_APPROACH.slice(1).map((p,i)=>Math.hypot(p[0]-HOKORA_APPROACH[i]![0],p[1]-HOKORA_APPROACH[i]![1]));const total=lengths.reduce((a,b)=>a+b,0);let along=0;
 for(let i=0;i<lengths.length;i++){const a=HOKORA_APPROACH[i]!,b=HOKORA_APPROACH[i+1]!,dx=b[0]-a[0],dz=b[1]-a[1];const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));const distance=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);if(distance<best){best=distance;level=base+(road-base)*smooth((along+t*lengths[i]!)/total);}along+=lengths[i]!;}
 if(best<5)y+=(level-y)*(1-smooth(Math.max(0,best-1.5)/3.5))*smooth((x-HOKORA_SITE.x-9)/3);
 return y;
}
