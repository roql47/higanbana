import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {FRONTAGE_REFERENCES,referenceUrl,verticalFov} from '../src/world/ogimachi/referenceCamera.ts';
test('reference frame keeps its horizontal edges across portrait and landscape viewports',()=>{
 for(const aspect of [9/16,1,16/9,21/9]){
  const camera=new PerspectiveCamera(verticalFov(100,aspect),aspect,.1,100);
  camera.updateMatrixWorld();
  const edge=new Vector3(Math.tan(50*Math.PI/180)*10,0,-10).project(camera);
  assert.ok(Math.abs(edge.x-1)<1e-10);
 }
});
test('reference links lock the reviewed photograph and share the model projection request',()=>{
 for(const ref of Object.values(FRONTAGE_REFERENCES)){
  const params=new URL(referenceUrl(ref)).searchParams;
  assert.equal(params.get('pano'),ref.pano);assert.equal(params.get('fov'),String(ref.hfov));
  assert.equal(params.get('pitch'),String(ref.pitch));assert.equal(params.has('viewpoint'),false);
 }
});
