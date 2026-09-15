import bpy,math
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
assert not bpy.app.is_job_running('RENDER')
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-irori-timber-v6.blend',{s},fake_user=True,compress=True)
for o in list(r.children):
 if o.name.startswith('IR6 '):bpy.data.objects.remove(o,do_unlink=True)
base=bpy.data.materials['IR5 aged cedar floor']
def material(name,low,high):
 m=base.copy();m.name=name
 for node in m.node_tree.nodes:
  if node.type=='VALTORGB':node.color_ramp.elements[0].color=(*low,1);node.color_ramp.elements[1].color=(*high,1)
 return m
wood=material('IR6 aged interior cedar',(.080,.040,.019),(.225,.133,.062));dark=material('IR6 smoke aged frame',(.018,.013,.009),(.072,.042,.022))
def grain(o,axis):
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for p in o.data.polygons:
  other=max([i for i in range(3) if i!=axis],key=lambda i:1-abs(p.normal[i]))
  for li in p.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[axis],v[other])
def box(name,pos,size,mat,axis=None):
 x,y,z=[v/2 for v in size];vs=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)];fs=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.materials.append(mat);o=bpy.data.objects.new('IR6 '+name,me);s.collection.objects.link(o);o.parent=r;o.location=pos;o['runtimeGroup']='interior';grain(o,axis if axis is not None else max(range(3),key=lambda i:size[i]));be=o.modifiers.new('Worn edge','BEVEL');be.width=min(.004,min(size)*.12);be.segments=2;return o
# Correct source UV direction on frame members without affecting their placement.
for o in list(r.children):
 if o.type!='MESH' or o.hide_render:continue
 if o.name.startswith(('IR interior wall post','IR interior ceiling cross beam','IR2 wall rail','IR2 wainscot batten','IR2 front mullion')):
  o.data=o.data.copy();o.data.materials.clear();o.data.materials.append(dark);axis=max(range(3),key=lambda i:o.dimensions[i]);grain(o,axis)
# Replace stretched ceiling and wall sheets with actual boarding.
for o in list(r.children):
 if o.name in ['IR interior ceiling','IR2 back wainscot'] or o.name.startswith(('IR2 wall timber base','IR2 front low lining')):o.hide_render=True;o.hide_set(True)
for j in range(44):
 y=-5.65+(j+.5)*11.3/44
 for a,b in [(-4.475,-.9),(-.9,4.075)]:box('ceiling board',((a+b)/2,y,3.18),(b-a-.001,11.3/44-.0015,.12),wood,0)
for side in [-1,1]:
 for j in range(34):box('vertical wall board',(-4.2+(j+.5)*8.25/34,side*5.457,.71),(8.25/34-.0015,.074,.78),wood,2)
for j in range(46):box('rear vertical board',(3.83,-5.5+(j+.5)*11/46,.72),(.065,11/46-.0015,.8),wood,2)
for side in [-1,1]:
 for j in range(18):box('front vertical board',(-4.32,side*3.3-2.175+(j+.5)*4.35/18,.61),(.10,4.35/18-.0015,.61),wood,2)
# Back wall rails and posts close the abrupt finish at the plaster boundary.
for z in [.34,1.14,2.82]:box('rear finish rail',(3.77,0,z),(.085,11.02,.065),dark,1)
for y in [-5.38,-.1,5.38]:box('rear frame post',(3.77,y,1.69),(.14,.14,2.78),dark,2)
# Small bearing blocks and pegged junctions where cross beams meet wall posts.
for x in [-3.5,-1,1.5,3.6]:
 for side in [-1,1]:
  y=side*5.38;box('beam bearing',(x,y,2.86),(.26,.31,.13),dark)
  box('exposed timber peg',(x-.084,y-side*.045,2.77),(.015,.035,.035),wood,2)
# Ceiling perimeter trim follows the actual shell instead of floating on plaster.
for y in [-5.42,5.42]:box('ceiling edge ledger',(-.15,y,3.03),(8.17,.13,.13),dark,0)
bpy.context.view_layer.update();r['interior_revision']='v6-timber'
bpy.data.libraries.write(R+'/assets/authored/ogimachi/irori-interior-v6.blend',{s},fake_user=True,compress=True)
old=s.camera;settings=(s.render.resolution_x,s.render.resolution_y,s.render.filepath,s.cycles.samples);s.camera=bpy.data.objects['IR interior review'];s.render.resolution_x=1400;s.render.resolution_y=950;s.render.filepath=R+'/artifacts/ogimachi-phases/irori-interior-v6.png';s.cycles.samples=32
def render():
 try:bpy.ops.render.render(write_still=True)
 finally:s.camera=old;s.render.resolution_x,s.render.resolution_y,s.render.filepath,s.cycles.samples=settings
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Wall and ceiling boards, aligned grain, bearing blocks and trim saved; rendering')
