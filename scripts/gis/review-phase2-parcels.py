import json
from pathlib import Path
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[2];s=json.loads((R/'public/data/ogimachi/survey.json').read_text());b=s['photo'];im=Image.open(R/'assets/reference/ogimachi-gis/north-orthophoto.jpg').convert('RGB');w,h=im.size
pixels=[[891,920],[904,909],[913,941],[886,945]]
points=[[b['minX']+x/w*(b['maxX']-b['minX']),b['minZ']+y/h*(b['maxZ']-b['minZ'])] for x,y in pixels]
override={'source':'north-orthophoto.jpg','status':'visual retrace draft; not survey measurement','fields':{'photo-north-6':points},'reason':'Exclude western residential area visible in source mosaic; retain eastern cultivated patch'}
override_path=R/'artifacts/ogimachi-phases/parcel-overrides.json'
if override_path.exists():
 override=json.loads(override_path.read_text())
override_path.write_text(json.dumps(override,indent=2))
def inside(p,poly):
 x,y=p;hit=False
 for a,c in zip(poly,poly[1:]+poly[:1]):
  if (a[1]>y)!=(c[1]>y) and x<(c[0]-a[0])*(y-a[1])/(c[1]-a[1])+a[0]:hit=not hit
 return hit
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def intersects(a,b):
 if any(inside(p,b) for p in a) or any(inside(p,a) for p in b):return True
 return any(cross(p,q,r)*cross(p,q,t)<0 and cross(r,t,p)*cross(r,t,q)<0 for p,q in zip(a,a[1:]+a[:1]) for r,t in zip(b,b[1:]+b[:1]))
report=[]
for f in s['fields']:
 if f['kind']!='rice-reviewed':continue
 old=f['points'];new=override['fields'].get(f['id'],old)
 report.append({'id':f['id'],'before_building_intersections':[x['id'] for x in s['buildings'] if intersects(old,x['points'])],'after_building_intersections':[x['id'] for x in s['buildings'] if intersects(new,x['points'])]})
 f['points']=new
(R/'artifacts/ogimachi-phases/parcel-intersections.json').write_text(json.dumps(report,indent=2))
d=ImageDraw.Draw(im);p=lambda q:((q[0]-b['minX'])/(b['maxX']-b['minX'])*w,(q[1]-b['minZ'])/(b['maxZ']-b['minZ'])*h)
for f in s['fields']:
 if f['kind']=='rice-reviewed':d.line([p(q) for q in f['points']]+[p(f['points'][0])],fill='cyan',width=2)
for f in s['buildings']:d.line([p(q) for q in f['points']]+[p(f['points'][0])],fill='red',width=1)
im.crop((830,750,1020,1000)).resize((760,1000)).save(R/'artifacts/ogimachi-phases/parcel-audit-corrected.png')
print(json.dumps(report))
