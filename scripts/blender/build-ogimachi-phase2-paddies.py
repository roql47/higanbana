"""Foreground rice-terrace study; parcel outlines are reviewed photo traces, not measurements."""
import bpy,json,struct,math
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
R=Path('/Users/jay/Claude/3D_motion');d=json.loads((R/'public/data/ogimachi/survey.json').read_text());meta=d['dem'];raw=(R/'public/data/ogimachi/dem.f32').read_bytes();v=struct.unpack('<%sf'%(len(raw)//4),raw)
def sample(x,z):
 u=max(0,min(meta['size']-1.000001,(x-meta['minX'])/meta['step']));w=max(0,min(meta['size']-1.000001,(z-meta['minZ'])/meta['step']));i,j=int(u),int(w);a,b=u-i,w-j;k=j*meta['size']+i;n=meta['size'];return v[k]*(1-a)*(1-b)+v[k+1]*a*(1-b)+v[k+n]*(1-a)*b+v[k+n+1]*a*b
override_path=R/'artifacts/ogimachi-phases/parcel-overrides.json'
deferred=[]
if override_path.exists():
 review=json.loads(override_path.read_text());overrides=review['fields'];deferred=review.get('deferredFields',[])
 for field in d['fields']:
  if field['id'] in overrides:field['points']=overrides[field['id']]
src=bpy.data.scenes.get('Ogimachi_Phase1_GIS_Base')
if src is None:raise RuntimeError('Load phase1-gis-base.blend first')
scene=bpy.data.scenes.new('Ogimachi_Phase2_Foreground_Terraces');bpy.context.window.scene=scene
for ob in src.objects:
 cp=ob.copy()
 if ob.data:cp.data=ob.data.copy()
 scene.collection.objects.link(cp)
 if ob==src.camera:scene.camera=cp
scene.world=src.world.copy();scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
terrain=next(o for o in scene.objects if o.name.startswith('GSI_terrain_4m'))
def material(name,color,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
water=material('Paddy shallow water study',(.15,.24,.25),.16);earth=material('Paddy grass banks study',(.25,.31,.12),.95)
def mesh(name,verts,faces,mat):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.data.materials.append(mat);return ob
def inside(x,z,pts):
 hit=False
 for a,b in zip(pts,pts[1:]+pts[:1]):
  if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:hit=not hit
 return hit
def distance(x,z,pts):
 best=1e9
 for a,b in zip(pts,pts[1:]+pts[:1]):
  dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/max(1e-9,dx*dx+dz*dz)));best=min(best,math.hypot(x-a[0]-t*dx,z-a[1]-t*dz))
 return best
parcels=[]
for f in d['fields']:
 if f['kind']!='rice-reviewed' or f['id'] in deferred:continue
 pts=f['points'];pts=pts[:-1] if pts[0]==pts[-1] else pts
 cx=sum(p[0] for p in pts)/len(pts);cz=sum(p[1] for p in pts)/len(pts);level=sample(cx,cz)
 parcels.append((f['id'],pts,level))
# Refine to 1m before shaping banks; phase1 retains its original 4m grid.
bpy.context.view_layer.objects.active=terrain;terrain.select_set(True)
mod=terrain.modifiers.new('Terrace surface subdivision','SUBSURF');mod.subdivision_type='SIMPLE';mod.levels=2;bpy.ops.object.modifier_apply(modifier=mod.name)
for vert in terrain.data.vertices:
 x,z=vert.co.x,-vert.co.y;base=sample(x,z);best=0;target=base
 for _,pts,level in parcels:
  dist=distance(x,z,pts);weight=1 if inside(x,z,pts) else max(0,1-dist/2)
  if weight>best:best=weight;target=level-.12
 vert.co.z=base+(target-base)*best
for ident,pts,level in parcels:
 vectors=[Vector((x,-z,level+.015)) for x,z in pts];tris=tessellate_polygon([vectors]);coords=[];faces=[]
 for tri in tris:
  k=len(coords);coords.extend(tuple(vectors[p] if isinstance(p,int) else p) for p in tri);faces.append((k,k+1,k+2))
 ob=mesh('Rice_water_'+ident,coords,faces,water);ob['source']='photo-traced polygon; level inferred from DEM centroid'
 verts=[];fs=[]
 for a,b in zip(pts,pts[1:]+pts[:1]):
  dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
  if length<.01:continue
  nx,nz=-dz/length*.35,dx/length*.35;k=len(verts)
  verts.extend([(a[0]-nx,-a[1]+nz,level-.1),(a[0]+nx,-a[1]-nz,level-.1),(b[0]+nx,-b[1]-nz,level-.1),(b[0]-nx,-b[1]+nz,level-.1),(a[0]-nx*.65,-a[1]+nz*.65,level+.16),(a[0]+nx*.65,-a[1]-nz*.65,level+.16),(b[0]+nx*.65,-b[1]-nz*.65,level+.16),(b[0]-nx*.65,-b[1]+nz*.65,level+.16)])
  fs.extend(tuple(k+i for i in face) for face in [(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
 mesh('Rice_bank_'+ident,verts,fs,earth)
 # Remove duplicate trace only from this study scene.
 for o in list(scene.objects):
  if o.name.startswith('Field_'+ident):scene.collection.objects.unlink(o)
# Survey curves are retained for editing, but are not physical banks or roads.
for ob in scene.objects:
 if ob.name.startswith(('Field_','Road_axis_')):ob.hide_render=True
exec(compile((R/'scripts/blender/add-ogimachi-phase2-roads.py').read_text(),'phase2-roads','exec'))
cam=scene.camera;cam.data.type='ORTHO';cam.data.ortho_scale=250;cam.location=(170,275,170);target=Vector((15,120,-5));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
scene['status']='Phase2 terrace study, heights and bund dimensions inferred; no game replacement'
scene.render.filepath=str(R/'artifacts/ogimachi-phases/phase2-paddies.png')
bpy.data.libraries.write(str(R/'assets/authored/ogimachi/phase2-paddies.blend'),{scene},fake_user=True)
print({'scene':scene.name,'terraces':len(parcels),'terrain_vertices':len(terrain.data.vertices)})
