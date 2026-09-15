import json,math
from pathlib import Path
R=Path(__file__).resolve().parents[2];d=json.loads((R/'public/data/ogimachi/survey.json').read_text());o=json.loads((R/'artifacts/ogimachi-phases/parcel-overrides.json').read_text());inventory=json.loads((R/'artifacts/ogimachi-phases/road-mesh-inventory.json').read_text());widths={r['id']:r['width'] for r in inventory}
def pt(p,a,b):
 dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/max(1e-9,dx*dx+dz*dz)));return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)
rows=[]
for f in d['fields']:
 if f['kind']!='rice-reviewed' or f['id'] in o.get('deferredFields',[]):continue
 points=o['fields'].get(f['id'],f['points']);nearest=None
 for road in d['roads']:
  if road['id'] not in widths:continue
  dist=min(min(pt(p,a,b),pt(q,a,b),pt(a,p,q),pt(b,p,q)) for a,b in zip(road['points'],road['points'][1:]) for p,q in zip(points,points[1:]+points[:1]))
  # Precondition: no polygon/road centreline crossings, checked separately.
  gap=dist-widths[road['id']]/2-.4-.35
  if nearest is None or gap<nearest['gap']:nearest={'road':road['id'],'gap':round(gap,3)}
 rows.append({'field':f['id'],**nearest})
(R/'artifacts/ogimachi-phases/road-bank-clearance.json').write_text(json.dumps(rows,indent=2));print(rows)
