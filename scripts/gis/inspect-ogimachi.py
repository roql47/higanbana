from pathlib import Path
import json,math
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/reference/ogimachi-gis'
files=list((OUT/'seamlessphoto').glob('*.jpg'));coords=[tuple(map(int,p.stem.split('-'))) for p in files];x0=min(c[1] for c in coords);y0=min(c[2] for c in coords)
width=(max(c[1] for c in coords)-x0+1)*256;height=(max(c[2] for c in coords)-y0+1)*256
image=Image.new('RGB',(width,height))
for path,(z,x,y) in zip(files,coords):image.paste(Image.open(path),((x-x0)*256,(y-y0)*256))
image.save(OUT/'north-orthophoto.jpg',quality=95)
meta={'zoom':17,'x0':x0,'y0':y0,'width':width,'height':height};(OUT/'orthophoto-grid.json').write_text(json.dumps(meta))
data=json.loads((OUT/'osm.json').read_text())['elements']
buildings=[e for e in data if 'building' in e.get('tags',{})]
print('buildings',len(buildings),'landuses',[(e['id'],e['tags']) for e in data if 'landuse' in e.get('tags',{})])
print('named buildings',[(e['id'],e['tags'],e.get('bounds')) for e in buildings if 'name' in e.get('tags',{})])
print('landmarks',[(e['id'],e.get('lat'),e.get('lon'),e['tags']) for e in data if any(s in e.get('tags',{}).get('name','') for s in ['和田','展望','城山'])])
draw=ImageDraw.Draw(image)
def xy(lat,lon):return ((lon+180)/360*2**17*256-x0*256,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**17*256-y0*256)
for e in buildings:
    pts=[xy(p['lat'],p['lon']) for p in e['geometry']];draw.line(pts,fill='#ffae64',width=1)
draw.ellipse((*[v-5 for v in xy(36.260013,136.907639)],*[v+5 for v in xy(36.260013,136.907639)]),outline='red',width=2)
image.save(OUT/'footprint-overlay.jpg',quality=95)
print('grid',meta)
