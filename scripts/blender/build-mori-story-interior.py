import bpy,math,json
from pathlib import Path
from mathutils import Vector
R=Path('/Users/jay/Claude/3D_motion');orig=bpy.context.scene
assert not bpy.app.is_job_running('RENDER')
name='B003_Mori_Story_Interior'
assert bpy.data.scenes.get(name) is None, 'Already built; refine existing scene instead'
s=bpy.data.scenes.new(name);s.world=orig.world.copy() if orig.world else bpy.data.worlds.new(name)
bpy.data.libraries.write(str(R/'assets/authored/ogimachi/pre-mori-story-interior.blend'),{bpy.data.scenes['B003_Mori_Facade_V3']},fake_user=True,compress=True)
root=bpy.data.objects.new('mori-story-interior',None);s.collection.objects.link(root);root['fictionalInterior']=True
source=bpy.data.scenes['B003_Mori_Facade_V3']
wood=next(m for o in source.objects if o.type=='MESH' for m in o.data.materials if m and 'weathered grey brown' in m.name)
def mat(n,c,rough=.8):
 m=bpy.data.materials.new('Mori interior '+n);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;return m
plaster=mat('warm plaster',(.48,.43,.34));dark=mat('old lacquer',(.045,.036,.028));paper=mat('aged paper',(.65,.57,.39));indigo=mat('indigo cloth',(.055,.09,.13));brass=mat('aged brass',(.23,.17,.08),.35);screen=mat('CRT glass',(.025,.07,.08),.22)
groups={}
def box(n,p,d,m,collision=False):
 x,y,z=p;a,b,c=[v/2 for v in d];vs,fs=groups.setdefault(m,([],[]));i=len(vs)
 vs.extend([(x+dx*a,y+dy*b,z+dz*c) for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]])
 fs.extend(tuple(i+j for j in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
 if collision:
  o=bpy.data.objects.new(n,None);s.collection.objects.link(o);o.parent=root;o.location=p;o['collisionBox']=[d[0],d[2],d[1]]
# Clear central route, level continuous floor; doorway uses a short fade to an isolated interior.
box('floor',(0,0,-.1),(8.8,10.4,.2),wood,True)
for x in [-4.4,4.4]:box('side wall',(x,0,1.65),(.16,10.4,3.3),plaster,True)
for y in [-5.2,5.2]:box('end wall',(0,y,1.65),(8.8,.16,3.3),plaster,True)
box('ceiling',(0,0,3.32),(8.8,10.4,.16),plaster,True)
for x in [-4.25,-2.1,0,2.1,4.25]:box('beam',(x,0,3.10),(.16,10.2,.22),dark)
for y in [-5,-2.5,0,2.5,5]:
 box('ceiling joist',(0,y,3.13),(8.6,.13,.18),wood)
 for x in [-4.25,4.25]:box('post',(x,y,1.55),(.17,.17,3.1),dark)
for x in [-4.26,4.26]:
 box('skirting',(x,0,.16),(.08,10.2,.24),dark)
 for y in [-3.6,-1.2,1.2,3.6]:
  box('wall display backing',(x*.985,y,1.8),(.06,1.75,1.4),wood)
  box('display paper',(x*.978,y,1.8),(.025,1.5,1.13),paper)
# Foreground reception bench and shoe rack.
box('bench',(-2.5,-3.9,.5),(2.2,.65,.15),wood,True)
for x in [-3.35,-1.65]:box('bench leg',(x,-3.9,.23),(.12,.5,.46),dark)
for z in [.15,.5,.85]:box('shoe shelf',(3.4,-4.1,z),(1.25,.65,.07),wood)
for x in [2.75,4.05]:box('shoe upright',(x,-4.1,.48),(.08,.65,.95),dark)
# Two low exhibit islands; baskets, tools and folded cloth.
for x in [-2.65,2.65]:
 box('display plinth',(x,-.8,.46),(1.65,2.25,.92),wood,True)
 box('display top',(x,-.8,.95),(1.78,2.38,.07),dark)
 for k in range(4):
  y=-1.5+k*.45
  box('folded cloth',(x,y,1.015+k*.005),(.62,.34,.06),indigo)
  for j in range(6):box('cloth seam',(x-.25+j*.1,y,1.048+k*.005),(.008,.32,.002),paper)
# Woven open baskets and small hand tools on left island.
for y in [-1.5,-.65,.15]:
 x=-3.18
 for z in [1.0+i*.045 for i in range(6)]:
  for dy in [-.17,.17]:box('basket weave',(x,y+dy,z),(.40,.012,.016),paper)
  for dx in [-.2,.2]:box('basket weave',(x+dx,y,z),(.012,.34,.016),paper)
 for dx in [-.18,-.09,0,.09,.18]:
  for dy in [-.17,.17]:box('basket rib',(x+dx,y+dy,1.13),(.012,.016,.30),brass)
# Open screen partition to office: passage x -0.8..0.8.
for x in [-2.7,2.7]:
 box('partition base',(x,2.2,.45),(3.75,.13,.9),wood,True)
 for j in range(19):box('partition lattice',(x-1.8+j*.20,2.2,1.75),(.026,.065,1.7),dark)
 box('partition cap',(x,2.2,2.62),(3.8,.15,.1),dark)
# Manager's counter, CRT and filing.
box('office desk',(2.65,3.9,.77),(2.6,1.15,.12),wood,True)
for x in [1.5,3.8]:box('desk cabinet',(x,3.9,.37),(.28,1.05,.74),dark,True)
box('CRT case',(2.8,3.92,1.21),(1.02,.68,.76),dark)
box('CRT bevel',(2.8,3.55,1.25),(.86,.10,.60),brass)
box('CRT screen',(2.8,3.49,1.25),(.74,.025,.50),screen)
for x in [3.22,3.28]:box('CRT knob',(x,3.47,1.03),(.038,.035,.06),paper)
for i in range(10):box('speaker grille',(3.26,3.46,1.28+i*.02),(.1,.012,.005),dark)
box('chair seat',(3.8,2.85,.46),(.55,.54,.08),wood,True)
box('chair back',(3.8,2.61,.86),(.55,.07,.75),wood)
for x in [3.57,4.03]:
 for y in [2.65,3.05]:box('chair leg',(x,y,.23),(.05,.05,.46),dark)
for i in range(8):box('stacked leaflets',(1.72,3.65,.85+i*.009),(.36,.5,.008),paper)
for z in [.2,.8,1.4,2.0]:box('archive shelf',(-2.5,4.7,z),(2.7,.65,.08),wood)
for x in [-3.9,-1.1]:box('archive side',(x,4.7,1.12),(.10,.65,2.3),dark)
for j in range(12):
 x=-3.7+j*.21
 for z in [.53,1.13,1.73]:
  box('archive binder',(x,4.62,z),(.16,.42,.55),indigo if j%3 else paper)
  box('binder label',(x,4.40,z+.10),(.11,.01,.12),paper)
# Festival workbench with incomplete paper decorations, spool frames and string.
box('preparation table',(-2.5,3.05,.76),(2.3,1,.10),wood,True)
for x in [-3.5,-1.5]:box('table leg',(x,3.05,.37),(.10,.85,.74),dark)
for i in range(9):box('unfolded festival paper',(-3.3+i*.19,2.9,.827),(.16,.38,.015),paper)
for y in [2.8,3.3]:box('rope strand',(-2.5,y,.85),(1.55,.035,.035),brass)
# Entrance door readable from inside.
box('entry door',(0,-5.08,1.25),(1.8,.08,2.5),wood)
for x in [-.85,0,.85]:box('entry stile',(x,-5.02,1.25),(.07,.04,2.5),dark)
box('door pull',(.55,-4.97,1.1),(.035,.07,.22),brass)
for m,(vs,fs) in groups.items():
 me=bpy.data.meshes.new(m.name);me.from_pydata(vs,[],fs);me.update();me.materials.append(m);uv=me.uv_layers.new()
 for p in me.polygons:
  axis=max(range(3),key=lambda i:abs(p.normal[i]))
  for li in p.loop_indices:
   v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=((v.y if axis==0 else v.x)/1.5,(v.y if axis==2 else v.z)/1.5)
 o=bpy.data.objects.new(m.name,me);s.collection.objects.link(o);o.parent=root;b=o.modifiers.new('Worn edge highlight','BEVEL');b.width=.005;b.segments=2
# Interior light fixtures and render lighting.
for y in [-3,0,3.4]:
 ld=bpy.data.lights.new('Mori warm practical','AREA');ld.energy=140;ld.color=(1,.84,.65);ld.shape='DISK';ld.size=2
 o=bpy.data.objects.new(ld.name,ld);s.collection.objects.link(o);o.location=(0,y,2.95)
camd=bpy.data.cameras.new('Mori interior review');cam=bpy.data.objects.new(camd.name,camd);s.collection.objects.link(cam);cam.location=(.1,-4.7,1.9);cam.rotation_euler=(Vector((0,2.5,1.35))-cam.location).to_track_quat('-Z','Y').to_euler();camd.lens=20;s.camera=cam
s.render.engine='CYCLES';s.cycles.samples=24;s.render.resolution_x=1200;s.render.resolution_y=850;s.render.resolution_percentage=100
out=R/'artifacts/ogimachi-phases/mori-interior';out.mkdir(parents=True,exist_ok=True)
bpy.context.window.scene=s
bpy.data.libraries.write(str(R/'assets/authored/ogimachi/B003-mori-story-interior.blend'),{s},fake_user=True,compress=True)
for o in s.objects:o.select_set(o==root or o.parent==root)
bpy.ops.export_scene.gltf(filepath=str(out/'mori-story-interior.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True)
bpy.context.window.scene=orig
def render():
 try:
  bpy.context.window.scene=s;s.render.filepath=str(out/'interior.png');bpy.ops.render.render(write_still=True)
 finally:bpy.context.window.scene=orig
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Mori interior exported; render scheduled')
