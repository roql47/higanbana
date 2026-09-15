import {LOTS,ANNEXES,PATHS,RIVER,TRIBUTARY,TERRACES,MAP_SCALE,type Point} from './plan';
const SOURCE='https://whc-shirakawa-goandgokayama.jp/wp/wp-content/uploads/2024/05/%E2%97%8F%E8%8D%BB%E7%94%BA%E3%80%80%E8%A9%B3%E7%B4%B0%E5%9B%B3%EF%BC%88%E5%BB%BA%E9%80%A0%E7%89%A9%E4%BD%8D%E7%BD%AE%E5%90%AB%E3%82%80%EF%BC%89-scaled.jpg';
export function installPlanComparison(){
  const dialog=document.createElement('dialog');dialog.style.cssText='width:min(1400px,96vw);height:94vh;border:1px solid #697d70;border-radius:8px;background:#edf0eb;color:#14251c;padding:14px;';
  const pixel=([x,z]:Point)=>`${1280+z/MAP_SCALE},${900-x/MAP_SCALE}`;
  const lines=(paths:Point[][],color:string,width:number)=>paths.map(points=>`<polyline points="${points.map(pixel).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}"/>`).join('');
  const buildings=LOTS.map(h=>`<rect x="${1280+(h.z-h.depth/2)/MAP_SCALE}" y="${900-(h.x+h.width/2)/MAP_SCALE}" width="${h.depth/MAP_SCALE}" height="${h.width/MAP_SCALE}" fill="${h.id.startsWith('traced-red')?'#d82654':h.id.startsWith('traced-blue')?'#078adc':'#303e39'}"/><circle cx="${1280+h.z/MAP_SCALE}" cy="${900-h.x/MAP_SCALE}" r="2" fill="#fff"/>`).join('');
  const annexes=ANNEXES.map(h=>`<rect x="${1280+(h.z-h.depth/2)/MAP_SCALE}" y="${900-(h.x+h.width/2)/MAP_SCALE}" width="${h.depth/MAP_SCALE}" height="${h.width/MAP_SCALE}" fill="#cc8428"/>`).join('');
  dialog.innerHTML=`<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><strong>공식 위치도 ↔ 현재 맵 좌표</strong><label>현재 맵 겹치기 <input id="trace-opacity" aria-label="현재 맵 겹치기" type="range" min="0" max="1" step=".05" value=".7"></label><button id="trace-core">중심부</button><button id="trace-all">전체</button><button id="trace-close">닫기</button></div><p>흰 점: 지도에서 추출한 건물 중심 · 초록 선: 현재 길 · 파랑 선: 현재 강. 건물 외형과 지형 높이는 실측 복원이 아닙니다.</p><svg style="width:100%;height:calc(100% - 100px);background:white" viewBox="775 585 1045 525"><image href="${SOURCE}" width="2560" height="1811"/><g id="trace-overlay" opacity=".7">${lines(TERRACES.map(p=>[...p,p[0]!]),'#92931a',2)}${lines([RIVER,TRIBUTARY],'#0087aa',8)}${lines(PATHS.map(p=>p.points),'#24873c',3)}${buildings}</g></svg>`;
  document.body.append(dialog);
  dialog.querySelector('#trace-overlay')!.insertAdjacentHTML('beforeend',annexes);
  dialog.querySelector('p')!.append(' 주황색: 영상의 밀도를 참고해 제작한 부속채이며 실측 건물 표시는 아닙니다.');
  dialog.querySelector<HTMLInputElement>('#trace-opacity')!.addEventListener('input',e=>dialog.querySelector('#trace-overlay')!.setAttribute('opacity',(e.target as HTMLInputElement).value));
  dialog.querySelector('#trace-core')!.addEventListener('click',()=>dialog.querySelector('svg')!.setAttribute('viewBox','775 585 1045 525'));
  dialog.querySelector('#trace-all')!.addEventListener('click',()=>dialog.querySelector('svg')!.setAttribute('viewBox','0 0 2560 1811'));
  dialog.querySelector('#trace-close')!.addEventListener('click',()=>dialog.close());
  document.querySelector('#compare')!.addEventListener('click',()=>dialog.showModal());
}
