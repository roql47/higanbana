"""B002: observed Irori restaurant entrance and adjacent shop, independent mapped roots.
Facade details are photo based; heights, rear walls and footprint identity remain estimates.
"""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
scene.name='Ogimachi_B002_Irori';scene['codex_authored']='B002-irori-pair'
glass=material('Irori recessed glazing',(.13,.16,.14),.3)
white=material('Irori pale shoji',(.68,.67,.59));cloth=material('Irori dusty red noren',(.30,.12,.13));metal=material('Irori weathered canopy',(.17,.19,.18))
cream=material('Irori cream paper lamps',(.67,.61,.42));red=material('Irori red sarubobo cloth',(.39,.055,.04));ceramic=material('Irori pottery charcoal',(.11,.095,.075));leaf=material('Irori garden leaves',(.13,.24,.065))
def root(name,osm):
    global current
    current=bpy.data.objects.new(name,None);current['archetype']=name;current['osm_id']=osm;current['review_id']='B002';scene.collection.objects.link(current);models.append(current)
def sphere(name,position,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=position);o=bpy.context.object;o.name=name;o.scale=scale;o.parent=current;o.data.materials.append(mat);return o
def cylinder(name,position,radius,depth,mat,rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=radius,depth=depth,location=position);o=bpy.context.object;o.name=name;o.parent=current;o.data.materials.append(mat)
    if rotation:o.rotation_euler=rotation
    return o
def shell(w,d,wall,rw,rd,rise):
    box('Individual stone foundation',(w,d,.22),(0,0,.11),stone)
    box('Aged timber shell',(w,d,wall-.22),(0,0,(wall+.22)/2),wood)
    roof(rw,rd,wall+.58,rise,thatch,.66)
    for sign in [-1,1]:
        y=sign*d/2
        mesh('Boarded gable',[(-w/2,y,wall),(w/2,y,wall),(0,y,wall+.58+rise)],[(0,1,2) if sign<0 else (2,1,0)],wood)
        beam('Gable rake',(-w/2,y,wall),(0,y,wall+.58+rise),.14)
        beam('Gable rake',(w/2,y,wall),(0,y,wall+.58+rise),.14)
    for x in [-w/2,w/2]:
        for y in np.linspace(-d/2,d/2,6):box('Timber bay post',(.16,.16,wall),(x,float(y),wall/2),frame)
    for y in [-d/2,d/2]:box('Eave timber belt',(w,.18,.17),(0,y,wall-.1),frame)
def side_window(x,y,width=1.6):
    box('Recessed side glazing',(.065,width,1.65),(x,y,1.6),glass)
    for z in [.78,1.32,1.89,2.43]:box('Side sash cross rail',(.10,width+.04,.055),(x-.035,y,z),wood)
    for yy in np.linspace(y-width/2,y+width/2,9):box('Side lattice stile',(.10,.03,1.65),(x-.04,float(yy),1.60),frame)
    box('Boarded lower window bay',(.08,width,.55),(x,y,.43),wood)
root('irori-restaurant',236248710);current['roof_envelope_m']=[10.386,13.514]
w,d=8.7,11.9;shell(w,d,3.4,10.386,13.514,6.0)
for y in [-4.6,-2.8,2.7,4.5]:side_window(-w/2-.06,y,1.55)
# Recessed lattice sliding entrance, slab sign, twin vertical paper lanterns.
box('Entrance dark recess',(.15,2.0,2.45),(-w/2-.08,0,1.40),frame)
for y in [-.99,-.50,0,.50,.99]:box('Entrance door upright',(.10,.055,2.28),(-w/2-.18,y,1.35),wood)
for z in [.3,1.0,1.70,2.42]:box('Entrance sliding sash rail',(.10,2.02,.065),(-w/2-.19,0,z),wood)
for y in np.linspace(-.95,.95,15):box('Door lower fine lattice',(.07,.023,.85),(-w/2-.21,float(y),.74),frame)
box('Pale weathered door lintel',(.22,2.3,.21),(-w/2-.16,0,2.62),cream)
box('Irregular slab shop sign',(.13,1.85,.67),(-w/2-.14,0,3.04),wood)
for y in [-1.32,1.32]:
    box('Vertical lantern paper core',(.18,.30,.77),(-w/2-.30,y,3.03),cream)
    for yy in [-.15,0,.15]:box('Lantern timber vertical rail',(.05,.035,.83),(-w/2-.42,y+yy,3.03),frame)
    for z in [2.63,3.43]:box('Lantern timber cap',(.26,.38,.055),(-w/2-.30,y,z),frame)
box('Entrance stone threshold',(1.1,2.25,.12),(-w/2-.58,0,.12),stone)
box('Small menu holder',(.35,.55,.64),(-w/2-.38,1.30,1.60),wood)
box('Umbrella stand lower rack',(.6,1.15,.075),(-w/2-.60,2.0,.24),frame)
for y in [1.43,2.57]:box('Umbrella rack leg',(.06,.06,.95),(-w/2-.83,y,.53),frame)
box('Umbrella stand top frame',(.6,1.15,.045),(-w/2-.60,2.0,1.00),frame)
# A compact stone lantern and tanuki-shaped pottery, observed beside the door.
x,y=-w/2-.72,-1.65
cylinder('Stone lantern base',(x,y,.16),.38,.28,stone);cylinder('Stone lantern pedestal',(x,y,.64),.12,.8,stone)
box('Stone lantern chamber',(.44,.44,.36),(x,y,1.18),stone)
box('Stone lantern dark window',(.025,.22,.21),(x-.235,y,1.18),frame)
mesh('Stone lantern flared cap',[(x+a,y+b,z) for z,span in [(1.35,.52),(1.58,.19)] for a,b in [(-span,-span),(span,-span),(span,span),(-span,span)]],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],stone)
sphere('Stone lantern finial',(x,y,1.69),(.11,.11,.18),stone)
x,y=-w/2-.55,-1.01
sphere('Tanuki pottery body',(x,y,.58),(.29,.27,.49),ceramic);sphere('Tanuki cream belly',(x-.24,y,.56),(.05,.19,.26),cream)
sphere('Tanuki head',(x,y,1.12),(.25,.24,.25),ceramic);sphere('Tanuki muzzle',(x-.21,y,1.05),(.13,.15,.09),cream)
for yy in [-.09,.09]:sphere('Tanuki eye',(x-.225,y+yy,1.18),(.025,.027,.03),white)
sphere('Tanuki straw hat',(x,y,1.32),(.36,.34,.10),wood)
for i in range(6):
    x=-w/2-.65-(i%2)*.45;y=-2.55-(i//2)*.6
    cylinder('Garden pot',(x,y,.17),.17,.33,ceramic)
    for j in range(5):
        a=j*math.pi*.4;sphere('Garden plant leaf',(x+math.cos(a)*.18,y+math.sin(a)*.18,.5+(j%2)*.13),(.06,.07,.30),leaf)

root('irori-shop',236248704);current['roof_envelope_m']=[8.769,10.526]
w,d=7.1,8.85;shell(w,d,3.5,8.769,10.526,7.0)
# Visible south gable: broad lattice row below a narrower pair of white attic panels.
y=-d/2-.06
for x in [-1.95,0,1.95]:
    box('Lower attic shoji',(1.65,.045,1.65),(x,y,4.60),white)
    for xx in np.linspace(x-.82,x+.82,9):box('Attic close lattice',(.025,.08,1.68),(float(xx),y-.03,4.60),frame)
    for z in [3.8,4.35,4.9,5.42]:box('Attic horizontal sash',(1.70,.08,.04),(x,y-.05,z),frame)
for x in [-.72,.72]:box('Upper attic pale panel',(1.23,.05,1.55),(x,y,6.82),white)
for z,span in [(3.65,7.0),(5.58,5.8),(7.68,3.2)]:box('Attic structural cross beam',(span,.15,.15),(0,y-.03,z),frame)
box('Attic king post',(.17,.18,6.8),(0,y-.035,6.85),frame)
# Low metal canopy wraps the shop's west side and south gable.
box('South canopy',(8.4,1.50,.13),(0,-d/2-.58,3.16),metal,(-.10,0,0))
box('West canopy',(1.35,d+1.3,.13),(-w/2-.52,-.1,3.16),metal,(0,-.10,0))
for x,y in [(-4.05,-5.4),(3.7,-5.4),(-4.05,3.85)]:box('Porch support post',(.17,.17,3.05),(x,y,1.53),wood)
for yy in [-2.8,0,2.8]:side_window(-w/2-.08,yy,1.5)
box('Shop west entrance',(.09,1.5,2.40),(-w/2-.12,.1,1.37),glass)
box('West hanging shop board',(.13,1.70,.68),(-w/2-.20,.1,2.68),wood)
# South serving window and projecting wooden counter, with fabric valance.
box('Serving opening',(4.9,.08,1.30),(-.35,-d/2-.05,1.86),glass)
box('Serving counter',(5.0,.78,.14),(-.35,-d/2-.38,1.18),wood)
for x in [-2.65,-1.3,0,1.3,2.1]:box('Serving window sash',(.07,.10,1.35),(x,-d/2-.10,1.86),frame)
for i in range(5):
    box('Separate red noren strip',(.64,.024,.50),(-1.95+i*.67,-d/2-.28,2.47),cloth,(.04,0,0))
# Two wagon wheels above the serving window, as seen on the shop's front.
for x in [-1.65,1.1]:
    center=(x,-d/2-.20,2.92)
    bpy.ops.mesh.primitive_torus_add(major_radius=.44,minor_radius=.035,major_segments=24,minor_segments=6,location=center,rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='Shop wagon wheel sign';o.parent=current;o.data.materials.append(wood)
    for j in range(10):
        a=j*math.pi/5;beam('Wheel spoke',center,(x+math.cos(a)*.43,-d/2-.20,2.92+math.sin(a)*.43),.026,wood)
box('Upright drinks refrigerator',(.67,.59,1.83),(2.92,-d/2-.28,1.0),metal)
box('Fridge glass display',(.51,.02,1.46),(2.92,-d/2-.59,1.09),glass)
for row in range(4):
    for col in range(4):box('Drinks behind glass',(.075,.028,.14),(2.74+col*.115,-d/2-.61,.57+row*.29),white if col%2 else leaf)
for x,y,length in [(-1.25,-5.12,1.9),(-4.0,2.35,1.5)]:
    box('Shop bench seat',(length,.46,.09),(x,y,.43),wood)
    for xx in [-length*.35,length*.35]:box('Shop bench foot',(.12,.37,.38),(x+xx,y,.20),frame)
for x in [-1.9,-.9]:
    sphere('Sarubobo red body',(x,-5.05,.76),(.17,.13,.24),red);sphere('Sarubobo black head',(x,-5.05,1.02),(.18,.15,.17),frame)
    for sign in [-1,1]:beam('Sarubobo outstretched arm',(x,-5.05,.80),(x+sign*.23,-5.03,.72),.1,red)
for obj in models:
    for mat in [wood,thatch,frame,stone,glass,white,cloth,metal,cream,red,ceramic,leaf]:
        objects=[o for o in obj.children if o.type=='MESH' and o.data.materials[0]==mat]
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        objects[0].name=obj.name+'_'+mat.name
bpy.ops.object.select_all(action='DESELECT')
for obj in models:
    obj.select_set(True)
    for child in obj.children:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi/irori.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
for i,obj in enumerate(models):obj.location.x=i*20
bpy.data.libraries.write(str(OUT/'B002-irori.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'models':[o.name for o in models],'bytes':(ROOT/'public/models/ogimachi/irori.glb').stat().st_size}))
