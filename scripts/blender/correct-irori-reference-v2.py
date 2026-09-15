"""Photo-guided entrance correction; owns stable v2 additions, retains surveyed root."""
import bpy,bmesh,math,random,json
from pathlib import Path
from mathutils import Vector
s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710);rng=random.Random(612)
for o in list(s.objects):
 if o.get('entrance_correction_v2'):bpy.data.objects.remove(o,do_unlink=True)
def own(o):o['entrance_correction_v2']=True;return o
def mesh(name,vs,fs,mat):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.parent=r;me.materials.append(mat);return own(o)
def box(name,dim,pos,mat):
 dx,dy,dz=[a/2 for a in dim];x,y,z=pos
 o=mesh(name,[(x+i*dx,y+j*dy,z+k*dz) for i,j,k in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]],[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)],mat)
 b=o.modifiers.new('Worn eased edges','BEVEL');b.width=.006;b.segments=2;return o
def material(name,col,rough):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();p=n.new('ShaderNodeBsdfPrincipled');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs[0],out.inputs[0]);return m
# Remove only identified components, not entire merged building meshes.
def components(o):
 par=list(range(len(o.data.vertices)))
 def f(a):
  while par[a]!=a:par[a]=par[par[a]];a=par[a]
  return a
 for e in o.data.edges:a,b=map(f,e.vertices);par[b]=a
 gr={}
 for v in o.data.vertices:gr.setdefault(f(v.index),[]).append(v.index)
 for ids in gr.values():
  ps=[o.matrix_local@o.data.vertices[i].co for i in ids];yield ids,[min(v[a] for v in ps) for a in range(3)],[max(v[a] for v in ps) for a in range(3)]
def remove(o,pred):
 if o.get('correction_v2_source'):return
 ids=set()
 for ii,lo,hi in components(o):
  if pred(lo,hi):ids.update(ii)
 if not ids:return
 o['correction_v2_source']=o.data.name;o.data=o.data.copy();bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in ids],context='VERTS');bm.to_mesh(o.data);bm.free()
woodob=next(o for o in r.children if 'Smoke-aged cedar' in o.name)
remove(woodob,lambda l,h:l[0]<-4.5 and l[1]>-.8 and h[1]<.8 and l[2]>2.7 and h[2]<3.8)
creamob=next(o for o in r.children if 'cream paper' in o.name)
remove(creamob,lambda l,h:l[0]<-4.6 and l[1]>-.8 and h[1]<.8 and l[2]>2.7)
stoneob=next(o for o in r.children if 'Foundation granite' in o.name)
remove(stoneob,lambda l,h:l[1]>-2.5 and h[1]<-1.3 and h[2]<1.8)
# Warm cedar now has local fiber scale plus broad timber-to-timber tonal variation.
for m in [bpy.data.materials.get('Photoreal Reference warm cedar'),bpy.data.materials.get('Photoreal Dark structural timber')]:
 if not m:continue
 n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
 tex=next((a for a in n if a.type=='TEX_IMAGE' and a.image and a.image.colorspace_settings.name=='sRGB'),None)
 if tex:
  tint=n.get('V2 warm oil') or n.new('ShaderNodeMixRGB');tint.name='V2 warm oil';tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(1.8,1.10,.68,1);l.new(tex.outputs['Color'],tint.inputs[1]);l.new(tint.outputs[0],p.inputs['Base Color'])
 p.inputs['Roughness'].default_value=.68
# Live-edge sign is wider, asymmetric, with end-grain swirls and raised pale brush lettering.
burl=material('V2 weathered burl sign',(.18,.075,.028),.73);n=burl.node_tree.nodes;l=burl.node_tree.links;p=n.get('Principled BSDF');tc=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4;noise.inputs['Detail'].default_value=5;l.new(tc.outputs['Generated'],noise.inputs[0]);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.055,.023,.009,1);ramp.color_ramp.elements[1].color=(.30,.14,.056,1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.17;b.inputs['Distance'].default_value=.009;l.new(noise.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
outline=[(-.87,-.22),(-.93,-.06),(-.78,.09),(-.85,.28),(-.60,.29),(-.49,.48),(-.27,.38),(-.08,.44),(.15,.32),(.40,.47),(.53,.27),(.80,.23),(.75,.02),(.88,-.13),(.62,-.34),(.30,-.39),(.12,-.30),(-.12,-.41),(-.40,-.31),(-.68,-.35)]
N=len(outline);vs=[(x,y,3.15+z) for x in [-4.74,-4.57] for y,z in outline];fs=[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
o=mesh('V2 irregular burl sign',vs,fs,burl);b=o.modifiers.new('Soft natural sign rim','BEVEL');b.width=.025;b.segments=3
ivory=material('V2 aged ivory lettering',(.78,.74,.61),.8)
font=next(Path('/System/Library/Fonts').glob('*W5.ttc'))
for char,y,z,size,rot in [('い',.30,3.22,.48,-.12),('ろ',-.02,3.13,.51,.04),('り',-.38,3.23,.52,.13)]:
 cu=bpy.data.curves.new('V2 shop brush letter','FONT');cu.body=char;cu.font=bpy.data.fonts.load(str(font));cu.size=size;cu.align_x='CENTER';cu.align_y='CENTER';cu.shear=.12;cu.extrude=.001
 o=bpy.data.objects.new('V2 shop brush letter',cu);s.collection.objects.link(o);o.parent=r;o.location=(-4.748,y,z);o.rotation_euler=(math.pi/2,0,-math.pi/2);own(o);cu.materials.append(ivory)
# Replace the thin floating lantern roof with a closed carved stone profile.
stone=material('V2 weathered lantern granite',(.27,.28,.22),.91);n=stone.node_tree.nodes;l=stone.node_tree.links;p=n.get('Principled BSDF');tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=8;tex.inputs['Detail'].default_value=4;ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=(.09,.105,.068,1);ra.color_ramp.elements[1].color=(.43,.42,.34,1);l.new(tex.outputs['Fac'],ra.inputs[0]);l.new(ra.outputs[0],p.inputs['Base Color']);fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=160;b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.27;b.inputs['Distance'].default_value=.012;l.new(fine.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
def lathe(name,profile,cx,cy,mat,N=48):
 vs=[(cx+rad*math.cos(j*math.tau/N),cy+rad*math.sin(j*math.tau/N),z) for rad,z in profile for j in range(N)];fs=[(k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j) for k in range(len(profile)-1) for j in range(N)];o=mesh(name,vs,fs,mat)
 for p in o.data.polygons:p.use_smooth=True
 return o
cx,cy=-5.03,-1.88
lathe('V2 lantern octagonal foot',[(0,.02),(.28,.02),(.29,.10),(.23,.17),(.17,.18),(.12,.29),(.105,.75),(.18,.80)],cx,cy,stone,8)
box('V2 lantern ledge',(.46,.46,.10),(cx,cy,.82),stone)
for dx in [-.15,.15]:
 for dy in [-.15,.15]:box('V2 lantern chamber post',(.08,.08,.30),(cx+dx,cy+dy,1.02),stone)
box('V2 lantern chamber floor',(.30,.30,.045),(cx,cy,.905),stone)
prof=[(.0,1.15),(.42,1.15),(.49,1.19),(.46,1.25),(.33,1.26),(.20,1.35),(.09,1.47),(.0,1.49)]
N=64;vs=[]
for rad,z in prof:
 for j in range(N):
  a=j*math.tau/N;cs,sn=math.cos(a),math.sin(a);den=max(abs(cs),abs(sn));vs.append((cx+rad*cs/den,cy+rad*sn/den,z+.055*(min(abs(cs),abs(sn))**2)*(rad/.49)))
fs=[(k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j) for k in range(len(prof)-1) for j in range(N)];o=mesh('V2 thick swept granite roof',vs,fs,stone)
for p in o.data.polygons:p.use_smooth=True
lathe('V2 lantern lotus finial',[(0,1.47),(.065,1.47),(.082,1.51),(.066,1.59),(.025,1.66),(0,1.68)],cx,cy,stone)
# Face the ceramic ornament toward the approach, keeping its feet on the stone slab.
tan=next(o for o in r.children if o.get('irori_tripo_tanuki'));tan.rotation_euler.z=math.radians(145);tan.location=(-5.12,-1.10,.185)
# Actual depth behind door; the existing shadow backing is moved into the room.
back=next(o for o in r.children if o.name=='236248710_Deep interior shadow.040');back.location.x=-2.1
oldglass=next(o for o in r.children if 'recessed glazing' in o.name)
remove(oldglass,lambda lo,hi:lo[1]>-1.1 and hi[1]<1.1)
inside=material('V2 warm interior cedar',(.13,.065,.025),.8)
box('V2 entrance interior floor',(2.1,2.06,.06),(-3.10,0,.23),inside)
for y in [-.97,.97]:box('V2 entrance deep jamb',(2.1,.075,2.20),(-3.10,y,1.36),inside)
for y in [-.62,0,.62]:box('V2 interior screen post',(.07,.055,1.8),(-2.35,y,1.25),inside)
box('V2 interior reception counter',(.46,1.65,.085),(-2.65,0,.93),inside)
ld=bpy.data.lights.new('V2 interior bounce','AREA');ld.energy=24;ld.color=(1,.72,.43);ld.shape='RECTANGLE';ld.size=1.1;o=bpy.data.objects.new('V2 interior bounce',ld);s.collection.objects.link(o);own(o);o.location=r.matrix_world@Vector((-3.35,0,2.3));o.rotation_euler=(r.matrix_world@Vector((-2.3,0,1.0))-o.location).to_track_quat('-Z','Y').to_euler()
# Twisted timber display behind garden, silhouette observed in reference; inferred branches.
bark=material('V2 weathered rootwood',(.09,.066,.041),.94);n=bark.node_tree.nodes;l=bark.node_tree.links;p=n.get('Principled BSDF');te=n.new('ShaderNodeTexNoise');te.inputs['Scale'].default_value=19;te.inputs['Detail'].default_value=5;b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.42;b.inputs['Distance'].default_value=.022;l.new(te.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
def branch(name,points,radii):
 vs=[];N=9
 for k,(pt,rad) in enumerate(zip(points,radii)):
  tangent=Vector(points[min(k+1,len(points)-1)])-Vector(points[max(0,k-1)]);q=tangent.to_track_quat('Z','Y')
  for j in range(N):vs.append(tuple(Vector(pt)+q@Vector((rad*math.cos(j*math.tau/N),rad*math.sin(j*math.tau/N),0))))
 fs=[(k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j) for k in range(len(points)-1) for j in range(N)];o=mesh(name,vs,fs,bark)
 for p in o.data.polygons:p.use_smooth=True
for j in range(11):
 y=-2.8+rng.uniform(-.4,.4);x=-4.62-rng.random()*.25;h=rng.uniform(1.45,2.95)
 points=[(x,y,.05),(x-.1,y+.1,.5),(x+.12,y-.1,1.1),(x-.12,y+rng.uniform(-.45,.45),h*.8),(x+.06,y+rng.uniform(-.55,.55),h)]
 branch('V2 gnarled garden root',points,[.09,.10,.065,.042,.011])
# Preserve root GIS orientation. Correct camera approach and crop, not building coordinates.
cam=s.camera;cam.location=r.matrix_world@Vector((-10.7,3.3,2.15));target=r.matrix_world@Vector((-4.6,-.85,1.95));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=46
s.render.resolution_x=1600;s.render.resolution_y=1310;s.render.resolution_percentage=50;s.cycles.samples=32
s.render.filepath='/Users/jay/Claude/3D_motion/artifacts/ogimachi-phases/entrance-correction-test.png'
print('CORRECTED',sum(1 for o in s.objects if o.get('entrance_correction_v2')))
