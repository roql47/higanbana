"""Three-building study; reuse observed B002 details, improve close-range finish."""
from pathlib import Path
import bpy, math, json, random
from mathutils import Vector
R=Path('/Users/jay/Claude/3D_motion');src=R/'scripts/blender/build-ogimachi-irori.py'
ns={'__file__':str(src)}
exec(compile(src.read_text().split('for obj in models:')[0],str(src),'exec'),ns)
scene=ns['scene'];scene.name='Phase3_Three_House_Block'
box=ns['box'];beam=ns['beam'];wood=ns['wood'];frame=ns['frame'];stone=ns['stone'];models=ns['models']
rng=random.Random(710)
# Use physical surface scale on trim rather than cube-default repeated UVs.
for root in models:
 ns['current']=root
 restaurant=root['osm_id']==236248710
 w,d,h,rw=(8.7,11.9,3.4,10.386) if restaurant else (7.1,8.85,3.5,8.769)
 for side in [-1,1]:
  for j in range(int(d/.42)+1):
   y=-d/2+j*.42
   beam('Exposed under-eave rafter',(side*(w/2-.25),y,h-.04),(side*(rw/2-.12),y,h-.04),.085,frame)
 # Layered cedar boards above window heads, with non-identical UV offsets.
 for j in range(3):
  o=box('Horizontal facade cedar course',(.065,d-.3,.17),(-w/2-.035,0,2.82+j*.19),wood)
  for uv in o.data.uv_layers.active.data:uv.uv.x+=rng.uniform(0,.03)
 for y in [-d/2+.25,d/2-.25]:
  beam('Eave diagonal brace',(-w/2-.03,y,h-.75),(-rw/2+.12,y,h-.07),.095,frame)
 for j in range(int(d/.38)):
  y=-d/2+.2+j*.38
  if abs(y)<1.5:continue
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(-w/2-.15,y,.09));o=bpy.context.object;o.parent=root;o.name='Irregular footing stone';o.scale=(.24,rng.uniform(.15,.22),rng.uniform(.07,.13));o.data.materials.append(stone)
 for o in list(root.children):
  if o.type!='MESH':continue
  if any(k in o.name.lower() for k in ['post','counter','sill','lintel','bench','sign','rack','cap']):
   mod=o.modifiers.new('Soft worn timber edges','BEVEL');mod.width=.012;mod.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 # Correct cut-face UVs: the roof slope mapping collapses the thickness axis.
 for o in list(root.children):
  if o.type=='MESH' and o.name.startswith('Curved deep kaya roof'):
   for poly in o.data.polygons:
    if abs(poly.normal.z)<.15:
     poly.use_smooth=False
     for li in poly.loop_indices:
      co=o.data.vertices[o.data.loops[li].vertex_index].co
      o.data.uv_layers.active.data[li].uv=((co.y if abs(poly.normal.x)>.5 else co.x)/.65,co.z/.65)
  if o.name.startswith('Garden plant leaf'):bpy.data.objects.remove(o,do_unlink=True)
 if restaurant:
  # Curved, pointed blade rosettes replace upright ellipsoid placeholders.
  for i in range(6):
   x=-w/2-.65-(i%2)*.45;y=-2.55-(i//2)*.6
   for j in range(11):
    a=j*math.tau/11+rng.uniform(-.15,.15);reach=rng.uniform(.18,.32);height=rng.uniform(.32,.65);vs=[]
    for k in range(5):
     t=k/4;cx=x+math.cos(a)*reach*t*t;cy=y+math.sin(a)*reach*t*t;z=.31+height*t-.16*t*t
     width=.045*math.sin(math.pi*t)
     vs.extend([(cx-math.sin(a)*width,cy+math.cos(a)*width,z),(cx+math.sin(a)*width,cy-math.cos(a)*width,z)])
    ns['mesh']('Curved garden blade',vs,[(k*2,k*2+1,k*2+3,k*2+2) for k in range(4)],ns['leaf'])
 # Open real pockets behind glazing without cutting the separate outer lattice.
 shell=next(o for o in root.children if o.name.startswith('Aged timber shell'))
 pockets=[o for o in root.children if o.name.startswith(('Recessed side glazing','Entrance dark recess','Shop west entrance','Serving opening'))]
 for pane in pockets:
  dims=list(pane.dimensions);axis=0 if dims[0]<dims[1] else 1
  dims[axis]=.9
  loc=pane.location.copy();loc[axis]+=.32
  cutter=box('Temporary window pocket',dims,loc,frame)
  bpy.context.view_layer.objects.active=shell;mod=shell.modifiers.new('Deep window pocket','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
  bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
  # Opaque dark backing stays behind existing sash; no costly transmission sorting.
  pane.location[axis]+=.43
  dark=ns['material']('Deep interior shadow',(.018,.022,.019),.48);pane.data.materials[0]=dark
 # Small diagonal pane highlight gives glazing a reflection without a flat pale fill.
 if restaurant:
  for yy in [-4.6,-2.8,2.7,4.5]:
   beam('Muted glass highlight',(-w/2+.31,yy-.6,1.1),(-w/2+.31,yy+.55,2.1),.012,ns['glass'])
  # Reference sign is an irregular wooden slab rather than a rectangular board.
  sign=next(o for o in root.children if o.name.startswith('Irregular slab shop sign'))
  for v in sign.data.vertices:
   v.co.z+=.045*math.sin(v.co.y*8)+.02*math.cos(v.co.y*19)
  for lamp in [o for o in root.children if o.name.startswith('Vertical lantern paper core')]:
   lamp.scale.y*=1.12;lamp.scale.z*=1.12
 if restaurant:
  # Readable shop name from the reference, with a plain font rather than invented calligraphy.
  font=next(Path('/System/Library/Fonts').glob('*W5.ttc'))
  cu=bpy.data.curves.new('Irori sign lettering','FONT');cu.body='いろり';cu.font=bpy.data.fonts.load(str(font));cu.align_x='CENTER';cu.align_y='CENTER';cu.size=.41;cu.extrude=.001
  ob=bpy.data.objects.new('Irori sign lettering',cu);scene.collection.objects.link(ob);ob.parent=root;ob.location=(-w/2-.225,0,3.04);ob.rotation_euler=(math.pi/2,0,-math.pi/2);cu.materials.append(ns['cream'])
  bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
  # Unequal pot group heights, observed layered planting rather than a row of identical silhouettes.
  centers=[(-w/2-.65-(i%2)*.45,-2.55-(i//2)*.6) for i in range(6)]
  factors=[1.2,.85,1.65,1.05,1.4,.95]
  for ob in list(root.children):
   if ob.name.startswith('Garden pot'):
    idx=min(range(6),key=lambda i:(ob.location.x-centers[i][0])**2+(ob.location.y-centers[i][1])**2)
    f=factors[idx];ob.scale*=f;ob.location.z*=f
   elif ob.name.startswith('Curved garden blade'):
    center=ob.data.vertices[0].co;idx=min(range(6),key=lambda i:(center.x-centers[i][0])**2+(center.y-centers[i][1])**2);f=factors[idx];cx,cy=centers[idx]
    for v in ob.data.vertices:v.co.x=cx+(v.co.x-cx)*f;v.co.y=cy+(v.co.y-cy)*f;v.co.z*=f
 exec(compile((R/'scripts/blender/refine-irori-entrance.py').read_text(),'refine-entrance','exec'))
 # Keep existing windows, lattice, entrance lanterns, shop canopy and attic distinct.
 mats=set(o.data.materials[0] for o in root.children if o.type=='MESH')
 for mat in mats:
  obs=[o for o in root.children if o.type=='MESH' and o.data.materials[0]==mat]
  bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0]
  if len(obs)>1:bpy.ops.object.join()
  obs[0].name=str(root['osm_id'])+'_'+mat.name
# Append the approved-quality baseline without rebuilding it.
with bpy.data.libraries.load(str(R/'assets/authored/ogimachi/phase3-hakusuien.blend'),link=False) as (a,b):b.scenes=a.scenes
hs=b.scenes[0];hr=next(o for o in hs.objects if o.get('osm_id')==236248693)
for o in [hr,*hr.children]:scene.collection.objects.link(o)
models.append(hr)
exec(compile((R/'scripts/blender/correct-phase3-surfaces.py').read_text(),'phase3-surfaces','exec'))
survey=json.loads((R/'public/data/ogimachi/survey.json').read_text());lookup={b['id']:b for b in survey['buildings']}
base=sorted([s for s in bpy.data.scenes if s.name.startswith('Ogimachi_Phase2_Foreground_Terraces')],key=lambda s:s.name)[-1]
ids={r['osm_id'] for r in models};terrain=None
for o in base.objects:
 if o.name.startswith('Footprint_') and any(o.name.startswith('Footprint_'+str(i)) for i in ids):continue
 if o.type in ['CAMERA','LIGHT'] or o.name.startswith('Footprint_'):continue
 cp=o.copy()
 if o.name.startswith('GSI_terrain'):cp.data=o.data.copy();terrain=cp
 scene.collection.objects.link(cp)
levels={}
for root in models:
 b=lookup[root['osm_id']];old=next(o for o in base.objects if o.name.startswith('Footprint_'+str(b['id'])));level=min(v.co.z for v in old.data.vertices);levels[b['id']]=level
 root.location=(b['x'],-b['z'],level);root.rotation_euler.z=b['angle'];c,s=math.cos(b['angle']),math.sin(b['angle'])
 for v in terrain.data.vertices:
  dx,dy=v.co.x-b['x'],v.co.y+b['z'];x,y=c*dx+s*dy,-s*dx+c*dy;edge=max(abs(x)-b['width']/2,abs(y)-b['depth']/2)
  t=max(0,min(1,1-edge/1.5));t=t*t*(3-2*t);v.co.z=v.co.z*(1-t)+level*t
# Terrain-aligned apron ribbons meet the nearest existing road surface, avoiding flat floating slabs.
from mathutils.bvhtree import BVHTree
bpy.context.view_layer.update();bv=BVHTree.FromObject(terrain,bpy.context.evaluated_depsgraph_get())
def ground(x,y):
 p,*_=bv.ray_cast(Vector((x,y,100)),Vector((0,0,-1)));return p.z if p else -3
roadmat=next(m for m in bpy.data.materials if m.name.startswith('Study packed earth road'))
# Use actual road vertices as attachment targets; no invented centreline.
roadverts=[o.matrix_world@v.co for o in scene.objects if o.type=='MESH' and 'shoulder' not in o.name.lower() and o.name.startswith('Study_road_') for v in o.data.vertices]
print('road surface candidates',len(roadverts))
for root in models:
 b=lookup[root['osm_id']];start=root.matrix_world@Vector((-b['width']/2-.2,0,0))
 if not roadverts:continue
 end=min(roadverts,key=lambda v:(v.x-start.x)**2+(v.y-start.y)**2)
 direction=Vector((end.x-start.x,end.y-start.y,0));length=direction.length
 if length>25 or length<.3:continue
 direction.normalize();perp=Vector((-direction.y,direction.x,0));verts=[];faces=[];n=max(2,int(length/.5));half=1.3
 for j in range(n+1):
  p=start.lerp(end,j/n)
  for sign in [-1,1]:
   q=p+perp*half*sign;verts.append((q.x,q.y,ground(q.x,q.y)+.035))
 for j in range(n):faces.append((j*2,j*2+1,j*2+3,j*2+2))
 me=bpy.data.meshes.new('Earth entrance approach');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Approach_'+str(b['id']),me);scene.collection.objects.link(o);me.materials.append(roadmat)
# Export local block only; the distant placeholders remain in editable study scene.
bpy.ops.object.select_all(action='DESELECT')
for root in models:
 root.select_set(True)
 for o in root.children:o.select_set(True)
# Crop terrain triangles to the block for the lightweight review export.
verts=[];faces=[]
for p in terrain.data.polygons:
 points=[terrain.data.vertices[i].co for i in p.vertices]
 if all(-87<v.x<-24 and  40<v.y<130 for v in points):
  k=len(verts);verts.extend(tuple(v) for v in points);faces.append(tuple(range(k,k+len(points))))
me=bpy.data.meshes.new('Block terrain crop');me.from_pydata(verts,[],faces);me.update();
for p in me.polygons:p.use_smooth=True
crop=bpy.data.objects.new('Block terrain crop',me);scene.collection.objects.link(crop)
for m in terrain.data.materials:me.materials.append(m)
import bmesh
bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bm.to_mesh(me);bm.free();me.update()
for p in me.polygons:p.use_smooth=True
crop.select_set(True)
for o in scene.objects:
 if o.name.startswith(('Approach_','Study_road_','Study_shoulder_')):
  # Keep only segments within local area; source meshes span too far, crop their polygons.
  vs=[];fs=[]
  for p in o.data.polygons:
   pts=[o.matrix_world@o.data.vertices[i].co for i in p.vertices]
   if all(-87<v.x<-24 and 40<v.y<130 for v in pts):
    k=len(vs);vs.extend(tuple(v) for v in pts);fs.append(tuple(range(k,k+len(pts))))
  if not fs:continue
  md=bpy.data.meshes.new('Block road crop');md.from_pydata(vs,[],fs);md.update();cp=bpy.data.objects.new('Block_'+o.name,md);scene.collection.objects.link(cp)
  for m in o.data.materials:md.materials.append(m)
  cp.select_set(True);o.hide_render=True
terrain.hide_render=True
out=R/'artifacts/ogimachi-phases'
bpy.ops.export_scene.gltf(filepath=str(out/'phase3-cluster.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
scene.world=hs.world
sun=bpy.data.lights.new('Cluster sunlight','SUN');sun.energy=2;sun.angle=.2;o=bpy.data.objects.new('Cluster sunlight',sun);scene.collection.objects.link(o);o.rotation_euler=(.6,-.5,-.5)
cam=bpy.data.cameras.new('Cluster review');o=bpy.data.objects.new('Cluster review',cam);scene.collection.objects.link(o);scene.camera=o
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
for name,loc,target in [('overview',(-114,17,54),(-53,87,0)),('restaurant',(-79,70,7),(-55,98,1)),('shop',(-77,87,8),(-62,110,1))]:
 o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();cam.lens=42;scene.render.filepath=str(out/('phase3-cluster-'+name+'.png'));bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(str(R/'assets/authored/ogimachi/phase3-three-house-block.blend'),{scene},fake_user=True)
report={'buildings':[{'id':r['osm_id'],'meshes':len(r.children),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in r.children if o.type=='MESH'),'level':levels[r['osm_id']]} for r in models],'approaches':len([o for o in scene.objects if o.name.startswith('Approach_')]),'source':'Existing authored B001/B002 refined; not new measured replicas'}
(out/'phase3-cluster-inventory.json').write_text(json.dumps(report,indent=2));print(report)
