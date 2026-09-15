import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {cutInteriorTerrain} from '../src/world/ogimachi/interiorTerrainCut.ts';
test('interior terrain cut preserves exterior area and RGBA at rotated sites',()=>{
 const b={x:12,z:-8,angle:.63};
 const geometry=new T.PlaneGeometry(30,30,10,10).rotateX(-Math.PI/2).rotateY(b.angle).translate(b.x,0,b.z);
 const colors=new Float32Array(geometry.getAttribute('position').count*4);for(let i=0;i<colors.length;i+=4)colors.set([.2,.4,.6,.8],i);
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,4));
 const result=cutInteriorTerrain(geometry,b),p=result.getAttribute('position');let area=0;
 const a=new T.Vector3(),c=new T.Vector3(),d=new T.Vector3();
 for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);c.fromBufferAttribute(p,i+1);d.fromBufferAttribute(p,i+2);area+=c.clone().sub(a).cross(d.clone().sub(a)).length()/2;
  const middle=a.clone().add(c).add(d).divideScalar(3).sub(new T.Vector3(b.x,0,b.z)).applyAxisAngle(new T.Vector3(0,1,0),-b.angle);
  assert.ok(!(middle.x> -4.45+1e-5&&middle.x<4.05-1e-5&&middle.z> -5.62+1e-5&&middle.z<5.62-1e-5));
 }
 assert.ok(Math.abs(area-(900-8.5*11.24))<.001);
 assert.equal(result.getAttribute('color').count,p.count);
 assert.ok(Math.abs(result.getAttribute('color').getW(0)-.8)<1e-6);
});
