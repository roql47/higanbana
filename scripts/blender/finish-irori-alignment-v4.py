"""Window datum and four-sided lantern corrections after the reference overlay review."""
import bpy,bmesh,math
from mathutils import Vector
s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
# Move all side window assemblies together; maintain their clear openings and sill support.
window_names=('V3 deep window backing','V3 window recess cheek','V3 projecting window sill','V3 window head','V3 window leaf','V3 reflective glass','V3 fine exterior grille')
for o in r.children:
 if o.type!='MESH' or o.get('v4_window_datum'):continue
 if o.name.startswith(window_names) or o.name=='V3 pegged facade header':
  o.data=o.data.copy()
  for v in o.data.vertices:v.co.z+=.25
  o['v4_window_datum']=True
 elif o.name.startswith('V3 lower vertical weatherboards'):
  o.data=o.data.copy()
  for v in o.data.vertices:v.co.z=.195+(v.co.z-.195)*(.80/.55)
  o['v4_window_datum']=True
 elif o.name.startswith('V3 broad upper wall board'):
  lo=min(v.co.z for v in o.data.vertices);hi=max(v.co.z for v in o.data.vertices)
  if lo<2.8:
   o.data=o.data.copy()
   for v in o.data.vertices:v.co.z=2.99+(v.co.z-lo)/(hi-lo)*.08
   o['v4_window_datum']=True
for o in r.children:
 if o.name.startswith('PR interior timber reveal'):o.hide_render=True;o.hide_set(True)
# Preserve old merged meshes but remove only the identified lamp components.
def groups(o):
 par=list(range(len(o.data.vertices)))
 def f(a):
  while par[a]!=a:par[a]=par[par[a]];a=par[a]
  return a
 for e in o.data.edges:a,b=map(f,e.vertices);par[b]=a
 gr={}
 for v in o.data.vertices:gr.setdefault(f(v.index),[]).append(v.index)
 for ids in gr.values():
  ps=[o.matrix_local@o.data.vertices[i].co for i in ids];yield ids,[min(v[a] for v in ps) for a in range(3)],[max(v[a] for v in ps) for a in range(3)]
for o in r.children:
 if o.type!='MESH' or not any(k in o.name for k in ['Dark structural timber','cream paper','pale shoji']) or o.get('v4_lantern_source'):continue
 remove=set()
 for ids,lo,hi in groups(o):
  cy=(lo[1]+hi[1])*.5
  if lo[0]<-4.56 and lo[2]>2.70 and hi[2]<3.70 and .65<abs(cy)<1.70:remove.update(ids)
 if remove:
  o['v4_lantern_source']=o.data.name;o.data=o.data.copy();bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in remove],context='VERTS');bm.to_mesh(o.data);bm.free()
for o in list(r.children):
 if o.get('v4_lantern'):bpy.data.objects.remove(o,do_unlink=True)
def mat(name,color,rough):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
paper=mat('V4 aged lantern paper',(.64,.61,.48),.93);cage=mat('V4 smoked bamboo lantern cage',(.105,.087,.054),.83)
n=paper.node_tree.nodes;l=paper.node_tree.links;p=n.get('Principled BSDF');te=n.get('Paper fiber') or n.new('ShaderNodeTexNoise');te.name='Paper fiber';te.inputs['Scale'].default_value=140;b=n.get('Paper relief') or n.new('ShaderNodeBump');b.name='Paper relief';b.inputs['Strength'].default_value=.15;b.inputs['Distance'].default_value=.0005;l.new(te.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
def mesh(name,vs,fs,m):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.parent=r;o['v4_lantern']=True;me.materials.append(m);bm=bmesh.new();bm.from_mesh(me)
 if all(e.is_manifold for e in bm.edges) and bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(me)
 bm.free();return o
def rod(a,b,radius,m):
 a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Z','Y');vs=[];N=8
 for point in [a,b]:
  for j in range(N):t=j*math.tau/N;vs.append(tuple(point+q@Vector((radius*math.cos(t),radius*math.sin(t),0))))
 fs=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(j,(j+1)%N,(j+1)%N+N,j+N) for j in range(N)];return mesh('V4 lantern bamboo rib',vs,fs,m)
for cy in [1.43,-.97]:
 cx=-4.70;zc=3.16;H=.57;N=32
 vs=[(cx+math.cos(j*math.tau/N)*.088,cy+math.sin(j*math.tau/N)*.11,z) for z in [zc-H/2,zc+H/2] for j in range(N)];fs=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(j,(j+1)%N,(j+1)%N+N,j+N) for j in range(N)];o=mesh('V4 rounded paper lantern',vs,fs,paper)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 for j in range(12):
  a=j*math.tau/12;x=cx+math.cos(a)*.106;y=cy+math.sin(a)*.129;rod((x,y,zc-H/2-.018),(x,y,zc+H/2+.018),.007,cage)
 for k in range(9):
  z=zc-H/2+k*H/8;rr=.006 if k in [0,8] else .0024
  for j in range(N):
   a=j*math.tau/N;aa=(j+1)*math.tau/N;rod((cx+math.cos(a)*.107,cy+math.sin(a)*.130,z),(cx+math.cos(aa)*.107,cy+math.sin(aa)*.130,z),rr,cage)
# Consolidate lantern ribs by material to avoid hundreds of draw objects in the study.
for m in [paper,cage]:
 objs=[o for o in r.children if o.get('v4_lantern') and o.data.materials[0]==m]
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]
 if len(objs)>1:bpy.ops.object.join()
 objs[0].name='V4 complete lantern '+('paper' if m==paper else 'cage')
s.render.filepath='/Users/jay/Claude/3D_motion/artifacts/ogimachi-phases/alignment-v4-final.png'
print('Side windows raised, lower boards extended, full lantern cages built')
# Close the door-only infill exposed when the side-window header was raised.
# The door/lintel datum remains fixed to the photographic corner fit.
for ob in list(r.children):
 if ob.get('v4_door_infill'):bpy.data.objects.remove(ob,do_unlink=True)
x,y,z=-4.365,0,2.86;dx,dy,dz=.045,1.10,.16
vs=[(x+i*dx,y+j*dy,z+k*dz) for i,j,k in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
fs=[(0,2,6,4),(1,5,7,3),(0,4,5,1),(2,3,7,6),(0,1,3,2),(4,6,7,5)];me=bpy.data.meshes.new('V4 door head timber infill');me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new('V4 door head timber infill',me);s.collection.objects.link(ob);ob.parent=r;ob['v4_door_infill']=True;me.materials.append(bpy.data.materials['V3 cedar board 2']);uv=me.uv_layers.new()
for p in me.polygons:
 for li in p.loop_indices:
  v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(.354+(v.z-(z-dz))/(2*dz)*.048,.46+(v.y+dy)/(2*dy)*.27)
