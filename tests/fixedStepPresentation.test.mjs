import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {FixedStepPresentation} from '../src/story/fixedStepPresentation.ts';

test('irregular display frames do not present zero-step/double-step body jumps',()=>{
 const position=new Vector3(),view=new FixedStepPresentation(position),step=1/60,speed=2.79;
 let remainder=0,time=0,previousShown,previousTime,rawPrevious=0,zeros=0,doubles=0;
 for(let i=0;i<600;i++){
  const dt=[.008,.025,.017][i%3];time+=dt;remainder+=dt;
  while(remainder>=step){view.beforeStep(position);position.z+=speed*step;remainder-=step;}
  if(position.z===rawPrevious)zeros++;if(position.z-rawPrevious>speed*step*1.5)doubles++;
  rawPrevious=position.z;
  const saved=position.clone(),offset=view.offset(position,remainder,step);
  const shown=position.clone().add(offset);
  const companion=position.clone().add(new Vector3(.17,0,.34)).add(offset);
  assert.deepEqual(position,saved,'presentation must not move the physics body');
  assert.ok(companion.clone().sub(shown).distanceTo(new Vector3(.17,0,.34))<1e-10);
  if(i>2)assert.ok(Math.abs(shown.z-previousShown-speed*(time-previousTime))<1e-10);
  previousShown=shown.z;previousTime=time;
 }
 assert.ok(zeros>0&&doubles>0,'fixture reproduces the un-interpolated stepping');
});
test('cinematic teleports reset presentation immediately',()=>{
 const view=new FixedStepPresentation(new Vector3());
 assert.equal(view.offset(new Vector3(100,0,100),.008,1/60).length(),0);
});
