/** Planning-only building avoidance using conservatively expanded footprint bounds. */
export function segmentHitsRect(a,b,r){
 let lo=0,hi=1;
 for(let k=0;k<2;k++){const d=b[k]-a[k],min=r[k*2],max=r[k*2+1];if(Math.abs(d)<1e-9){if(a[k]<=min||a[k]>=max)return false;continue;}let t0=(min-a[k])/d,t1=(max-a[k])/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>=hi)return false;}
 return hi>0&&lo<1;
}
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function planAccess(site,buildings,segments,isInside){
 const obstacles=buildings.filter(b=>b.id!==site.buildingId).map(b=>({id:b.id,r:[Math.min(...b.points.map(p=>p[0]))-1,Math.max(...b.points.map(p=>p[0]))+1,Math.min(...b.points.map(p=>p[1]))-1,Math.max(...b.points.map(p=>p[1]))+1]}));
 const occupied=p=>obstacles.some(({r})=>p[0]>=r[0]&&p[0]<=r[1]&&p[1]>=r[2]&&p[1]<=r[3]);
 const original=site.originalPosition??site.position;let start=site.position;
 if(occupied(start)){
  const choices=[];for(let x=-30;x<=30;x+=2)for(let z=-30;z<=30;z+=2){const p=[original[0]+x,original[1]+z];if(dist(p,original)<=30&&isInside(p)&&!occupied(p))choices.push(p);}choices.sort((a,b)=>dist(a,original)-dist(b,original));if(!choices.length)return null;start=choices[0];
 }
 const candidates=segments.map(segment=>{const a=segment.a,b=segment.b,dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((start[0]-a[0])*dx+(start[1]-a[1])*dz)/(dx*dx+dz*dz)));const point=[a[0]+t*dx,a[1]+t*dz];return {segment,t,point,d:dist(start,point)}}).filter(q=>!occupied(q.point)).sort((a,b)=>a.d-b.d).slice(0,12);
 let best=null;
 for(const candidate of candidates){
  const end=candidate.point,box=[Math.min(start[0],end[0])-35,Math.max(start[0],end[0])+35,Math.min(start[1],end[1])-35,Math.max(start[1],end[1])+35];const local=obstacles.filter(({r})=>r[0]<box[1]&&r[1]>box[0]&&r[2]<box[3]&&r[3]>box[2]);
  const nodes=[start,end];for(const {r} of local)for(const p of [[r[0]-.1,r[2]-.1],[r[1]+.1,r[2]-.1],[r[1]+.1,r[3]+.1],[r[0]-.1,r[3]+.1]])if(isInside(p)&&!occupied(p))nodes.push(p);
  const ds=Array(nodes.length).fill(Infinity),prev=Array(nodes.length).fill(-1),seen=new Set();ds[0]=0;
  for(;;){let v=-1;for(let i=0;i<nodes.length;i++)if(!seen.has(i)&&(v===-1||ds[i]<ds[v]))v=i;if(v<0||!Number.isFinite(ds[v])||v===1)break;seen.add(v);for(let j=0;j<nodes.length;j++){if(j===v||seen.has(j))continue;const cost=ds[v]+dist(nodes[v],nodes[j]);if(cost>=ds[j])continue;if(local.some(({r})=>segmentHitsRect(nodes[v],nodes[j],r)))continue;const steps=Math.ceil(dist(nodes[v],nodes[j])/2);let valid=true;for(let k=0;k<=steps;k++){const t=steps?k/steps:0;if(!isInside([nodes[v][0]+(nodes[j][0]-nodes[v][0])*t,nodes[v][1]+(nodes[j][1]-nodes[v][1])*t])){valid=false;break;}}if(valid){ds[j]=cost;prev[j]=v;}}}
  if(Number.isFinite(ds[1])&&(!best||ds[1]<best.length)){const path=[];for(let n=1;n>=0;n=prev[n]){path.push(nodes[n]);if(n===0)break;}best={...candidate,path:path.reverse(),length:ds[1],start};}
 }
 if(best&&dist(start,site.position)>.01){site.originalPosition??=site.position;site.position=start;site.positionAdjustmentMeters=+dist(start,original).toFixed(1);}
 // For reused buildings, stop the approach at its exterior bounding rectangle rather than its centre.
 if(best&&site.buildingId){const b=buildings.find(b=>b.id===site.buildingId);const target=best.path[1]??best.point,a=best.path[0],v=[target[0]-a[0],target[1]-a[1]];const bounds=[Math.min(...b.points.map(p=>p[0]))-1,Math.max(...b.points.map(p=>p[0]))+1,Math.min(...b.points.map(p=>p[1]))-1,Math.max(...b.points.map(p=>p[1]))+1];let exit=Infinity;for(let k=0;k<2;k++)if(Math.abs(v[k])>1e-6)exit=Math.min(exit,((v[k]>0?bounds[k*2+1]:bounds[k*2])-a[k])/v[k]);if(exit>0&&exit<1)best.path[0]=[a[0]+exit*v[0],a[1]+exit*v[1]];best.length=best.path.slice(1).reduce((s,p,i)=>s+dist(best.path[i],p),0);}
 return best;
}
