import type {Point,FieldPlot} from './plan';
export const polygonArea=(p:Point[])=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length]!;return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
function halfPlane(poly:Point[],a:Point,b:Point,inside:boolean):Point[]{
  const side=(p:Point)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const output:Point[]=[];
  for(let i=0;i<poly.length;i++){
    const p=poly[i]!,q=poly[(i+1)%poly.length]!,dp=side(p),dq=side(q),keep=inside?dp>=-1e-7:dp<=1e-7,next=inside?dq>=-1e-7:dq<=1e-7;
    if(keep)output.push(p);
    if(keep!==next){const t=dp/(dp-dq);output.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
  return output;
}
/** Subtract a convex counterclockwise obstacle, retaining disjoint convex pieces. */
export function subtractPolygon(subject:Point[],obstacle:Point[]):Point[][]{
  let remainder=subject;const pieces:Point[][]=[];
  const signed=obstacle.reduce((s,a,i)=>{const b=obstacle[(i+1)%obstacle.length]!;return s+a[0]*b[1]-b[0]*a[1];},0);
  const boundary=signed>=0?obstacle:[...obstacle].reverse();
  for(let i=0;i<boundary.length&&remainder.length>=3;i++){
    const a=boundary[i]!,b=boundary[(i+1)%boundary.length]!;
    const outside=halfPlane(remainder,a,b,false);if(outside.length>=3&&polygonArea(outside)>.1)pieces.push(outside);
    remainder=halfPlane(remainder,a,b,true);
  }
  return pieces;
}
export const rectangle=(x:number,z:number,w:number,d:number):Point[]=>[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]];
export function corridor(a:Point,b:Point,width:number):Point[]{
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),x=-dz/length*width/2,z=dx/length*width/2;
  return [[a[0]+x,a[1]+z],[a[0]-x,a[1]-z],[b[0]-x,b[1]-z],[b[0]+x,b[1]+z]];
}
export function overlapsBounds(a:Point[],b:Point[]){
  const bounds=(p:Point[])=>[Math.min(...p.map(a=>a[0])),Math.max(...p.map(a=>a[0])),Math.min(...p.map(a=>a[1])),Math.max(...p.map(a=>a[1]))];
  const x=bounds(a),y=bounds(b);return x[0]!<y[1]!&&x[1]!>y[0]!&&x[2]!<y[3]!&&x[3]!>y[2]!;
}
/** Remove internal decomposition edges, so clipping a parcel does not create artificial bunds. */
export function parcelBoundaryEdges(fields:FieldPlot[]):[Point,Point][]{
  const groups=new Map<string,FieldPlot[]>();for(const f of fields){const key=f.parcelId??f.id;const group=groups.get(key)??[];group.push(f);groups.set(key,group);}
  const result:[Point,Point][]=[];
  const key=(p:Point)=>`${Math.round(p[0]*1000)},${Math.round(p[1]*1000)}`;
  for(const group of groups.values()){
    const vertices=group.flatMap(f=>f.corners),edges=new Map<string,{count:number;edge:[Point,Point]}>();
    for(const f of group)for(let i=0;i<f.corners.length;i++){
      const a=f.corners[i]!,b=f.corners[(i+1)%f.corners.length]!,dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz;if(length2<1e-8)continue;
      const cuts=[0,1];for(const p of vertices){const t=((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length2;if(t>1e-6&&t<1-1e-6&&Math.abs((p[0]-a[0])*dz-(p[1]-a[1])*dx)<.0001*Math.sqrt(length2))cuts.push(t);}
      cuts.sort((a,b)=>a-b);
      for(let j=1;j<cuts.length;j++){
        if(cuts[j]!-cuts[j-1]!<1e-6)continue;
        const p:Point=[a[0]+dx*cuts[j-1]!,a[1]+dz*cuts[j-1]!],q:Point=[a[0]+dx*cuts[j]!,a[1]+dz*cuts[j]!],id=[key(p),key(q)].sort().join(':');
        const old=edges.get(id);if(old)old.count++;else edges.set(id,{count:1,edge:[p,q]});
      }
    }
    result.push(...[...edges.values()].filter(e=>e.count===1).map(e=>e.edge));
  }
  return result;
}
