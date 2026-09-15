"""Reproducible metric scene input; raw OSM geometry and GSI DEM remain auditable.
Run with the bundled Python (numpy/Pillow). No network access in this stage.
"""
from pathlib import Path
import json, math
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]; SRC=ROOT/'assets/reference/ogimachi-gis'; OUT=ROOT/'public/data/ogimachi';OUT.mkdir(parents=True,exist_ok=True)
LAT,LON=36.259924,136.907628
R=6378137; SCALE=math.cos(math.radians(LAT))
def merc(lat,lon):return R*math.radians(lon),R*math.asinh(math.tan(math.radians(lat)))
MX,MY=merc(LAT,LON)
def local(lat,lon):
    x,y=merc(lat,lon);return [round((x-MX)*SCALE,3),round((MY-y)*SCALE,3)]
tiles={tuple(map(int,p.stem.split('-')[1:])):np.genfromtxt(p,delimiter=',',missing_values='e',filling_values=np.nan) for p in (SRC/'dem').glob('*.txt')}
def elevation(x,z):
    mx=MX+x/SCALE;my=MY-z/SCALE;n=2**14*256
    px=(mx/(2*math.pi*R)+.5)*n-.5;py=(.5-my/(2*math.pi*R))*n-.5
    ix,iy=math.floor(px),math.floor(py);tx,ty=px-ix,py-iy
    def at(a,b):return tiles[(a//256,b//256)][b%256,a%256]
    return float(at(ix,iy)*(1-tx)*(1-ty)+at(ix+1,iy)*tx*(1-ty)+at(ix,iy+1)*(1-tx)*ty+at(ix+1,iy+1)*tx*ty)
BASE=round(elevation(0,0),2)
def obb(points):
    p=np.array(points[:-1] if points[0]==points[-1] else points);best=None
    for a,b in zip(p,np.roll(p,-1,axis=0)):
        ang=math.atan2(*(b-a)[::-1]);c,s=math.cos(ang),math.sin(ang);q=p@np.array([[c,-s],[s,c]])
        low,high=q.min(0),q.max(0);dim=high-low;area=float(np.prod(dim))
        if best is None or area<best[0]:best=(area,ang,(low+high)/2,dim)
    _,ang,center,dim=best;c,s=math.cos(ang),math.sin(ang);center=center@np.array([[c,s],[-s,c]])
    w,d=dim
    if w>d:w,d=d,w;ang+=math.pi/2
    return dict(x=round(float(center[0]),3),z=round(float(center[1]),3),width=round(float(w),3),depth=round(float(d),3),angle=round(-ang,6))
data=json.loads((SRC/'osm.json').read_text())['elements']; buildings=[];fields=[];roads=[]
review=json.loads((ROOT/'assets/authored/ogimachi/individual-review.json').read_text())
for e in data:
    if not e.get('geometry'):continue
    tags=e.get('tags',{});pts=[local(p['lat'],p['lon']) for p in e['geometry']]
    if 'building' in tags:
        b=dict(id=e['id'],points=pts,**obb(pts),name=tags.get('name',''),roof=tags.get('roof:material','unverified'))
        b['height']=round(elevation(b['x'],b['z'])-BASE,2);b['levels']=int(tags.get('building:levels','2').split(';')[0]) if tags.get('building:levels','2').split(';')[0].isdigit() else 2
        buildings.append(b)
    elif tags.get('landuse') in ['farmland','farmyard','meadow']:
        fields.append(dict(id=e['id'],points=pts,kind=tags['landuse']))
    elif 'highway' in tags:
        road=dict(id=e['id'],points=pts,kind=tags['highway'],bridge=tags.get('bridge')=='yes',surface=tags.get('surface','unknown'),name=tags.get('name',''),oneway=tags.get('oneway','no'))
        try:road['width']=float(tags['width']);road['widthBasis']='OSM width tag'
        except (KeyError,ValueError):pass
        if str(e['id']) in review['roads']:road.update(review['roads'][str(e['id'])])
        roads.append(road)
grid=np.array([[round(elevation(x,z)-BASE,2) for x in range(-2400,2401,8)] for z in range(-2400,2401,8)],dtype='<f4')
assert np.isfinite(grid).all();grid.tofile(OUT/'dem.f32')
meta=json.loads((SRC/'orthophoto-grid.json').read_text());n=2**meta['zoom']*256
def photo_local(px,py):
    mx=((meta['x0']*256+px)/n-.5)*2*math.pi*R;my=(.5-(meta['y0']*256+py)/n)*2*math.pi*R
    return [(mx-MX)*SCALE,(MY-my)*SCALE]
lo=photo_local(0,0);hi=photo_local(meta['width'],meta['height'])
image=Image.open(SRC/'north-orthophoto.jpg');image.save(OUT/'orthophoto.webp',quality=92)
# Woodland extents reviewed on this exact north-up mosaic. These are authored
# cover masks, not authoritative forestry boundaries. No trees on the Wada paddies.
woods=[[(820,0),(1536,0),(1536,1536),(980,1536),(940,1340),(1040,1200),(1060,1050),(1040,940),(1090,850),(1110,780),(1020,690),(960,670),(870,700),(820,680),(850,620),(940,570),(1110,540),(1150,680),(1220,760),(1390,900),(1536,930),(1536,710),(1400,600),(1250,540),(1130,440),(1110,320),(1030,240),(910,340),(850,420),(780,440),(760,380),(900,210)],[(230,0),(410,0),(380,140),(470,330),(430,430),(310,270)],[(260,280),(400,460),(410,550),(520,650),(590,800),(535,890),(460,740),(420,640),(340,550),(220,430)],[(560,870),(700,850),(750,920),(730,1000),(590,1070),(510,1040)],[(800,510),(865,515),(890,580),(835,650),(805,660),(760,570)]]
mask=Image.new('L',image.size);md=ImageDraw.Draw(mask)
for poly in woods:md.polygon(poly,fill=255)
md.polygon([(980,1450),(1536,1450),(1536,2560),(730,2560),(790,2240),(910,2130),(970,1900),(1010,1800),(970,1650)],fill=255)
md.polygon([(0,1450),(410,1450),(460,1660),(260,1950),(270,2260),(0,2560)],fill=255)
mask.resize((384,640)).save(OUT/'woodland.png')
# Photograph-traced northern rice plots fill the unmapped focal precinct only.
# Individual irregular banks are retained, rather than a generated rectangular grid.
north_plots=[[(886,786),(929,780),(938,837),(906,837)],[(932,780),(963,785),(964,839),(941,837)],[(909,843),(958,845),(957,882),(918,888)],[(970,787),(993,805),(990,859),(975,859)],[(920,894),(955,889),(955,933),(927,939)],[(963,885),(982,885),(985,930),(963,932)],[(860,911),(904,904),(916,943),(869,949)],[(866,954),(921,948),(923,969),(867,974)],[(928,944),(957,941),(956,969),(929,970)],[(962,938),(984,938),(984,973),(963,970)]]
for i,poly in enumerate(north_plots):fields.append(dict(id=f'photo-north-{i}',kind='rice-reviewed',points=[[round(v,3) for v in photo_local(*p)] for p in poly]))
for b in buildings:
    b['model']='wada-main' if b['id']==236248621 else 'wada-itakura' if b['id']==660927470 else 'wada-hasagoya' if b['id']==236248645 else 'farmhouse' if b['id'] in [236408763,236408787,236408744,236408751,236408737] else 'storehouse' if b['width']<6 else 'merchant'
    if b['model']=='wada-main':b['width']=12.8;b['depth']=22.3;b['angle']+=math.pi
    record=review['buildings'].get(str(b['id']))
    b['reviewStatus']='placeholder'
    if record:
        b['reviewId']=record['reviewId'];b['reviewStatus']=record['status']
        if record.get('model'):b['model']=record['model']
        if record.get('angleRule')=='west-half-plane':b['angle']=(b['angle']+math.pi/2)%math.pi-math.pi/2
    elif b['model'].startswith('wada'):b['reviewStatus']='prior-approximation'
# Manual aerial review overrides are explicit; unreviewed roofs remain conventional placeholders.
draw=ImageDraw.Draw(image)
for b in buildings:
    px=(b['x']-lo[0])/(hi[0]-lo[0])*meta['width'];py=(b['z']-lo[1])/(hi[1]-lo[1])*meta['height']
    if 750<px<1080 and 750<py<1100:draw.text((px,py),str(b['id']),fill='yellow')
image.crop((740,740,1100,1120)).resize((1080,1140)).save(SRC/'north-building-ids.png')
result=dict(origin=dict(lat=LAT,lon=LON,altitude=BASE),dem=dict(minX=-2400,minZ=-2400,step=8,size=601),photo=dict(minX=lo[0],minZ=lo[1],maxX=hi[0],maxZ=hi[1]),buildings=buildings,fields=fields,roads=roads,viewpoint=local(36.2629545,136.9079634),credits='Processed GSI elevation/photographic tiles; © OpenStreetMap contributors (ODbL).')
(OUT/'survey.json').write_text(json.dumps(result,separators=(',',':')))
(OUT/'individual-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2))
print(json.dumps(dict(buildings=len(buildings),fields=len(fields),roads=len(roads),base=BASE,range=[float(grid.min()),float(grid.max())])))
