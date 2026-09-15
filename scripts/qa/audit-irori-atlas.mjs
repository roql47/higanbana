import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';
const d=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
for(const n of d.getRoot().listNodes().filter(n=>/irori-v5-(interior|timber)/.test(n.getName()))){let count=0,black=0;
for(const p of n.getMesh().listPrimitives()){const t=p.getMaterial().getBaseColorTexture();if(!t)continue;const {data,info}=await sharp(t.getImage()).removeAlpha().raw().toBuffer({resolveWithObject:true});const uv=p.getAttribute('TEXCOORD_0'),idx=p.getIndices();for(let i=0;i<idx.getCount();i+=3){let u=0,v=0;for(let j=0;j<3;j++){const a=[];uv.getElement(idx.getScalar(i+j),a);u+=a[0]/3;v+=a[1]/3;}const x=Math.max(0,Math.min(info.width-1,Math.floor(u*info.width))),y=Math.max(0,Math.min(info.height-1,Math.floor(v*info.height))),o=(y*info.width+x)*info.channels;count++;if(data[o]+data[o+1]+data[o+2]<8)black++;}}
console.log(n.getName(),{triangles:count,blackCentroids:black,percent:100*black/count});}
