from PIL import Image,ImageDraw
import json
from pathlib import Path
R=Path('/Users/jay/Claude/3D_motion');s=json.loads((R/'public/data/ogimachi/survey.json').read_text());im=Image.open(R/'assets/reference/ogimachi-gis/north-orthophoto.jpg').convert('RGB');d=ImageDraw.Draw(im);b=s['photo'];w,h=im.size
p=lambda q:((q[0]-b['minX'])/(b['maxX']-b['minX'])*w,(q[1]-b['minZ'])/(b['maxZ']-b['minZ'])*h)
rows=[]
for road in s['roads']:
 pts=[p(q) for q in road['points']]
 if any(830<x<1020 and 750<y<1000 for x,y in pts):
  rows.append(road);d.line(pts,fill='orange',width=2)
  q=next(q for q in pts if 830<q[0]<1020 and 750<q[1]<1000);d.text(q,str(len(rows)),fill='white')
im.crop((830,750,1020,1000)).resize((760,1000)).save(R/'artifacts/ogimachi-phases/road-photo-audit.png')
(R/'artifacts/ogimachi-phases/road-photo-index.json').write_text(json.dumps(rows,indent=2))
print([(i+1,r['id'],r['kind'],r.get('width')) for i,r in enumerate(rows)])
# Conservative source-image retraces beside the visible north-south footpath.
# Plot 7 crosses a junction; retain it as unresolved instead of inventing its edge.
path=R/'artifacts/ogimachi-phases/parcel-overrides.json';o=json.loads(path.read_text())
for ident,pixels in {'photo-north-0':[[921,785],[928,784],[935,834],[918,834]],'photo-north-2':[[918,845],[958,845],[957,882],[918,888]],'photo-north-6':[[898,920],[904,915],[913,941],[888,945]]}.items():
 o['fields'][ident]=[[b['minX']+x/w*(b['maxX']-b['minX']),b['minZ']+y/h*(b['maxZ']-b['minZ'])] for x,y in pixels]
o['deferredFields']=['photo-north-7'];o['roadReview']='Conservative partial retraces from aerial image; plot 7 deferred at junction; not full original-field reconstruction'
path.write_text(json.dumps(o,indent=2))
