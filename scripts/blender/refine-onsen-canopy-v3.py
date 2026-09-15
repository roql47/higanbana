"""Rebuild B004 entry v2, then add photo-observed canopy seams, snow rails and eave.
Sizes are estimates. Source v1/v2 and desktop Blender scenes are preserved.
"""
from pathlib import Path
source=Path(__file__).with_name('refine-onsen-entry-v2.py')
code=source.read_text()
addition='''
# Photo reference: low sheet-metal canopy with longitudinal joints and snow rails.
metal=next(m for m in bpy.data.materials if 'Onsen weathered sheet metal' in m.name)
extra=[]
def canopy_box(name,loc,size,tilt=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
 o=bpy.context.object;o.name=name;o.dimensions=size;o.rotation_euler.y=tilt
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.parent=root;o.data.materials.append(metal);extra.append(o)
 return o
for i in range(10):
 canopy_box('B004 canopy standing seam',(-7.75,-17.13+i*.695,3.50),(2.86,.025,.04),-.12)
for xx in [-8.72,-7.65]:
 zz=3.4+math.sin(.12)*(xx+7.75)+.14
 canopy_box('B004 canopy snow rail',(xx,-14,zz),(.065,6.3,.065))
 for yy in [-16.75,-15.4,-14,-12.6,-11.25]:
  canopy_box('B004 snow rail bracket',(xx,yy,zz-.05),(.10,.07,.13))
canopy_box('B004 canopy eave fascia',(-9.21,-14,3.22),(.09,6.55,.17))
canopy_box('B004 canopy gutter',(-9.30,-14,3.17),(.16,6.65,.10))
# Consolidate into the existing roof material batch; doors stay separate.
roof=next(o for o in root.children if o.type=='MESH' and any('Onsen weathered sheet metal' in m.name for m in o.data.materials) and o not in extra)
bpy.ops.object.select_all(action='DESELECT');roof.select_set(True)
for o in extra:o.select_set(True)
bpy.context.view_layer.objects.active=roof;bpy.ops.object.join()
root['scope']='entry frame, short centre noren, horizontal siding and canopy detailing; dimensions estimated'
'''
code=code.replace('# Save/export model before staging review lighting.',addition+'\n# Save/export model before staging review lighting.')
code=code.replace('B004_Onsen_Entry_v2','B004_Onsen_Canopy_v3').replace('onsen-v2.glb','onsen-v3.glb').replace('B004-onsen-v2.blend','B004-onsen-v3.blend').replace("onsen-v2';","onsen-v3';")
exec(compile(code,str(source),'exec'),{'__file__':str(source)})
