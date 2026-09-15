import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { facingYaw } from '../src/ai/facing.ts';
import { WellWoman } from '../src/ai/wellWoman.ts';
import { Props } from '../src/world/props.ts';
import { WellCinematics } from '../src/story/wellCinematics.ts';
import { Graveyard } from '../src/world/village/graveyard.ts';
import { GraveyardHollow } from '../src/world/village/graveyardHollow.ts';

test('a child stays upright at contact and turns slowly along the shortest arc', () => {
  let yaw = 0.45;
  for (let i = 0; i < 120; i++) yaw = facingYaw(yaw, Math.sin(i) * 0.4, Math.cos(i) * 0.4, 1/60);
  assert.equal(yaw, 0.45);
  const before = Math.PI - 0.03;
  const after = facingYaw(before, -0.1, -4, 1/60);
  assert.ok(after > before && after - before <= 1.25 / 60);
  assert.equal(facingYaw(yaw, 5, 0, 0), yaw);
});

test('the well mixer and rise continue during a shot while movement, captures and AI timers pause', async t => {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.68, 0.3)); scene.add(body);
  const hand = new THREE.Bone(); hand.name = 'Hand'; scene.add(hand);
  const clips = ['rise','submerged','idle','wade','cradle','face_check','grab','recognize','rope_tug'].map(name =>
    new THREE.AnimationClip(name, 2, [new THREE.NumberKeyframeTrack('Hand.position[x]', [0, 1, 2], [0, 0.35, 0])]));
  t.mock.method(Props, 'loader', () => ({loadAsync: async () => ({scene, animations: clips})}));
  const chamber = {cx:0, cz:0, r:3.4, floorY:-12, waterY:-11.84};
  const shaft = {chamber, inChamber:()=>true, inNiche:()=>false};
  const sfx = new Proxy({}, {get:()=>()=>{}});
  const woman = new WellWoman(shaft,sfx); await woman.ready;
  const player = new THREE.Vector3(1.5,-12,0);
  woman.beginPickupReveal(player); woman.endPickupReveal();
  const origin = woman.pos.clone(), cooldown = woman.caughtCooldown;
  for (let i=0;i<45;i++) woman.update(1/60,player,true,true);
  assert.ok(hand.position.x > 0.2, 'the animated bone must move during the shot');
  assert.ok(woman.riseK > 0.9, 'the model must emerge from the water');
  assert.deepEqual(woman.pos.toArray(),origin.toArray());
  assert.equal(woman.stateT,0); assert.equal(woman.caughtCooldown,cooldown); assert.equal(woman.catches,0);
  woman.update(0.2,player,true);
  assert.ok(woman.pos.distanceTo(origin)>0.1,'pursuit resumes on release');
  woman.beginRecognition(player); const start = woman.actions.get('face_check').time;
  woman.update(0.3,player,false,true);
  assert.ok(woman.actions.get('face_check').time>start);
  woman.sinkForCinematic(); woman.beginFinalKnot();
  assert.equal(woman.state,'risen'); assert.equal(woman.activeClip,'rope_tug');
  const knotTime=woman.actions.get('rope_tug').time, knotPos=woman.pos.clone();
  woman.update(0.4,player,true);
  assert.ok(woman.actions.get('rope_tug').time>knotTime);
  assert.deepEqual(woman.pos.toArray(),knotPos.toArray());
});

test('all well camera keys and connecting segments stay inside the chamber; the outro stays at the well', () => {
  const c = {cx:-10,cz:22,r:3.4,floorY:-12}, shots = new WellCinematics(c);
  const woman = new THREE.Vector3(-10,-10.42,22), altar = new THREE.Vector3(-11.25,-11.45,20.9);
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8, p=new THREE.Vector3(c.cx+Math.cos(a)*3.5,-12,c.cz+Math.sin(a)*3.5);
    const sequences = [shots.faceCheck(p,woman),shots.firstQuestion(p,woman),shots.coinPickup(p,altar,woman),shots.firstCapture(p,woman,altar),shots.finalKnot(altar,woman,p)];
    for(const seq of sequences) {
      assert.equal(seq.cameraPath,'bounded');
      for(const k of seq.cam) {
        assert.ok(Math.hypot(k.pos[0]-c.cx,k.pos[2]-c.cz)<=c.r-0.65+1e-6,seq.id);
        assert.ok(k.pos[1]>=c.floorY+0.7&&k.pos[1]<=c.floorY+3.2,seq.id);
      }
    }
  }
  const p=new THREE.Vector3(-8.4,0,22.6), well=new THREE.Vector3(-10,0,22);
  for(const k of shots.surfaceOutro(p,well,new THREE.Vector3(40,5,40)).cam)
    assert.ok(Math.hypot(k.pos[0]-p.x,k.pos[2]-p.z)<5);
});

test('the surface maze cannot catch an underground corner and hollow recovery retains the same location', () => {
  const hollow=Object.assign(Object.create(GraveyardHollow.prototype),{
    center:new THREE.Vector3(-40,0,15), floorY:-18, landing:new THREE.Vector3(-40,-17.88,22.5),
    wasInside:false,recovery:new THREE.Vector3(),
  });
  const grave=Object.assign(Object.create(Graveyard.prototype),{
    center:hollow.center, hollow, mazeOn:true, loopCooldown:0, loopR:16, loopCount:0,
    ground:{heightAt:()=>0},
  });
  const corner=new THREE.Vector3(-27.8,-18,28.2);
  assert.equal(hollow.contains(corner),false);
  assert.equal(grave.loopCheck(corner,1/60),null,'no teleport to surface outside the hollow bounds');
  assert.equal(hollow.recoverPosition(hollow.landing),null);
  assert.deepEqual(hollow.recoverPosition(corner).toArray(),hollow.landing.toArray());
  assert.equal(hollow.recoverPosition(new THREE.Vector3(-40,0,15)),null,'explicit surface return is allowed');
  assert.ok(grave.loopCheck(new THREE.Vector3(-23,0,15),1/60),'surface maze still works');
});

test('returning from a well shot preserves the player view in first and third person', async () => {
  const {ThirdPersonCamera}=await import('../src/camera/thirdPerson.ts');
  for(const mode of ['first','third']) {
    const camera=new THREE.PerspectiveCamera(55), physics={R:{Ball:class{}},world:{castShape:()=>null}};
    const rig=new ThirdPersonCamera(camera,physics,{}), player=new THREE.Vector3(0,-12,0);
    rig.setView(mode); rig.yaw=-1.2; rig.pitch=0.21;
    const before={yaw:rig.yaw,pitch:rig.pitch,distance:2};
    camera.position.set(2,-10.5,1); camera.lookAt(-1,-10.7,0);
    rig.adoptCurrentView(player,before);
    for(let i=0;i<40;i++)rig.update(1/60,{x:0,y:0},0,player,0,true);
    assert.equal(rig.yaw,before.yaw);assert.equal(rig.pitch,before.pitch);
    if(mode==='first') {
      const forward=camera.getWorldDirection(new THREE.Vector3());
      assert.ok(Math.abs(forward.x+Math.sin(before.yaw)*Math.cos(before.pitch))<1e-6);
    }
  }
});
