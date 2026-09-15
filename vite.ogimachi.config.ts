import {defineConfig} from 'vite';
import {fileURLToPath,URL} from 'node:url';
import {copyFileSync,mkdirSync,cpSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
const ASSETS=['models/ogimachi/village-library.glb','models/ogimachi/outbuildings.glb','textures/ogimachi/oak-8.png','textures/impostors/cedar-a-8.webp','textures/grass/aerial_grass_rock_diff_1k.webp','textures/grass/aerial_grass_rock_nor_gl_1k.webp','textures/stone/japanese_stone_wall_diff_1k.webp','textures/stone/japanese_stone_wall_nor_gl_1k.webp'];
ASSETS.push('textures/ogimachi/packed-gravel.webp');
ASSETS.push('textures/grass/aerial_grass_rock_arm_1k.webp');
ASSETS.push('models/ogimachi/wada-precinct.glb','data/ogimachi/survey.json','data/ogimachi/dem.f32','data/ogimachi/orthophoto.webp','data/ogimachi/woodland.png');
ASSETS.push('models/props/cut-rescue-rope.glb','models/props/haru-hanging-gown.glb','models/props/wet-sleeve-nails.glb','models/props/wooden-horse-haru.glb','models/yokai-fake-haru.glb','textures/wood/japanese_cedar_planks_nor_gl_1k.webp');
ASSETS.push('data/ogimachi/CREDITS.md','data/ogimachi/story-selection.json','data/ogimachi/story-layout.json');
ASSETS.push('models/ogimachi/hakusuien.glb','models/ogimachi/irori.glb','data/ogimachi/individual-review.json');
ASSETS.push('textures/wood/japanese_cedar_planks_diff_1k.webp');
ASSETS.push('models/ogimachi/mori-workshop.glb','models/ogimachi/mori-workshop-v2.glb','models/ogimachi/mori-workshop-v3.glb');
ASSETS.push('models/ogimachi/onsen.glb','models/ogimachi/onsen-v2.glb','models/ogimachi/onsen-v3.glb','models/ogimachi/mori-story-interior.glb');
ASSETS.push('models/ogimachi/act1-sides.glb','models/ogimachi/act1-frontage.glb','models/ogimachi/act1-north.glb','models/ogimachi/junction.glb','models/ogimachi/junction-rear.glb');
ASSETS.push(...['concrete-color','concrete-normal','concrete-rough','pavers-color','pavers-normal','pavers-rough','grass-color','asphalt-color','asphalt-normal','asphalt-rough'].map(name=>`textures/ogimachi/act1/${name}.webp`));
ASSETS.push('models/ogimachi/street-bench.glb','models/ogimachi/story-shrine.glb','models/ogimachi/story-well.glb');
ASSETS.push('models/ogimachi/fern-pot.glb');
ASSETS.push('models/ogimachi/street-bin.glb');
ASSETS.push('models/ogimachi/noticeboard.glb');
ASSETS.push('models/ogimachi/street-hydrant.glb');
ASSETS.push('models/ogimachi/street-lamp.glb');
ASSETS.push('models/mio.glb');
ASSETS.push('data/ogimachi/massing.json');
ASSETS.push('data/ogimachi/forest-cover.bin');
ASSETS.push('models/sayo.glb','models/props/photo-hands.glb','models/props/stele.glb',
  'models/props/bus-farebox.glb','models/props/bus-ticket.glb','models/props/bus-faredisplay-v2.glb',
  'models/props/bus-dash.glb','models/props/bus-seat.glb','models/props/bus-wheel.glb','models/props/bus-strap.glb',
  'models/props/bus-driver-v2.glb','textures/bus/driver-reflection.webp',
  'models/props/cedar-a.glb','models/props/cedar-far.glb','models/props/utility-pole.glb','models/props/guardrail.glb');
ASSETS.push('models/props/blackboard.glb','models/props/candlestick.glb','models/props/ema-rack-frame.glb','models/props/gohei.glb','models/props/hokora-altar.glb','models/props/hokora-kyodai.glb','models/props/ishidoro.glb','models/props/miki.glb','models/props/school-desk.glb','models/props/shelf.glb','models/props/shimenawa-binding.glb','models/props/shimenawa-loose.glb','models/props/teacher-desk.glb','textures/minka/aged-mud-plaster-arm-512.webp','textures/minka/aged-mud-plaster-diff-1k.webp','textures/minka/aged-mud-plaster-nor-gl-1k.webp','textures/minka/kaya-thatch-arm-512.webp','textures/minka/kaya-thatch-diff-1k.webp','textures/minka/kaya-thatch-nor-gl-1k.webp','textures/minka/weathered-cedar-arm-512.webp','textures/minka/weathered-cedar-diff-1k.webp','textures/minka/weathered-cedar-nor-gl-1k.webp','textures/plaster/grey_plaster_02_diff_1k.webp','textures/plaster/grey_plaster_02_nor_gl_1k.webp','textures/school/aged-school-plaster-arm-512.webp','textures/school/aged-school-plaster-diff-1k.webp','textures/school/aged-school-plaster-nor-gl-1k.webp');
ASSETS.push('models/props/well.glb','models/props/offer-suzu.glb');
ASSETS.push('models/ogimachi/irori-restaurant-interior-v8.glb','models/ogimachi/irori-shop-v5.glb');
export default defineConfig(({command})=>({
  publicDir:command==='build'?false:'public',
  plugins:[{name:'local-story-recording',apply:'serve',configureServer(server){
    server.middlewares.use('/__map-selection',(req,res)=>{
      if(req.method!=='POST'||req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;res.end();return;}
      let body='';req.on('data',chunk=>{body+=chunk;if(body.length>1000000)req.destroy();});
      req.on('end',()=>{try{const value=JSON.parse(body);if(!Array.isArray(value)||!value.length||!value.every(r=>['keep','delete'].includes(r.type)&&Array.isArray(r.points)&&r.points.length>=3&&r.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))))throw Error('Invalid regions');writeFileSync('public/data/ogimachi/story-selection.json',JSON.stringify(value,null,2));res.end('saved');}catch{res.statusCode=400;res.end('invalid');}});
    });
    server.middlewares.use('/__story-recording' ,(req,res)=>{
      if(req.method!=='POST'||req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;res.end();return;}
      const chunks:Buffer[]=[];let size=0;
      req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>80*1024*1024){req.destroy();return;}chunks.push(chunk);});
      req.on('end',()=>{writeFileSync('/tmp/ogimachi-sayo-recording.webm',Buffer.concat(chunks));res.end('saved');});
    });
  }},{name:'ogimachi-assets-only',apply:'build',closeBundle(){for(const asset of ASSETS){const output=join('dist-ogimachi',asset);mkdirSync(dirname(output),{recursive:true});copyFileSync(join('public',asset),output);}cpSync('public/audio','dist-ogimachi/audio',{recursive:true});}}],
  resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
  server:{host:'127.0.0.1',port:5188,strictPort:true},
  build:{outDir:'dist-ogimachi',target:'es2022',rolldownOptions:{input:'ogimachi.html'}},
}));
