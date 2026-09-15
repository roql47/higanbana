import test from 'node:test';import assert from 'node:assert/strict';import {shrineGroundHeight} from '../src/world/ogimachi/shrineSite.ts';
test('courtyard footprint stays level across sloping source terrain',()=>{for(const [x,z] of [[-90,-262],[-101,-275],[-79,-249]])assert.equal(shrineGroundHeight(x,z,45,10),10);});
test('terrain outside blend is unchanged',()=>{assert.equal(shrineGroundHeight(-110,-262,45,10),45);assert.equal(shrineGroundHeight(0,0,7,10),7);});
test('edge blend is continuous and bounded',()=>{const values=Array.from({length:41},(_,i)=>shrineGroundHeight(-90+11.65+i*.1,-262,20,10));for(let i=1;i<values.length;i++){assert(values[i]>=values[i-1]-1e-8);assert(values[i]-values[i-1]<.4);}assert.equal(values[0],10);assert.equal(values.at(-1),20);});
