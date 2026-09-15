/** Review-only grading for the authored 23 x 28 metre courtyard. */
export function shrineGroundHeight(x:number,z:number,original:number,base:number){
 const edge=Math.max(Math.abs(x+90)-11.65,Math.abs(z+262)-14.15);
 if(edge>=4)return original;
 const t=Math.max(0,edge/4),blend=t*t*(3-2*t);
 return base+(original-base)*blend;
}
