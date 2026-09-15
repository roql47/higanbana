"""Run through the local Blender MCP execute_code endpoint. Keeps the user's original scene.
Authors a separate scene and a GLB library for the new Ogimachi landscape.
"""
from pathlib import Path
import math, json
import bpy
import numpy as np
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/authored/ogimachi'; OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.data.scenes.new('Ogimachi_Reference_Study')
scene['codex_authored']='ogimachi-library-v1'
bpy.context.window.scene=scene
models=[]

def material(name, color, rough=.9):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
    return m

def surface(name, albedo, normal=None, strength=.55):
    image=bpy.data.images.load(str(ROOT/'public'/albedo),check_existing=False);image.pack()
    m=material(name,(1,1,1));nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF')
    node=nodes.new('ShaderNodeTexImage');node.image=image;links.new(node.outputs['Color'],p.inputs['Base Color'])
    if normal:
        ni=bpy.data.images.load(str(ROOT/'public'/normal),check_existing=False);ni.colorspace_settings.name='Non-Color';ni.pack()
    else:
        # Approximate microrelief from the albedo, not a measured displacement scan.
        w,h=image.size;rgba=np.empty(w*h*4,dtype=np.float32);image.pixels.foreach_get(rgba)
        luminance=rgba.reshape(h,w,4)[:,:,:3].mean(axis=2)
        gx=(np.roll(luminance,-1,axis=1)-np.roll(luminance,1,axis=1))*2.5
        gy=(np.roll(luminance,-1,axis=0)-np.roll(luminance,1,axis=0))*2.5
        vectors=np.stack([-gx,-gy,np.ones_like(gx)],axis=-1);vectors/=np.linalg.norm(vectors,axis=-1,keepdims=True)
        pixels=np.ones((h,w,4),dtype=np.float32);pixels[:,:,:3]=vectors*.5+.5
        ni=bpy.data.images.new(name+'-normal',w,h);ni.colorspace_settings.name='Non-Color';ni.pixels.foreach_set(pixels.ravel());ni.pack()
    nt=nodes.new('ShaderNodeTexImage');nt.image=ni;nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=strength;links.new(nt.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],p.inputs['Normal'])
    return m

wood=surface('Smoke-aged cedar','textures/minka/weathered-cedar-diff-1k.webp','textures/minka/weathered-cedar-nor-gl-1k.webp')
thatch=surface('Bound kaya reeds','textures/ogimachi/kaya-aligned-v2.png',strength=.8)
frame=material('Dark structural timber',(.065,.044,.030));paper=material('Recessed muted glazing',(.10,.14,.12),.32)
stone=surface('Foundation granite','textures/stone/japanese_stone_wall_diff_1k.webp','textures/stone/japanese_stone_wall_nor_gl_1k.webp',.7)
tile=material('Weathered grey roof tile',(.12,.15,.15),.82)
plaster=surface('Pale mineral plaster','textures/minka/aged-mud-plaster-diff-1k.webp','textures/minka/aged-mud-plaster-nor-gl-1k.webp',.4)
current=None
def mesh(name,verts,faces,mat):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.parent=current;data.materials.append(mat)
    uv=data.uv_layers.new(name='UVMap')
    for p in data.polygons:
        axis=max(range(3),key=lambda a:abs(p.normal[a]))
        for li in p.loop_indices:
            co=data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv=((co.y if axis==0 else co.x)/2, (co.y if axis==2 else co.z)/2)
    return o
def box(name,dim,loc,mat,rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:
        axis=max(range(3),key=lambda a:abs(p.normal[a]))
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co;o.data.uv_layers.active.data[li].uv=((co.y if axis==0 else co.x)/2,(co.y if axis==2 else co.z)/3)
    if rot:o.rotation_euler=rot
    o.parent=current;o.data.materials.append(mat)
    return o
def beam(name,a,b,r,mat=frame):
    a,b=Vector(a),Vector(b);o=box(name,(r,r,(b-a).length),(a+b)/2,mat);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def window(x,y,z,w,h,side=False):
    if not side:
        out=-1 if y<0 else 1
        box('Window recess',(w+.16,.09,h+.16),(x,y,z),frame);box('Paper light panel',(w,.025,h),(x,y+out*.06,z),paper)
        for dx in [-w/2,0,w/2]:box('Window mullion',(.045,.06,h+.04),(x+dx,y+out*.09,z),frame)
        box('Window transom',(w,.06,.045),(x,y+out*.09,z),frame)
    else:
        box('Side window recess',(.09,w+.14,h+.14),(x,y,z),frame);box('Side paper panel',(.035,w,h),(x+.06,y,z),paper)
        for dy in [-w/2,0,w/2]:box('Side mullion',(.06,.045,h),(x+.09,y+dy,z),frame)

def roof(width,depth,base,rise,mat,thickness=.5):
    half=width/2;length=math.hypot(half,rise);angle=math.atan2(rise,half)
    for side in [-1,1]:
        if mat==thatch:
            # Closed, curved reed pack with irregular eaves; the silhouette carries
            # thickness and subtle sag independently of the surface normal texture.
            nx,ny=12,48;verts=[];faces=[]
            for layer in [0,1]:
                for j in range(ny+1):
                    yy=-depth/2+depth*j/ny
                    for i in range(nx+1):
                        t=i/nx;wave=math.sin(j*1.7)*.028+math.cos(j*.67)*.020
                        x=side*(half*t+(wave*t**6));z=base+rise*(1-t)+.16*math.sin(math.pi*t)-.11*t**7+wave*t**4
                        verts.append((x,yy,z-thickness*layer))
            stride=nx+1;layer_count=stride*(ny+1)
            for j in range(ny):
                for i in range(nx):
                    a=j*stride+i;b=a+1;c=a+stride+1;d=a+stride
                    faces.extend([(a,b,c,d),(d+layer_count,c+layer_count,b+layer_count,a+layer_count)])
            border=list(range(stride))+[j*stride+nx for j in range(1,ny+1)]+[ny*stride+i for i in range(nx-1,-1,-1)]+[j*stride for j in range(ny-1,0,-1)]
            for a,b in zip(border,border[1:]+border[:1]):faces.append((a,a+layer_count,b+layer_count,b))
            if side<0:faces=[tuple(reversed(f)) for f in faces]
            o=mesh('Curved deep kaya roof',verts,faces,mat)
            for poly in o.data.polygons:
                poly.use_smooth=len(poly.vertices)==4 and abs(poly.normal.z)>.1
                for li in poly.loop_indices:
                    co=o.data.vertices[o.data.loops[li].vertex_index].co
                    o.data.uv_layers.active.data[li].uv=(co.y/2.4,abs(co.x)/half*length/2.4)
            continue
        o=box('Thick roof slope',(length,depth,thickness),(side*half/2,0,base+rise/2),mat,(0,side*angle,0))
        # Roof reeds follow the fall of the slope, not the ridge direction.
        for poly in o.data.polygons:
            for li in poly.loop_indices:
                co=o.data.vertices[o.data.loops[li].vertex_index].co;o.data.uv_layers.active.data[li].uv=(co.y/2,co.x/2)
        for j in range(round(depth/.4)):
            yy=-depth/2+(j+.5)*depth/round(depth/.4)
            box('Raised tile channel',(length,.055,.055),(side*half/2,yy,base+rise/2+.12),mat,(0,side*angle,0))
        for j in range(1,round(length/.45)):
            t=j/round(length/.45)
            box('Overlapping tile course',(.07,depth,.035),(side*half*t,0,base+rise*(1-t)+.12),mat,(0,side*angle,0))
    box('Ridge cap',(.46,depth+.04,.26),(0,0,base+rise+.10),mat)

def build(name,w,d,kind,variant=False):
    global current
    current=bpy.data.objects.new(name,None);current['archetype']=name;scene.collection.objects.link(current);models.append(current)
    floor=.38;wall=2.6 if kind=='farmhouse' else 5.3 if kind=='merchant' else 3.1
    box('Raised stone base',(w,.0+d,.26),(0,0,.13),stone)
    box('Boarded main volume',(w,d,wall),(0,0,floor+wall/2),wood if kind!='merchant' else plaster)
    for x in [-w/2,w/2]:
        for y in [-d/2,d/2]:box('Corner post',(.20,.20,wall+.25),(x,y,floor+wall/2),frame)
        if kind=='merchant':
            box('Side timber wainscot',(.09,d,1.05),(x,0,floor+.525),wood)
            box('Upper cedar storey',(.10,d,2.25),(x,0,4.48),wood)
            box('Second floor side belt',(.16,d,.18),(x,0,3.17),frame)
            for y in np.arange(-d/2,d/2+.1,2):box('Plaster bay post',(.16,.15,wall),(x,float(y),floor+wall/2),frame)
        else:
            for y in np.arange(-d/2+.2,d/2,.29):box('Side board batten',(.065,.035,wall-.1),(x*1.005,float(y),floor+wall/2),wood)
    for y in [-d/2,d/2]:
        if kind=='merchant':
            box('Gable timber wainscot',(w,.09,1.05),(0,y,floor+.525),wood)
            box('Upper gable storey',(w,.10,2.25),(0,y,4.48),wood)
            box('Second floor gable belt',(w,.16,.18),(0,y,3.17),frame)
            for x in [-w/2,-w/6,w/6,w/2]:box('Gable plaster bay post',(.15,.16,wall),(x,y,floor+wall/2),frame)
        else:
            for x in np.arange(-w/2+.15,w/2,.28):box('Gable-end boards',(.033,.075,wall-.1),(float(x),y,floor+wall/2),wood)
        box('Lower wall belt',(w+.12,.12,.12),(0,y,floor+.9),frame)
    base=floor+wall
    rise=w*(.72 if variant else .68) if kind=='farmhouse' else w*.24
    roof(w+1.7,d+1.4,base,rise,thatch if kind=='farmhouse' else tile,.58 if kind=='farmhouse' else .15)
    for sign in [-1,1]:
        y=sign*d/2
        span=(w+1.7)/2-.22
        verts=[(-span,y-.06,base-.1),(span,y-.06,base-.1),(0,y-.06,base+rise-.15),(-span,y+.06,base-.1),(span,y+.06,base-.1),(0,y+.06,base+rise-.15)]
        mesh('Boarded attic gable',verts,[(0,1,2),(5,4,3),(0,3,4,1),(1,4,5,2),(2,5,3,0)],wood)
        for fraction in [.03,.43]:box('Attic beam',(w*(1-fraction),.13,.15),(0,y,base+rise*fraction),frame)
        for side in [-1,1]:beam('Gable rake',(side*w/2,y,base),(0,y,base+rise*.9),.16)
        if kind=='farmhouse':
            for x in ([-w*.23,w*.23] if variant else [-w*.20,0,w*.20]):
                window(x,y+sign*.1,base+1.1,1.3 if variant else 1.0,1.15)
                if variant:
                    for side in [-1,1]:box('Open attic wooden shutter',(.42,.11,1.22),(x+side*.9,y+sign*.15,base+1.1),wood)
            window(0,y+sign*.1,base+rise*.61,.85,.90)
    if kind=='farmhouse':
        # Side entry with a low, tiled lean-to; main house is not an exposed wall of shoji.
        for y in [-d*.28,0,d*.28]:window(w/2+.10,y,1.7,1.75,1.35,True)
        box('Side earthen entry',(.12,1.65,2.1),(w/2+.13,-d*.25,1.43),frame)
        canopy=box('Tiled entry lean-to',(2.1,d*.78,.16),(w/2+.8,0,2.66),tile,(0,.16,0))
        for y in [-d*.36,d*.36]:box('Canopy post',(.13,.13,2.5),(w/2+1.65,y,1.25),frame)
        box('Stone entry step',(1.5,2,.16),(w/2+.8,-d*.25,.14),stone)
        for x in [-w*.27,w*.27]:window(x,-d/2-.1,1.75,1.65,1.45)
    else:
        for x in [-w*.3,0,w*.3]:window(x,-d/2-.1,1.65,1.5,1.65)
        box('Storefront awning',(w+.4,1.25,.15),(0,-d/2-.55,2.9),tile,(-.12,0,0))
        if kind=='merchant':
            for y in [-d*.30,0,d*.30]:window(w/2+.14,y,4.45,1.85,1.28,True)
            for x in [-w*.3,0,w*.3]:window(x,-d/2-.15,4.45,1.55,1.28)
            for y in [-d*.30,d*.27]:window(w/2+.1,y,1.95,2.0,1.25,True)
            box('Street entrance recess',(.15,1.8,2.35),(w/2+.12,0,1.56),frame)
            for y in [-.75,-.5,-.25,0,.25,.5,.75]:box('Entrance sliding timber slat',(.10,.08,2.1),(w/2+.22,y,1.56),wood)
            box('Street eave canopy',(1.5,d*.91,.15),(w/2+.6,0,2.95),tile,(0,.15,0))
            for y in [-d*.42,d*.42]:box('Street canopy post',(.14,.14,2.8),(w/2+1.18,y,1.4),frame)
            box('Entrance threshold',(1.5,2.3,.14),(w/2+.6,0,.12),stone)
            if variant:
                for y in [-d/2-.10,d/2+.10]:
                    box('Upper boarded street fascia',(w,.07,.65),(0,y,base-.32),wood)
                    for x in [-w*.3,w*.3]:box('Closed storm shutter',(.48,.12,1.8),(x+.96,y,1.65),wood)
                for side in [-1,1]:box('Upper side cedar infill',(.08,d,.72),(side*(w/2+.06),0,base-.35),wood)
    # Merge within each material: preserves authorable archetypes and supports instancing in-game.
    for mat in [wood,thatch,frame,paper,stone,tile,plaster]:
        objects=[o for o in current.children if o.type=='MESH' and len(o.data.materials) and o.data.materials[0]==mat]
        if not objects:continue
        if len(objects)==1:objects[0].name=name+'_'+mat.name;continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=name+'_'+mat.name
    return current

build('farmhouse',10.4,17,'farmhouse')
build('merchant',9.5,12,'merchant')
build('storehouse',5,7,'storehouse')
build('farmhouse-shutters',10.4,17,'farmhouse',True)
build('merchant-boarded',9.5,12,'merchant',True)
bpy.ops.object.select_all(action='DESELECT')
for root in models:
    root.select_set(True)
    for child in root.children:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi/village-library.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
# Space archetypes apart only in the editable Blender file, after export at shared local origin.
for i,root in enumerate(models):root.location.x=i*24
scene.world=bpy.data.worlds.new('Ogimachi studio world');scene.world.color=(.25,.25,.25)
bpy.data.libraries.write(str(OUT/'village-library.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'scene':scene.name,'archetypes':[o.name for o in models],'glb':str(ROOT/'public/models/ogimachi/village-library.glb'),'bytes':(ROOT/'public/models/ogimachi/village-library.glb').stat().st_size}))
