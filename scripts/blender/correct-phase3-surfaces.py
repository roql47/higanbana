"""Reference-led surface corrections; all measurements remain inferred."""
import bpy,math,random
from mathutils import Vector
rng=random.Random(812)
# Packed material image: soften high-contrast grey streaking and restore brown cedar.
old=next(n.image for n in wood.node_tree.nodes if n.type=='TEX_IMAGE' and n.image.colorspace_settings.name!='Non-Color')
import numpy as np
pixels=np.empty(old.size[0]*old.size[1]*4,dtype=np.float32);old.pixels.foreach_get(pixels);pixels=pixels.reshape(-1,4)
lum=pixels[:,:3].mean(axis=1);soft=np.clip(.12+lum*.46,0,1)
pixels[:,:3]=soft[:,None]*np.array([1.0,.66,.40])
im=bpy.data.images.new('Warm aged cedar corrected',old.size[0],old.size[1]);im.pixels.foreach_set(pixels.ravel());im.pack()
correctedwood=wood.copy();correctedwood.name='Reference warm cedar'
for n in correctedwood.node_tree.nodes:
 if n.type=='TEX_IMAGE' and n.image==old:n.image=im
for root in models:
 for ob in root.children:
  if ob.type!='MESH':continue
  for i,m in enumerate(ob.data.materials):
   if m and ('Smoke-aged cedar' in m.name or 'cedar' in m.name.lower()):ob.data.materials[i]=correctedwood
# Each roof gets broad sag and fine reed-edge variation, preserving its envelope.
for root in models:
 for ob in root.children:
  if ob.type!='MESH':continue
  slots={i for i,m in enumerate(ob.data.materials) if m and ('kaya' in m.name.lower() or 'reed end' in m.name.lower())}
  if not slots:continue
  # Restrict deformation to the roof slab, not ridge cap or unrelated bundled geometry.
  candidates={v for p in ob.data.polygons if p.material_index in slots for v in p.vertices}
  if not candidates:continue
  coords=[ob.data.vertices[i].co for i in candidates];half=max(abs(v.x) for v in coords)
  if half<3:continue
  for idx in candidates:
   v=ob.data.vertices[idx];t=min(1,abs(v.co.x)/half)
   v.co.z+=(.045*math.sin(v.co.y*1.8)+.020*math.sin(v.co.y*7.1))*(t**7)
  ob.data.update()
