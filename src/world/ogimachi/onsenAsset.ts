import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {SurveyBuilding} from './survey';

/** Shared exterior for design and detailed worlds; retains the Blender axis conversion. */
export async function loadOnsenExterior(b:SurveyBuilding){
  const asset=await new GLTFLoader().loadAsync('/models/ogimachi/onsen-v3.glb?v=B004-canopy-3');
  const root=asset.scene;root.name='B004-textured-onsen';
  root.position.set(b.x,b.height,b.z);root.rotation.y=b.angle;
  root.traverse(o=>{if(o instanceof T.Mesh){
    o.castShadow=true;o.receiveShadow=true;
    for(const mat of Array.isArray(o.material)?o.material:[o.material])
      if(mat instanceof T.MeshStandardMaterial&&mat.name.includes('horizontal cedar'))mat.color.setRGB(.7,.65,.58);
  }});
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#dbc49b';ctx.font='52px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('白川郷の湯',256,48);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const label=new T.Mesh(new T.PlaneGeometry(2.5,.40),new T.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:1}));
  label.rotation.y=-Math.PI/2;label.position.set(-6.92,3.0,14);root.add(label);
  const inside=label.clone();inside.geometry=new T.PlaneGeometry(1.45,.28);inside.position.set(-1.74,1.9,14);root.add(inside);
  let floorMaterial:T.Material=new T.MeshStandardMaterial({color:0x8c8780,roughness:1});
  root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)&&o.material.name.includes('Foundation granite'))floorMaterial=o.material;});
  const floor=new T.Mesh(new T.PlaneGeometry(5,8),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.set(-4.05,.16,14);
  floor.userData['walkSurface']=true;floor.receiveShadow=true;root.add(floor);
  // The detailed yard overlay sits at +.10 m. Keep the threshold above it.
  const rampGeo=new T.BufferGeometry();rampGeo.setAttribute('position',new T.Float32BufferAttribute([-9.5,.12,11.7,-6.55,.16,11.7,-9.5,.12,16.3,-6.55,.16,16.3],3));
  rampGeo.setAttribute('uv',new T.Float32BufferAttribute([0,0,1.5,0,0,2.3,1.5,2.3],2));rampGeo.setIndex([0,2,1,1,2,3]);rampGeo.computeVertexNormals();
  const ramp=new T.Mesh(rampGeo,floorMaterial);ramp.userData['walkSurface']=true;ramp.receiveShadow=true;root.add(ramp);
  const light=new T.PointLight(0xffdfaf,12,9,2);light.position.set(-4.1,2.7,14);root.add(light);
  return root;
}
