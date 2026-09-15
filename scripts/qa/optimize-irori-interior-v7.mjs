import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read('artifacts/ogimachi-phases/runtime-irori-interior-v7-packed/irori-restaurant-v5.glb');
for(const name of ['floor','cabinet','interior','tatami','cushions','timber']) {
 const m=doc.getRoot().listMaterials().find(m=>m.getName()==='Irori runtime '+name);
 if(!m)throw Error('Missing material '+name);
 const t=doc.createTexture('Irori contact '+name).setImage(await readFile('artifacts/ogimachi-phases/runtime-irori-interior-v7-packed/'+name+'-occlusion.png')).setMimeType('image/png');
 m.setOcclusionTexture(t).setOcclusionStrength(.7);
}
await doc.transform(dedup(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[2048,2048],quality:90}));
const root=doc.getRoot().listScenes()[0].listChildren()[0];console.log('root',root.getTranslation(),root.getRotation(),root.getScale());
if(root.getExtras().archetype!=='irori-restaurant')throw Error('Wrong root');
console.log('door nodes',root.listChildren().filter(n=>n.getExtras().iroriDoorSide).map(n=>({name:n.getName(),rotation:n.getRotation(),side:n.getExtras().iroriDoorSide})));
for(const [key,count] of [['collisionBox',20],['iroriLight',4],['iroriDoorSide',4]]) {
 if(root.listChildren().filter(n=>n.getExtras()[key]).length!==count)throw Error(`Missing runtime metadata: ${key}`);
}
const cushions=root.listChildren().find(n=>n.getName().startsWith('irori-v5-cushions'));
if(!cushions?.getMesh()?.listPrimitives().every(p=>p.getMaterial()?.getNormalTexture()))throw Error('Missing cushion normal atlas');
const tatami=root.listChildren().find(n=>n.getName().startsWith('irori-v5-tatami'));
if(!tatami?.getMesh()?.listPrimitives().every(p=>p.getMaterial()?.getNormalTexture()))throw Error('Missing tatami normal atlas');
const floor=root.listChildren().find(n=>n.getName().startsWith('irori-v5-floor'));
if(!floor?.getMesh()?.listPrimitives().every(p=>p.getMaterial()?.getNormalTexture()))throw Error('Missing floor normal atlas');
if(doc.getRoot().listMaterials().filter(m=>m.getOcclusionTexture()).length!==6)throw Error('Missing contact occlusion maps');
await io.write('public/models/ogimachi/irori-restaurant-interior-v7.glb',doc);
console.log('textures',doc.getRoot().listTextures().length,'colliders',root.listChildren().filter(n=>n.getExtras().collisionBox).length);
