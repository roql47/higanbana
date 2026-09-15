import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOptionalAssets} from '../src/world/ogimachi/loadOptionalAssets.ts';

test('a pending prop does not prevent other props from starting; results retain placement order',async()=>{
  let release;const started=[];
  const result=loadOptionalAssets([
    ['slow',()=>{started.push('slow');return new Promise(resolve=>{release=resolve;});}],
    ['fast',async()=>{started.push('fast');return 'second';}],
  ]);
  assert.deepEqual(started,['slow','fast']);
  release('first');assert.deepEqual(await result,['first','second']);
});
test('missing and synchronously failing props fall back without discarding successful assets',async()=>{
  const warnings=[];const result=await loadOptionalAssets([
    ['missing',async()=>{throw new Error('404');}],
    ['broken',()=>{throw new Error('decode');}],
    ['ready',async()=>({model:'ready'})],
  ],(name,error)=>warnings.push([name,error.message]));
  assert.deepEqual(result,[null,null,{model:'ready'}]);
  assert.deepEqual(warnings.sort(),[['broken','decode'],['missing','404']]);
});
