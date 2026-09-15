import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { SurveyData } from './survey';
import {ONSEN_ID,onsenProfile} from './onsenStudy';

/** Metres, Y-up. Ground triangles match the visible slopes; houses use solid footprint proxies. */
export function addWalkColliders(physics: Physics, group: THREE.Group, data: SurveyData) {
  group.updateMatrixWorld(true);
  let surfaces = 0;
  const groundHandles = new Set<number>();
  let openOnsen=()=>{};let blockIrori=(_blocked:boolean)=>{};
  group.traverse(object => {
    const size=object.userData['collisionBox'] as number[] | undefined;
    if(size){
      const position=object.getWorldPosition(new THREE.Vector3());
      const scale=object.getWorldScale(new THREE.Vector3());
      const solid=physics.addStaticBox(position,new THREE.Vector3(size[0]!/2,size[1]!/2,size[2]!/2).multiply(scale),object.getWorldQuaternion(new THREE.Quaternion()));
      if(object.userData['walkSurface'])groundHandles.add(solid.col.handle);
    }
    if (!(object instanceof THREE.Mesh) || !(object.name === 'GSI-DEM-ground-metres' || object.name.startsWith('mapped-roads-') || object.userData['walkSurface'] === true)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const positions = new Float32Array(geometry.getAttribute('position').array);
    const indices = geometry.index ? new Uint32Array(geometry.index.array)
      : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    const collider = physics.world.createCollider(physics.R.ColliderDesc.trimesh(positions, indices).setFriction(1));
    groundHandles.add(collider.handle);
    geometry.dispose();
    surfaces++;
  });
  for (const b of data.buildings) {
    if(b.model==='irori-restaurant'&&group.getObjectByName('irori-enterable-building')){
      const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),b.angle);
      const center=new THREE.Vector3(-4.57,1.37,0).applyQuaternion(rotation).add(new THREE.Vector3(b.x,b.height,b.z));
      const door=physics.addStaticBox(center,new THREE.Vector3(.10,1.1,1.025),rotation);
      blockIrori=blocked=>door.col.setEnabled(blocked);
      continue;
    }
    if(b.id===ONSEN_ID){
      const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),b.angle);
      const box=(x:number,y:number,z:number,w:number,h:number,d:number)=>{
        const center=new THREE.Vector3(x,y,z).applyQuaternion(rotation).add(new THREE.Vector3(b.x,b.height,b.z));
        return physics.addStaticBox(center,new THREE.Vector3(w/2,h/2,d/2),rotation);
      };
      // Preserve the empty foyer and the doorway in the authored Blender shell.
      box(0,4.9,0,13.1,3.3,52.4);
      box(0,1.65,22.1,13.1,3.3,8.2);box(0,1.65,-8.1,13.1,3.3,36.2);
      box(2.5,1.65,14,8.1,3.3,8);
      for(const z of [17.15,10.85])box(-6.55,1.65,z,.18,3.3,1.7);
      box(-6.55,3.075,14,.18,.35,4.6);
      const door=box(-6.75,1.65,14,.2,3.3,4.6);openOnsen=()=>door.col.setEnabled(false);
      box(-2.3,.3,16.6,.6,.6,2.2);box(-2,.6,11.4,.45,1.2,1.8);
      for(const z of [11.2,16.8])box(-8.7,1.61,z,.38,3.22,.38);
      box(-7.55,.3,18.4,.62,.6,2);
      box(-7.75,3.4,14,2.9,.35,6.5);
      continue;
    }
    const h = Math.max(3, b.levels * 2.7);
    physics.addStaticBox(new THREE.Vector3(b.x, b.height + h / 2, b.z),
      new THREE.Vector3(b.width / 2, h / 2, b.depth / 2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.angle));
  }
  const ray = new physics.R.Ray({ x: 0, y: 4096, z: 0 }, { x: 0, y: -1, z: 0 });
  const isGround = (collider: { handle: number }) => groundHandles.has(collider.handle);
  // Actors must stand on the same triangles as the player, including raised
  // roads. DEM samples are not the interpolated, rendered/collidable surface.
  const heightAt = (x: number, z: number): number | null => {
    ray.origin.x = x; ray.origin.z = z;
    const hit = physics.world.castRay(ray, 8192, true, undefined, undefined, undefined, undefined, isGround);
    if(hit)return ray.origin.y-hit.timeOfImpact;
    // Long downward rays can miss a shared float32 triangle edge by micrometres.
    // Retry within 5 mm only when the exact ray misses; never snap to a distant surface.
    let nearest:number|null=null;
    for(const [dx,dz] of [[.005,0],[-.005,0],[0,.005],[0,-.005]]){
      ray.origin.x=x+dx!;ray.origin.z=z+dz!;
      const edgeHit=physics.world.castRay(ray,8192,true,undefined,undefined,undefined,undefined,isGround);
      if(edgeHit){const y=ray.origin.y-edgeHit.timeOfImpact;nearest=nearest===null?y:Math.max(nearest,y);}
    }
    return nearest;
  };
  return { surfaces, buildings: data.buildings.length, heightAt, openOnsen, blockIrori };
}
