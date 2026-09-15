import * as T from 'three';
import type {SurveyBuilding} from './survey';

/** Reversible sliding leaves. A closing sweep never traps the player. */
export function iroriDoor(group:T.Group,b:SurveyBuilding,setBlocked:(blocked:boolean)=>void){
  const leaves:{object:T.Object3D;z:number;side:number}[]=[];
  group.traverse(object=>{const side=object.userData['iroriDoorSide'];if(side===1||side===-1)leaves.push({object,z:object.position.z,side});});
  let progress=0,target=0,blocked=true;
  const local=(p:T.Vector3)=>{const dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);return {x:c*dx-s*dz,z:s*dx+c*dz,y:p.y-b.height};};
  const near=(p:T.Vector3)=>{const q=local(p);return Math.abs(q.x+4.57)<2.8&&Math.abs(q.z)<2.1&&q.y>-.5&&q.y<2.8;};
  const occupied=(p:T.Vector3)=>{const q=local(p);return Math.abs(q.x+4.57)<.85&&Math.abs(q.z)<2.15&&q.y>-.3&&q.y<2.7;};
  return {
    near,
    get leafCount(){return leaves.length;},
    toggle(p:T.Vector3){if(!near(p)||!leaves.length)return false;if(target===1&&occupied(p))return false;target=target===1?0:1;return true;},
    update(dt:number,p:T.Vector3){
      if(target===0&&progress>0&&occupied(p))target=1;
      progress=T.MathUtils.clamp(progress+Math.sign(target-progress)*Math.min(Math.abs(target-progress),Math.max(0,dt)/1.0),0,1);
      const t=progress*progress*(3-2*progress);
      for(const leaf of leaves)leaf.object.position.z=leaf.z-leaf.side*1.04*t;
      const next=progress===0?true:progress>=.98?false:blocked;
      if(next!==blocked){blocked=next;setBlocked(blocked);}
    },
    get opened(){return progress===1;},
    get opening(){return target===1;},
    get progress(){return progress;},
  };
}
