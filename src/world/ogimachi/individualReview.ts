import type {SurveyData} from './survey';
/** A north-up, registered audit view. Road arrows are not invented traffic directions. */
export function installIndividualReview(data:SurveyData,onBuilding:(id:number)=>void){
  let selected=236248644;
  const nav=document.querySelector('header nav')!;
  for(const [id,label] of [[236248644,'B003 전승관'],[236248710,'B002 이로리·매점'],[236248693,'B001 백수원']] as const){const house=document.createElement('button');house.className='individual-house';house.textContent=label;house.onclick=()=>{selected=id;onBuilding(id);};nav.prepend(house);}
  const audit=document.createElement('button');audit.id='road-audit';audit.textContent='길·방향 대조';nav.append(audit);
  const panel=document.createElement('dialog');panel.id='individual-audit';
  panel.innerHTML=`<div class="audit-heading"><div><strong>01–03 · 백수원·이로리·전승관</strong><p>북쪽이 위 · 항공사진과 같은 좌표</p></div><button id="close-audit">닫기</button></div><div id="registered-map"></div><p>청록: 도로 중심선 · 자주: 작은 다리 · 노랑: 개별 제작 건물과 길 쪽 정면</p><p>전승관은 2010년 8월 도로 사진의 간판과 입면을 확인했습니다. 높이·뒷면·이후 변경 사항은 미확인입니다. 이로리의 두 건물 대응과 도로 폭은 추정입니다.</p><button id="audit-house">선택한 건물 보기</button> <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26095,136.90677&heading=260&pitch=14&fov=110" target="_blank" rel="noreferrer">전승관 외관 사진</a>`;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','-160 -270 265 350');svg.setAttribute('role','img');svg.setAttribute('aria-label','북쪽 마을 도로와 백수원·이로리·전승관 위치 대조');
  const element=(name:string,attributes:Record<string,string>,text?:string)=>{const e=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attributes))e.setAttribute(key,value);if(text)e.textContent=text;svg.append(e);return e;};
  const p=data.photo;element('image',{href:'/data/ogimachi/orthophoto.webp',x:String(p.minX),y:String(p.minZ),width:String(p.maxX-p.minX),height:String(p.maxZ-p.minZ)});
  for(const road of data.roads){
    if(!road.points.some(([x,z])=>x>-160&&x<105&&z>-270&&z<80))continue;
    element('polyline',{points:road.points.map(p=>p.join(',')).join(' '),fill:'none',stroke:road.bridge?'#ff77d8':'#64e5e0','stroke-width':road.bridge?'1.7':'.8','stroke-linejoin':'round'});
  }
  for(const b of data.buildings){
    if(b.x<-160||b.x>105||b.z<-270||b.z>80)continue;
    const authored=[236248693,236248710,236248704,236248644].includes(b.id);
    element('polygon',{points:b.points.map(p=>p.join(',')).join(' '),fill:authored?'#ffe28655':'none',stroke:authored?'#ffe286':'#efbd85','stroke-width':authored?'1.4':'.45'});
  }
  for(const [id,label] of [[236248693,'B001 백수원'],[236248710,'B002 식당'],[236248704,'B002 매점'],[236248644,'B003 전승관']] as const){
  const b=data.buildings.find(b=>b.id===id)!;
  const side=id===236248644?1:-1,dx=side*Math.cos(b.angle),dz=-side*Math.sin(b.angle),ex=b.x+dx*19,ez=b.z+dz*19;
  element('line',{x1:String(b.x),y1:String(b.z),x2:String(ex),y2:String(ez),stroke:'#ffe286','stroke-width':'1.7'});
  element('path',{d:`M ${ex-dx*4-dz*2} ${ez-dz*4+dx*2} L ${ex} ${ez} L ${ex-dx*4+dz*2} ${ez-dz*4-dx*2}`,fill:'none',stroke:'#ffe286','stroke-width':'1.5'});
  element('text',{x:String(b.x+(id===236248644?-40:9)),y:String(b.z),'font-size':'5',fill:'#fff4be',stroke:'#24302c','stroke-width':'.5','paint-order':'stroke'},label);
  }
  element('path',{d:'M 83 -233 L 83 -254 M 79 -248 L 83 -254 L 87 -248',stroke:'white','stroke-width':'1.4',fill:'none'});
  element('text',{x:'80',y:'-259','font-size':'7',fill:'white'},'N');
  element('path',{d:'M -145 62 L -95 62 M -145 59 L -145 65 M -95 59 L -95 65',stroke:'white','stroke-width':'1',fill:'none'});
  element('text',{x:'-133',y:'57','font-size':'5',fill:'white'},'50 m');
  panel.querySelector('#registered-map')!.append(svg);document.body.append(panel);
  const style=document.createElement('style');style.textContent='#individual-audit{background:#18251f;color:#efeedd;border:1px solid #a5b09c;border-radius:8px;width:min(650px,94vw);max-height:94vh;padding:16px}#individual-audit::backdrop{background:#000b}.audit-heading{display:flex;justify-content:space-between;align-items:start}#registered-map svg{display:block;width:100%;height:60vh;background:#384637}#individual-audit p{font-size:12px;line-height:1.6;margin:8px 0}.individual-view header{padding:12px 16px}.individual-view header h1,.individual-view header>p,.individual-view #status{display:none}.individual-view header nav button:not(.individual-house):not(#aerial):not(#road-audit){display:none}';document.head.append(style);
  audit.onclick=()=>panel.showModal();panel.querySelector<HTMLButtonElement>('#close-audit')!.onclick=()=>panel.close();panel.querySelector<HTMLButtonElement>('#audit-house')!.onclick=()=>{panel.close();onBuilding(selected);};
}
