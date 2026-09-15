import * as THREE from 'three';
import type { DetailBundle } from '../streamedDetail';
import { tileTex } from '../higasato/kit';
import { manorBox as block, batchManorCraft as batch } from '../higasato/manorCraft';

/** Art follows the existing collision plan: no new obstacles across clues or wet footprints. */
export type HollowShoeDisplay = { parent: THREE.Group; fallback: THREE.Group; scale: number; repaired: boolean };
export async function buildGraveyardHollowArt(bundle: DetailBundle, center: THREE.Vector3, floorY: number,
  shoes: readonly HollowShoeDisplay[]) {
  const [lantern, slab, natural, rock, geta] = await bundle.models([
    ['/models/props/ishidoro.glb', 1.48, 0.92],
    ['/models/props/grave-slab.glb', 1.65, 0.92],
    ['/models/props/grave-natural.glb', 1.48, 0.92],
    ['/models/props/rock-mossy.glb', 0.28, 0.9],
    ['/models/props/offer-geta.glb', 0.23, 0.9],
  ] as const);
  const root = bundle.root; root.name = 'graveyard-hollow-finished-art';
  root.position.set(center.x, floorY, center.z);
  const surface = (name: string, diff: string, normal: string, color: number, repeat: number, fill: number) => {
    // The bundle disposes its textures on unload. Never dispose kit's shared tile cache.
    const map = tileTex(diff, true).clone(), normalMap = tileTex(normal, false).clone();
    map.needsUpdate = normalMap.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ name, map, normalMap, color, roughness: 0.97,
      normalScale: new THREE.Vector2(0.4, 0.4), emissive: 0x8996a2, emissiveIntensity: fill, emissiveMap: map });
    m.userData['worldUV'] = repeat; return m;
  };
  const stone = surface('Hollow worn cut stone', '/textures/stone/japanese_stone_wall_diff_1k.webp',
    '/textures/stone/japanese_stone_wall_nor_gl_1k.webp', 0x989b88, 0.75, 0.82);
  const edge = stone.clone(); edge.color.setHex(0xa8ac9b); edge.name = 'Hollow exposed stone edges';
  const moss = stone.clone(); moss.color.setHex(0x566046); moss.name = 'Hollow damp plinths';
  const gravel = surface('Hollow earth and fine gravel', '/textures/grass/aerial_grass_rock_diff_1k.webp',
    '/textures/grass/aerial_grass_rock_nor_gl_1k.webp', 0x8c8b75, 0.65, 0.65);
  const cedar = surface('Hollow weathered gate boards', '/textures/minka/weathered-cedar-diff-1k.webp',
    '/textures/minka/weathered-cedar-nor-gl-1k.webp', 0x858173, 2, 0.65);
  const iron = new THREE.MeshStandardMaterial({ color: 0x343731, roughness: .75, metalness: .45 });
  block(root, [24, .5, 26], [0, -.25, 0], gravel, 0);
  // Cut-stone wall, damp footing and individually jointed coping, without full-height room walls.
  const wall = (x: number, z: number, length: number, yaw: number, height: number, width: number) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; root.add(g);
    block(g, [length, height, width], [0, height / 2, 0], stone, .03);
    block(g, [length, .23, width + .10], [0, .115, 0], moss, .035);
    const count = Math.ceil(length / 1.25), segment = length / count;
    for (let i = 0; i < count; i++)
      block(g, [segment - .025, .16, width + .13], [-length/2+(i+.5)*segment, height-.08, 0], edge, .025);
  };
  wall(-11.7, 0, 26, Math.PI/2, 2.6, .6); wall(11.7, 0, 26, Math.PI/2, 2.6, .6);
  wall(0, -12.7, 24, 0, 2.6, .6); wall(0, 12.7, 24, 0, 2.6, .6);
  for (const x of [-3.5, 3.5]) {
    wall(x, -3.2, 10, Math.PI/2, 1.7, .65);
    for (const z of [-8, -3.2, 1.6]) {
      block(root, [.86,.24,.83], [x,.12,z], moss,.04);
      block(root, [.69,2.55,.67], [x,1.5,z], stone,.025);
      block(root, [.82,.15,.80], [x,2.83,z], edge,.025);
      block(root, [.88,.17,.85], [x,3.005,z], edge,.045);
      // Recessed facing panel, with a narrow sculpted rim rather than a featureless column.
      block(root, [.39,1.2,.015], [x,1.82,z+.347], moss,.004);
      for (const side of [-1,1]) block(root,[.035,1.27,.033],[x+side*.215,1.82,z+.36],edge,.008);
    }
  }
  for (const [x,z] of [[-7,-6],[0,-8],[7,-6],[7.1,4.4]]) {
    block(root,[.95,.11,.75],[x!,.055,z!],moss,.025);
    block(root,[.79,.26,.60],[x!,.24,z!],stone,.025);
    block(root,[.91,.06,.71],[x!,.395,z!],edge,.012);
    block(root,[.95,.075,.75],[x!,.4625,z!],edge,.025);
  }
  for (const x of [-7.5,0,7.5]) {
    for (const side of [-1,1]) {
      block(root,[.42,3.6,.58],[x+side*1.05,1.8,11.1],stone,.045);
      block(root,[.52,.18,.68],[x+side*1.05,.09,11.1],moss,.025);
      block(root,[.5,.12,.67],[x+side*1.05,3.44,11.1],edge,.025);
    }
    block(root,[2.8,.27,.8],[x,3.64,11.1],edge,.04);
    block(root,[2.98,.13,.94],[x,3.84,11.1],stone,.04);
    // Broken shrine doors are behind the interaction plane; the approach remains unobstructed.
    for (let i=0;i<8;i++) block(root,[.2,2.86-(i%3)*.035,.075],
      [x+(i-3.5)*.207,1.54,11.31],cedar,.007);
    for (const y of [.44,2.5]) block(root,[1.68,.09,.09],[x,y,11.245],cedar,.008);
    for (const side of [-1,1]) {
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.06,.011,5,14),iron);
      ring.position.set(x+side*.15,1.42,11.23); root.add(ring);
    }
  }
  batch(root);

  // Shared geometry/materials and instancing: six detailed lanterns are one draw per material.
  const stamp = (model: THREE.Group, placements: { x:number; z:number; y?:number; yaw?:number; scale?:number }[], name:string) => {
    model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model), size=bounds.getSize(new THREE.Vector3());
    const fit = name==='grave-stones' ? Math.min(1,1.05/size.x,.85/size.z) : 1;
    model.traverse(o=>{
      if (!(o instanceof THREE.Mesh)) return;
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissive.setHex(0x8798a0); mat.emissiveIntensity=.75; mat.emissiveMap=mat.map;
        }
      }
      const im=new THREE.InstancedMesh(o.geometry,o.material,placements.length);
      im.name=name; im.receiveShadow=true; im.castShadow=false;
      const dummy=new THREE.Object3D(), m=new THREE.Matrix4();
      placements.forEach((at,i)=>{
        dummy.position.set(at.x,at.y??0,at.z); dummy.rotation.set(0,at.yaw??0,0);
        const s=at.scale??1; dummy.scale.set(s*fit,s,s*fit); dummy.updateMatrix();
        im.setMatrixAt(i,m.multiplyMatrices(dummy.matrix,o.matrixWorld));
      });
      im.computeBoundingSphere(); root.add(im);
    });
  };
  const lamps=[[-2.7,6.1],[6,4.4],[-7,-7.3],[0,-9.3],[7,-7.3],[.85,10.5]];
  stamp(lantern,lamps.map(([x,z])=>({x:x!,z:z!})),'carved-stone-lanterns');
  const glow=new THREE.InstancedMesh(new THREE.SphereGeometry(.044,6,4),
    new THREE.MeshBasicMaterial({color:0xffc078}),lamps.length);
  const matrix=new THREE.Matrix4();
  lamps.forEach(([x,z],i)=>glow.setMatrixAt(i,matrix.makeTranslation(x!,1.00,z!)));
  glow.computeBoundingSphere(); root.add(glow);
  const graves: {x:number;z:number;yaw:number;scale:number}[][]=[[],[]];
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8,x=Math.sin(a)*10.5,z=Math.cos(a)*11.5;
    if(z>7&&[0,-7.5,7.5].some(gx=>Math.abs(x-gx)<1.5))continue;
    graves[i%2]!.push({x,z,yaw:Math.atan2(-x,-z),scale:.92+(i%3)*.11});
  }
  stamp(slab,graves[0]!,'grave-stones'); stamp(natural,graves[1]!,'grave-stones');
  stamp(rock,[-10.5,10.5].flatMap(x=>[-9,-5,-1,3,6].map((z,i)=>({x,z,yaw:i*1.7,scale:.8+(i%3)*.2}))), 'mossy-wall-rubble');
  for (const shoe of shoes) {
    const holder = bundle.attachTo(shoe.parent), model = geta.clone(true);
    holder.name = 'textured-geta-display'; holder.scale.setScalar(shoe.scale); holder.add(model);
    if (shoe.repaired) {
      const thread = new THREE.MeshStandardMaterial({ color: 0x719ba7, roughness: 1 });
      for (let i=0;i<3;i++) {
        const seam = new THREE.Mesh(new THREE.TorusGeometry(.015,.003,4,10,Math.PI*1.75),thread);
        seam.position.set(-.022+i*.022,.18,-.005); seam.rotation.y=Math.PI/2; holder.add(seam);
      }
    }
  }
}
