import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Physics } from '../src/core/physics.ts';
import { HigasatoGround, ALL_PATHS, SITES, LANES, SETTLEMENT_LANES } from '../src/world/higasato/ground.ts';
import { SETTLEMENT_LOTS, inSettlementLot } from '../src/world/higasato/settlementPlan.ts';
import { placeAlongLane, rectToPoly } from '../src/world/higasato/minka.ts';

test('authored settlement lots keep routes and story sites clear', () => {
  for(const h of SETTLEMENT_LOTS) {
    for(const r of ALL_PATHS) assert.ok(rectToPoly(r.pts,h.x,h.z,h.yaw,h.w,h.d)>=r.halfWidth+.7,`${h.id} blocks ${r.id}`);
    const hw=(Math.abs(Math.cos(h.yaw))*h.w+Math.abs(Math.sin(h.yaw))*h.d)/2;
    const hd=(Math.abs(Math.sin(h.yaw))*h.w+Math.abs(Math.cos(h.yaw))*h.d)/2;
    for(const s of Object.values(SITES)) assert.ok(Math.abs(h.x-s.x)>hw+s.w/2+1 || Math.abs(h.z-s.z)>hd+s.d/2+1,`${h.id} overlaps ${s.id}`);
    assert.equal(inSettlementLot(h.x,h.z,2),true);
  }
});

test('infill preserves the original eight house anchors and leaves new lanes unobstructed', async () => {
  const physics=await Physics.create();
  const ground=new HigasatoGround(new THREE.Scene(),physics,{map:null,normalMap:null,armMap:null});
  try {
    let s=77149;
    const rng=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296};
    const lanes=[{id:'sando-village',halfWidth:1.9,pts:[[0,41],[0,30],[0,24],[.8,16],[1.2,10]]},...LANES];
    const houses=[],rej={site:0,paddy:0,slope:0,road:0,clash:0};
    for(const lane of lanes)placeAlongLane(lane,rng,ground,houses,lanes,rej);
    assert.deepEqual(houses.map(h=>[+h.x.toFixed(1),+h.z.toFixed(1)]),[[5.9,31.3],[10.6,41.6],[17.5,27.8],[20.1,14.5],[12.7,8.3],[26.5,41.4],[-8.5,29.5],[7.5,16.4]]);
    for(const h of houses)for(const r of SETTLEMENT_LANES)assert.ok(rectToPoly(r.pts,h.x,h.z,h.yaw,h.w,h.d)>r.halfWidth+.4,`new lane ${r.id} cuts existing house`);
    const separated=(a,b)=>{
      const axes=h=>[[Math.cos(h.yaw),-Math.sin(h.yaw)],[Math.sin(h.yaw),Math.cos(h.yaw)]];
      const radius=(h,axis)=>{const [u,v]=axes(h);return Math.abs(u[0]*axis[0]+u[1]*axis[1])*(h.w/2+1)+Math.abs(v[0]*axis[0]+v[1]*axis[1])*(h.d/2+1.2)};
      return [...axes(a),...axes(b)].some(axis=>Math.abs((a.x-b.x)*axis[0]+(a.z-b.z)*axis[1])>radius(a,axis)+radius(b,axis));
    };
    for(const [i,lot] of SETTLEMENT_LOTS.entries())for(const other of [...houses,...SETTLEMENT_LOTS.slice(0,i)])assert.ok(separated(lot,other),`overlapping house roofs ${lot.id} and ${other.id??`${other.x},${other.z}`}`);
    for(const lot of SETTLEMENT_LOTS) {
      const center=ground.heightAt(lot.x,lot.z);
      for(const sx of [-1,1])for(const sz of [-1,1]) {
        const x=lot.x+Math.cos(lot.yaw)*sx*lot.w/2+Math.sin(lot.yaw)*sz*lot.d/2;
        const z=lot.z-Math.sin(lot.yaw)*sx*lot.w/2+Math.cos(lot.yaw)*sz*lot.d/2;
        assert.ok(Math.abs(ground.heightAt(x,z)-center)<.025,`uneven foundation ${lot.id}`);
      }
    }
  } finally {physics.world.free();ground.mesh.geometry.dispose();ground.apron.geometry.dispose();ground.mesh.material.dispose();}
});
