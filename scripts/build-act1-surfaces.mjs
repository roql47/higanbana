// Authored deterministic seamless material maps. No photograph is embedded.
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
const N=512,dir='public/textures/ogimachi/act1';await mkdir(dir,{recursive:true});
let seed=72931;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const kind of ['asphalt','concrete','pavers']){
 const height=new Float32Array(N*N),rgb=Buffer.alloc(N*N*3),rough=Buffer.alloc(N*N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const i=y*N+x,noise=rand(),macro=Math.sin(x*Math.PI/128)*Math.cos(y*Math.PI/256)*.5+.5;
  let v,hh;
  if(kind==='asphalt'){const chip=noise>.93?18:noise<.12?-12:0;v=108+(noise-.5)*18+chip;hh=noise*.4+(chip>0?.16:0);rough[i]=Math.round(205+noise*40);}
  else if(kind==='concrete'){v=145+(noise-.5)*20+macro*12;hh=noise*.13;rough[i]=205+Math.floor(noise*38);}
  else {const row=Math.floor(y/64),xx=(x+(row%2)*64)%128,joint=xx<3||y%64<3;v=joint?60:144+(noise-.5)*21+Math.sin(row*8.3+Math.floor((x+(row%2)*64)/128)*2.1)*14;hh=joint?0:.55+noise*.08;rough[i]=joint?245:215;}
  height[i]=hh;rgb[i*3]=v*.98;rgb[i*3+1]=v;rgb[i*3+2]=v*.96;
 }
 const normal=Buffer.alloc(N*N*3);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const i=y*N+x,dx=(height[y*N+(x+1)%N]-height[y*N+(x+N-1)%N])*.8,dy=(height[((y+1)%N)*N+x]-height[((y+N-1)%N)*N+x])*.8,len=Math.hypot(dx,dy,1);
  normal[i*3]=Math.round((-.5*dx/len+.5)*255);normal[i*3+1]=Math.round((.5*dy/len+.5)*255);normal[i*3+2]=Math.round((.5/len+.5)*255);
 }
 await Promise.all([sharp(rgb,{raw:{width:N,height:N,channels:3}}).webp({quality:88}).toFile(`${dir}/${kind}-color.webp`),sharp(normal,{raw:{width:N,height:N,channels:3}}).webp({lossless:true}).toFile(`${dir}/${kind}-normal.webp`),sharp(rough,{raw:{width:N,height:N,channels:1}}).webp({quality:92}).toFile(`${dir}/${kind}-rough.webp`)]);
}
console.log('Authored 3 tileable materials, 9 maps at 512px');
// Regrade the existing licensed grass texture for the shaded close-range verge.
const {data: turf,info}=await sharp('public/textures/grass/aerial_grass_rock_diff_1k.webp').resize(512,512).removeAlpha().raw().toBuffer({resolveWithObject:true});
for(let i=0;i<turf.length;i+=info.channels){const l=turf[i]*.3+turf[i+1]*.59+turf[i+2]*.11;turf[i]=l*.6+40;turf[i+1]=l*.73+55;turf[i+2]=l*.35+24;}
await sharp(turf,{raw:info}).webp({quality:88}).toFile(`${dir}/grass-color.webp`);
