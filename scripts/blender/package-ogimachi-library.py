from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2]
scenes=[s for s in bpy.data.scenes if s.get('codex_authored')=='ogimachi-library-v1']
scene=sorted(scenes,key=lambda s:s.name)[-1]
path=ROOT/'assets/authored/ogimachi/village-library.blend'
bpy.data.libraries.write(str(path),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print({'scene':scene.name,'bytes':path.stat().st_size,'file':str(path)})
