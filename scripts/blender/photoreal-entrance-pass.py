"""In-place architectural finish pass. Own additions are updated on rerun."""
import bpy,math,random,json
import numpy as np
from pathlib import Path
from mathutils import Vector
R=Path('/Users/jay/Claude/3D_motion');s=bpy.context.scene
root=next(o for o in s.objects if o.get('osm_id')==236248710)
for ob in list(s.objects):
 if ob.get('photoreal_owned'):bpy.data.objects.remove(ob,do_unlink=True)
def mat(name,color,rough):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
def box(name,dim,pos,m,parent=root):
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.parent=parent;o.location=pos;o['photoreal_owned']=True;o.data.materials.append(m);return o
def mesh(name,vs,fs,m):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.parent=root;o['photoreal_owned']=True;me.materials.append(m);return o
# Fine granite image with no masonry joints; same physical material on carved stone.
rng=np.random.default_rng(82);N=512
noise=rng.random((N,N));coarse=rng.random((64,64)).repeat(8,0).repeat(8,1)
value=np.clip(.42+.10*(noise-.5)+.045*(coarse-.5),0,1)
px=np.ones((N,N,4),np.float32);px[:,:,:3]=value[:,:,None]*np.array([1.0,.97,.88]);flecks=rng.random((N,N))<.04;px[flecks,:3]*=.5
im=bpy.data.images.get('Photoreal fine granite albedo') or bpy.data.images.new('Photoreal fine granite albedo',N,N);im.pixels.foreach_set(px.ravel());im.pack()
granite=mat('Photoreal carved fine granite',(.4,.39,.35),.88);nodes=granite.node_tree.nodes;links=granite.node_tree.links;p=nodes.get('Principled BSDF')
tex=nodes.get('Granite albedo') or nodes.new('ShaderNodeTexImage');tex.name='Granite albedo';tex.image=im;links.new(tex.outputs['Color'],p.inputs['Base Color'])
noiseNode=nodes.get('Stone pores') or nodes.new('ShaderNodeTexNoise');noiseNode.name='Stone pores';noiseNode.inputs['Scale'].default_value=155
bump=nodes.get('Stone micro relief') or nodes.new('ShaderNodeBump');bump.name='Stone micro relief';bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.008;links.new(noiseNode.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],p.inputs['Normal'])
# Keep source object links. Per-component UV aligns grain along each timber member.
for o in list(root.children):
 if o.type!='MESH' or o.get('photoreal_owned'):continue
 if not o.get('photoreal_original_data'):o['photoreal_original_data']=o.data.name;o.data=o.data.copy()
 for idx,m in enumerate(o.data.materials):
  if not m:continue
  if 'Foundation granite' in m.name:o.data.materials[idx]=granite
  if 'Reference warm cedar' in m.name or 'Dark structural timber' in m.name:
   name='Photoreal '+m.name.split('.')[0]
   nm=bpy.data.materials.get(name)
   if not nm:nm=m.copy();nm.name=name
   o.data.materials[idx]=nm;p=nm.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.58
   # Existing normal texture remains correctly marked Non-Color.
   for no in nm.node_tree.nodes:
    if no.type=='NORMAL_MAP':no.inputs['Strength'].default_value=.28
 if 'Smoke-aged cedar' in o.name and not o.get('photoreal_uv_corrected'):
  par=list(range(len(o.data.vertices)))
  def find(a):
   while par[a]!=a:par[a]=par[par[a]];a=par[a]
   return a
  for e in o.data.edges:
   a,b=map(find,e.vertices);par[b]=a
  groups={}
  for v in o.data.vertices:groups.setdefault(find(v.index),[]).append(v.index)
  info={}
  rr=random.Random(17)
  for k,ids in groups.items():
   xyz=np.array([o.data.vertices[i].co[:] for i in ids]);span=xyz.max(0)-xyz.min(0);axis=int(np.argmax(span));info[k]=(axis,rr.random()*3,rr.random()*3)
  uv=o.data.uv_layers.active
  for poly in o.data.polygons:
   axis,du,dv=info[find(poly.vertices[0])]
   normalaxis=max(range(3),key=lambda a:abs(poly.normal[a]));cross=next((a for a in range(3) if a!=axis and a!=normalaxis),(axis+1)%3)
   for li in poly.loop_indices:
    v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[cross]/1.0+du,v[axis]/2.5+dv)
  o['photoreal_uv_corrected']=True
# Glass has real thickness, transmission and surrounding geometry to reflect.
glass=mat('Photoreal clear old window glass',(.94,.98,.96),.12);p=glass.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=1;p.inputs['IOR'].default_value=1.46
interior=mat('Photoreal interior warm shadow',(.10,.073,.041),.9)
# Existing recess backing remains at depth. Thin panes sit behind the lattice, clear of it.
for cy,width in [(0,1.94),(-4.6,1.5),(-2.8,1.5),(2.7,1.5),(4.5,1.5)]:
 height=2.04 if cy==0 else 1.52;zc=1.36 if cy==0 else 1.60
 pane=box('PR thin window glass',(.005,width,height),(-4.49,cy,zc),glass)
 # A few interior uprights and sill catch indirect light through the glass.
 for yy in [cy-width*.35,cy+width*.35]:box('PR interior timber reveal',(.12,.08,height),(-4.02,yy,zc),interior)
# Narrow reed tips only along visible eave; avoid a solid serrated strip.
reed=mat('Photoreal cut reed ends',(.24,.17,.095),.98);vs=[];fs=[];rr=random.Random(371)
for i in range(1700):
 yy=rr.uniform(-5.9,5.9);xx=-5.193+rr.uniform(-.025,.025);zz=3.78+.045*math.sin(yy*1.8)+.02*math.sin(yy*7.1);length=rr.uniform(.024,.11);rad=rr.uniform(.0015,.003)
 start=Vector((xx,yy,zz));end=start+Vector((-.015,rr.uniform(-.009,.009),-length));k=len(vs)
 for pt in [start,end]:
  for j in range(3):a=math.tau*j/3;vs.append(tuple(pt+Vector((math.cos(a)*rad,math.sin(a)*rad,0))))
 fs.extend([(k+j,k+(j+1)%3,k+(j+1)%3+3,k+j+3) for j in range(3)])
mesh('PR fine irregular thatch edge',vs,fs,reed)
# Local daylight reflected by pale ground and sky, with broad shadows under the eave.
world=s.world.copy();world.name='Photoreal daylight';s.world=world;nt=world.node_tree;bg=nt.nodes.get('Background');bg.inputs[0].default_value=(.68,.77,.90,1);bg.inputs[1].default_value=.45
for ob in s.objects:
 if ob.type=='LIGHT' and ob.data.type=='SUN':ob.data=ob.data.copy();ob.data.energy=2.4;ob.data.angle=.10;ob.rotation_euler=(.50,-.65,-.55)
ld=bpy.data.lights.new('PR sky bounce','AREA');ld.energy=180;ld.shape='DISK';ld.size=6
ob=bpy.data.objects.new('PR sky bounce',ld);s.collection.objects.link(ob);ob['photoreal_owned']=True;ob.location=root.matrix_world@Vector((-8,3,5));target=root.matrix_world@Vector((-4.5,0,1.5));ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
s.view_settings.view_transform='AgX';s.view_settings.exposure=0
s.cycles.samples=48;s.cycles.use_denoising=True;s.render.resolution_percentage=70
s.render.filepath=str(R/'artifacts/ogimachi-phases/photoreal-after-test.png')
print('READY',len(root.children),'camera fixed',list(s.camera.location))
