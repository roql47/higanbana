import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
import {statSync,writeFileSync} from 'node:fs';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const source='artifacts/ogimachi-phases/mori-interior/mori-story-interior.glb';
const output='public/models/ogimachi/mori-story-interior.glb';
const doc=await io.read(source);
await doc.transform(dedup(),prune({keepExtras:true}),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:90}));
await io.write(output,doc);
const root=(await io.read(output)).getRoot();
if(!root.listScenes()[0]?.listChildren().some(n=>n.getExtras().fictionalInterior===true))throw Error('Missing Mori root');
writeFileSync('artifacts/ogimachi-phases/mori-interior/report.json',JSON.stringify({before:statSync(source).size,after:statSync(output).size,meshes:root.listMeshes().length,textures:root.listTextures().length},null,2));

if(root.listNodes().filter(n=>n.getExtras().collisionBox).length<10)throw Error('Interior collision proxies missing');
