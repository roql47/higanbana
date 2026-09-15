"""Acquire bounded public GIS references; cache raw responses with provenance."""
from pathlib import Path
import urllib.request,urllib.parse,json,math,concurrent.futures
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/reference/ogimachi-gis';OUT.mkdir(parents=True,exist_ok=True)
HEAD={'User-Agent':'Higanbana-local-environment-study/1.0'}
def get(url,path,data=None):
    if path.exists():return
    with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=HEAD),timeout=55) as r:raw=r.read()
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
def tile(lon,lat,z):
    return ((lon+180)/360*2**z,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
query='[out:json][timeout:45];(way[building](36.250,136.898,36.266,136.917);way[highway](36.250,136.898,36.266,136.917);way[landuse](36.250,136.898,36.266,136.917);way[natural](36.250,136.898,36.266,136.917);way[waterway](36.250,136.898,36.266,136.917);node[name](36.253,136.902,36.265,136.914););out tags geom;'
(OUT/'overpass-query.txt').write_text(query)
try:
    get('https://overpass-api.de/api/interpreter',OUT/'osm.json',urllib.parse.urlencode({'data':query}).encode())
    print('OSM',len(json.loads((OUT/'osm.json').read_text())['elements']),flush=True)
except Exception as e:print('OSM ERROR',str(e),flush=True)
requests=[];manifest=[]
# Physical valley context: a 5 x 5 grid at z14, about 9.8 km on the ground.
cx,cy=map(math.floor,tile(136.907,36.259,14))
for x in range(cx-2,cx+3):
    for y in range(cy-2,cy+3):requests.append(('dem',14,x,y,'txt'))
# The northern scene and nearby settlement: ~1.5 x 1.5 km at z17.
cx,cy=map(math.floor,tile(136.9065,36.2605,17))
for x in range(cx-3,cx+3):
    for y in range(cy-3,cy+7):requests.append(('seamlessphoto',17,x,y,'jpg'))
def fetch(item):
    layer,z,x,y,ext=item;url=f'https://cyberjapandata.gsi.go.jp/xyz/{layer}/{z}/{x}/{y}.{ext}';path=OUT/layer/f'{z}-{x}-{y}.{ext}'
    try:get(url,path);return {'layer':layer,'z':z,'x':x,'y':y,'url':url,'file':str(path.relative_to(ROOT))}
    except Exception as e:return {'url':url,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for result in pool.map(fetch,requests):manifest.append(result)
(OUT/'manifest.json').write_text(json.dumps({'source':'国土地理院 / GSI','tileList':'https://maps.gsi.go.jp/development/ichiran.html','acquired':'2026-09-10','tiles':manifest},indent=2))
print(json.dumps({'tiles':len(manifest),'errors':[m for m in manifest if 'error' in m]}),flush=True)
