"""Photo-led roof and facade rebuild. Camera/GIS root fixed, source meshes preserved."""
import bpy,bmesh,math,random
from mathutils import Vector
from mathutils import noise as mnoise
s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710);rng=random.Random(37261)
for ob in list(s.objects):
 if ob.get('irori_roof_wall_v3'):bpy.data.objects.remove(ob,do_unlink=True)
def own(o):o['irori_roof_wall_v3']=True;return o
def mat(name):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();p=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs[0],out.inputs[0]);return m,p,n,m.node_tree.links
def mesh(name,vs,fs,m,uvaxis=None):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.parent=r;me.materials.append(m);own(o)
 if uvaxis is not None:
  uv=me.uv_layers.new(name='Physical grain');offset=rng.random()*7
  for p in me.polygons:
   normalaxis=max(range(3),key=lambda a:abs(p.normal[a]));cross=next((a for a in range(3) if a!=normalaxis and a!=uvaxis),(uvaxis+1)%3)
   for li in p.loop_indices:
    v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v[cross]+offset,v[uvaxis])
 return o
def box(name,dim,pos,m,axis=2,bevel=.004):
 dx,dy,dz=[v/2 for v in dim];x,y,z=pos
 vs=[(x+i*dx,y+j*dy,z+k*dz) for i,j,k in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
 o=mesh(name,vs,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],m,axis)
 if bevel:b=o.modifiers.new('Soft worn arris','BEVEL');b.width=bevel;b.segments=3
 return o
def groups(o):
 par=list(range(len(o.data.vertices)))
 def f(a):
  while par[a]!=a:par[a]=par[par[a]];a=par[a]
  return a
 for e in o.data.edges:a,b=map(f,e.vertices);par[b]=a
 d={}
 for v in o.data.vertices:d.setdefault(f(v.index),[]).append(v.index)
 for ids in d.values():
  vs=[o.matrix_local@o.data.vertices[i].co for i in ids];yield ids,[min(v[a] for v in vs) for a in range(3)],[max(v[a] for v in vs) for a in range(3)]
def strip(o,pred):
 if o.get('roof_wall_v3_source'):return
 ids=set()
 for indices,lo,hi in groups(o):
  if pred(lo,hi):ids.update(indices)
 if not ids:return
 o['roof_wall_v3_source']=o.data.name;o.data=o.data.copy();bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in ids],context='VERTS');bm.to_mesh(o.data);bm.free()
# Structural wood has physical continuous fibers, not a plank-wall photograph on each member.
def timber(name,dark,light):
 m,p,n,l=mat(name);p.inputs['Roughness'].default_value=.76;tc=n.new('ShaderNodeTexCoord');scale=n.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(95,1.8,1);l.new(tc.outputs['UV'],scale.inputs[0]);grain=n.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=2.3;grain.inputs['Detail'].default_value=4;grain.inputs['Roughness'].default_value=.72;l.new(scale.outputs[0],grain.inputs[0]);ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].position=.22;ra.color_ramp.elements[0].color=(*dark,1);ra.color_ramp.elements[1].position=.78;ra.color_ramp.elements[1].color=(*light,1);l.new(grain.outputs['Fac'],ra.inputs[0]);l.new(ra.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.25;b.inputs['Distance'].default_value=.0018;l.new(grain.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal']);return m
cedars=[timber('V3 cedar board '+str(i),(.09+i*.006,.035+i*.003,.014),(.25+i*.016,.10+i*.006,.034+i*.003)) for i in range(5)]
beam=timber('V3 smoke darkened structural oak',(.029,.019,.012),(.105,.062,.030));sash=timber('V3 handled warm sash timber',(.08,.041,.022),(.29,.18,.093))
# Remove old solid wall volumes, flat upper strips and old side window surrounds only.
wo=next(o for o in r.children if 'Smoke-aged cedar' in o.name)
strip(wo,lambda lo,hi:(lo[0]<-4.2 and hi[0]>4 and hi[2]<4) or (lo[0]<-4.30 and hi[0]<-4.25 and lo[1]<-5 and hi[1]>5 and lo[2]>2.7) or (hi[0]<-4.3 and lo[0]>-4.51 and hi[2]<2.5 and (hi[1]<-1.8 or lo[1]>1.8)))
fr=next(o for o in r.children if 'Dark structural timber' in o.name)
strip(fr,lambda lo,hi: (lo[0]<-4.2 and hi[0]<-4.10 and lo[2]<.10 and hi[2]>3.2 and hi[2]<4.1) or (lo[0]<-4.3 and hi[0]<-4.25 and lo[2]>.65 and hi[2]<2.5 and (hi[1]<-1.7 or lo[1]>1.7)))
# Old opaque sheets would obscure the new properly spaced glazing.
for o in r.children:
 if ('recessed glazing' in o.name or o.name in ['236248710_Deep interior shadow.041','236248710_Deep interior shadow.042','236248710_Deep interior shadow.043','236248710_Deep interior shadow.044'] or (o.name.startswith('PR thin window glass.') or o.name.startswith('PR interior timber reveal.'))):o.hide_render=True;o.hide_set(True)
# Retain enclosure on the three unseen sides; facade is built around genuine holes.
box('V3 rear wall',(.16,11.90,3.65),(4.27,0,2.05),cedars[1])
for yy in [-5.87,5.87]:box('V3 end wall',(8.54,.16,3.65),(0,yy,2.05),cedars[1])
# Wide upper boards between real posts, with restrained irregular edges.
postys=[-5.80,-3.78,-1.16,1.16,3.77,5.80]
for yy in postys:
 o=box('V3 full-height pegged jamb',(.22,.17,3.64),(-4.46,yy,2.05),beam,2,.009)
 # Mild, irregular hand-hewn edge; do not distort opening alignment.
 for v in o.data.vertices:
  v.co.x+=.003*math.sin(v.co.z*7+yy)
for y0,y1 in zip(postys,postys[1:]):
 for j,(za,zb) in enumerate([(2.75,3.07),(3.075,3.43),(3.435,3.88)]):
  box('V3 broad upper wall board',(.075,y1-y0-.12,zb-za),(-4.365,(y0+y1)/2,(za+zb)/2),cedars[(j+int(abs(y0)*2))%5],1,.0025)
box('V3 continuous eave plate',(.25,11.78,.20),(-4.42,0,3.82),beam,1,.012)
box('V3 pegged facade header',(.22,11.78,.15),(-4.43,0,2.70),beam,1,.008)
# Adjacent window bays now approach the door jamb instead of leaving a huge blank wall.
windows=[(-4.80,1.68),(-2.47,2.37),(2.465,2.37),(4.79,1.67)]
glass,p,n,l=mat('V3 old clear window panes');p.inputs['Base Color'].default_value=(.93,.98,.95,1);p.inputs['Transmission Weight'].default_value=1;p.inputs['IOR'].default_value=1.46;p.inputs['Roughness'].default_value=.065
interior,p,n,l=mat('V3 window interior shadow');p.inputs['Base Color'].default_value=(.066,.044,.026,1);p.inputs['Roughness'].default_value=.91
for cy,width in windows:
 lo,hi=cy-width/2,cy+width/2
 # Separate vertical boards below the windows, not stretched photographic plank seams.
 count=round(width/.19)
 for j in range(count):
  yy=lo+(j+.5)*width/count;box('V3 lower vertical weatherboards',(.075,width/count-.004,.55),(-4.36,yy,.47),cedars[j%5],2,.002)
 box('V3 deep window backing',(.055,width,1.9),(-3.65,cy,1.65),interior)
 for yy in [lo,hi]:box('V3 window recess cheek',(.66,.05,1.8),(-4.0,yy,1.64),sash)
 box('V3 projecting window sill',(.31,width+.11,.09),(-4.47,cy,.79),sash,1)
 box('V3 window head',(.18,width+.08,.10),(-4.45,cy,2.54),sash,1)
 # Paired sliding sash frames and continuous narrow exterior lattice.
 for leafcy in [cy-width/4,cy+width/4]:
  for yy in [leafcy-width/4,leafcy+width/4]:box('V3 window leaf stile',(.085,.047,1.68),(-4.47,yy,1.68),sash)
  for zz in [.86,1.72,2.49]:box('V3 window leaf rail',(.085,width/2,.033),(-4.47,leafcy,zz),sash,1)
  box('V3 reflective glass',(.005,width/2-.05,1.57),(-4.40,leafcy,1.68),glass,bevel=0)
 for j in range(round(width/.115)+1):
  yy=lo+j*width/round(width/.115);box('V3 fine exterior grille',(.055,.019,1.61),(-4.54,yy,1.66),sash,2,.0018)
# Narrow infill at the door boundary and end edges.
for lo,hi in [(-5.91,-5.64),(-3.96,-3.78),(-1.285,-1.065),(1.065,1.285),(3.65,3.955),(5.625,5.91)]:
 box('V3 narrow wall infill',(.075,hi-lo,2.45),(-4.365,(lo+hi)/2,1.43),cedars[2],2)
# Door timbers get their own grain direction, removing black photographed board seams.
if not wo.get('v3_door_uv'):
 if not wo.data.uv_layers.active:wo.data.uv_layers.new()
 uv=wo.data.uv_layers.active
 matslot=len(wo.data.materials);wo.data.materials.append(sash)
 for ids,lo,hi in groups(wo):
  if lo[0]<-4.5 and hi[0]<-4.48 and lo[1]>-1.04 and hi[1]<1.04 and hi[2]<2.5:
   idset=set(ids);axis=max(range(3),key=lambda a:hi[a]-lo[a]);off=rng.random()*4
   for p in wo.data.polygons:
    if p.vertices[0] not in idset:continue
    p.material_index=matslot
    for li in p.loop_indices:
     v=wo.matrix_local@wo.data.vertices[wo.data.loops[li].vertex_index].co;uv.data[li].uv=(v[2 if axis==1 else 1]+off,v[axis])
 wo['v3_door_uv']=True
# Joinery details: discrete pegs and longitudinal drying splits on structural posts.
pegmat=beam
for yy in postys:
 for zz in [.53,2.68,3.79]:
  N=10;vs=[(-4.576,yy+.023*math.cos(j*math.tau/N),zz+.023*math.sin(j*math.tau/N)) for j in range(N)];mesh('V3 end grain timber peg',vs,[tuple(range(N-1,-1,-1))],pegmat,2)
 for k in range(2):
  z0=.4+rng.random()*2.4;length=rng.uniform(.16,.40);y=yy+rng.uniform(-.045,.045)
  mesh('V3 localized timber split',[(-4.578,y,z0),(-4.578,y+.002,z0+length*.6),(-4.578,y-.003,z0+length),(-4.578,y-.001,z0+length*.45)],[(0,1,2,3)],interior)
# Replace only the front roof slab component; rear slope and ridge are preserved.
roof=next(o for o in r.children if 'Bound kaya reeds' in o.name)
strip(roof,lambda lo,hi:hi[0]<.001 and lo[0]<-5)
for o in r.children:
 if o.name=='PR fine irregular thatch edge':o.hide_render=True;o.hide_set(True)
# Independent directional surfaces: weathered sloped fibers vs tightly packed cut ends.
thatch,p,n,l=mat('V3 sloping weathered kaya');p.inputs['Roughness'].default_value=.98;tc=n.new('ShaderNodeTexCoord');scale=n.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(100,3,1);l.new(tc.outputs['UV'],scale.inputs[0]);te=n.new('ShaderNodeTexNoise');te.inputs['Scale'].default_value=2;te.inputs['Detail'].default_value=3;l.new(scale.outputs[0],te.inputs[0]);ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=(.13,.089,.046,1);ra.color_ramp.elements[1].color=(.46,.35,.21,1);l.new(te.outputs['Fac'],ra.inputs[0]);l.new(ra.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.50;b.inputs['Distance'].default_value=.008;l.new(te.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
cut,p,n,l=mat('V3 compressed kaya cut ends');p.inputs['Roughness'].default_value=1;tc=n.new('ShaderNodeTexCoord');vor=n.new('ShaderNodeTexVoronoi');vor.inputs['Scale'].default_value=210;l.new(tc.outputs['UV'],vor.inputs[0]);ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].position=.15;ra.color_ramp.elements[0].color=(.085,.044,.017,1);ra.color_ramp.elements[1].position=.65;ra.color_ramp.elements[1].color=(.38,.235,.105,1);l.new(vor.outputs['Distance'],ra.inputs[0]);l.new(ra.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.48;b.inputs['Distance'].default_value=.006;l.new(vor.outputs['Distance'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
# Closed cross-section: curved slope, rolled full eave, underside. No paper-thin front face.
profile=[]
for i in range(61):
 t=i/60;profile.append((-5.19*t,10.53-6.07*t+.12*math.sin(math.pi*t),0))
profile += [(-5.25,4.40,1),(-5.30,4.29,1),(-5.32,4.12,1),(-5.29,3.99,1),(-5.23,3.90,1),(-5.10,3.85,1)]
for i in range(59,-1,-1):
 t=i/60;profile.append((-5.19*t,10.53-6.07*t+.12*math.sin(math.pi*t)-.61,1))
NY=180;NP=len(profile);vs=[]
def sag(y):return .025*math.sin(y*1.37)+.012*math.sin(y*3.8+.4)
for j in range(NY+1):
 y=-6.757+13.514*j/NY
 for k,(x,z,slot) in enumerate(profile):
  t=abs(x)/5.32;irregular=.007*mnoise.noise(Vector((y*8,k*.33,1)));vs.append((x+irregular*t**6,y,z+sag(y)*t**5+irregular*t**4))
fs=[];slots=[]
for j in range(NY):
 for k in range(NP):
  fs.append((j*NP+k,j*NP+(k+1)%NP,(j+1)*NP+(k+1)%NP,(j+1)*NP+k));slots.append(0 if k<60 else 1)
fs.extend([tuple(range(NP-1,-1,-1)),tuple(NY*NP+k for k in range(NP))]);slots.extend([1,1]);o=mesh('V3 thick curved front thatch pack',vs,fs,thatch);o.data.materials.append(cut);uv=o.data.uv_layers.new(name='Slope and cut end scale')
for p,slot in zip(o.data.polygons,slots):
 p.material_index=slot;p.use_smooth=True
 for li in p.loop_indices:
  v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v.y,abs(v.x)*1.54 if slot==0 else v.z)
# Sparse actual reed stems on slope and cut tips provide directional silhouettes close up.
reedmats=[]
for i,col in enumerate([(.24,.145,.065),(.35,.24,.12),(.46,.34,.19)]):
 m,p,n,l=mat('V3 reed fiber '+str(i));p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=.98;reedmats.append(m)
vs=[];fs=[];mi=[]
for i in range(8200):
 y=rng.uniform(-6.75,6.75);z=rng.uniform(3.93,4.38)+sag(y);x=-5.32+.15*((z-sag(y)-4.15)/.30)**2;rad=rng.uniform(.001,.0022);end=Vector((x-rng.uniform(.004,.021),y+rng.uniform(-.003,.003),z+rng.uniform(-.003,.003)));start=Vector((x+.009,y,z));base=len(vs)
 for point in [start,end]:
  for j in range(3):a=j*math.tau/3;vs.append(tuple(point+Vector((0,math.cos(a)*rad,math.sin(a)*rad))))
 fs.extend([(base+j,base+(j+1)%3,base+(j+1)%3+3,base+j+3) for j in range(3)]);mi.extend([i%3]*3)
o=mesh('V3 packed irregular cut reed tips',vs,fs,reedmats[0]);o.data.materials.append(reedmats[1]);o.data.materials.append(reedmats[2])
for p,slot in zip(o.data.polygons,mi):p.material_index=slot
# Near-eave surface strands are sloped rather than vertical fringe.
vs=[];fs=[]
for i in range(2100):
 y=rng.uniform(-6.75,6.75);t=rng.uniform(.69,.985);length=rng.uniform(.028,.10);base=len(vs);rad=rng.uniform(.001,.002)
 for tt in [t,min(1,t+length)]:
  x=-5.19*tt;z=10.53-6.07*tt+.12*math.sin(math.pi*tt)+sag(y)*tt**5+.008
  vs.extend([(x,y-rad,z),(x,y+rad,z)])
 fs.append((base,base+1,base+3,base+2))
mesh('V3 overlapping sloped reed fibers',vs,fs,reedmats[1])
s.render.resolution_percentage=50;s.cycles.samples=32;s.render.filepath='/Users/jay/Claude/3D_motion/artifacts/ogimachi-phases/roof-wall-v3-test.png'
print('Rebuilt front roof and facade; camera unchanged',s.camera.name,'owned objects',sum(bool(o.get('irori_roof_wall_v3')) for o in s.objects))
