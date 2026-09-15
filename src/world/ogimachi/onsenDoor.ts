import * as T from 'three';
import type {SurveyBuilding} from './survey';

/** Once opened, stays open so the visitor can always leave the study room. */
export function onsenDoor(group:T.Group,b:SurveyBuilding,unlock:()=>void){
  const leaves:{object:T.Object3D;z:number;side:number}[]=[];
  group.traverse(object=>{const side=object.userData['onsenDoorSide'];if(side===1||side===-1)leaves.push({object,z:object.position.z,side});});
  let opening=false,progress=0,unlocked=false;
  const near=(p:T.Vector3)=>{
    const dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
    return Math.abs(c*dx-s*dz+6.75)<3&&Math.abs(s*dx+c*dz-14)<2.8&&Math.abs(p.y-b.height)<3;
  };
  return {
    near,
    open(p:T.Vector3){if(near(p)&&leaves.length===2)opening=true;},
    update(dt:number){
      if(!opening||unlocked)return;
      progress=Math.min(1,progress+Math.max(0,Math.min(dt,.1))/1.2);
      const t=progress*progress*(3-2*progress);
      // glTF export bakes Blender +Y into runtime -Z, including empty door roots.
      for(const leaf of leaves)leaf.object.position.z=leaf.z-leaf.side*2.3*t;
      if(progress===1){unlock();unlocked=true;}
    },
    get opened(){return unlocked;}
  };
}
