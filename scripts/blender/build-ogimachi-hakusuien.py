"""B001 Hakusuien: individually authored observed street facade.
Roof envelope is mapped; wall/eave heights and unseen gables remain estimates.
"""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
scene.name='Ogimachi_B001_Hakusuien';scene['codex_authored']='B001-observed-street-facade'
current=bpy.data.objects.new('hakusuien',None);current['archetype']='hakusuien';current['osm_id']=236248693;current['review_id']='B001';current['front_local']='-X';current['roof_envelope_m']=[11.894,19.555];scene.collection.objects.link(current);models.append(current)
w,d=10.0,17.85;base=3.05;rise=7.45
linen=material('Hakusuien muted purple linen',(.205,.105,.205));glass=material('Hakusuien dark recessed glazing',(.12,.15,.135),.27)
frosted=material('Hakusuien cloudy sliding glazing',(.30,.33,.30),.62)
lightwood=surface('Hakusuien warm cedar infill','textures/minka/weathered-cedar-diff-1k.webp','textures/minka/weathered-cedar-nor-gl-1k.webp',.4)
chalk=material('Weathered sign lettering',(.72,.70,.57));reedend=material('Weathered cut reed ends',(.23,.19,.135))
box('Rubble footing',(w,d,.22),(0,0,.11),stone)
box('Timber shell',(w,d,base-.22),(0,0,(base+.22)/2),wood)
# Long west facade: individual bays with opaque lower boards and recessed lattice.
for y in [-7.5,-5.25,-3.0,3.0,5.25,7.5]:
    box('Recessed dark window',(.08,1.95,1.5),(-w/2-.045,y,1.92),glass)
    box('Lower cedar shutter',(.1,1.95,.8),(-w/2-.07,y,.73),lightwood)
    # The photograph shows a cloudy sliding panel to the viewer's right of
    # the entrance, alongside the dark lattice. Local negative Y is right.
    cloudy=y==-5.25
    if cloudy:box('Cloudy sliding pane',(.025,1.83,1.38),(-w/2-.095,y,1.92),frosted)
    for offset in np.linspace(-.97,.97,3 if cloudy else 9):box('Fine vertical lattice',(.10,.033,1.52),(-w/2-.105,y+float(offset),1.92),frame)
    for z in ([1.17,2.67] if cloudy else [1.17,1.92,2.67]):box('Window horizontal rail',(.12,2.06,.045),(-w/2-.12,y,z),frame)
    for offset in np.linspace(-.91,.91,8):box('Lower shutter board joint',(.014,.015,.74),(-w/2-.128,y+float(offset),.73),frame)
    box('Sliding window meeting stile',(.14,.055,1.55),(-w/2-.14,y,1.92),frame)
for y in np.arange(-d/2,d/2+.1,2.23):box('Aged facade post',(.20,.18,base-.05),(-w/2-.12,float(y),base/2),frame)
for z in [.32,1.1,2.75,2.98]:
    if z>=2.75:box('Continuous facade header',(.2,d+.1,.14),(-w/2-.11,0,z),frame)
    else:
        for side in [-1,1]:box('Facade sill clear of doorway',(.2,d/2-1.35,.14),(-w/2-.11,side*(d/2+1.35)/2,z),frame)
# A dark opening and three folded noren panels; reference photo is not used as a texture.
box('Entrance dark opening',(.14,2.55,2.58),(-w/2-.13,0,1.51),frame)
for y in [-1.3,1.3]:box('Entrance jamb',(.22,.18,2.76),(-w/2-.18,y,1.52),lightwood)
for y in [-1.06,1.06]:
    box('Entrance side glazing',(.04,.32,2.28),(-w/2-.23,y,1.43),glass)
    for offset in [-.17,0,.17]:box('Entrance sliding side stile',(.08,.032,2.30),(-w/2-.27,y+offset,1.43),frame)
    for z in [.3,1.28,2.56]:box('Entrance sliding side rail',(.08,.37,.055),(-w/2-.27,y,z),frame)
box('Noren hanging bar',(.07,2.75,.08),(-w/2-.42,0,2.72),frame)
for panel in range(3):
    verts=[];faces=[];center=-.89+panel*.89
    for row in range(9):
        for col in range(13):
            yy=center-.415+.83*col/12;zz=2.65-row*.108
            xx=-w/2-.43-.025*math.sin(col*math.pi*.5)-.055*(row/8)**2
            verts.append((xx,yy,zz))
    for row in range(8):
        for col in range(12):
            i=row*13+col;faces.append((i,i+13,i+14,i+1))
    cloth=mesh('Folded purple noren panel',verts,faces,linen)
    for p in cloth.data.polygons:p.use_smooth=True
    solid=cloth.modifiers.new('Cloth thickness','SOLIDIFY');solid.thickness=.008
box('Entrance threshold',(1.15,2.7,.15),(-w/2-.6,0,.12),stone)
# Three low slatted benches beneath the eaves, with exposed feet.
for y,length in [(-6.6,2.4),(4.8,2.0),(7.0,1.6)]:
    for x in [-w/2-.57,-w/2-.76,-w/2-.95]:box('Bench seat slat',(.15,length,.07),(x,y,.43),lightwood)
    for yy in [y-length*.37,y+length*.37]:box('Bench foot',(.5,.12,.36),(-w/2-.75,yy,.21),frame)
# Irregular standing wood sign adjacent to the door. Plain authored lettering is
# added in the preview, so it remains readable without baking someone else's sign artwork.
ys=[1.9,2.4,2.65,2.53,2.75,2.62,2.35,2.0,1.84,1.95];zs=[.12,.12,.45,1.0,1.50,1.94,2.08,1.85,1.30,.60]
verts=[(x,-y,z) for x in [-w/2-.57,-w/2-.35] for y,z in zip(ys,zs)];N=len(ys)
faces=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
mesh('Live edge standing timber sign',verts,faces,lightwood)
box('Chalk menu board',(.09,.62,.96),(-w/2-.95,1.85,.64),frame,(0,-.1,0))
for z in np.arange(.32,1.0,.1):box('Menu chalk line',(.006,.42,.015),(-w/2-1.004,1.85,float(z)),chalk)
# Closed gables are deliberately neutral until their photographs are reviewed.
for sign in [-1,1]:
    y=sign*d/2
    mesh('Unverified boarded gable',[(-w/2,y,base),(w/2,y,base),(0,y,base+rise)],[(0,1,2) if sign<0 else (2,1,0)],wood)
    beam('Gable rake',(-w/2,y,base),(0,y,base+rise),.16)
    beam('Gable rake',(w/2,y,base),(0,y,base+rise),.16)
    for z,span in [(3.1,9.8),(5.25,6.8),(7.25,4.1)]:box('Gable timber belt',(span,.12,.14),(0,y,z),frame)
roofBase=3.73;roofRise=6.82
roof(11.894,19.555,roofBase,roofRise,thatch,.78)
# Roof pegs visible near the upper third of the street-facing reed slope.
for y in np.linspace(-7.7,7.7,9):
    x=-1.8;z=roofBase+roofRise*(1-abs(x)/(11.894/2))
    beam('Thatch retaining peg',(x,float(y),z-.1),(x-.26,float(y),z+.32),.085,wood)
    box('Peg crosspiece',(.13,.40,.08),(x-.23,float(y),z+.27),wood)
# Small uneven cut bundles make the eave thickness read geometrically close up.
for side in [-1,1]:
    for i in range(130):
        y=-9.73+i*19.46/129;length=.075+.05*(math.sin(i*2.31)+1)
        box('Cut reed eave bundle',(.13,.085,length),(side*5.94,y,roofBase-.59-length/2),reedend)
for y in np.arange(-8.6,8.7,.72):
    x=-w/2-.15;z=.12
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,float(y),z));o=bpy.context.object;o.name='Irregular exposed footing stone';o.scale=(.25,.34,.21);o.parent=current;o.data.materials.append(stone)
# Merge by material for the game, keeping the building as one individually authored root.
for mat in [wood,thatch,frame,stone,lightwood,linen,glass,frosted,chalk,reedend]:
    objects=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat]
    if not objects:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
        if o.modifiers:
            bpy.context.view_layer.objects.active=o
            for modifier in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    objects[0].name='B001_'+mat.name
bpy.ops.object.select_all(action='DESELECT');current.select_set(True)
for o in current.children:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi/hakusuien.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'B001-hakusuien.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'scene':scene.name,'model':current.name,'review':'B001','bytes':(ROOT/'public/models/ogimachi/hakusuien.glb').stat().st_size}))
