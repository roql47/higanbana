import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {usesLegacyEarthYard} from '../src/world/ogimachi/yardSurface.ts';
test('reviewed boundary building no longer receives an exposed second gravel yard',()=>{
 const {buildings}=JSON.parse(readFileSync('public/data/ogimachi/survey.json','utf8'));
 assert.equal(usesLegacyEarthYard(buildings.find(b=>b.id===236248631)),true);
});
test('rotated fringe is included but unrelated distant yards remain',()=>{
 const b={x:-116,z:-60,width:4,depth:12,angle:Math.PI/2};
 assert.equal(usesLegacyEarthYard(b),true);
 assert.equal(usesLegacyEarthYard({...b,x:-150}),false);
});
