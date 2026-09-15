import {readFileSync,writeFileSync} from 'node:fs';import {inStoryScope} from '../../src/world/ogimachi/storyScope.ts';
const read=p=>JSON.parse(readFileSync(p));const d=read('public/data/ogimachi/survey.json'),l=read('public/data/ogimachi/story-layout.json'),r=read('public/data/ogimachi/story-selection.json');
const well=l.sites.find(s=>s.id==='well'),paddy=l.sites.find(s=>s.id==='paddy');
const free=(x,z)=>d.buildings.every(b=>{const xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]);return x<Math.min(...xs)-6||x>Math.max(...xs)+6||z<Math.min(...zs)-6||z>Math.max(...zs)+6});
const candidates=[];for(let x=-170;x<=-85;x+=3)for(let z=-105;z<=25;z+=3){if(!free(x,z)||!inStoryScope(x,z,r,0))continue;let near=Infinity;for(const road of d.roads){if(road.bridge)continue;for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));near=Math.min(near,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}}if(near>=3&&near<=15)candidates.push({p:[x,z],score:near+Math.hypot(x+165,z+55)*.2});}
candidates.sort((a,b)=>a.score-b.score);if(!candidates.length)throw Error('No well site');
for(const [site,p] of [[well,candidates[0].p],[paddy,[-231.1,225.3]]]){site.originalPosition??=site.position;site.position=p;site.positionAdjustmentMeters=+Math.hypot(p[0]-site.originalPosition[0],p[1]-site.originalPosition[1]).toFixed(1);if(!inStoryScope(...p,r,0))throw Error('Outside region');}
paddy.work='기존 농지 부지 활용 후보. 논길·은신·수로를 제작하고 남측 주택가로 연결';paddy.fieldId=1466679562;
writeFileSync('public/data/ogimachi/story-layout.json',JSON.stringify(l,null,2));console.log('Well',well.position,'Paddy',paddy.position);
