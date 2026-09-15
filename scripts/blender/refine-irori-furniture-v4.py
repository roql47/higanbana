import bpy,math
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
assert not bpy.app.is_job_running('RENDER')
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-irori-furniture-v4.blend',{s},fake_user=True,compress=True)
for o in list(r.children):
 if o.name.startswith('IR4 '):bpy.data.objects.remove(o,do_unlink=True)
base=open(R+'/scripts/blender/build-irori-interior-v1.py').read();exec(base[base.index('def plain('):base.index('# Floor and shell.')]);oldbox=box
def box(name,pos,size,mat,group='interior'):
 o=oldbox(name,pos,size,mat);o.name='IR4 '+name;o['runtimeGroup']=group;return o
wood=bpy.data.materials['V3 cedar board 2'];dark=bpy.data.materials['Dark structural timber.072'];border=bpy.data.materials['IR2 tatami cloth border']
# UV-sized woven rush: crossing cords and reed variation, baked independently.
rush=plain('IR4 woven igusa',(.30,.29,.14),.91);n=rush.node_tree.nodes;l=rush.node_tree.links;p=n.get('Principled BSDF')
for node in list(n):
 if node.type not in ['BSDF_PRINCIPLED','OUTPUT_MATERIAL']:n.remove(node)
uv=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=65;l.new(uv.outputs['UV'],noise.inputs[0])
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.23,.245,.105,1);ramp.color_ramp.elements[1].color=(.47,.44,.23,1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
wx=n.new('ShaderNodeTexWave');wx.bands_direction='X';wx.inputs['Scale'].default_value=135;wy=n.new('ShaderNodeTexWave');wy.bands_direction='Y';wy.inputs['Scale'].default_value=45
for w in [wx,wy]:l.new(uv.outputs['UV'],w.inputs[0])
mix=n.new('ShaderNodeMath');mix.operation='MULTIPLY';l.new(wx.outputs[0],mix.inputs[0]);l.new(wy.outputs[0],mix.inputs[1]);bump=n.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.001;bump.inputs['Strength'].default_value=.4;l.new(mix.outputs[0],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
# Four padded reed panels: rounded bound edge and visible thickness.
for o in list(r.children):
 if o.name.startswith('IR interior rush mat'):
  o.hide_render=True;o.hide_set(True);x,y=o.location.x,o.location.y
  mat=box('woven tatami',(x,y,.438),(3.02,1.80,.034),rush,'tatami');mat.modifiers[0].width=.012;mat.modifiers[0].segments=3
  for dy in [-.875,.875]:
   box('cloth bound edge',(x,y+dy,.444),(3.02,.052,.032),border,'tatami')
   # Stitch runs use short thread segments at a restrained visible scale.
   for k in range(75):box('binding stitch',(x-1.48+k*.04,y+dy,.461),(.010,.002,.0015),rush,'tatami')
 if o.name.startswith('IR2 tatami bound hem'):o.hide_render=True;o.hide_set(True)
# Joinery and rounded plank tops, preserving established table height and collider.
for o in list(r.children):
 if o.name.startswith('IR interior dining table') or (o.name.startswith('IR interior low table') and 'leg' not in o.name):
  o.hide_render=True;o.hide_set(True);x,y,z=o.location;is_low='low' in o.name;depth=1.10 if is_low else 1.05
  for j in range(3):
   top=box('table joined plank',(x,y-depth/2+depth/6+j*depth/3,z),(1.65,depth/3-.0015,.09),wood);top.modifiers[0].width=.012;top.modifiers[0].segments=3
  for dy in [-depth/2+.10,depth/2-.10]:box('table apron',(x,y+dy,z-.13),(1.41,.055,.19),dark)
  for dx in [-.70,.70]:box('table end apron',(x+dx,y,z-.13),(.055,depth-.16,.19),wood)
  for dx in [-.66,.66]:
   for dy in [-depth/2+.14,depth/2-.14]:box('joinery peg',(x+dx,y+dy,z+.0455),(.016,.016,.002),dark)
# Curved solid chair seats: rounded plan and gently scooped sitting surface.
for o in list(r.children):
 if not o.name.startswith('IR interior chair seat'):continue
 o.hide_render=True;o.hide_set(True);x,y,z=o.location;N=16;vs=[];fs=[]
 for top in [True,False]:
  for j in range(N+1):
   for i in range(N+1):
    u=2*i/N-1;v=2*j/N-1;vs.append((.275*u*(1-.065*abs(v)**8),.26*v*(1-.065*abs(u)**8),(.035-.012*(1-u*u)*(1-v*v)) if top else -.035))
 off=(N+1)**2
 for j in range(N):
  for i in range(N):
   a=j*(N+1)+i;fs.extend([(a,a+1,a+N+2,a+N+1),(off+a+N+1,off+a+N+2,off+a+1,off+a)])
 ring=list(range(N+1))+[j*(N+1)+N for j in range(1,N+1)]+[N*(N+1)+i for i in range(N-1,-1,-1)]+[j*(N+1) for j in range(N-1,0,-1)]
 for a,b in zip(ring,ring[1:]+ring[:1]):fs.append((b,a,a+off,b+off))
 me=bpy.data.meshes.new('IR4 scooped seat');me.from_pydata(vs,[],fs);me.materials.append(wood);ob=bpy.data.objects.new('IR4 scooped seat',me);s.collection.objects.link(ob);ob.parent=r;ob.location=(x,y,z);ob['runtimeGroup']='interior';tex=me.uv_layers.new(name='UVMap')
 for p in me.polygons:
  p.use_smooth=True
  for li in p.loop_indices:
   v=me.vertices[me.loops[li].vertex_index].co;tex.data[li].uv=(v.x/1.5,v.y/1.5)
 for dx in [-.20,.20]:box('chair side stretcher',(x+dx,y,.48),(.04,.43,.05),dark)
 box('chair cross stretcher',(x,y,.50),(.43,.04,.05),wood)
# Replace opaque cubes with four thin folded washi panels and an open lower diffuser.
paper=plain('IR4 fibrous washi',(.76,.65,.44),.92);pn=paper.node_tree.nodes;pl=paper.node_tree.links;pb=pn.get('Principled BSDF');noise=pn.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=95;bump=pn.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.0007;bump.inputs['Strength'].default_value=.2;pl.new(noise.outputs[0],bump.inputs['Height']);pl.new(bump.outputs[0],pb.inputs['Normal'])
for o in list(r.children):
 if not o.name.startswith('IR interior pendant paper'):continue
 o.hide_render=True;o.hide_set(True);x,y,z=o.location
 for side in range(4):
  vs=[];fs=[];N=12
  for j in range(5):
   for i in range(N+1):
    u=i/N;h=j/4;v=Vector((-.22+.44*u,-.223-.003*math.sin(u*math.pi*8)*math.sin(h*math.pi),-.155+.31*h));a=side*math.pi/2;vs.append((x+v.x*math.cos(a)-v.y*math.sin(a),y+v.x*math.sin(a)+v.y*math.cos(a),z+v.z))
  for j in range(4):
   for i in range(N):a=j*(N+1)+i;fs.append((a,a+1,a+N+2,a+N+1))
  me=bpy.data.meshes.new('IR4 folded washi');me.from_pydata(vs,[],fs);me.materials.append(paper);ob=bpy.data.objects.new('IR4 folded washi',me);s.collection.objects.link(ob);ob.parent=r;ob['runtimeGroup']='interior';mod=ob.modifiers.new('Paper thickness','SOLIDIFY');mod.thickness=.0018
 for dz in [-.10,0,.10]:
  for dy in [-.229,.229]:box('lantern horizontal rib',(x,y+dy,z+dz),(.45,.013,.014),wood)
  for dx in [-.229,.229]:box('lantern horizontal rib',(x+dx,y,z+dz),(.013,.45,.014),wood)
 box('lantern diffuser',(x,y,z-.155),(.418,.418,.002),paper)
 box('lamp internal socket',(x,y,z+.08),(.065,.065,.15),dark)
r['interior_revision']='v4-furniture';bpy.context.view_layer.update()
bpy.data.libraries.write(R+'/assets/authored/ogimachi/irori-interior-v4.blend',{s},fake_user=True,compress=True)
old=s.camera;settings=(s.render.resolution_x,s.render.resolution_y,s.render.filepath,s.cycles.samples)
s.camera=bpy.data.objects['IR interior review'];s.render.resolution_x=1400;s.render.resolution_y=950;s.render.filepath=R+'/artifacts/ogimachi-phases/irori-interior-v4.png';s.cycles.samples=40
# Save the accepted room view for comparison, then restore original render settings.
def render():
 try:bpy.ops.render.render(write_still=True)
 finally:s.camera=old;s.render.resolution_x,s.render.resolution_y,s.render.filepath,s.cycles.samples=settings
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Tatami weave/binding, joined tabletops, scooped chairs, folded washi lamps authored and saved')
