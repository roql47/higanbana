import * as T from 'three';
import type {SurveyBuilding} from './survey';
type Vertex={p:T.Vector3;n:T.Vector3;uv:T.Vector2;color?:T.Vector4};
/** Clip a rectangular interior out of the visible terrain and its shared collider. */
export function cutInteriorTerrain(geometry:T.BufferGeometry,b:SurveyBuilding){
  geometry.computeBoundingBox();const bounds=geometry.boundingBox!;
  const radius=8;if(bounds.max.x<b.x-radius||bounds.min.x>b.x+radius||bounds.max.z<b.z-radius||bounds.min.z>b.z+radius)return geometry;
  const c=Math.cos(b.angle),s=Math.sin(b.angle);
  const local=(p:T.Vector3)=>new T.Vector2(c*(p.x-b.x)-s*(p.z-b.z),s*(p.x-b.x)+c*(p.z-b.z));
  const planes=[(p:T.Vector2)=>p.x+4.45,(p:T.Vector2)=>4.05-p.x,(p:T.Vector2)=>p.y+5.62,(p:T.Vector2)=>5.62-p.y];
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv'),color=geometry.getAttribute('color');
  const vertices:number[]=[],normals:number[]=[],uvs:number[]=[],colors:number[]=[];
  const emit=(poly:Vertex[])=>{for(let j=1;j<poly.length-1;j++)for(const v of [poly[0]!,poly[j]!,poly[j+1]!]){vertices.push(...v.p.toArray());normals.push(...v.n.toArray());uvs.push(...v.uv.toArray());if(v.color)colors.push(...v.color.toArray());}};
  const count=geometry.index?.count??position.count;
  for(let i=0;i<count;i+=3){
    let polygon:Vertex[]=[0,1,2].map(j=>{const id=geometry.index?.getX(i+j)??i+j;return {p:new T.Vector3().fromBufferAttribute(position,id),n:new T.Vector3().fromBufferAttribute(normal,id),uv:new T.Vector2(uv.getX(id),uv.getY(id)),color:color?new T.Vector4(color.getX(id),color.getY(id),color.getZ(id),color.itemSize===4?color.getW(id):1):undefined};});
    for(const plane of planes){
      if(polygon.length<3)break;
      const inside:Vertex[]=[],outside:Vertex[]=[];
      for(let j=0;j<polygon.length;j++){
        const a=polygon[j]!,z=polygon[(j+1)%polygon.length]!,da=plane(local(a.p)),dz=plane(local(z.p));
        (da>=0?inside:outside).push(a);
        if((da>=0)!==(dz>=0)){
          const t=da/(da-dz),v={p:a.p.clone().lerp(z.p,t),n:a.n.clone().lerp(z.n,t).normalize(),uv:a.uv.clone().lerp(z.uv,t),color:a.color?.clone().lerp(z.color!,t)};inside.push(v);outside.push(v);
        }
      }
      emit(outside);polygon=inside;
    }
  }
  const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(vertices,3));result.setAttribute('normal',new T.Float32BufferAttribute(normals,3));result.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));if(colors.length)result.setAttribute('color',new T.Float32BufferAttribute(colors,4));geometry.dispose();return result;
}
