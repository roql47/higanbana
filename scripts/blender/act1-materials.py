"""Deterministic authored PBR surfaces for the close ACT1 frontage.
Arrays generate new tileable material maps, not edits of reference photographs.
Executed in the frontage generator's Blender namespace.
"""
texdir=ROOT/'public/textures/ogimachi/frontage';texdir.mkdir(parents=True,exist_ok=True)
def authored_surface(label,base,kind):
 n=512;y,x=np.mgrid[0:n,0:n]/n;rng=np.random.default_rng(816)
 field=np.zeros((n,n));relief=np.zeros_like(field)
 for f,a in [(1,.35),(3,.24),(9,.13),(27,.065),(81,.025)]:
  phase=rng.random()*math.tau
  field+=a*np.sin(math.tau*(x*f+y*(f+1))+phase)*np.cos(math.tau*(y*f-x)+phase)
 fine=rng.uniform(-1,1,(n,n))
 if kind=='wood':
  grain=np.sin(math.tau*(x*58+.7*np.sin(y*math.tau)+.3*np.sin(y*math.tau*7)))
  relief=grain*.28+fine*.12+field*.2
  variation=1+grain*.13+field*.28+fine*.045;rough=.80+field*.10
 elif kind=='plaster':
  relief=fine*.35+field*.15;variation=1+field*.10+fine*.018;rough=.94+field*.035
 elif kind=='ochre':
  streak=np.sin(math.tau*x*19+.3*np.sin(y*math.tau))*np.sin(y*math.tau)
  relief=fine*.30+field*.12;variation=1+field*.17+streak*.025+fine*.025;rough=.92+field*.05
 elif kind in ['painted-metal','shutter']:
  brushed=np.sin(math.tau*y*109)*.025
  relief=fine*.10+brushed;variation=1+field*.14+fine*.025;rough=.55+field*.16+brushed
 else:
  relief=fine*.18+field*.28;variation=1+field*.25+fine*.045;rough=.76+field*.13
 color=np.clip(np.array(base)[None,None,:]*variation[:,:,None],0,1)
 # PNG color maps are sampled as sRGB in glTF. Encode the linear palette so
 # replacing a flat material does not unintentionally darken its base color.
 color=np.where(color<=.0031308,color*12.92,1.055*np.power(color,1/2.4)-.055)
 def save_map(suffix,data,noncolor=False):
  im=bpy.data.images.new(label+' '+suffix,n,n)
  if noncolor:im.colorspace_settings.name='Non-Color'
  rgba=np.ones((n,n,4),dtype=np.float32);rgba[:,:,:3]=data
  im.pixels.foreach_set(rgba.ravel());im.filepath_raw=str(texdir/(kind+'-'+suffix+'.png'));im.file_format='PNG';im.save();im.pack();return im
 col=save_map('color',color)
 dx=(np.roll(relief,-1,1)-np.roll(relief,1,1))*.22;dy=(np.roll(relief,-1,0)-np.roll(relief,1,0))*.22
 normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
 nor=save_map('normal',normal*.5+.5,True)
 rou=save_map('roughness',np.repeat(np.clip(rough,0,1)[:,:,None],3,axis=2),True)
 m=material(label,base);nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF')
 for im,slot in [(col,'Base Color'),(rou,'Roughness')]:
  t=nodes.new('ShaderNodeTexImage');t.image=im;links.new(t.outputs['Color'],p.inputs[slot])
 t=nodes.new('ShaderNodeTexImage');t.image=nor;nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45;links.new(t.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],p.inputs['Normal'])
 return m
cream=authored_surface('ACT1 fine weathered lime plaster',(.69,.67,.61),'plaster')
frame=authored_surface('ACT1 stained timber grain',(.085,.049,.026),'wood')
tile=authored_surface('ACT1 mineral roof tile',(.10,.12,.12),'tile')
ocher=authored_surface('ACT1 textured ochre workshop wall',(.43,.32,.22),'ochre')
rust=authored_surface('ACT1 weathered painted roof metal',(.24,.13,.10),'painted-metal')
shutter=authored_surface('ACT1 brushed rolling steel',(.28,.29,.28),'shutter')
for m in [rust,shutter]:m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.25
# Remap timber UVs along each beam's long axis; gently bevel visible cut edges.
original_box=box
def box(name,dim,loc,mat,rot=None):
 o=original_box(name,dim,loc,mat,rot)
 if mat==frame:
  major=max(range(3),key=lambda i:dim[i])
  for poly in o.data.polygons:
   face=max(range(3),key=lambda i:abs(poly.normal[i]))
   cross=next((i for i in range(3) if i!=major and i!=face),(major+1)%3)
   for li in poly.loop_indices:
    co=o.data.vertices[o.data.loops[li].vertex_index].co
    o.data.uv_layers.active.data[li].uv=(co[cross]/.28,co[major]/2.4)
 if mat in [frame,wood] and min(dim)>.06 and max(dim)>.3:
  mod=o.modifiers.new('Soft worn timber edge','BEVEL');mod.width=min(.009,min(dim)*.10);mod.segments=1
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
original_roof=roof
def roof(width,depth,base,rise,mat,thickness=.5):
 original_roof(width,depth,base,rise,mat,thickness)
 if mat!=tile:return
 # Curved individual tile crowns on the street-facing slope, merged on export.
 half=width/2;length=math.hypot(half,rise);rows=max(1,round(length/.55));cols=max(1,round(depth/.34))
 verts=[];faces=[]
 for row in range(rows):
  a=row/rows;b=min(1,(row+1.08)/rows)
  for col in range(cols):
   yy=-depth/2+col*depth/cols
   k=len(verts)
   for t in [a,b]:
    for j in range(4):
     u=j/3;verts.append((half*t,yy+u*depth/cols,base+rise*(1-t)+.16+.055*math.sin(math.pi*u)))
   for j in range(3):faces.append((k+j,k+4+j,k+5+j,k+1+j))
 mesh('Individual curved ceramic tile crowns',verts,faces,mat)
