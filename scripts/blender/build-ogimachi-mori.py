"""B003 Mori no Densho Juku: east facade observed in August 2010 Street View.
OSM roof envelope retained. Roof pitch, rear elevation and exact heights are estimates.
"""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
scene.name='Ogimachi_B003_Mori';scene['codex_authored']='B003-observed-east-facade-2010'
current=bpy.data.objects.new('mori-workshop',None);scene.collection.objects.link(current);models.append(current)
current['archetype']='mori-workshop';current['osm_id']=236248644;current['review_id']='B003';current['front_local']='+X';current['roof_envelope_m']=[11.42,14.274];current['reference_date']='2010-08'
cedar=surface('Mori weathered grey brown cedar','textures/minka/weathered-cedar-diff-1k.webp','textures/minka/weathered-cedar-nor-gl-1k.webp',.35)
glazing=material('Mori smoky glazing',(.19,.235,.225),.36)
aluminium=material('Mori aged aluminium sash',(.43,.46,.43),.48)
pink=material('Mori faded rose curtains',(.51,.35,.38))
ivory=material('Mori upstairs cream curtains',(.64,.61,.52))
roofmetal=material('Mori charcoal sheet roof',(.115,.13,.13),.77)
signwood=material('Mori pale live edge sign',(.64,.51,.30))
wicker=material('Mori split maple basket strips',(.45,.30,.14))
green=material('Mori potted foliage',(.14,.24,.07));flower=material('Mori magenta flowers',(.47,.07,.20));blue=material('Mori blue water tub',(.055,.23,.34))
def ball(name,loc,scale,mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.parent=current;o.data.materials.append(mat)
def tube(name,a,b,r,mat):
    a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=(b-a).length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.parent=current;o.data.materials.append(mat)
def curtain(y,z,width,height,mat,x=4.975):
    verts=[]
    for row in range(2):
        for col in range(19):verts.append((x+.038*math.sin(col*math.pi*.66),y-width/2+width*col/18,z+height/2-row*height+.025*math.sin(col)))
    return mesh('Folded fabric curtain',verts,[(i,i+19,i+20,i+1) for i in range(18)],mat)
def sash(y,z,width,height,mat=aluminium,x=5.0,divisions=2):
    box('Recess behind window',(.035,width,height),(x-.16,y,z),glazing)
    for yy in np.linspace(y-width/2,y+width/2,divisions+1):box('Window vertical sash',(.08,.045,height+.08),(x,float(yy),z),mat)
    for zz in [z-height/2,z+height/2]:box('Window sash rail',(.08,width+.06,.055),(x,y,zz),mat)
def basket(x,y,z,r=.17,h=.23):
    # Woven strip geometry, not a solid sphere or a photograph.
    for k in range(7):
        zz=z+k*h/6;rr=r*(.70+.30*k/6)
        for j in range(20):
            a=j*math.tau/20;b=(j+1)*math.tau/20
            beam('Basket horizontal weave',(x+rr*math.cos(a),y+rr*math.sin(a),zz),(x+rr*math.cos(b),y+rr*math.sin(b),zz),.015,wicker)
    for j in range(16):
        a=j*math.tau/16;beam('Basket upright strip',(x+r*.70*math.cos(a),y+r*.70*math.sin(a),z),(x+r*math.cos(a),y+r*math.sin(a),z+h),.012,wicker)
    for j in range(12):
        a=j*math.pi/12;b=(j+1)*math.pi/12
        beam('Basket curved handle',(x,y+math.cos(a)*r,z+h+math.sin(a)*r),(x,y+math.cos(b)*r,z+h+math.sin(b)*r),.018,wicker)

# Main two-storey timber body; the east wall has distinct bays, not repeated merchant glazing.
box('Stone footing',(9.8,12.6,.24),(0,0,.12),stone)
box('Rear and core volume',(9.55,12.6,6.0),(-.125,0,3.24),cedar)
for y in [-6.3,-3.8,-1.15,1.40,3.70,6.3]:box('East facade post',(.19,.16,6.0),(4.91,y,3.23),frame)
for z in [.30,2.62,3.20,3.72,6.18]:box('East continuous timber rail',(.18,12.6,.17),(4.96,0,z),frame)
for y,width in [(-5.05,2.28),(-2.52,2.38),(.10,2.35),(2.53,2.08)]:
    sash(y,4.86,width,1.54,frame,divisions=3)
    if y> -3:curtain(y,4.82,width-.16,1.36,ivory,x=4.92)
    box('Upper narrow-board apron',(.10,width,.62),(4.96,y,3.98),cedar)
    for yy in np.arange(y-width/2,y+width/2,.11):box('Upper apron vertical board seam',(.012,.012,.61),(5.015,float(yy),3.98),frame)
# Left utility windows are frosted and have broad metal frames.
for y in [-5.05,-2.65]:
    sash(y,1.32,2.22,1.75,divisions=2);sash(y,2.65,2.22,.60,divisions=2)
# Central entry: exposed display recess, pulled-back rose curtains and timber threshold.
box('Entry recessed background',(.03,2.5,2.12),(4.72,.0,1.40),frame)
for yy in [-1.23,1.23]:curtain(yy,1.46,.53,2.10,pink,x=4.99)
for yy in [-1.52,-.54,.52,1.51]:box('Entrance sliding door stile',(.11,.047,2.23),(5.045,yy,1.40),cedar)
for z in [.32,2.49]:box('Entry door rail',(.11,3.08,.08),(5.045,0,z),cedar)
for y in [-.75,.75]:
    sash(y,2.91,1.38,.42,frame,divisions=8)
    for zz in [2.79,2.87,2.95,3.03]:box('Fine transom lattice',(.09,1.40,.023),(5.015,y,zz),frame)
box('Workshop stone threshold',(.67,3.12,.12),(5.12,0,.20),stone)
for z in [.65,1.28]:
    box('Craft display shelf',(.34,1.43,.06),(4.92,0,z),cedar)
    for yy in [-.44,0,.44]:basket(4.95,yy,z+.035,.15,.22)
sash(2.62,1.43,1.90,1.97,divisions=2);sash(2.62,2.82,1.90,.60,divisions=3)
curtain(3.31,1.56,.32,1.68,pink)
# Pale uneven-edged sign matching the photographed placement; lettering is runtime-authored.
outline=[(-1.40,3.40),(-1.48,3.70),(-1.34,4.08),(-.72,4.03),(-.2,4.09),(.38,3.99),(1.40,4.06),(1.51,3.49),(.86,3.40),(.28,3.48),(-.65,3.36)]
n=len(outline);verts=[(x,y,z) for x in [5.08,5.19] for y,z in outline]
mesh('Live edge workshop sign',verts,[tuple(range(n)),tuple(range(2*n-1,n-1,-1))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],signwood)
# Right/north projecting bay: boarded wall, tall curtained window and a shallow guard rail.
box('North projecting two storey bay',(.18,2.47,6.23),(4.91,5.02,3.35),cedar)
for yy in [3.785,6.255]:box('North projecting corner post',(.18,.14,6.23),(5.18,yy,3.35),frame)
sash(5.02,1.44,2.0,1.83,x=5.21);sash(5.02,4.93,1.95,1.70,frame,x=5.21)
curtain(5.35,4.95,.92,1.52,ivory,x=5.15)
for yy in np.arange(4.06,6.05,.16):box('North upper window guard spindle',(.06,.04,.65),(5.37,float(yy),4.54),frame)
for zz in [4.21,4.89]:box('North upper window guard rail',(.07,2.10,.065),(5.37,5.02,zz),frame)
for zz in [2.65,2.93,3.21,3.49,3.77]:box('North horizontal weatherboard',(.08,2.43,.22),(5.205,5.02,zz),cedar)
# Low-pitch metal roof and its raised north end; rear roof profile is estimated.
for side in [-1,1]:box('Sheet metal roof plane',(math.hypot(5.71,2.05),14.274,.12),(side*5.71/2,0,7.385),roofmetal,(0,side*math.atan2(2.05,5.71),0))
box('Folded metal ridge cap',(.23,14.274,.10),(0,0,8.45),roofmetal)
box('Raised projecting bay roof',(2.32,2.85,.12),(4.50,5.14,6.69),roofmetal,(0,.10,0))
for y in np.arange(-6.96,7.0,.56):
    for side in [-1,1]:beam('Roof standing seam',(0,float(y),8.51),(side*5.71,float(y),6.47),.035,roofmetal)
for yy in np.arange(-6.25,6.3,.65):beam('Exposed eave rafter',(4.0,float(yy),6.22),(5.62,float(yy),6.25),.095,frame)
for x in [-5.64,5.64]:tube('Long eave gutter',(x,-7.05,6.28),(x,7.05,6.28),.065,aluminium)
for y in [-6.31,3.72,6.24]:tube('Downpipe',(5.37,y,.35),(5.37,y,6.30),.041,aluminium)
for y in [-6.8,-4.8,-2.8,-.8,1.2,3.2,5.2]:
    for xx in [5.22,5.43]:box('Roof snow retention rail',(.027,1.98,.028),(xx,y,6.54),aluminium)
for sign in [-1,1]:
    y=sign*6.3;mesh('Unverified end gable',[(-4.9,y,6.24),(4.9,y,6.24),(0,y,8.41)],[(0,1,2) if sign<0 else (2,1,0)],cedar)
# Pots and blue tub in the narrow shopfront strip, clear of the entry itself.
for k,y in enumerate([-1.90,-1.50,1.75,2.25,2.85,3.32]):
    x=5.40+(k%2)*.20;tube('Flower pot',(x,y,.10),(x,y,.42),.20,signwood)
    for j in range(7):
        a=j*math.tau/7;xx=x+.19*math.cos(a);yy=y+.19*math.sin(a)
        ball('Potted leaf clump',(xx,yy,.55),(.13,.11,.17),green)
        if k%2:ball('Small flower',(xx,yy,.71),(.055,.055,.06),flower)
box('Blue water tub',(.48,.80,.31),(5.45,2.03,.22),blue)
# Merge per material for compact runtime drawing. Keep this asset independent from earlier houses.
for mat in [cedar,glazing,aluminium,pink,ivory,roofmetal,signwood,wicker,green,flower,blue,stone,frame]:
    objects=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat]
    if not objects:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    objects[0].name='mori_'+mat.name
bpy.ops.object.select_all(action='DESELECT');current.select_set(True)
for child in current.children:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi/mori-workshop.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'B003-mori-workshop.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'model':'mori-workshop','bytes':(ROOT/'public/models/ogimachi/mori-workshop.glb').stat().st_size}))
