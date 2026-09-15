// Run after the Blender export; retain editable full-resolution materials in .blend.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
const path=process.argv[2]??'public/models/ogimachi/act1-sides.glb';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(path);
await doc.transform(dedup(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:85}));
await io.write(path,doc);
