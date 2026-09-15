import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Physics} from '../src/core/physics.ts';
import {addWalkColliders} from '../src/world/ogimachi/walkPhysics.ts';
import {CharacterController} from '../src/character/controller.ts';

test('rotated onsen allows porch approach but blocks closed doors, pillars and bench',async()=>{
  const physics=await Physics.create();
  try{
    const b={id:236248626,x:32,z:-25,height:4,angle:-2.943572,width:15.135,depth:54.613,levels:2};
    const collision=addWalkColliders(physics,new T.Group(),{buildings:[b]});physics.step(1/60);
    const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),b.angle);
    const hit=(x,y,z,dx,dz,length)=>{
      const p=new T.Vector3(x,y,z).applyQuaternion(q).add(new T.Vector3(b.x,b.height,b.z));
      const d=new T.Vector3(dx,0,dz).applyQuaternion(q);
      return physics.world.castRay(new physics.R.Ray(p,d),length,true);
    };
    assert.equal(hit(-11.5,1.3,14,1,0,4.4),null,'approach must reach beyond the old roof footprint');
    assert.ok(hit(-7.1,1.3,14,1,0,1),'closed entrance blocks entry');
    assert.ok(hit(-5.9,1.3,14,-1,0,1),'wall blocks from inside too');
    assert.ok(hit(-9.3,1.3,11.2,1,0,1),'porch pillar blocks');
    assert.ok(hit(-8.3,.4,18.4,1,0,1),'bench blocks');
    collision.openOnsen();physics.step(1/60);
    assert.equal(hit(-8,1.3,14,1,0,5),null,'open doorway and foyer are clear');
    assert.equal(hit(-3,1.3,14,-1,0,5),null,'return route remains open');
    assert.ok(hit(-3,1.3,14,1,0,2),'rear wall remains solid');
  }finally{physics.world.free();}
});

test('player capsule walks into the open foyer and back out without teleporting',async()=>{
  const physics=await Physics.create();
  try{
    const b={id:236248626,x:0,z:0,height:0,angle:0,width:15.135,depth:54.613,levels:2};
    physics.addStaticBox(new T.Vector3(0,-.1,0),new T.Vector3(50,.1,50));
    const collision=addWalkColliders(physics,new T.Group(),{buildings:[b]});
    const player=new CharacterController(physics,new T.Vector3(-9.2,.1,14));
    const advance=(direction,seconds)=>{for(let i=0;i<seconds*60;i++){
      player.update(1/60,{axis:{x:0,y:direction},cameraYaw:-Math.PI/2,walk:true,jumpPressed:false,jumpHeld:false});physics.step(1/60);
    }};
    advance(1,2);assert.ok(player.position.x< -6.8,'closed door stops capsule');
    collision.openOnsen();advance(1,1.5);
    assert.ok(player.position.x> -6&&player.position.x< -2,'capsule enters room');
    advance(-1,3);assert.ok(player.position.x< -8,'capsule exits through the same door');
    assert.ok(Math.abs(player.position.y)<.2,'capsule stays grounded');
  }finally{physics.world.free();}
});
