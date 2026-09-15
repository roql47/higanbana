import bpy,bmesh,math
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
assert not bpy.app.is_job_running('RENDER')
if not r.get('interior_v1'):
 bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-irori-interior-v1.blend',{s},fake_user=True,compress=True)
 # Extract the existing authored sliding frames instead of replacing their silhouette.
 for o in list(r.children):
  if o.type!='MESH' or not o.name.startswith('236248710') or o.hide_render:continue
  me=o.data;adj={v.index:set() for v in me.vertices}
  for e in me.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
  left=set(adj);remove=set();sides={-1:set(),1:set()}
  while left:
   st=[left.pop()];ids=[]
   while st:
    v=st.pop();ids.append(v);ns=adj[v]&left;left-=ns;st.extend(ns)
   vs=[o.matrix_local@me.vertices[i].co for i in ids];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
   if lo[0]>-4.8 and hi[0]<-4.4 and lo[1]>=-1.02 and hi[1]<=1.02 and lo[2]>=.24 and hi[2]<=2.45:
    side=1 if (lo[1]+hi[1])>0 else -1;sides[side].update(ids);remove.update(ids)
  if not remove:continue
  for side,ids in sides.items():
   if not ids:continue
   copy=me.copy();bm=bmesh.new();bm.from_mesh(copy);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in ids],context='VERTS');bm.to_mesh(copy);bm.free();copy.transform(o.matrix_local)
   ob=bpy.data.objects.new('IR door frame '+str(side),copy);s.collection.objects.link(ob);ob.parent=r;ob['iroriDoorSide']=side
  o.data=me.copy();bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in remove],context='VERTS');bm.to_mesh(o.data);bm.free()
 r['interior_v1']=True
for name in ['236248710_Deep interior shadow.040','PR thin window glass','V2 entrance interior floor']:
 ob=s.objects.get(name)
 if ob:ob.hide_render=True;ob.hide_set(True)
for ob in list(r.children):
 if ob.name.startswith(('IR interior','IR proxy','IR door glazing')):bpy.data.objects.remove(ob,do_unlink=True)
def plain(name,color,rough= .8):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
wood=bpy.data.materials['V3 cedar board 2'];dark=bpy.data.materials['Dark structural timber.072'];plaster=plain('IR warm lime plaster',(.49,.43,.32));cloth=plain('IR indigo seat cloth',(.035,.06,.07));tatami=plain('IR woven rush',(.31,.30,.16));paper=plain('IR lantern paper',(.72,.59,.36))
for mat,scale,dist in [(plaster,65,.002),(tatami,150,.0015),(cloth,180,.0007)]:
 n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF')
 if not n.get('IR microrelief'):
  noise=n.new('ShaderNodeTexNoise');noise.name='IR microrelief';noise.inputs['Scale'].default_value=scale;b=n.new('ShaderNodeBump');b.inputs['Distance'].default_value=dist;b.inputs['Strength'].default_value=.24;l.new(noise.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
def proxy(name,pos,size,walk=False):
 ob=bpy.data.objects.new('IR proxy '+name,None);s.collection.objects.link(ob);ob.parent=r;ob.location=pos;ob['collisionBox']=[size[0],size[2],size[1]];ob['walkSurface']=walk;return ob
def box(name,pos,size,mat,collision=False,walk=False,group='interior'):
 bpy.ops.mesh.primitive_cube_add(size=1);ob=bpy.context.object;ob.name='IR interior '+name;ob.parent=r;ob.location=pos;ob.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ob.data.materials.append(mat)
 # World-sized board UVs, used by the existing wood albedo and normal texture.
 uv=ob.data.uv_layers.active
 for p in ob.data.polygons:
  for li in p.loop_indices:
   v=ob.data.vertices[ob.data.loops[li].vertex_index].co
   uv.data[li].uv=(v.x/1.5,v.y/1.5) if abs(p.normal.z)>.5 else ((v.y/1.5,v.z/1.5) if abs(p.normal.x)>.5 else (v.x/1.5,v.z/1.5))
 be=ob.modifiers.new('Subtle edge','BEVEL');be.width=min(.009,min(size)*.15);be.segments=2;ob['runtimeGroup']=group
 if collision:proxy(name,pos,size,walk)
 return ob
# Floor and shell. Keep a full 2m entrance aperture on the west facade.
box('floor',(-.2,0,.21),(8.55,11.3,.18),wood,True,True)
box('ceiling',(-.2,0,3.18),(8.55,11.3,.12),wood,True)
for y in [-5.58,5.58]:box('side plaster',(-.1,y,1.72),(8.3,.12,2.85),plaster,True)
box('back plaster',(3.95,0,1.72),(.14,11.2,2.85),plaster,True)
for y in [-3.3,3.3]:proxy('front wall',(-4.45,y,1.6),(.25,4.5,3.2))
proxy('door header',(-4.48,0,2.8),(.3,2.1,.72))
for x in [-3.5,-1.0,1.5,3.6]:box('ceiling cross beam',(x,0,2.98),(.18,11.1,.23),dark)
for y in [-5.45,5.45]:
 for x in [-3.5,-1,1.5,3.6]:box('wall post',(x,y,1.67),(.15,.15,2.74),dark)
# Seats on either side leave the central passage open.
box('tatami platform',(.1,3.45,.36),(6.3,3.75,.12),dark,True,True)
for x in [-1.45,1.65]:
 for y in [2.52,4.38]:box('rush mat',(x,y,.438),(3.02,1.80,.035),tatami)
for x in [-1.45,1.65]:
 box('low table',(x,3.45,.79),(1.65,1.10,.09),wood,True)
 for dx in [-.66,.66]:
  for dy in [-.39,.39]:box('low table leg',(x+dx,3.45+dy,.60),(.09,.09,.33),dark)
 for y in [2.4,4.5]:box('seat cushion',(x,y,.51),(.68,.65,.10),cloth)
for x in [-1.4,1.55]:
 box('dining table',(x,-3.45,1.03),(1.65,1.05,.09),wood,True)
 for dx in [-.65,.65]:
  for dy in [-.38,.38]:box('table leg',(x+dx,-3.45+dy,.67),(.085,.085,.68),dark)
 for y in [-2.35,-4.55]:
  box('chair seat',(x,y,.76),(.55,.52,.07),wood,True)
  for dx in [-.20,.20]:
   for dy in [-.19,.19]:box('chair leg',(x+dx,y+dy,.52),(.055,.055,.42),dark)
  box('chair back',(x,y+(-.22 if y<-3 else .22),1.04),(.54,.045,.56),dark)
box('reception',(-3.35,-2.0,.78),(.85,1.15,.96),wood,True)
box('reception top',(-3.35,-2.0,1.29),(1.0,1.3,.07),dark)
# A threshold divided into manageable steps; outside transition handled at runtime.
box('threshold',(-4.53,0,.26),(.24,2.02,.08),wood,True,True)
# Glass moves with each leaf, not with the building shell.
glass=plain('IR door clear glass',(.75,.82,.80),.16);bs=glass.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=.85;bs.inputs['IOR'].default_value=1.45
for side in [-1,1]:
 ob=box('door glass',(-4.56,side*.5,1.39),(.012,.93,2.02),glass);ob.name='IR door glazing '+str(side);ob['iroriDoorSide']=side;ob['iroriDoorGlass']=True
for x in [-1.8,1.8]:
 for y in [-2.7,2.7]:
  box('pendant paper',(x,y,2.58),(.46,.46,.32),paper)
  box('pendant cap',(x,y,2.77),(.52,.52,.045),dark)
  box('pendant cord',(x,y,2.95),(.022,.022,.35),dark)
  ob=bpy.data.objects.new('IR interior light',None);s.collection.objects.link(ob);ob.parent=r;ob.location=(x,y,2.36);ob['iroriLight']=True
# Separate inspection camera; retain the accepted exterior camera.
cam=bpy.data.objects.get('IR interior review')
if not cam:cam=bpy.data.objects.new('IR interior review',bpy.data.cameras.new('IR interior review'));s.collection.objects.link(cam)
cam.location=r.matrix_world@Vector((-3.8,0,1.8));target=r.matrix_world@Vector((1.0,0,1.4));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=20
# Blender preview illumination, exported runtime lights use metadata anchors.
for ob in list(s.objects):
 if ob.name.startswith('IR preview area'):bpy.data.objects.remove(ob,do_unlink=True)
for x in [-1.8,1.8]:
 light=bpy.data.lights.new('IR preview area','AREA');light.energy=180;light.color=(1,.79,.56);light.shape='DISK';light.size=3
 ob=bpy.data.objects.new('IR preview area',light);s.collection.objects.link(ob);ob.location=r.matrix_world@Vector((x,0,2.9));ob.rotation_euler=r.rotation_euler
bpy.data.libraries.write(R+'/assets/authored/ogimachi/irori-interior-v1.blend',{s},fake_user=True,compress=True)
old=s.camera;s.camera=cam;s.render.resolution_x=1400;s.render.resolution_y=950;s.render.filepath=R+'/artifacts/ogimachi-phases/irori-interior-v1.png';s.cycles.samples=40
# Door leaves stay closed for source; view is already inside.
def render():
 try:bpy.ops.render.render(write_still=True)
 finally:s.camera=old
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Interior shell furniture colliders and movable source leaves ready')
