import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createStreetPropVisibility} from '../src/world/ogimachi/streetPropVisibility.ts';
test('props cull with a dead band, restore nearby, and leave collisions untouched',()=>{
 const root=new T.Group(),parent=new T.Group();parent.position.x=100;root.add(parent);
 const pot=new T.Mesh(new T.BoxGeometry(1,1,1));pot.name='Tripo-Blender-fern-pot';parent.add(pot);
 const collision=new T.Object3D();collision.name='COL_ACT1_pot';root.add(collision);
 const update=createStreetPropVisibility(root);
 assert.equal(update(new T.Vector3(181,0,0)),true);assert.equal(pot.visible,false);
 update(new T.Vector3(170,0,0));assert.equal(pot.visible,false);
 update(new T.Vector3(160,0,0));assert.equal(pot.visible,true);
 assert.equal(update(new T.Vector3(175,0,0)),false);assert.equal(pot.visible,true);
 assert.equal(collision.visible,true);
});
test('tall lamps remain visible farther than small pots',()=>{
 const root=new T.Group();
 for(const name of ['Blender-street-lamp','Tripo-Blender-fern-pot']){const mesh=new T.Mesh(new T.BoxGeometry(1,1,1));mesh.name=name;root.add(mesh);}
 createStreetPropVisibility(root)(new T.Vector3(150,0,0));
 assert.equal(root.children[0].visible,true);assert.equal(root.children[1].visible,false);
});
