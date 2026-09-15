import type {Point,VillageLot,VillagePath} from './plan';
type Box={x0:number;x1:number;z0:number;z1:number};
const inside=(p:Point,b:Box)=>p[0]>b.x0&&p[0]<b.x1&&p[1]>b.z0&&p[1]<b.z1;
function crosses(a:Point,b:Point,r:Box) {
  let low=0,high=1;
  for(const [origin,delta,min,max] of [[a[0],b[0]-a[0],r.x0,r.x1],[a[1],b[1]-a[1],r.z0,r.z1]]) {
    if(Math.abs(delta!)<1e-8){if(origin!<=min!||origin!>=max!)return false;continue;}
    const t0=(min!-origin!)/delta!,t1=(max!-origin!)/delta!;
    low=Math.max(low,Math.min(t0,t1));high=Math.min(high,Math.max(t0,t1));if(low>=high)return false;
  }
  return high>0&&low<1;
}
/** Retain digitized centres; route small road clearances around enlarged cartographic symbols. */
export function clearTracedRoads(paths:VillagePath[],lots:VillageLot[]) {
  for(const path of paths) {
    const boxes=lots.map(h=>({x0:h.x-h.width/2-1.8-path.width/2-1.2,x1:h.x+h.width/2+1.8+path.width/2+1.2,z0:h.z-h.depth/2-1-path.width/2-1.2,z1:h.z+h.depth/2+1+path.width/2+1.2}));
    const snap=(p:Point):Point=>{
      let result=p;
      for(let i=0;i<8;i++){
        const box=boxes.find(b=>inside(result,b));if(!box)break;
        const choices:Point[]=[[box.x0-.2,result[1]],[box.x1+.2,result[1]],[result[0],box.z0-.2],[result[0],box.z1+.2]];
        result=choices.sort((a,b)=>Math.hypot(a[0]-p[0],a[1]-p[1])-Math.hypot(b[0]-p[0],b[1]-p[1]))[0]!;
      }
      return result;
    };
    const anchors=path.points.map(snap),result:Point[]=[anchors[0]!];
    for(let segment=1;segment<anchors.length;segment++){
      const a=anchors[segment-1]!,b=anchors[segment]!;
      if(!boxes.some(r=>crosses(a,b,r))){result.push(b);continue;}
      const local=boxes.filter(r=>r.x1>Math.min(a[0],b[0])-80&&r.x0<Math.max(a[0],b[0])+80&&r.z1>Math.min(a[1],b[1])-80&&r.z0<Math.max(a[1],b[1])+80);
      const nodes:Point[]=[a,b,...local.flatMap(r=>[[r.x0-.2,r.z0-.2],[r.x1+.2,r.z0-.2],[r.x1+.2,r.z1+.2],[r.x0-.2,r.z1+.2]] as Point[]).filter(p=>!boxes.some(r=>inside(p,r)))];
      const dist=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),used=new Set<number>();dist[0]=0;
      for(let step=0;step<nodes.length;step++){
        let u=-1;for(let i=0;i<nodes.length;i++)if(!used.has(i)&&(u<0||dist[i]!<dist[u]!))u=i;
        if(u<0||!Number.isFinite(dist[u]!))break;if(u===1)break;used.add(u);
        for(let v=0;v<nodes.length;v++)if(!used.has(v)&&!local.some(r=>crosses(nodes[u]!,nodes[v]!,r))){const value=dist[u]!+Math.hypot(nodes[u]![0]-nodes[v]![0],nodes[u]![1]-nodes[v]![1]);if(value<dist[v]!){dist[v]=value;prev[v]=u;}}
      }
      if(!Number.isFinite(dist[1]!))throw new Error(`No road clearance: ${path.id}, segment ${segment}`);
      const route:Point[]=[];for(let i=1;i!==0;i=prev[i]!){if(i<0)throw new Error('Invalid road route');route.unshift(nodes[i]!);}result.push(...route);
    }
    path.points=result;
  }
}
