"""Wada precinct: documented main dimensions, observed north gable and open sheds.
Heights/window spacing are photo estimates, not a measured conservation model.
Uses the existing UV/PBR authoring helpers; preserves every pre-existing scene.
"""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
scene.name='Ogimachi_Wada_Precinct';scene['codex_authored']='ogimachi-north-v1'
white=material('Wada white mineral infill',(.69,.68,.62));black=material('Wada black lime plaster',(.07,.065,.055))
def root(name):
    global current
    current=bpy.data.objects.new(name,None);current['archetype']=name;scene.collection.objects.link(current);models.append(current)
def gable(w,d,base,rise):
    for sign in [-1,1]:
        y=sign*d/2
        mesh('Weathered gable boards',[(-w/2,y,base),(w/2,y,base),(0,y,base+rise)],[(0,1,2) if sign<0 else (2,1,0)],wood)
        beam('Gable rake left',(-w/2,y,base),(0,y,base+rise),.2)
        beam('Gable rake right',(w/2,y,base),(0,y,base+rise),.2)
root('wada-main');w,d=12.8,22.3;base=3.5;rise=8.8
current['body_width_m']=w;current['body_depth_m']=d;current['dimensions_source']='https://online.bunka.go.jp/heritages/detail/188943'
box('Stone plinth',(w,d,.38),(0,0,.19),stone)
box('Black plaster ground storey',(w,d,3.12),(0,0,1.94),black)
for x in [-w/2,w/2]:
    box('White lime base strip',(.075,d,.62),(x,0,.75),white)
    for y in np.arange(-d/2,d/2+.1,1.85):box('Side structural post',(.19,.18,3.25),(x,float(y),1.92),frame)
    for y in np.arange(-d/2+1.2,d/2,2.75):
        # West facade uses inset shoji between timber bays.
        box('Side white sliding panel',(.055,2.2,1.7),(x*1.007,float(y),2.05),white)
        for dy in [-1.1,0,1.1]:box('Panel stile',(.085,.06,1.75),(x*1.014,float(y)+dy,2.05),frame)
for sign in [-1,1]:
    y=sign*d/2
    box('Ground gable white base',(w,.08,.6),(0,y,.74),white)
    for x in np.arange(-4.5,4.6,1.5):window(float(x),y+sign*.12,2.05,1.30,1.7)
gable(w,d,base,rise)
roof(w+2.2,d+1.8,base+.15,rise,thatch,.75)
for sign in [-1,1]:
    y=sign*(d/2+.09)
    for x in [-3.6,-1.8,0,1.8,3.6]:
        box('First attic shoji',(1.62,.05,1.65),(x,y,5.0),white)
        box('Attic sash',(1.65,.08,.065),(x,y+sign*.035,5),frame)
    for x in [-2.5,0,2.5]:
        box('Upper attic shoji',(1.55 if x==0 else .8,.06,1.7 if x==0 else 1.1),(x,y,7.65),white)
    for z,span in [(4.05,11.2),(5.92,8.7),(6.45,7.7),(8.8,4.3)]:box('Attic floor belt',(span,.17,.17),(0,y,z),frame)
    box('King post',(.20,.19,8.3),(0,y,7.6),frame)
# West-facing formal entrance (local negative X); lower continuous eave.
for x in [-1,1]:
    box('Lower side eave',(1.7,d+1,.16),(x*(w/2+.6),0,3.05),tile,(0,x*.2,0))
box('Formal entry platform',(2.6,4.1,.32),(-w/2-1.2,-3,.45),wood)
box('Entry canopy',(3.2,4.6,.22),(-w/2-1.25,-3,3.24),tile,(0,-.1,0))
for y in [-4.8,-1.2]:box('Formal entry post',(.19,.19,2.75),(-w/2-2.35,y,1.9),frame)
for i in range(3):box('Entry granite step',(1.2,3.8,.15),(-w/2-2.7-i*.30,-3,.3-i*.075),stone)

for name,w,d,metal in [('wada-itakura',6.5,10.2,False),('wada-hasagoya',7.5,9.5,True)]:
    root(name);base=3.8 if metal else 2.6;rise=2.3 if metal else 4.6
    for x in [-w/2,w/2]:
        for y in np.linspace(-d/2,d/2,6):
            box('Individual foundation stone',(.55,.55,.22),(x,float(y),.11),stone)
            box('Open frame post',(.22,.22,base),(x,float(y),base/2+.2),frame)
        for z in [.8,1.45,2.1,2.75]:box('Rice drying horizontal rail',(.13,d+.4,.14),(x,0,z),wood)
    for y in [-d/2,d/2]:
        for z in [.8,1.45,2.1]:box('Open gable drying rail',(w+.3,.13,.14),(0,y,z),wood)
        for x in [-1,1]:beam('Exposed gable rafter',(x*w/2,y,base),(0,y,base+rise),.19)
    if not metal:
        box('Inset raised board granary',(w-1.8,d-2.0,1.95),(0,0,1.55),wood)
        for y in [-d/2+1,d/2-1]:
            for x in np.arange(-w/2+.9,w/2-.8,.38):box('Granary board joint',(.045,.06,1.95),(float(x),y,1.55),frame)
    roof(w+1.5,d+1.3,base,rise,tile if metal else thatch,.13 if metal else .5)

for obj in models:
    for mat in [wood,thatch,frame,paper,stone,tile,plaster,white,black]:
        parts=[o for o in obj.children if o.type=='MESH' and o.data.materials[0]==mat]
        if len(parts)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for p in parts:p.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join()
bpy.ops.object.select_all(action='DESELECT')
for obj in models:
    obj.select_set(True)
    for child in obj.children:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi/wada-precinct.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
for i,obj in enumerate(models):obj.location.x=i*32
bpy.data.libraries.write(str(OUT/'wada-precinct.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'scene':scene.name,'models':[o.name for o in models]}))
