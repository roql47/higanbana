import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {readFile} from 'node:fs/promises';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read('public/models/ogimachi/irori-restaurant-interior-v7.glb');
const mapping=JSON.parse(await readFile('artifacts/ogimachi-phases/irori-window-v8-remap.json','utf8'));
const buckets=new Map();for(const pair of mapping){const k=pair[0].map(v=>Math.round(v*1000)).join(',');const a=buckets.get(k)??[];a.push(pair);buckets.set(k,a);}
let count=0;const seen=new Set();
for(const n of doc.getRoot().listNodes()){
 if(n.getName()!=='irori-v5-body')continue;
 for(const p of n.getMesh().listPrimitives()){
  const pos=p.getAttribute('POSITION');if(seen.has(pos))continue;seen.add(pos);const a=pos.getArray();
  for(let i=0;i<a.length;i+=3){const key=[a[i],a[i+1],a[i+2]].map(v=>Math.round(v*1000)).join(',');const pair=buckets.get(key)?.find(([o])=>Math.hypot(o[0]-a[i],o[1]-a[i+1],o[2]-a[i+2])<.00005);if(pair){a[i]=pair[1][0];a[i+1]=pair[1][1];a[i+2]=pair[1][2];count++;}}
 }
}
if(count<500)throw Error('Insufficient source mesh matches: '+count);
const root=doc.getRoot().listNodes().find(n=>n.getExtras().archetype==='irori-restaurant');root.setExtras({...root.getExtras(),runtime_revision:'interior-v8'});
await io.write('public/models/ogimachi/irori-restaurant-interior-v8.glb',doc);console.log({movedVertices:count});
