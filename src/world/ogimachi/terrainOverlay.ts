import * as T from 'three';
type Vertex={x:number;z:number;u:number;v:number};
/** Split overlays along the actual 4 m terrain triangles, retaining their UVs.
 * Merely sampling heights at the original corners bridges over slope changes.
 */
export function terrainOverlay(source:T.BufferGeometry,height:(x:number,z:number)=>number,offset:number){
  const p=source.getAttribute('position'),uv=source.getAttribute('uv'),index=source.index;
  const positions:number[]=[],tex:number[]=[];
  const clip=(poly:Vertex[],distance:(v:Vertex)=>number)=>{
    const out:Vertex[]=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i]!,b=poly[(i+1)%poly.length]!,da=distance(a),db=distance(b);
      if(da>=-1e-8)out.push(a);
      if((da>0&&db<0)||(da<0&&db>0)){
        const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});
      }
    }return out;
  };
  for(let i=0;i<(index?.count??p.count);i+=3){
    const tri=[0,1,2].map(k=>{const j=index?index.getX(i+k):i+k;return {x:p.getX(j),z:p.getZ(j),u:uv.getX(j),v:uv.getY(j)};});
    const minX=Math.floor(Math.min(...tri.map(v=>v.x))/4)*4,maxX=Math.max(...tri.map(v=>v.x));
    const minZ=Math.floor(Math.min(...tri.map(v=>v.z))/4)*4,maxZ=Math.max(...tri.map(v=>v.z));
    for(let x=minX;x<maxX;x+=4)for(let z=minZ;z<maxZ;z+=4){
      let cell=tri;for(const d of [(v:Vertex)=>v.x-x,(v:Vertex)=>x+4-v.x,(v:Vertex)=>v.z-z,(v:Vertex)=>z+4-v.z])cell=clip(cell,d);
      for(const sign of [-1,1]){
        const poly=clip(cell,v=>sign*(v.x+v.z-x-z-4));
        for(let j=1;j+1<poly.length;j++){
          const a=poly[0]!,b=poly[j]!,c=poly[j+1]!;
          if(Math.abs((b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z))<1e-9)continue;
          for(const v of [a,b,c]){positions.push(v.x,height(v.x,v.z)+offset,v.z);tex.push(v.u,v.v);}
        }
      }
    }
  }
  const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(positions,3));result.setAttribute('uv',new T.Float32BufferAttribute(tex,2));result.computeVertexNormals();return result;
}
