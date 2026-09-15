import bpy
from mathutils import Vector
s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
for o in r.children:
 if o.type!='MESH' or o.hide_render:continue
 if not o.name.startswith('236248710'):continue
 me=o.data;adj={v.index:set() for v in me.vertices}
 for e in me.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 left=set(adj);hits=[]
 while left:
  st=[left.pop()];ids=[]
  while st:
   v=st.pop();ids.append(v);ns=adj[v]&left;left-=ns;st.extend(ns)
  vs=[o.matrix_local@me.vertices[i].co for i in ids];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
  if lo[0]<-4.2 and hi[0]>-4.9 and lo[1]<1.05 and hi[1]>-1.05 and lo[2]<2.45 and hi[2]>.3:hits.append(([round(x,3) for x in lo],[round(x,3) for x in hi],len(ids)))
 if hits:print(o.name,hits)
