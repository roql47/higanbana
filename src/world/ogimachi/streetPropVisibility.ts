import * as T from 'three';
// Keep tall landmarks visible farther away than small ground furnishings.
const ranges:Record<string,number>={
  'Tripo-Blender-fern-pot':65,'Blender-street-bin':85,'Blender-street-bench':100,
  'Blender-street-hydrant':85,'Blender-street-noticeboard':120,'Blender-street-lamp':220,
};
export function createStreetPropVisibility(root:T.Object3D){
  const entries:{object:T.Object3D;center:T.Vector3;range:number}[]=[];
  root.updateWorldMatrix(true,true);
  root.traverse(object=>{const range=ranges[object.name];if(range)entries.push({object,range,center:new T.Box3().setFromObject(object).getCenter(new T.Vector3())});});
  return (camera:T.Vector3)=>{
    let changed=false;
    for(const {object,center,range} of entries){
      // A 15m dead band avoids flicker when walking along the distance boundary.
      const limit=range+(object.visible?15:0),visible=center.distanceToSquared(camera)<=limit*limit;
      if(object.visible!==visible){object.visible=visible;changed=true;}
    }
    return changed;
  };
}
