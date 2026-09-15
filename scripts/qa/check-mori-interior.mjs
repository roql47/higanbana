import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import R from '@dimforge/rapier3d-compat';
import assert from 'node:assert/strict';
await R.init();const world=new R.World({x:0,y:-9.81,z:0});
const root=(await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/ogimachi/mori-story-interior.glb')).getRoot();
assert.equal(root.listScenes().length,1);
const nodes=root.listNodes().filter(n=>n.getExtras().collisionBox);assert.equal(nodes.length,16);
for(const n of nodes){const [x,y,z]=n.getWorldTranslation(),[w,h,d]=n.getExtras().collisionBox;world.createCollider(R.ColliderDesc.cuboid(w/2,h/2,d/2).setTranslation(x,y,z));}
const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.88,4.25));
const col=world.createCollider(R.ColliderDesc.capsule(.55,.28),body);const k=world.createCharacterController(.02);k.enableSnapToGround(.25);
let moved=0;
for(const goal of [[0,.03,-2.85],[2.8,.03,-2.85],[0,.03,-2.85],[0,.03,4.25]]){
 for(let i=0;i<400;i++){const p=body.translation(),dx=goal[0]-p.x,dz=goal[2]-p.z,l=Math.hypot(dx,dz);if(l<.06)break;k.computeColliderMovement(col,{x:dx/Math.max(l,.001)*Math.min(l,.045),y:-.012,z:dz/Math.max(l,.001)*Math.min(l,.045)});const v=k.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});world.step();moved++;}
 const p=body.translation();assert.ok(Math.hypot(p.x-goal[0],p.z-goal[2])<.12,`route blocked at ${JSON.stringify(p)}`);assert.ok(p.y>.80&&p.y<.92,'feet lost floor');
}
console.log(JSON.stringify({collisionBoxes:nodes.length,route:'entrance → center aisle → TV approach → entrance',steps:moved,result:'pass'}));world.free();
