"""Rear junction study; reference limits in docs/ogimachi-junction-rear.md."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('build-ogimachi-act1-north.py')),init_globals={
 'asset_stem':'junction-rear','blend_name':'north-junction-rear.blend',
 'building_configs':[
  (1054192968,4.3,1.1,'metal','z','garage'),
  (1054192969,5.15,1.8,'tile','z','porch'),
  (1054192970,5.0,1.7,'tile','z','lime'),
  (1465225098,4.5,1.35,'metal','x','boards'),
  (1465225099,2.35,1.0,'metal','x','shed'),
  (1465225100,4.4,1.4,'tile','z','timber'),
  (1465225101,4.5,1.5,'tile','z','balcony'),
  (1465225102,2.25,.95,'metal','z','shed'),
  (1465225103,2.05,.85,'metal','z','shed')]
})
