import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildGasshoRoof,gasshoThatch} from '../src/world/higasato/gassho.ts';
import {HigasatoGround,ALL_PATHS,SITES} from '../src/world/higasato/ground.ts';
import {SETTLEMENT_FIELDS} from '../src/world/higasato/settlementPlan.ts';
import {rectToPoly} from '../src/world/higasato/minka.ts';
import {Physics} from '../src/core/physics.ts';

test('gassho roofs have finite normals/UVs, steep slopes and bounded eaves at both house sizes',()=>{
  const mat=new THREE.MeshStandardMaterial(),tex={plankDark:mat,timber:mat,shojiMat:mat};
  for(const [span,length] of [[2.8,3],[4.9,5.9]]) {
    const parts=buildGasshoRoof(span,length,3,tex,41),bounds=new THREE.Box3();
    for(const {geo} of parts) {
      for(const key of ['position','normal','uv']) {
        const attr=geo.getAttribute(key);assert.ok(attr);
        assert.ok(Array.from(attr.array).every(Number.isFinite),key);
      }
      geo.computeBoundingBox();bounds.union(geo.boundingBox);geo.dispose();
    }
    assert.ok(bounds.max.x<=span+.22 && bounds.min.x>=-span-.22,'roof remains inside eave allowance');
    assert.ok(bounds.max.z<=length+.1 && bounds.min.z>=-length-.1,'ridge cap remains inside frontage allowance');
    const pitch=Math.atan2(bounds.max.y-3-.33,span)*180/Math.PI;
    assert.ok(pitch>54 && pitch<58,'steep gassho pitch');
  }
  assert.equal(gasshoThatch(),gasshoThatch(),'all roofs share texture/material');mat.dispose();
});

test('new agricultural plots keep paths/sites open and their shallow water covers the physical soil',async()=>{
  const physics=await Physics.create(),ground=new HigasatoGround(new THREE.Scene(),physics,{map:null,normalMap:null,armMap:null});
  try {
    for(const f of SETTLEMENT_FIELDS) {
      for(const r of ALL_PATHS)assert.ok(rectToPoly(r.pts,f.x,f.z,0,f.w,f.d)>r.halfWidth+.7,`${f.id} crosses ${r.id}`);
      for(const s of Object.values(SITES))assert.ok(Math.abs(f.x-s.x)>(f.w+s.w)/2+1 || Math.abs(f.z-s.z)>(f.d+s.d)/2+1,`${f.id} crosses ${s.id}`);
      const water=ground.fieldWaterHeight(f.x,f.z);
      for(const dx of [-f.w/2+1,0,f.w/2-1])for(const dz of [-f.d/2+1,0,f.d/2-1]) {
        const soil=ground.heightAt(f.x+dx,f.z+dz);
        assert.ok(water-soil>.10 && water-soil<.22,`${f.id}: soil/water mismatch`);
      }
      assert.equal(ground.surfaceAt(new THREE.Vector3(f.x,water,f.z)),'water');
    }
    for(const [x,z] of [[100,0],[-100,0],[0,100],[0,-100]])assert.equal(ground.backdropHeightAt(x,z),ground.heightAt(x,z),'mountain apron seam');
  } finally {physics.world.free();ground.mesh.geometry.dispose();ground.apron.geometry.dispose();ground.mesh.material.dispose();}
});
