"""Export existing surveyed watercourses for the overall design study. No network."""
from pathlib import Path
import json,math
from PIL import Image
root=Path(__file__).resolve().parents[2]
raw=json.loads((root/'assets/reference/ogimachi-gis/osm.json').read_text())['elements']
r=6378137;lat,lon=36.259924,136.907628;c=math.cos(math.radians(lat))
def local(p):return [round(r*math.radians(p['lon']-lon)*c,3),round(r*(math.asinh(math.tan(math.radians(lat)))-math.asinh(math.tan(math.radians(p['lat']))))*c,3)]
rivers=[]
for e in raw:
    tags=e.get('tags',{})
    if tags.get('waterway') not in ['river','stream'] or not e.get('geometry'):continue
    rivers.append(dict(id=e['id'],name=tags.get('name',''),width=44 if tags.get('name')=='庄川' else 12 if tags.get('name')=='牛首谷' else 5,points=[local(p) for p in e['geometry']]))
mask=Image.open(root/'public/data/ogimachi/woodland.png').convert('L').resize((128,214),Image.Resampling.BILINEAR)
(root/'public/data/ogimachi/forest-cover.bin').write_bytes(mask.tobytes())
out={'basis':'OSM centreline retained. Water widths and bank profiles are design estimates, not a surveyed river boundary.','rivers':rivers,'forest':{'width':128,'height':214,'basis':'Existing aerial-reviewed woodland mask, not surveyed forestry boundaries'}}
(root/'public/data/ogimachi/massing.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
print(f'{len(rivers)} watercourses exported')
