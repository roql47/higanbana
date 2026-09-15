"""B004 textured exterior. Observed front features; dimensions and unseen faces estimated.
Run via Blender MCP; creates a separate scene and preserves earlier authored scenes.
"""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
scene.name='Ogimachi_B004_Onsen'
current=bpy.data.objects.new('onsen',None);scene.collection.objects.link(current)
current['archetype']='onsen';current['osm_id']=236248626;current['front_local']='-X'
current['roof_envelope_m']=[15.135,54.613];current['scope']='textured exterior; entry offset and rear are estimates'
cedar=surface('Onsen horizontal cedar','textures/minka/weathered-cedar-diff-1k.webp','textures/minka/weathered-cedar-nor-gl-1k.webp',.35)
glass=material('Onsen smoked window glass',(.18,.235,.22),.30)
metal=material('Onsen weathered sheet metal',(.14,.16,.155),.72)
linen=material('Onsen indigo entrance linen',(.035,.14,.25))
# Compact, tileable authored maps. Export actual image textures, not unsupported
# procedural shader nodes; these are approximations rather than scanned surfaces.
def micro_surface(mat,cloth=False):
    n=256;y,x=np.mgrid[0:n,0:n]/n
    relief=(np.sin(x*math.tau*64)*np.sin(y*math.tau*64) if cloth else
            .45*np.sin(x*math.tau*3+y*math.tau*2)+.2*np.cos(y*math.tau*11))
    gx=np.roll(relief,-1,1)-np.roll(relief,1,1);gy=np.roll(relief,-1,0)-np.roll(relief,1,0)
    normals=np.stack([-gx*.12,-gy*.12,np.ones_like(x)],-1);normals/=np.linalg.norm(normals,axis=-1,keepdims=True)
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF')
    for label,rgb in [('normal',normals*.5+.5),('roughness',np.repeat(((.91 if cloth else .72)+relief*.07)[:,:,None],3,axis=2))]:
        im=bpy.data.images.new(('Noren' if cloth else 'Roof')+'-'+label,n,n)
        im.colorspace_settings.name='Non-Color';pixels=np.ones((n,n,4),dtype=np.float32);pixels[:,:,:3]=rgb
        im.pixels.foreach_set(pixels.ravel());im.pack()
        tex=nodes.new('ShaderNodeTexImage');tex.image=im
        if label=='normal':
            nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45
            links.new(tex.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],p.inputs['Normal'])
        else:links.new(tex.outputs['Color'],p.inputs['Roughness'])
micro_surface(metal);micro_surface(linen,True)
cream=material('Onsen warm inner curtains',(.67,.65,.52))
brass=material('Onsen aged door handles',(.31,.28,.19),.43)
sign=material('Onsen sign slab',(.31,.19,.075))
w,d=13.1,52.4;front=-w/2
# Set the wall skin outside a recessed opaque core, so frames/glazing are not buried.
box('Upper timber core',(w,d,3.30),(0,0,4.9),cedar)
# Estimated entrance room: local X -6.55..-1.55, Blender Y -18..-10.
for yy,dd in [(-22.1,8.2),(8.1,36.2)]:
    box('Closed lower wing',(w,dd,3.3),(0,yy,1.65),cedar)
    box('Wing plinth',(w,dd,.5),(0,yy,.25),stone)
box('Foyer rear wall',(8.1,8,3.3),(2.5,-14,1.65),cedar)
for yy in [-17.15,-10.85]:box('Entrance side wall',(.18,1.7,3.3),(front,yy,1.65),cedar)
box('Entrance lintel',(.18,4.6,.35),(front,-14,3.075),cedar)
# Simple enclosed foyer, deliberately a design study rather than a measured lobby.
box('Foyer ceiling',(5,8,.12),(-4.05,-14,3.2),cream)
for yy in [-17.91,-10.09]:box('Foyer timber lining',(5,.10,3.1),(-4.05,yy,1.6),cedar)
box('Foyer back lining',(.10,7.8,3.1),(-1.60,-14,1.6),cream)
box('Foyer bench',(.6,2.2,.14),(-2.3,-16.6,.48),cedar)
for yy in [-17.4,-15.8]:box('Foyer bench leg',(.48,.14,.42),(-2.3,yy,.21),frame)
for zz in [.3,.75,1.2]:box('Shoe shelf',(.45,1.8,.07),(-2,-11.4,zz),cedar)
for yy in [-12.3,-11.7,-11.1,-10.5]:box('Shoe cubby upright',(.45,.045,1.2),(-2,yy,.65),cedar)
box('Shoe cabinet back',(.055,1.85,1.25),(-1.78,-11.4,.65),frame)
for yy in [-17.8,-10.2]:
    for zz in [.22,2.98]:box('Foyer wall trim',(4.85,.075,.12),(-4.05,yy,zz),frame)
for yy in [-17,-14,-11]:box('Ceiling timber beam',(4.9,.16,.18),(-4.05,yy,3.05),cedar)
# Timber framed diffuser, using shared materials and no extra shadow lights.
box('Ceiling lamp diffuser',(1.15,.65,.08),(-4.05,-14,2.95),cream)
for xx in [-4.65,-3.45]:box('Lamp frame rail',(.055,.76,.14),(xx,-14,2.96),frame)
for yy in [-14.36,-13.64]:box('Lamp end rail',(1.25,.055,.14),(-4.05,yy,2.96),frame)
box('Foyer welcome plaque',(.06,1.6,.52),(-1.70,-14,1.9),sign)
for y in np.arange(-26,26,.4):
    # Low polygon siding courses give grazing-light relief while texture carries grain.
    zz=.60+(y+26)/52*5.85
    if zz<3.25:
        for yy,dd in [(-21.25,9.9),(7.25,37.9)]:box('Split cedar siding',(.07,dd,.018),(front+.025,yy,zz),cedar)
    else:box('Horizontal cedar siding',(.07,52.4,.018),(front+.025,0,zz),cedar)
for z in [3.22,6.48]:box('Long timber belt',(.17,d,.18),(front-.015,0,z),frame)
for y in [-24.7,-18.7,-12.7,-6.7,-.7,5.3,11.3,17.3,23.3]:
    height=3.05 if y==-12.7 else 6.05
    box('Facade structural post',(.20,.17,height),(front-.03,y,6.525-height/2),frame)
def glazed_bay(y,z,width,height):
    box('Window dark recess',(.035,width+.15,height+.15),(front-.025,y,z),frame)
    box('Window glazing',(.03,width,height),(front-.055,y,z),glass)
    for yy in np.linspace(y-width/2,y+width/2,5):box('Window timber mullion',(.11,.065,height+.10),(front-.11,float(yy),z),frame)
    for zz in [z-height/2,z+height/2]:box('Window sill and lintel',(.15,width+.22,.10),(front-.13,y,zz),frame)
    for yy in [y-width*.35,y+width*.35]:box('Curtain panel',(.012,width*.19,height-.12),(front-.072,yy,z),cream)
for y in [-22,-16,-10,-4,2,8,14,20]:
    glazed_bay(y,4.9,4.5,1.75)
    if y<8 and y!=-16:
        box('Lower screen recess',(.045,4.75,1.15),(front-.04,y,1.78),glass)
        for yy in np.arange(y-2.3,y+2.3,.18):box('Lower vertical screen',(.12,.07,1.2),(front-.11,float(yy),1.78),frame)
for y in [-18,-6,6]:
    box('Balcony shelf',(.86,9.2,.15),(front-.42,y,3.83),cedar)
    for z in [3.96,4.67]:box('Balcony rail',(.13,9.2,.13),(front-.83,y,z),frame)
    for yy in np.arange(y-4.5,y+4.6,.55):box('Balcony upright',(.12,.10,.77),(front-.83,float(yy),4.28),frame)
# Low continuous metal roof, ridge, gutters, and snow stops.
half=15.135/2;rise=2.25;base=6.75
for side in [-1,1]:
    slope=math.atan2(rise,half)
    box('Standing seam roof',(math.hypot(half,rise),54.613,.14),(side*half/2,0,base+rise/2),metal,(0,side*slope,0))
    for y in np.arange(-27.1,27.2,.85):beam('Roof seam',(0,float(y),base+rise+.09),(side*half,float(y),base+.09),.035,metal)
    box('Long eave gutter',(.16,54.6,.15),(side*(half-.05),0,base-.08),metal)
    for y in np.arange(-25,26,3):box('Snow stop',(.12,1.8,.12),(side*(half-1),float(y),base+rise/half+.13),metal)
box('Folded ridge cap',(.23,54.6,.14),(0,0,9.05),metal)
for side in [-1,1]:
    y=side*d/2;mesh('Unverified end gable',[(-w/2,y,6.45),(w/2,y,6.45),(0,y,8.94)],[(0,1,2) if side<0 else (2,1,0)],cedar)
for y in [-25,0,24]:box('Downpipe',(.12,.12,6.2),(front-.48,y,3.3),metal)
# Entrance glazing, lattice doors, handles, canopy, three separately folded fabric panels.
entry=-14  # Blender +Y exports as runtime -Z; entrance is runtime local +14.
building_root=current
for y in [entry-1.16,entry+1.16]:
    current=bpy.data.objects.new('Onsen sliding leaf',None);scene.collection.objects.link(current);current.parent=building_root
    current['onsenDoorSide']=-1 if y<entry else 1
    box('Sliding door glazing',(.05,2.13,2.46),(front-.12,y,1.69),glass)
    for yy in np.arange(y-1.03,y+1.04,.16):box('Door lattice stile',(.11,.046,2.51),(front-.20,float(yy),1.7),cedar)
    for z in [.43,1.4,2.93]:box('Door horizontal frame',(.13,2.21,.08),(front-.22,y,z),cedar)
    box('Door handle',(.16,.05,.36),(front-.30,y+(.85 if y<entry else -.85),1.52),brass)
current=building_root
box('Entrance canopy',(2.9,6.5,.16),(front-1.20,entry,3.4),metal,(0,-.12,0))
for y in [entry-2.8,entry+2.8]:
    box('Porch granite shoe',(.38,.38,.32),(front-2.15,y,.16),stone)
    box('Porch post',(.22,.22,2.9),(front-2.15,y,1.75),cedar)
    beam('Porch brace',(front-2.15,y,2.7),(front-.5,y,3.27),.15,frame)
box('Entrance sign',( .17,2.75,.48),(front-.27,entry,3.0),sign)
for k in [-1,0,1]:
    verts=[]
    for row in [0,1]:
        for j in range(13):
            yy=entry+k*.87-.4+j*.8/12
            verts.append((front-.40-.045*math.sin(j*math.pi*.7),yy,2.88-row*1.03+.025*math.sin(j)))
    o=mesh('Split indigo noren',verts,[(i,i+1,i+14,i+13) for i in range(12)],linen)
    for uv in o.data.uv_layers.active.data:uv.uv*=8
    solid=o.modifiers.new('Cloth thickness','SOLIDIFY');solid.thickness=.012
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
box('Entrance bench',( .62,2.0,.12),(front-1.0,entry-4.4,.48),cedar)
for y in [entry-5.1,entry-3.7]:box('Bench foot',(.45,.16,.44),(front-1.0,y,.22),frame)
# Nine shared material groups; don't export thousands of independently drawn boards.
for leaf in [o for o in current.children if 'onsenDoorSide' in o]:
    for mat in [cedar,glass,brass]:
        objects=[o for o in leaf.children if o.type=='MESH' and o.data.materials[0]==mat]
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
for mat in [cedar,glass,metal,linen,cream,brass,sign,stone,frame]:
    objects=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat]
    if not objects:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    objects[0].name='onsen_'+mat.name
bpy.ops.object.select_all(action='DESELECT');current.select_set(True)
for child in current.children_recursive:child.select_set(True)
output=ROOT/'public/models/ogimachi/onsen.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'B004-onsen.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'model':'onsen','bytes':output.stat().st_size,'meshes':len(current.children)}))
