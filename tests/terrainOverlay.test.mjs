import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {terrainOverlay} from '../src/world/ogimachi/terrainOverlay.ts';

test('overlays follow the terrain inside triangles, not just at original corners',()=>{
 const height=(x,z)=>{const a=Math.floor(x/4)*4,b=Math.floor(z/4)*4,u=(x-a)/4,v=(z-b)/4;
 const h=(x,z)=>Math.sin(x*.8)*Math.cos(z*.7)*2;
 return u+v<=1?h(a,b)+(h(a+4,b)-h(a,b))*u+(h(a,b+4)-h(a,b))*v:h(a+4,b+4)+(h(a,b+4)-h(a+4,b+4))*(1-u)+(h(a+4,b)-h(a+4,b+4))*(1-v);};
 const source=new T.PlaneGeometry(12,15,2,3).rotateX(-Math.PI/2).rotateY(.32);
 const g=terrainOverlay(source,height,.14),p=g.getAttribute('position');let area=0;
 for(let i=0;i<p.count;i+=3){let x=0,y=0,z=0;for(let j=0;j<3;j++){x+=p.getX(i+j)/3;y+=p.getY(i+j)/3;z+=p.getZ(i+j)/3;}
 assert.ok(Math.abs(y-height(x,z)-.14)<2e-5,'centroid must stay above the rendered terrain');
 area+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getX(i+2)-p.getX(i))*(p.getZ(i+1)-p.getZ(i)))/2;
 assert.ok(g.getAttribute('normal').getY(i)>0);
 }assert.ok(Math.abs(area-180)<.001,'clipping preserves area without gaps or duplicates');
});
