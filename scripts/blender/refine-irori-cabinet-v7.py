"""Editable joinery pass: drawer fronts, framed doors and wall counter."""
import bpy,math
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
assert not bpy.app.is_job_running('RENDER')
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-irori-cabinet-v7.blend',{s},fake_user=True,compress=True)
for o in list(r.children):
 if o.name.startswith('IR7 '):bpy.data.objects.remove(o,do_unlink=True)
wood=bpy.data.materials['IR6 aged interior cedar'];dark=bpy.data.materials['IR6 smoke aged frame']
metal=bpy.data.materials.new('IR7 aged iron');metal.use_nodes=True;p=metal.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.035,.027,.019,1);p.inputs['Metallic'].default_value=.72;p.inputs['Roughness'].default_value=.55
# Reuse direct mesh and directional UV helpers, not previous scene mutations.
helper=open(R+'/scripts/blender/refine-irori-timber-v6.py').read();exec(helper[helper.index('def grain('):helper.index('# Correct source')].replace("'IR6 '+name","'IR7 '+name"))
def piece(name,pos,size,mat=wood,axis=None):
 o=box(name,pos,size,mat,axis);o['runtimeGroup']='cabinet';return o
def handle(y,z):
 # Bent iron bail with short return legs, standing proud of the drawer.
 cu=bpy.data.curves.new('IR7 iron bail','CURVE');cu.dimensions='3D';cu.bevel_depth=.010;cu.bevel_resolution=2;cu.resolution_u=2
 sp=cu.splines.new('POLY');pts=[(3.042,y-.075,z),(3.005,y-.075,z),(2.984,y-.055,z-.035),(2.984,y+.055,z-.035),(3.005,y+.075,z),(3.042,y+.075,z)];sp.points.add(len(pts)-1)
 for p,co in zip(sp.points,pts):p.co=(*co,1)
 ob=bpy.data.objects.new('IR7 curved iron handle',cu);s.collection.objects.link(ob);ob.parent=r;cu.materials.append(metal);ob['runtimeGroup']='cabinet'
 for yy in [y-.075,y+.075]:piece('iron mounting plate',(3.037,yy,z),(.013,.035,.055),metal)
for o in list(r.children):
 if o.name.startswith(('IR2 cabinet inset door','IR2 cabinet panel','IR2 cabinet pull','IR2 cabinet worktop','IR interior reception top')):o.hide_render=True;o.hide_set(True)
# Recessed carcass supplies true shadow gaps, framed door bottoms and drawer row.
for y in [-4.05,-3.23,-2.41,-1.59]:
 piece('recess behind fronts',(3.084,y,.88),(.018,.8,.96),dark)
 piece('drawer front',(3.059,y,1.225),(.060,.785,.225),wood,1)
 piece('drawer lower lip',(3.023,y,1.119),(.019,.77,.020),dark,1)
 handle(y,1.255)
 for yy in [y-.352,y+.352]:piece('door stile',(3.051,yy,.756),(.064,.070,.66),wood,2)
 for z in [.461,1.051]:piece('door rail',(3.051,y,z),(.064,.635,.070),wood,1)
 piece('recessed door field',(3.076,y,.756),(.025,.633,.514),wood,2)
 piece('door iron latch',(3.008,y+.245,.98),(.026,.04,.073),metal)
for y in [-4.48,-1.12]:piece('cabinet corner stile',(3.082,y,.87),(.10,.08,1.04),dark,2)
piece('recessed toe rail',(3.21,-2.8,.365),(.16,3.24,.11),dark,1)
for y in [-4.3,-2.8,-1.3]:piece('cabinet short foot',(3.13,y,.365),(.17,.13,.11),dark,2)
for j in range(3):piece('counter joined board',(3.45+(j-1)*.263,-2.8,1.425),(.261,3.52,.075),wood,1)
piece('counter eased front edge',(3.052,-2.8,1.419),(.027,3.52,.056),wood,1)
# Reception wall table: individual top boards, framed face, a real apron and pegs.
for j in range(4):piece('wall table top board',(-3.35,-2+(j-1.5)*.325,1.29),(1,.323,.07),wood,0)
for y in [-2.59,-1.41]:piece('wall table apron',(-3.35,y,1.17),(.92,.064,.16),dark,0)
for y in [-2.52,-2.26,-2,-1.74,-1.48]:piece('wall table face board',(-2.915,y,.8),(.035,.252,.84),wood,2)
for z in [.41,1.17]:piece('wall table face rail',(-2.887,-2,z),(.039,1.21,.055),dark,1)
for y in [-2.54,-1.46]:
 for z in [.45,1.13]:piece('wall table square peg',(-2.862,y,z),(.012,.025,.025),wood,2)
# Shelf edge profiles and brackets make the pottery shelving structurally supported.
for z in [1.66,2.12,2.57]:
 piece('shelf eased front',(3.425,-2.8,z),(.035,3.45,.050),wood,1)
 for y in [-4.3,-2.8,-1.3]:
  piece('shelf bearing',(3.63,y,z-.055),(.30,.055,.065),dark,0)
bpy.context.view_layer.update();r['interior_revision']='v7-cabinet'
bpy.data.libraries.write(R+'/assets/authored/ogimachi/irori-interior-v7.blend',{s},fake_user=True,compress=True)
print('v7 cabinet and reception joinery saved',sum(o.name.startswith('IR7 ') for o in r.children))
