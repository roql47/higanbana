import test from 'node:test';
import assert from 'node:assert/strict';
import {outsideLegacyGround} from '../src/world/ogimachi/legacyGround.ts';
test('design roads stop at the legacy earth region and resume after it',()=>{
 const parts=outsideLegacyGround([[-150,-40],[0,-40]]);
 assert.equal(parts.length,2);assert.ok(Math.abs(parts[0][1][0]+111)<1e-8);assert.ok(Math.abs(parts[1][0][0]+27)<1e-8);
 assert.deepEqual(parts[0][0],[-150,-40]);assert.deepEqual(parts[1][1],[0,-40]);
 assert.deepEqual(outsideLegacyGround([[-80,-50],[-60,-40]]),[]);
 const outside=[[0,20],[10,30],[20,40]];assert.deepEqual(outsideLegacyGround(outside),[outside]);
});
